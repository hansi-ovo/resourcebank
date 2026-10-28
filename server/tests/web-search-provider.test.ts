import { describe, expect, it } from 'vitest';
import { WebSearchProvider, disambiguateNames } from '../src/providers/WebSearchProvider';
import { CATEGORY_PROMPTS } from '../src/providers/category-prompts';
import type { JsonLlm } from '../src/providers/dedup';
import type { SearchSource } from '../src/providers/search-source';
import type { ExistingEntryRef, RawHit, SearchContext } from '../src/providers/types';
import type { EntryDraft, SearchStats } from '../../shared/types';

/**
 * Offline pipeline test: fake LLM (keyed by system prompt), fake search
 * source, injected page fetcher — no network anywhere.
 */

const PLANNER_MARK = 'plan web searches';
const JUDGE_MARK = 'deduplication judge';

function fakeLlm(paths: { plan?: unknown; classify?: unknown; extract?: unknown }): JsonLlm {
  return {
    async chatJson(opts) {
      let value: unknown;
      if (opts.system.includes(PLANNER_MARK)) value = paths.plan;
      else if (opts.system.includes(JUDGE_MARK)) value = paths.classify;
      else value = paths.extract;
      return opts.schema.parse(value);
    },
  };
}

function fakeSource(hits: RawHit[]) {
  const seenQueries: string[][] = [];
  const source: SearchSource = {
    kind: 'tavily',
    search: async (queries) => {
      seenQueries.push(queries);
      return hits;
    },
  };
  return { source, seenQueries };
}

const EXISTING: ExistingEntryRef[] = [
  {
    id: 7,
    name: 'Global Leaders Fellowship 2026',
    url: 'https://glf.org/apply/2026',
    summary: 'Funded fellowship for undergraduates.',
    category: 'fellowships',
    status: 'published',
  },
];

function makeCtx(
  opts: {
    existingUrls?: string[];
    existingEntries?: ExistingEntryRef[];
    recentQueries?: string[];
  } = {},
) {
  const editions: Array<{ name: string; url: string }> = [];
  const holder: { stats: SearchStats | undefined } = { stats: undefined };
  const ctx: SearchContext = {
    existingUrls: new Set(opts.existingUrls ?? []),
    existingEntries: opts.existingEntries ?? [],
    recentQueries: opts.recentQueries ?? [],
    onSameProgramEdition: (c) => {
      editions.push(c);
    },
    onStats: (s) => {
      holder.stats = s;
    },
  };
  return { ctx, editions, holder };
}

const GOOD_DRAFT_BASE = {
  name: 'Young Leaders Fellowship',
  summary:
    'A fully funded one-year fellowship for undergraduates in Asia, with mentorship and a clear application deadline each spring.',
  audience: ['undergraduates'],
  startsAt: null,
  endsAt: '2027-03-01',
  timeline: 'Apply by Mar 1, 2027',
  category: 'fellowships' as const,
  imageUrl: null,
  quality: 88,
};
const GOOD_DRAFT: EntryDraft = { ...GOOD_DRAFT_BASE, url: 'https://ylf.org/apply' };

const HIT_A: RawHit = { title: 'Young Leaders Fellowship', url: 'https://ylf.org/apply', snippet: 'Funded fellowship' };
const HIT_B: RawHit = { title: 'Asia Youth Summit', url: 'https://ays.org/2027', snippet: 'Delegate summit' };

function makeProvider(
  llmPaths: Parameters<typeof fakeLlm>[0],
  hits: RawHit[],
  pageFetcher: (url: string) => Promise<string | null> = async (url) => `Page text about ${url}`,
) {
  const { source, seenQueries } = fakeSource(hits);
  const provider = new WebSearchProvider(fakeLlm(llmPaths), source, { qualityFloor: 70, pageFetcher });
  return { provider, seenQueries };
}

