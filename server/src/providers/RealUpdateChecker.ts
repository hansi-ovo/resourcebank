import { z } from 'zod';
import type { Entry, UpdateDiffItem } from '../../../shared/types';
import type { JsonLlm } from './dedup';
import type { UpdateChecker, UpdateDraft } from './types';
import { fetchPageText, mapLimit } from './WebSearchProvider';

/**
 * RealUpdateChecker — the drop-in UpdateChecker behind the D11 seam
 * (01-architecture.md §4). The weekly scheduled check (Monday 09:00
 * Asia/Shanghai) re-reads each published entry's official page and asks the
 * LLM gateway what changed; only real, visible differences become pending
 * diffs for the Check updates tab. The apply/discard review flow downstream
 * is unchanged.
 *
 * Safety rails:
 * - A dead/unreachable page (fetch null) never produces diffs.
 * - Every entry fails in isolation — one gateway hiccup skips that entry only.
 * - Dates must arrive as YYYY-MM-DD or the field is ignored (no guessing).
 * - Audience compares as a set, so tag reordering is not reported as a change.
 */

/** What the LLM may report for one page. null = unchanged / not comparable. */
export interface PageFacts {
  pageStatus: 'ok' | 'gone';
  endsAt: string | null;
  startsAt: string | null;
  timeline: string | null;
  audience: string[] | null;
}

const pageFactsSchema = z.object({
  pageStatus: z.enum(['ok', 'gone']),
  endsAt: z.string().max(10).nullable().catch(null),
  startsAt: z.string().max(10).nullable().catch(null),
  timeline: z.string().max(300).nullable().catch(null),
  audience: z.array(z.string().max(80)).max(10).nullable().catch(null),
});

const SYSTEM_PROMPT = `You are the update checker for a university student-opportunities database.
You receive ONE stored record and the current text of its official page.
Decide pageStatus:
- "gone" when the page is an error page, empty, or no longer about this program.
- "ok" otherwise.
When "ok", report ONLY fields the page now states differently from the stored record:
- "endsAt": application deadline as YYYY-MM-DD ("" when the page no longer states any deadline)
- "startsAt": program start date as YYYY-MM-DD ("" when no longer stated)
- "timeline": application timeline text, verbatim from the page
- "audience": the full eligibility/audience tag list shown on the page
Use null for a field that is unchanged, or that you cannot compare confidently.
Never guess, never invent values, never rephrase stored text.`;

/** Only the compared fields are sent; name/summary are too noisy to diff. */
function storedView(entry: Entry) {
  return {
    endsAt: entry.endsAt,
    startsAt: entry.startsAt,
    timeline: entry.timeline,
    audience: entry.audience,
  };
}

function pretty(dateIso: string | null): string {
  if (!dateIso) return 'none';
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function isoOrNull(v: string | null): string | null {
  return v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((x) => set.has(x));
}

/** Pure diff builder: stored entry vs page facts → pending diff items. */
export function buildUpdateDiff(entry: Entry, facts: PageFacts): UpdateDiffItem[] {
  if (facts.pageStatus !== 'ok') return [];
  const diff: UpdateDiffItem[] = [];

  const endsAt = isoOrNull(facts.endsAt);
  if (endsAt !== null && endsAt !== entry.endsAt) {
    diff.push({
      field: 'endsAt',
      from: entry.endsAt ?? '',
      to: endsAt,
      note: `Deadline changed from ${pretty(entry.endsAt)} to ${pretty(endsAt)} per program page`,
    });
  } else if (facts.endsAt === '' && entry.endsAt) {
    diff.push({
      field: 'endsAt',
      from: entry.endsAt,
      to: '',
      note: 'Deadline no longer stated on the program page',
    });
  }

  const startsAt = isoOrNull(facts.startsAt);
  if (startsAt !== null && startsAt !== entry.startsAt) {
    diff.push({
      field: 'startsAt',
      from: entry.startsAt ?? '',
      to: startsAt,
      note: `Start date changed from ${pretty(entry.startsAt)} to ${pretty(startsAt)} per program page`,
    });
  } else if (facts.startsAt === '' && entry.startsAt) {
    diff.push({
      field: 'startsAt',
      from: entry.startsAt,
      to: '',
      note: 'Start date no longer stated on the program page',
    });
  }

  const timeline = facts.timeline?.trim() ?? null;
  if (timeline !== null && timeline.length > 0 && timeline !== entry.timeline) {
    diff.push({
      field: 'timeline',
      from: entry.timeline,
      to: timeline,
      note: 'Application timeline updated per program page',
    });
  }

  if (facts.audience !== null && !sameSet(facts.audience, entry.audience)) {
    diff.push({
      field: 'audience',
      from: JSON.stringify(entry.audience),
      to: JSON.stringify(facts.audience),
      note: `Audience tags changed from [${entry.audience.join(', ') || 'none'}] to [${
        facts.audience.join(', ') || 'none'
      }] per program page`,
    });
  }

  return diff;
}

export interface RealUpdateCheckerOptions {
  fetchTimeoutMs?: number;
  concurrency?: number;
  /** Cap per round (stalest-updated entries win) — protects gateway quota. */
  maxEntries?: number;
  /** Test seam — defaults to the shared fetchPageText. */
  pageFetcher?: (url: string, timeoutMs: number) => Promise<string | null>;
}

const DEFAULTS: Required<Omit<RealUpdateCheckerOptions, 'pageFetcher'>> = {
  fetchTimeoutMs: 15_000,
  concurrency: 4,
  maxEntries: 50,
};

export class RealUpdateChecker implements UpdateChecker {
  constructor(
    private readonly llm: JsonLlm,
    private readonly opts: RealUpdateCheckerOptions = {},
  ) {}

  async check(entries: Entry[]): Promise<UpdateDraft[]> {
    const o = { ...DEFAULTS, ...this.opts };
    const targets = [...entries]
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, o.maxEntries);
    const pageFn = o.pageFetcher ?? fetchPageText;

    const drafts = await mapLimit(targets, o.concurrency, async (entry): Promise<UpdateDraft | null> => {
      try {
        if (!entry.url) return null;
        const page = await pageFn(entry.url, o.fetchTimeoutMs);
        if (!page) return null; // unreachable — never diff against a dead fetch
        const facts = await this.llm.chatJson({
          system: SYSTEM_PROMPT,
          user: JSON.stringify({ stored: storedView(entry), page }),
          schema: pageFactsSchema,
          temperature: 0,
          maxTokens: 1200,
        });
        const diff = buildUpdateDiff(entry, facts);
        return diff.length > 0 ? { entryId: entry.id, diff } : null;
      } catch (err) {
        console.warn(
          '[update-check] entry check failed:',
          err instanceof Error ? err.message : String(err),
          `(${entry.url})`,
        );
        return null;
      }
    });
    return drafts.filter((d): d is UpdateDraft => d !== null);
  }
}
