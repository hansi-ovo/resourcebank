import { describe, expect, it } from 'vitest';
import type { ExistingEntryRef } from '../src/providers/types';
import { classifyEntities, normalizeUrl, type JsonLlm } from '../src/providers/dedup';

describe('normalizeUrl (exact-page dedup layer)', () => {
  it('strips tracking params, www, trailing slash and upper case host', () => {
    const a = normalizeUrl('HTTPS://WWW.Example.org/programs/lead/');
    const b = normalizeUrl('https://example.org/programs/lead?utm_source=x&utm_campaign=y');
    expect(a).toBe(b);
    expect(a).toBe('https://example.org/programs/lead');
  });

  it('removes fragments and sorts remaining params for stability', () => {
    expect(normalizeUrl('https://a.org/p?b=2&a=1#section')).toBe('https://a.org/p?a=1&b=2');
  });

  it('keeps year edition paths distinct (…/2026 vs …/2027)', () => {
    expect(normalizeUrl('https://fellow.org/programs/2026')).not.toBe(
      normalizeUrl('https://fellow.org/programs/2027'),
    );
  });

  it('keeps sibling sub-programs distinct', () => {
    expect(normalizeUrl('https://inst.org/work/rural-health')).not.toBe(
      normalizeUrl('https://inst.org/work/climate-lab'),
    );
  });

  it('never throws on garbage input', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
    expect(normalizeUrl('')).toBe('');
  });

  it('keeps http for loopback hosts (local mock pages stay fetchable)', () => {
    expect(normalizeUrl('http://localhost:8999/program')).toBe('http://localhost:8999/program');
  });
});

/** Fake LLM that runs the caller's own zod schema over a canned reply. */
function fakeLlm(replyFor: (user: string) => unknown): JsonLlm {
  return {
    async chatJson(opts) {
      return opts.schema.parse(replyFor(opts.user));
    },
  };
}

const existing: ExistingEntryRef[] = [
  { id: 7, name: 'Global Leaders Fellowship 2026', url: 'https://glf.org/apply/2026', summary: 'Funded fellowship', category: 'fellowships', status: 'published' },
  { id: 9, name: 'Rural Health Initiative', url: 'https://inst.org/work/rural-health', summary: 'Field program', category: 'experiential', status: 'published' },
];

describe('classifyEntities (LLM entity dedup layer)', () => {
  it('routes verdicts to the right candidate index', async () => {
    const llm = fakeLlm(() => ({
      matches: [
        { index: 0, verdict: 'same_program_new_edition', entryId: 7, reason: '2027 edition of GLF' },
        { index: 1, verdict: 'new', entryId: null, reason: 'different organizer' },
      ],
    }));
    const out = await classifyEntities(
      llm,
      [
        { name: 'Global Leaders Fellowship 2027', url: 'https://glf.org/apply/2027', summary: 'Funded fellowship' },
        { name: 'Rural Health Initiative', url: 'https://other.org/rural-health', summary: 'Field program' },
      ],
      existing,
    );
    expect(out[0]).toMatchObject({ verdict: 'same_program_new_edition', entryId: 7 });
    expect(out[1]).toMatchObject({ verdict: 'new', entryId: null });
  });

  it('fails open to "new" when the LLM errors', async () => {
    const llm: JsonLlm = {
      chatJson: async () => {
        throw new Error('gateway down');
      },
    };
    const out = await classifyEntities(
      llm,
      [{ name: 'Some Program', url: 'https://x.org/p', summary: 'A program' }],
      existing,
    );
    expect(out[0]!.verdict).toBe('new');
  });

  it('ignores out-of-range indexes from a misbehaving model', async () => {
    const llm = fakeLlm(() => ({
      matches: [
        { index: 99, verdict: 'duplicate', entryId: 7, reason: 'hallucinated' },
        { index: 0, verdict: 'duplicate', entryId: 9, reason: 'same page again' },
      ],
    }));
    const out = await classifyEntities(
      llm,
      [{ name: 'Same Page', url: 'https://inst.org/work/rural-health', summary: 'Field program' }],
      existing,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.verdict).toBe('duplicate');
  });

  it('splits large candidate sets into batches and covers every index', async () => {
    const seenBatches: number[][] = [];
    const llm = fakeLlm((user) => {
      const parsed = JSON.parse(user) as { candidates: { index: number }[] };
      seenBatches.push(parsed.candidates.map((c) => c.index));
      return { matches: parsed.candidates.map((c) => ({ index: c.index, verdict: 'new', entryId: null, reason: '' })) };
    });
    const candidates = Array.from({ length: 23 }, (_, i) => ({
      name: `Program ${i}`,
      url: `https://p${i}.org/x`,
      summary: 'A program',
    }));
    const out = await classifyEntities(llm, candidates, existing);
    expect(out).toHaveLength(23);
    expect(seenBatches).toHaveLength(3); // 10 + 10 + 3
    expect(new Set(out.map((m) => m.index)).size).toBe(23);
  });
});
