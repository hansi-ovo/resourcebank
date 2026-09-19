import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { makeApp, login, listEntries, type TestContext } from './harness';

let ctx: TestContext | null = null;
function fresh(): TestContext {
  ctx = makeApp({ searchDelayMs: 300 });
  return ctx;
}
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

describe('state machine (01-architecture §2)', () => {
  it('approve: review -> published', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const review = (await listEntries(app, cookie, 'review'))[0];
    expect(review).toBeTruthy();

    const res = await request(app).post(`/api/entries/${review.id}/approve`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');

    const published = await listEntries(app, cookie, 'published');
    expect(published.some((e) => e.id === review.id)).toBe(true);
  });

  it('remove: review -> removed (terminal); approve after remove is 409', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const review = (await listEntries(app, cookie, 'review'))[0];

    const res = await request(app).post(`/api/entries/${review.id}/remove`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('removed');

    const again = await request(app).post(`/api/entries/${review.id}/approve`).set('Cookie', cookie);
    expect(again.status).toBe(409);
  });

  it('withdraw: published -> withdrawn; removed rows are never re-suggested (URL stays blocked)', async () => {
    const { app, db } = fresh();
    const cookie = await login(app);
    const published = (await listEntries(app, cookie, 'published'))[0];

    const res = await request(app).post(`/api/entries/${published.id}/withdraw`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('withdrawn');

    // URL uniqueness across ALL statuses still enforced
    const dupe = db.prepare('SELECT COUNT(*) AS n FROM entries WHERE url = ?').get(published.url) as {
      n: number;
    };
    expect(dupe.n).toBe(1);
  });

  it('approve twice is 409 (published entry cannot be re-approved)', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const review = (await listEntries(app, cookie, 'review'))[0];
    await request(app).post(`/api/entries/${review.id}/approve`).set('Cookie', cookie);
    const res = await request(app).post(`/api/entries/${review.id}/approve`).set('Cookie', cookie);
    expect(res.status).toBe(409);
  });

  it('withdraw a review entry is 409', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const review = (await listEntries(app, cookie, 'review'))[0];
    const res = await request(app).post(`/api/entries/${review.id}/withdraw`).set('Cookie', cookie);
    expect(res.status).toBe(409);
  });
});

describe('batch operations', () => {
  it('batch approve applies to all valid review ids and reports counts', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const review = await listEntries(app, cookie, 'review');
    const ids = review.slice(0, 3).map((e) => e.id);

    const res = await request(app)
      .post('/api/entries/batch')
      .set('Cookie', cookie)
      .send({ ids, action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: 3, rejected: 0 });

    const published = await listEntries(app, cookie, 'published');
    for (const id of ids) expect(published.some((e) => e.id === id)).toBe(true);
  });

  it('batch remove marks terminal and ignores already-processed ids', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const review = await listEntries(app, cookie, 'review');
    const id = review[0].id;
    await request(app).post(`/api/entries/${id}/remove`).set('Cookie', cookie);

    const res = await request(app)
      .post('/api/entries/batch')
      .set('Cookie', cookie)
      .send({ ids: [id], action: 'remove' });
    expect(res.body).toEqual({ applied: 0, rejected: 1 });
  });
});

describe('inline edits (PUT /api/entries/:id)', () => {
  it('edits name/audience/category and persists', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const review = (await listEntries(app, cookie, 'review'))[0];

    const res = await request(app)
      .put(`/api/entries/${review.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Renamed Program', audience: ['Undergraduates', 'First-years'], category: 'events' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Program');
    expect(res.body.audience).toEqual(['Undergraduates', 'First-years']);
    expect(res.body.category).toBe('events');
  });

  it('rejects a URL that already exists (409)', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const review = (await listEntries(app, cookie, 'review'))[0];
    const other = (await listEntries(app, cookie, 'review'))[1];

    const res = await request(app)
      .put(`/api/entries/${review.id}`)
      .set('Cookie', cookie)
      .send({ url: other.url });
    expect(res.status).toBe(409);
  });

  it('empty patch is 400', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const review = (await listEntries(app, cookie, 'review'))[0];
    const res = await request(app).put(`/api/entries/${review.id}`).set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });
});

describe('/api/published (public)', () => {
  it('returns five sections in canonical order, published only', async () => {
    const { app } = fresh();
    const res = await request(app).get('/api/published');
    expect(res.status).toBe(200);
    expect(res.body.map((s: { category: { id: string } }) => s.category.id)).toEqual([
      'on-campus',
      'fellowships',
      'experiential',
      'events',
      'training',
    ]);
    for (const section of res.body) {
      for (const e of section.entries) expect(e.status).toBe('published');
    }
  });

  it('withdraw removes the entry from the public payload', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    const before = await request(app).get('/api/published').then((r) => r.body);
    const flat = before.flatMap((s: { entries: { id: number }[] }) => s.entries);
    const victim = flat[0];

    await request(app).post(`/api/entries/${victim.id}/withdraw`).set('Cookie', cookie);
    const after = await request(app).get('/api/published').then((r) => r.body);
    const flatAfter = after.flatMap((s: { entries: { id: number }[] }) => s.entries);
    expect(flatAfter.some((e: { id: number }) => e.id === victim.id)).toBe(false);
  });
});
