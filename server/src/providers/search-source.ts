import { z } from 'zod';
import { config } from '../config';
import { normalizeUrl } from './dedup';
import type { RawHit } from './types';

/**
 * Search sources (search-upgrade Step 1). A source turns queries into
 * RawHits; everything else (entity dedup, page fetching, extraction,
 * scoring) lives in WebSearchProvider.
 *
 * The DKU NewAPI gateway exposes chat models only — no web-search-capable
 * model — so Tavily is the wired source (queries only leave campus; page
 * content extraction happens through the campus LLM).
 */

export interface SearchSource {
  readonly kind: 'tavily' | 'searxng' | 'gateway';
  search(queries: string[]): Promise<RawHit[]>;
}

/** Binary/static extensions never worth an LLM extraction round-trip. */
const SKIP_URL = /\.(jpe?g|png|gif|svg|ico|css|js|mjs|woff2?|ttf|eot|mp4|mp3|zip|pdf)$/i;

export function collectHits(hits: Map<string, RawHit>, title: string, url: string, snippet: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  if (SKIP_URL.test(new URL(url).pathname)) return;
  const norm = normalizeUrl(url);
  if (!hits.has(norm)) {
    hits.set(norm, {
      title: title.slice(0, 200),
      url: norm,
      snippet: snippet.slice(0, 400),
    });
  }
}

export function createSearchSource(): SearchSource {
  switch (config.searchSource) {
    case 'tavily':
      return new TavilySearchSource(config.tavilyApiKey, config.tavilyBaseUrl);
    default:
      throw new Error(
        `SEARCH_SOURCE=${config.searchSource} has no implementation. Set SEARCH_SOURCE=tavily (SearXNG planned).`,
      );
  }
}

const tavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().catch(''),
        url: z.string(),
        content: z.string().catch(''),
      }),
    )
    .catch([]),
});

/**
 * Tavily search API (api.tavily.com). Queries run in parallel; one query
 * failing doesn't sink the round — only a total failure throws.
 */
export class TavilySearchSource implements SearchSource {
  readonly kind = 'tavily' as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly maxResultsPerQuery = 8,
    private readonly timeoutMs = 20_000,
  ) {}

  async search(queries: string[]): Promise<RawHit[]> {
    if (queries.length === 0) return [];
    const settled = await Promise.allSettled(queries.map((q) => this.query(q)));
    const hits = new Map<string, RawHit>();
    let failures = 0;
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        for (const r of s.value) collectHits(hits, r.title, r.url, r.content);
      } else {
        failures += 1;
        console.error('[search-source] tavily query failed:', s.reason instanceof Error ? s.reason.message : s.reason);
      }
    }
    if (failures === settled.length) {
      throw new Error(`all ${settled.length} tavily queries failed (network or API key?)`);
    }
    return [...hits.values()];
  }

  private async query(q: string): Promise<{ title: string; url: string; content: string }[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query: q,
          topic: 'general',
          search_depth: 'basic',
          max_results: this.maxResultsPerQuery,
          include_answer: false,
        }),
        signal: controller.signal,
      });
      if (res.status === 401) throw new Error('tavily 401 — check TAVILY_API_KEY');
      if (res.status === 429) throw new Error('tavily 429 — monthly quota exhausted');
      if (!res.ok) throw new Error(`tavily HTTP ${res.status}`);
      return tavilyResponseSchema.parse(await res.json()).results;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * GatewaySearchSource would ask a web-connected LLM for results. The DKU
 * gateway currently exposes no search-capable model (verified via
 * scripts/llm-smoke.mjs), so this stays a stub until one appears.
 */
export class GatewaySearchSource implements SearchSource {
  readonly kind = 'gateway' as const;
  async search(_queries: string[]): Promise<RawHit[]> {
    throw new Error('GatewaySearchSource: the DKU gateway has no web-search model; use SEARCH_SOURCE=tavily');
  }
}
