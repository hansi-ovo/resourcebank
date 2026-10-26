import { z } from 'zod';
import { CATEGORY_IDS, type CategoryId, type EntryDraft, type Scope, type SearchStats } from '../../../shared/types';
import { config } from '../config';
import { classifyEntities, normalizeUrl, type JsonLlm } from './dedup';
import { extractionMessages, queryPlannerMessages, CATEGORY_PROMPTS } from './category-prompts';
import type { ExistingEntryRef, RawHit, SearchContext, SearchProvider } from './types';
import type { SearchSource } from './search-source';

/**
 * The real search pipeline (search-upgrade Step 1):
 *
 *   plan queries (LLM + category spec)
 *     → search the web (Tavily)
 *     → URL-level dedup (normalizeUrl, existing + intra-round)
 *     → entity dedup (LLM: new | duplicate | same_program_new_edition)
 *     → fetch page text (truncated, concurrency-limited)
 *     → extract EntryDraft + quality score (LLM, zod-validated)
 *     → quality floor → top 30 drafts, funnel stats reported via ctx
 *
 * Any single page failing never fails the round; only a dead search source
 * ends the round early (with stats.error).
 */

const plannerSchema = z.object({
  queries: z.array(z.string().min(4).max(200)).catch([]),
});

const draftSchema = z.object({
  name: z.string().min(3).max(200),
  summary: z.string().min(30).max(700),
  audience: z.array(z.string().max(80)).catch([]),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  timeline: z.string().max(400).catch(''),
  category: z.string().catch(''),
  quality: z.coerce.number().min(0).max(100).catch(0),
});

export interface WebSearchProviderOptions {
  maxQueries?: number;
  maxCandidates?: number;
  qualityFloor?: number;
  fetchConcurrency?: number;
  extractConcurrency?: number;
  fetchTimeoutMs?: number;
  /** Test seam — inject a fake page fetcher instead of the network. */
  pageFetcher?: (url: string) => Promise<string | null>;
}

const DEFAULTS = {
  maxQueries: 7,
  maxCandidates: 24,
  qualityFloor: config.searchQualityFloor,
  fetchConcurrency: 5,
  extractConcurrency: 3,
  fetchTimeoutMs: 15_000,
};

export class WebSearchProvider implements SearchProvider {
  constructor(
    private readonly llm: JsonLlm,
    private readonly source: SearchSource,
    private readonly opts: WebSearchProviderOptions = {},
  ) {}

  async search(prompt: string, scope: Scope, ctx: SearchContext): Promise<EntryDraft[]> {
    const o = { ...DEFAULTS, ...this.opts };
    const stats: SearchStats = {
      candidatesFound: 0,
      dedupSkipped: 0,
      sameProgramEditions: 0,
      extractionFailed: 0,
      lowQuality: 0,
      returned: 0,
      queries: [],
    };

    // 1. plan diverse queries (falls back to the raw prompt on any failure);
    //    recent rounds' queries steer the planner away from re-finding the
    //    same pages
    const queries = await this.planQueries(prompt, scope, o.maxQueries, ctx.recentQueries);
    stats.queries = queries;

    // 2. search the web — a dead source ends the round with stats.error
    let hits: RawHit[];
    try {
      hits = await this.source.search(queries);
    } catch (err) {
      stats.error = err instanceof Error ? err.message : String(err);
      ctx.onStats?.(stats);
      return [];
    }
    stats.candidatesFound = hits.length;

    // 3. URL-level dedup (intra-round + already in DB), then cap
    const seen = new Set<string>();
    const candidates: RawHit[] = [];
    for (const h of hits) {
      const norm = normalizeUrl(h.url);
      if (seen.has(norm) || ctx.existingUrls.has(norm) || ctx.existingUrls.has(h.url)) {
        stats.dedupSkipped += 1;
        continue;
      }
      seen.add(norm);
      candidates.push({ ...h, url: norm });
      if (candidates.length >= o.maxCandidates) break;
    }

    // 4. entity dedup against existing entries
    const verdicts = await classifyEntities(
      this.llm,
      candidates.map((c) => ({ name: c.title, url: c.url, summary: c.snippet })),
      ctx.existingEntries,
    );
    const fresh: RawHit[] = [];
    candidates.forEach((c, i) => {
      const v = verdicts[i] ?? { verdict: 'new' as const, entryId: null };
      if (v.verdict === 'duplicate') {
        stats.dedupSkipped += 1;
        return;
      }
      if (v.verdict === 'same_program_new_edition') {
        stats.sameProgramEditions += 1;
        const target =
          (v.entryId != null ? ctx.existingEntries.find((e) => e.id === v.entryId) : undefined) ??
          ctx.existingEntries.find((e) => hostOf(e.url) === hostOf(c.url));
        if (target) ctx.onSameProgramEdition?.({ name: c.title || c.url, url: c.url }, target);
        return;
      }
      fresh.push(c);
    });

    // 5. fetch page text
    const pageFn = o.pageFetcher ?? ((url: string) => fetchPageText(url, o.fetchTimeoutMs));
    const pages = await mapLimit(fresh, o.fetchConcurrency, async (c) => {
      try {
        return { c, text: await pageFn(c.url) };
      } catch {
        return { c, text: null as string | null };
      }
    });
    const fetchable = pages.filter((p): p is { c: RawHit; text: string } => p.text !== null && p.text.length > 0);
    stats.extractionFailed += pages.length - fetchable.length;

    // 6. LLM extraction + quality gate
    const drafts: EntryDraft[] = [];
    await mapLimit(fetchable, o.extractConcurrency, async ({ c, text }) => {
      try {
        const d = await this.extractDraft(c, text, scope, o.qualityFloor);
        if (d === null) {
          stats.extractionFailed += 1;
        } else if (d.quality < o.qualityFloor) {
          stats.lowQuality += 1;
          console.log(
            `[search] low-quality (q=${d.quality} < ${o.qualityFloor}) ${c.url} — ${d.name}`,
          );
        } else {
          drafts.push(d);
        }
      } catch (err) {
        stats.extractionFailed += 1;
        // previously swallowed — gateway flakiness was invisible (extractionFailed:8
        // rounds with no log line). One line per failure names the cause.
        console.warn(
          '[search] extraction failed:',
          err instanceof Error ? err.message : String(err),
          `(${c.url})`,
        );
      }
    });

    // 7. disambiguate same-name drafts (e.g. two "Schwarzman Scholars" pages
    //    from different organizers) by suffixing the source domain
    disambiguateNames(drafts, ctx.existingEntries);

    // 8. finalize
    drafts.sort((a, b) => b.quality - a.quality);
    const returned = drafts.slice(0, 30);
    stats.returned = returned.length;
    ctx.onStats?.(stats);
    return returned;
  }

