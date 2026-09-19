import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { makeApp, login, listEntries, type TestContext } from './harness';
import { MockSearchProvider } from '../src/providers/MockSearchProvider';
import { SEED_ENTRIES } from '../../shared/seed-data';

let ctx: TestContext | null = null;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

describe('MockSearchProvider scoring (01-architecture §4)', () => {
  const provider = new MockSearchProvider();

  it('dedupes against existing URLs (any status)', async () => {
    const existing = new Set([SEED_ENTRIES[0].url, SEED_ENTRIES[5].url]);
    const out = await provider.search('leadership', 'all', existing);
    expect(out.some((d) => existing.has(d.url))).toBe(false);
  });

  it('scope match scores above out-of-scope entries', async () => {
    const out = await provider.search('leadership programs for students', 'fellowships', new Set());
    // top 8 should lean fellowships heavily (in-scope +20, out-of-scope −20)
    const fellowships = out.slice(0, 8).filter((d) => d.category === 'fellowships');
    expect(fellowships.length).toBeGreaterThanOrEqual(6);
  });

  it('keyword hits raise matching entries', async () => {
    const out = await provider.search('wilderness outdoor expedition', 'all', new Set());
    expect(out[0]!.name).toContain('NOLS');
  });

  it('returns at most 30 drafts', async () => {
    const out = await provider.search('program', 'all', new Set());
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.length).toBeGreaterThan(0);
  });

  it('ties break by earlier seed index', async () => {
    const out = await provider.search('zzz-no-keyword-match', 'all', new Set());
    // all score 60 (no scope, no hits) → seed order preserved
    expect(out[0]!.name).toBe(SEED_ENTRIES[0].name);
  });
});

describe('updates: demo injection, apply, discard (D11)', () => {
  it('demo/update-check injects pending diffs for published entries', async () => {
    const { app } = makeApp({ seed: true });
    const cookie = await login(app);
    const res = await request(app).post('/api/updates/demo/update-check').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBeGreaterThanOrEqual(2);
    expect(res.body.inserted).toBeLessThanOrEqual(3);

    const list = await request(app).get('/api/updates?status=pending').set('Cookie', cookie);
    expect(list.body.length).toBe(res.body.inserted);
    for (const u of list.body) {
      expect(u.entryName).toBeTruthy();
      expect(Array.isArray(u.diff)).toBe(true);
      expect(u.diff[0].note).toBeTruthy();
    }
  });

  it('apply patches the entry, sets source=update-apply, clears pending', async () => {
    const { app } = makeApp({ seed: true });
    const cookie = await login(app);
    await request(app).post('/api/updates/demo/update-check').set('Cookie', cookie);
    const pending = (
      await request(app).get('/api/updates?status=pending').set('Cookie', cookie)
    ).body as Array<{ id: number; entryId: number; diff: { field: string; from: string; to: string }[] }>;

    // pick one with a date diff to verify the field patch
    const target = pending[0];
    const res = await request(app).post(`/api/updates/${target.id}/apply`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.entry.source).toBe('update-apply');

    const entry = (
      await request(app).get(`/api/entries?status=published`).set('Cookie', cookie)
    ).body.find((e: { id: number }) => e.id === target.entryId);
    for (const d of target.diff) {
      if (d.field === 'endsAt') expect(entry.endsAt).toBe(d.to);
      if (d.field === 'startsAt') expect(entry.startsAt).toBe(d.to);
      if (d.field === 'audience') expect(JSON.stringify(entry.audience)).toBe(d.to);
    }

    const after = (
      await request(app).get('/api/updates?status=pending').set('Cookie', cookie)
    ).body as unknown[];
    expect(after.some((u) => (u as { id: number }).id === target.id)).toBe(false);
  });

  it('discard removes the row from pending without touching the entry', async () => {
    const { app } = makeApp({ seed: true });
    const cookie = await login(app);
    await request(app).post('/api/updates/demo/update-check').set('Cookie', cookie);
    const pending = (
      await request(app).get('/api/updates?status=pending').set('Cookie', cookie)
    ).body as Array<{ id: number; entryId: number }>;

    const res = await request(app).post(`/api/updates/${pending[0].id}/discard`).set('Cookie', cookie);
    expect(res.status).toBe(200);

    const after = (
      await request(app).get('/api/updates?status=pending').set('Cookie', cookie)
    ).body as Array<{ id: number }>;
    expect(after.some((u) => u.id === pending[0].id)).toBe(false);

    const published = await listEntries(app, cookie, 'published');
    expect(published.some((e) => e.id === pending[0].entryId)).toBe(true);
  });

  it('apply on a non-pending id is 404', async () => {
    const { app } = makeApp({ seed: true });
    const cookie = await login(app);
    const res = await request(app).post('/api/updates/999999/apply').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

describe('SSE stream (01-architecture §5)', () => {
  it('streams entries-changed when an entry is approved; headers are SSE-correct', async () => {
    const { app } = makeApp({ seed: true });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      let head: http.IncomingMessage | null = null;
      const collected: string[] = [];
      const sawEvent = new Promise<void>((resolve) => {
        const req = http.get({ port, path: '/api/stream' }, (res) => {
          head = res;
          res.setEncoding('utf-8');
          res.on('data', (chunk) => {
            collected.push(chunk as string);
            if (collected.join('').includes('event: entries-changed')) resolve();
          });
        });
        req.on('error', () => {
          /* socket destroyed after verdict — expected */
        });
      });
      await new Promise<void>((resolve) => {
        const check = () => (head ? resolve() : setTimeout(check, 20));
        check();
      });

      // handshake headers
      expect(head).not.toBeNull();
      expect(head!.statusCode).toBe(200);
      expect(head!.headers['content-type']).toContain('text/event-stream');
      expect(head!.headers['x-accel-buffering']).toBe('no');

      // drive a mutation through the same app and confirm the event arrives
      const cookie = await login(app);
      const review = (await listEntries(app, cookie, 'review'))[0];
      const res = await request(app).post(`/api/entries/${review.id}/approve`).set('Cookie', cookie);
      expect(res.status).toBe(200);

      await sawEvent; // entries-changed received on the open stream
    } finally {
      server.close();
    }
  });
});
