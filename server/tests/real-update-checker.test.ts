import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { makeApp, login, type TestContext } from './harness';
import { buildUpdateDiff, RealUpdateChecker, type PageFacts } from '../src/providers/RealUpdateChecker';
import { insertPendingUpdates, runScheduledCheck, applyDiffToEntry } from '../src/routes/updates';
import { createBus } from '../src/bus';
import type { Entry } from '../../shared/types';
import type { UpdateChecker, UpdateDraft } from '../src/providers/types';
import type { JsonLlm } from '../src/providers/dedup';

let ctx: TestContext | null = null;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
  vi.restoreAllMocks();
});

/** JsonLlm fake keyed off the user payload; falls back to schema.parse so
 *  generic values are coerced/validated like the real gateway path. */
function fakeLlm(value: unknown): JsonLlm;
function fakeLlm(value: (user: string) => unknown): JsonLlm;
function fakeLlm(value: unknown | ((user: string) => unknown)): JsonLlm {
  return {
    async chatJson(opts) {
      const v = typeof value === 'function' ? (value as (u: string) => unknown)(opts.user) : value;
      return opts.schema.parse(v);
    },
  };
}

const baseEntry = (over: Partial<Entry> = {}): Entry => ({
  id: 1,
  name: 'Test Fellowship',
  summary: 'A test fellowship for DKU students.',
  url: 'https://example.org/fellowship',
  audience: ['Undergraduates'],
  startsAt: null,
  endsAt: '2027-03-01',
  timeline: 'Apply by March 1',
  notes: '',
  category: 'fellowships',
  imageUrl: null,
  quality: 80,
  status: 'published',
  source: 'search',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('buildUpdateDiff (RealUpdateChecker)', () => {
  it('reports a deadline change as an endsAt diff with a note', () => {
    const diff = buildUpdateDiff(baseEntry(), { pageStatus: 'ok', endsAt: '2027-03-15', startsAt: null, timeline: null, audience: null });
    expect(diff).toEqual([
      {
        field: 'endsAt',
        from: '2027-03-01',
        to: '2027-03-15',
        note: expect.stringContaining('Deadline changed'),
      },
    ]);
  });

  it('reports a cleared deadline when the page no longer states one', () => {
    const diff = buildUpdateDiff(baseEntry(), { pageStatus: 'ok', endsAt: '', startsAt: null, timeline: null, audience: null });
    expect(diff).toEqual([
      { field: 'endsAt', from: '2027-03-01', to: '', note: expect.stringContaining('no longer stated') },
    ]);
  });

  it('reports start date and timeline changes', () => {
    const diff = buildUpdateDiff(
      baseEntry({ startsAt: '2027-06-01', timeline: 'Apply by June 1' }),
      { pageStatus: 'ok', endsAt: null, startsAt: '2027-06-10', timeline: 'Apply by June 15', audience: null },
    );
    expect(diff.map((d) => d.field)).toEqual(['startsAt', 'timeline']);
  });

  it('compares audience as a set â€?reordering is not a change', () => {
    const diff = buildUpdateDiff(
      baseEntry({ audience: ['A', 'B'] }),
      { pageStatus: 'ok', endsAt: null, startsAt: null, timeline: null, audience: ['B', 'A'] },
    );
    expect(diff).toEqual([]);
  });

  it('audience add and remove both produce diffs', () => {
    const added = buildUpdateDiff(
      baseEntry({ audience: ['A'] }),
      { pageStatus: 'ok', endsAt: null, startsAt: null, timeline: null, audience: ['A', 'B'] },
    );
    expect(added).toHaveLength(1);
    expect(JSON.parse(added[0]!.to)).toEqual(['A', 'B']);

    const removed = buildUpdateDiff(
      baseEntry({ audience: ['A', 'B'] }),
      { pageStatus: 'ok', endsAt: null, startsAt: null, timeline: null, audience: ['A'] },
    );
    expect(removed).toHaveLength(1);
  });

  it('ignores malformed dates (no guessing)', () => {
    const diff = buildUpdateDiff(
      baseEntry(),
      { pageStatus: 'ok', endsAt: 'March 15', startsAt: '15/03/2027', timeline: null, audience: null },
    );
    expect(diff).toEqual([]);
  });

  it('never diffs when pageStatus is not ok', () => {
    const diff = buildUpdateDiff(
      baseEntry(),
      { pageStatus: 'gone', endsAt: '1999-01-01', startsAt: '1999-01-01', timeline: 'x', audience: ['x'] },
    );
    expect(diff).toEqual([]);
  });

  it('unchanged page produces no diff', () => {
    const diff = buildUpdateDiff(
      baseEntry({ audience: ['Undergraduates'] }),
      { pageStatus: 'ok', endsAt: '2027-03-01', startsAt: '', timeline: 'Apply by March 1', audience: ['Undergraduates'] },
    );
    expect(diff).toEqual([]);
  });
});

describe('RealUpdateChecker.check', () => {
  it('skips entries whose page cannot be fetched (no diffs, no LLM call)', async () => {
    const llm = fakeLlm(() => {
      throw new Error('should not be called');
    });
    const checker = new RealUpdateChecker(llm, {
      pageFetcher: async () => null,
    });
    const out = await checker.check([baseEntry()]);
    expect(out).toEqual([]);
  });

  it('one failing entry is isolated â€?other entries still produce drafts', async () => {
    const okFacts: PageFacts = { pageStatus: 'ok', endsAt: '2027-04-01', startsAt: null, timeline: null, audience: null };
    // chatJson receives {stored, page} â€?the page text is the only
    // entry-distinguishing signal, so fail on the bad page's marker.
    const llmMixed = fakeLlm((user: string) => {
      if (user.includes('BADPAGE')) throw new Error('gateway 500');
      return okFacts;
    });
    const checker = new RealUpdateChecker(llmMixed, {
      pageFetcher: async (url) => (url.includes('bad') ? 'BADPAGE content' : 'GOODPAGE content'),
    });
    const out = await checker.check([
      baseEntry({ id: 1, url: 'https://bad.example.org' }),
      baseEntry({ id: 2, url: 'https://good.example.org' }),
    ]);
    expect(out).toEqual([{ entryId: 2, diff: [{ field: 'endsAt', from: '2027-03-01', to: '2027-04-01', note: expect.any(String) }] }]);

    // sanity: an all-fail checker also resolves without throwing
    const llmAllFail = fakeLlm(() => {
      throw new Error('gateway 500');
    });
    const all = await new RealUpdateChecker(llmAllFail, { pageFetcher: async () => 'page' }).check([baseEntry()]);
    expect(all).toEqual([]);
  });

  it('respects maxEntries â€?stalest-updated entries win', async () => {
    const seen: string[] = [];
    const checker = new RealUpdateChecker(fakeLlm(() => {
      throw new Error('should not be called');
    }), {
      pageFetcher: async (url) => {
        seen.push(url);
        return 'page';
      },
      maxEntries: 2,
    });
    await checker.check([
      baseEntry({ id: 1, url: 'https://a.example.org', updatedAt: '2026-05-01T00:00:00.000Z' }),
      baseEntry({ id: 2, url: 'https://b.example.org', updatedAt: '2026-01-01T00:00:00.000Z' }),
      baseEntry({ id: 3, url: 'https://c.example.org', updatedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(seen).toEqual(['https://b.example.org', 'https://c.example.org']);
  });
});

describe('scheduled check chain with a real-checker-shaped fake (D11)', () => {
  it('runScheduledCheck â†?insertPendingUpdates â†?apply patches the entry', async () => {
    ctx = makeApp({ seed: true });
    const { db, bus } = ctx;

    // Fake checker shaped like RealUpdateChecker: deterministic diff on the
    // timeline field (seed entries have non-empty timelines, null dates).
    const fake: UpdateChecker = {
      check: async (entries: Entry[]): Promise<UpdateDraft[]> =>
        entries
          .filter((e) => e.timeline.length > 0)
          .slice(0, 2)
          .map((e) => ({
            entryId: e.id,
            diff: [{ field: 'timeline' as const, from: e.timeline, to: `${e.timeline} (updated)`, note: 'Timeline moved' }],
          })),
    };
    const inserted = await runScheduledCheck({ db, bus, checker: fake });
    expect(inserted).toBeGreaterThanOrEqual(1);

    const cookie = await login(ctx.app);
    const pending = (await request(ctx.app).get('/api/updates?status=pending').set('Cookie', cookie)).body as Array<{
      id: number;
      entryId: number;
      diff: { field: string; from: string; to: string }[];
    }>;
    expect(pending.length).toBe(inserted);

    const target = pending[0]!;
    const res = await request(ctx.app).post(`/api/updates/${target.id}/apply`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.entry.timeline).toBe(`${target.diff[0].from} (updated)`);
    expect(res.body.entry.source).toBe('update-apply');
  });

  it('insertPendingUpdates is a no-op broadcast for an empty round', async () => {
    const { db, bus } = makeApp({ seed: true });
    const spy = vi.spyOn(bus, 'emitUpdatesChanged');
    const n = insertPendingUpdates(db, bus, []);
    expect(n).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    db.close();
  });

  it('applyDiffToEntry applies a real-checker diff shape end-to-end', async () => {
    const { db, bus } = makeApp({ seed: true });
    const row = db.prepare("SELECT * FROM entries WHERE status = 'published' LIMIT 1").get() as {
      id: number;
    };
    const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(row.id) as never;
    // toEntry is exported from ../src/db; build via row directly.
    const { toEntry } = await import('../src/db');
    const before = toEntry(entry);
    const after = applyDiffToEntry(db, bus, before, [
      { field: 'timeline', from: before.timeline, to: 'New timeline from page', note: 'Timeline updated' },
    ]);
    expect(after.timeline).toBe('New timeline from page');
    expect(after.source).toBe('update-apply');
    db.close();
  });
});