  private async planQueries(
    prompt: string,
    scope: Scope,
    maxQueries: number,
    recentQueries: string[] = [],
  ): Promise<string[]> {
    try {
      const { system, user } = queryPlannerMessages(prompt, scope, recentQueries);
      const parsed = await this.llm.chatJson({
        system,
        user,
        schema: plannerSchema,
        temperature: 0.5,
        // The planner prompt carries recent queries + already-covered program
        // names — 900 truncated the JSON mid-array on the gateway ("LLM JSON
        // is truncated"), silently dropping every round to the 1-query
        // fallback. Queries are short; 1800 leaves ample headroom.
        maxTokens: 1800,
      });
      const qs = [...new Set(parsed.queries.map((q) => q.trim()).filter(Boolean))].slice(0, maxQueries);
      if (qs.length > 0) return qs;
    } catch (err) {
      console.warn(
        '[search] query planning failed — using static fallback:',
        err instanceof Error ? err.message : String(err),
      );
    }
    // Static fallbacks: the typed prompt when present; otherwise the scope's
    // category include-angles (tag-only search), or one generic query.
    // Recent queries are filtered out here too, so even a planning failure
    // doesn't re-run the exact same web searches as the previous rounds.
    const fallback = prompt.trim().length >= 4
      ? [prompt.trim()]
      : scope !== 'all'
        ? CATEGORY_PROMPTS[scope].include
        : ['leadership fellowships programs for university students'];
    const used = new Set(recentQueries.map((q) => q.toLowerCase()));
    const fresh = fallback.filter((q) => !used.has(q.toLowerCase()));
    return (fresh.length > 0 ? fresh : fallback).slice(0, maxQueries);
  }

  /** Extracts one draft; null = page unusable (counted as extractionFailed). */
  private async extractDraft(
    hit: RawHit,
    pageText: string,
    scope: Scope,
    qualityFloor: number,
  ): Promise<EntryDraft | null> {
    const { system, user } = extractionMessages(hit, pageText, scope, qualityFloor);
    const raw = await this.llm.chatJson({
      system,
      user,
      schema: draftSchema,
      temperature: 0.1,
      maxTokens: 1500,
    });
    const name = raw.name.trim();
    const summary = raw.summary.trim();
    if (name.length < 3 || summary.length < 30) return null;

    let category: CategoryId;
    if (scope !== 'all') {
      category = scope; // the round was scoped — trust it over the model's guess
    } else if ((CATEGORY_IDS as readonly string[]).includes(raw.category)) {
      category = raw.category as CategoryId;
    } else {
      return null;
    }

    return {
      name,
      summary,
      url: hit.url,
      audience: raw.audience.slice(0, 10),
      startsAt: raw.startsAt,
      endsAt: raw.endsAt,
      timeline: raw.timeline ?? '',
      category,
      imageUrl: null,
      quality: Math.max(1, Math.min(100, Math.round(raw.quality))),
    };
  }
}

/** Bounded-concurrency map; order preserved. Shared with RealUpdateChecker. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Display-name disambiguation: when a draft shares its name with another
 * draft in the round or an entry already in the DB, append the source
 * domain — "Schwarzman Scholars — wesleyan.edu" vs "Schwarzman Scholars —
 * schwarzmanscholars.org". Deterministic (no LLM), case-insensitive on the
 * name, skips names that already carry a domain suffix.
 */
export function disambiguateNames(drafts: EntryDraft[], existing: ExistingEntryRef[]): void {
  const keyOf = (name: string) => name.trim().toLowerCase();
  const DOMAIN_RE = /\s—\s[a-z0-9.-]+\.[a-z]{2,}$/i;

  // count every name in play (drafts + existing entries) BEFORE mutating
  const seen = new Map<string, number>();
  for (const d of drafts) seen.set(keyOf(d.name), (seen.get(keyOf(d.name)) ?? 0) + 1);
  for (const e of existing) seen.set(keyOf(e.name), (seen.get(keyOf(e.name)) ?? 0) + 1);

  for (const d of drafts) {
    if ((seen.get(keyOf(d.name)) ?? 0) <= 1) continue; // unique — leave it alone
    if (DOMAIN_RE.test(d.name)) continue; // already suffixed (e.g. by a prior round)
    const host = hostOf(d.url);
    if (!host) continue;
    d.name = `${d.name} — ${host}`.slice(0, 200);
  }
}

/** Fetches a page as plain text; null = unreachable / not HTML / empty. */
export async function fetchPageText(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DKUResourceBank/1.0; program discovery)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html') && !type.includes('text/plain')) return null;
    const html = (await res.text()).slice(0, 500_000);
    return htmlToText(html).slice(0, 4000) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