describe('WebSearchProvider pipeline', () => {
  it('end-to-end: plans queries, extracts drafts, reports stats', async () => {
    const { provider, seenQueries } = makeProvider(
      { plan: { queries: ['fellowship asia undergraduate funded', 'youth summit delegates 2027'] }, classify: { matches: [] }, extract: GOOD_DRAFT },
      [HIT_A, HIT_B],
    );
    const { ctx, holder } = makeCtx();
    const drafts = await provider.search('fellowships for undergraduates', 'all', ctx);

    // planner's 2 queries lead; the pool pads them up to ≥ 4 angles
    expect(seenQueries[0]!.slice(0, 2)).toEqual(['fellowship asia undergraduate funded', 'youth summit delegates 2027']);
    expect(seenQueries[0]!.length).toBeGreaterThanOrEqual(4);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.quality).toBe(88);
    expect(holder.stats).toMatchObject({
      candidatesFound: 2,
      dedupSkipped: 0,
      sameProgramEditions: 0,
      extractionFailed: 0,
      lowQuality: 0,
      returned: 2,
    });
  });

  it('skips URLs already in the DB before spending LLM calls', async () => {
    const { provider } = makeProvider(
      { plan: { queries: ['q one'] }, classify: { matches: [{ index: 0, verdict: 'new', entryId: null, reason: '' }] }, extract: GOOD_DRAFT },
      [HIT_A, { ...HIT_B, url: EXISTING[0]!.url }],
    );
    const { ctx, holder } = makeCtx({ existingUrls: [EXISTING[0]!.url] });
    const drafts = await provider.search('fellowships', 'all', ctx);

    expect(drafts).toHaveLength(1);
    expect(holder.stats).toMatchObject({ candidatesFound: 2, dedupSkipped: 1, returned: 1 });
  });

  it('routes same_program_new_edition to onSameProgramEdition instead of drafts', async () => {
    const { provider } = makeProvider(
      {
        plan: { queries: ['glf 2027'] },
        classify: { matches: [{ index: 0, verdict: 'same_program_new_edition', entryId: 7, reason: '2027 edition' }] },
        extract: GOOD_DRAFT,
      },
      [{ title: 'Global Leaders Fellowship 2027', url: 'https://glf.org/apply/2027', snippet: 'Funded fellowship' }],
    );
    const { ctx, editions, holder } = makeCtx({ existingEntries: EXISTING });
    const drafts = await provider.search('fellowships', 'all', ctx);

    expect(drafts).toHaveLength(0);
    expect(editions).toEqual([{ name: 'Global Leaders Fellowship 2027', url: 'https://glf.org/apply/2027' }]);
    expect(holder.stats).toMatchObject({ sameProgramEditions: 1, returned: 0 });
  });

  it('drops drafts below the quality floor into lowQuality', async () => {
    const { provider } = makeProvider(
      { plan: { queries: ['q one'] }, classify: { matches: [] }, extract: { ...GOOD_DRAFT, quality: 40 } },
      [HIT_A],
    );
    const { ctx, holder } = makeCtx();
    const drafts = await provider.search('fellowships', 'all', ctx);

    expect(drafts).toHaveLength(0);
    expect(holder.stats).toMatchObject({ lowQuality: 1, returned: 0 });
  });

  it('forces the scope category over the model guess', async () => {
    const { provider } = makeProvider(
      { plan: { queries: ['q one'] }, classify: { matches: [] }, extract: { ...GOOD_DRAFT, category: 'events' } },
      [HIT_A],
    );
    const { ctx } = makeCtx();
    const drafts = await provider.search('leadership training', 'training', ctx);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.category).toBe('training');
  });

  it('a dead search source ends the round with stats.error and no drafts', async () => {
    const llm = fakeLlm({ plan: { queries: ['q one'] } });
    const source: SearchSource = {
      kind: 'tavily',
      search: async () => {
        throw new Error('tavily 429 — quota exhausted');
      },
    };
    const provider = new WebSearchProvider(llm, source, { qualityFloor: 70 });
    const { ctx, holder } = makeCtx();
    const drafts = await provider.search('anything', 'all', ctx);

    expect(drafts).toEqual([]);
    expect(holder.stats?.error).toContain('429');
    expect(holder.stats?.returned).toBe(0);
  });

  it('counts unreachable pages as extractionFailed', async () => {
    const { provider } = makeProvider(
      { plan: { queries: ['q one'] }, classify: { matches: [] }, extract: GOOD_DRAFT },
      [HIT_A, HIT_B],
      async () => null, // every fetch fails
    );
    const { ctx, holder } = makeCtx();
    const drafts = await provider.search('fellowships', 'all', ctx);

    expect(drafts).toHaveLength(0);
    expect(holder.stats).toMatchObject({ extractionFailed: 2, returned: 0 });
  });

  it('falls back to the raw prompt when query planning fails', async () => {
    const { provider, seenQueries } = makeProvider(
      { plan: null, classify: { matches: [] }, extract: GOOD_DRAFT }, // planner returns garbage
      [HIT_A],
    );
    const { ctx } = makeCtx();
    const drafts = await provider.search('fellowships for undergraduates', 'all', ctx);

    // prompt first, then padded from the generic angle pool (≥ 4 total)
    expect(seenQueries[0]).toHaveLength(7);
    expect(seenQueries[0]![0]).toBe('fellowships for undergraduates');
    expect(drafts).toHaveLength(1);
  });

  it('tag-only search: empty prompt falls back to the scope category angles', async () => {
    const { provider, seenQueries } = makeProvider(
      { plan: { queries: [] }, classify: { matches: [] }, extract: GOOD_DRAFT }, // planner yields nothing
      [HIT_A],
    );
    const { ctx } = makeCtx();
    const drafts = await provider.search('', 'fellowships', ctx);

    // the scope's include-angles lead the pool, padded with year variants
    expect(seenQueries[0]!.slice(0, 4)).toEqual(CATEGORY_PROMPTS.fellowships.include.slice(0, 4));
    expect(seenQueries[0]!.length).toBeGreaterThanOrEqual(4);
    expect(drafts).toHaveLength(1);
  });

  it('pads an under-delivering planner up to ≥ 4 queries', async () => {
    const { provider, seenQueries } = makeProvider(
      { plan: { queries: ['only one query'] }, classify: { matches: [] }, extract: GOOD_DRAFT },
      [HIT_A],
    );
    const { ctx } = makeCtx();
    await provider.search('', 'fellowships', ctx);

    const qs = seenQueries[0]!;
    expect(qs[0]).toBe('only one query'); // the planner's query still leads
    expect(qs.length).toBeGreaterThanOrEqual(4);
    // padding comes from the scope's include-angles (planner prompt was empty)
    expect(qs.slice(1)).toEqual(expect.arrayContaining(CATEGORY_PROMPTS.fellowships.include));
    // no duplicates
    expect(new Set(qs.map((q) => q.toLowerCase())).size).toBe(qs.length);
  });

  it('recent-round queries are filtered out of both planned and padded queries', async () => {
    const { provider, seenQueries } = makeProvider(
      { plan: { queries: ['only one query'] }, classify: { matches: [] }, extract: GOOD_DRAFT },
      [HIT_A],
    );
    const recent = [CATEGORY_PROMPTS.fellowships.include[0]!];
    const { ctx } = makeCtx({ recentQueries: recent });
    await provider.search('', 'fellowships', ctx);

    const qs = seenQueries[0]!;
    expect(qs).not.toContain(recent[0]);
    expect(qs.length).toBeGreaterThanOrEqual(3); // planner's 1 + pool minus the used angle
  });

  it('tag-only search with scope=all falls back to the generic angle pool', async () => {
    const { provider, seenQueries } = makeProvider(
      { plan: null, classify: { matches: [] }, extract: GOOD_DRAFT },
      [HIT_A],
    );
    const { ctx } = makeCtx();
    const drafts = await provider.search('', 'all', ctx);

    expect(seenQueries[0]![0]).toBe('fully funded leadership fellowships for university students');
    expect(seenQueries[0]!.length).toBeGreaterThanOrEqual(4);
    expect(drafts).toHaveLength(1);
  });

  it('suffixes source domain when two drafts in a round share a name', async () => {
    const draftFor = (url: string, name: string) => ({
      ...GOOD_DRAFT,
      name,
      url,
    });
    const makeDraftSource = (hits: RawHit[]) => {
      const { source } = fakeSource(hits);
      return source;
    };
    // The extract LLM always returns GOOD_DRAFT — the same NAME for both
    // hits; only the URLs differ (two organizers' pages for Schwarzman).
    const provider = new WebSearchProvider(
      fakeLlm({ plan: { queries: ['schwarzman'] }, classify: { matches: [] }, extract: GOOD_DRAFT }),
      makeDraftSource([
        { title: 'Schwarzman Scholars', url: 'https://www.wesleyan.edu/schwarzman', snippet: 'x' },
        { title: 'Schwarzman Scholars', url: 'https://schwarzmanscholars.org/about', snippet: 'y' },
      ]),
      { qualityFloor: 70, pageFetcher: async (url) => `text ${url}` },
    );
    const { ctx } = makeCtx();
    const drafts = await provider.search('schwarzman scholars', 'all', ctx);

    expect(drafts).toHaveLength(2);
    const names = drafts.map((d) => d.name).sort();
    expect(names).toEqual([
      'Young Leaders Fellowship — schwarzmanscholars.org',
      'Young Leaders Fellowship — wesleyan.edu',
    ]);
  });

  it('suffixes a draft that collides with an existing DB entry name', async () => {
    const provider = new WebSearchProvider(
      fakeLlm({ plan: { queries: ['glf'] }, classify: { matches: [] }, extract: GOOD_DRAFT }),
      fakeSource([{ title: 'Global Leaders Fellowship', url: 'https://glf.example.org/2027', snippet: 'x' }]).source,
      { qualityFloor: 70, pageFetcher: async (url) => `text ${url}` },
    );
    // extract returns GOOD_DRAFT named "Young Leaders Fellowship" — rename the
    // fake to collide with EXISTING via a targeted fake below instead:
    const colliding = { ...GOOD_DRAFT, name: 'Global Leaders Fellowship 2026' };
    const p2 = new WebSearchProvider(
      fakeLlm({ plan: { queries: ['glf'] }, classify: { matches: [] }, extract: colliding }),
      fakeSource([{ title: 'GLF', url: 'https://glf.example.org/2027', snippet: 'x' }]).source,
      { qualityFloor: 70, pageFetcher: async (url) => `text ${url}` },
    );
    void provider;
    const { ctx } = makeCtx({ existingEntries: EXISTING });
    const drafts = await p2.search('glf', 'all', ctx);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.name).toBe('Global Leaders Fellowship 2026 — glf.example.org');
  });

  it('leaves unique names untouched', async () => {
    const drafts: EntryDraft[] = [
      { ...GOOD_DRAFT, name: 'Young Leaders Fellowship', url: 'https://ylf.org/apply' },
    ];
    disambiguateNames(drafts, EXISTING);
    expect(drafts[0]!.name).toBe('Young Leaders Fellowship');
  });

  it('does not double-suffix a name that already carries a domain', async () => {
    // "Young Leaders Fellowship — ylf.org" no longer matches the bare key
    // "young leaders fellowship", so neither draft is treated as a collision —
    // the suffixed form survives verbatim and the bare one is unique.
    const drafts: EntryDraft[] = [
      { ...GOOD_DRAFT, name: 'Young Leaders Fellowship — ylf.org', url: 'https://ylf.org/apply' },
      { ...GOOD_DRAFT, name: 'young leaders fellowship', url: 'https://other.org/x' },
    ];
    disambiguateNames(drafts, []);
    expect(drafts[0]!.name).toBe('Young Leaders Fellowship — ylf.org');
    expect(drafts[1]!.name).toBe('young leaders fellowship');
  });
});
