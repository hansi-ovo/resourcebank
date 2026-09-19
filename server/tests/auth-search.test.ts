import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { makeApp, login, type TestContext } from './harness';

let ctx: TestContext | null = null;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

describe('auth (01-architecture §6)', () => {
  it('wrong password -> 401 with copy-deck error message', async () => {
    const { app } = makeApp({ seed: true });
    const res = await request(app).post('/api/login').send({ password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Wrong password. Try again.');
  });

  it('admin endpoints 401 without cookie, 200 with it', async () => {
    const { app } = makeApp({ seed: true });
    const anon = await request(app).get('/api/summary');
    expect(anon.status).toBe(401);

    const cookie = await login(app);
    const authed = await request(app).get('/api/summary').set('Cookie', cookie);
    expect(authed.status).toBe(200);
    expect(authed.body).toHaveProperty('reviewCount');
    expect(authed.body).toHaveProperty('pendingUpdatesCount');
    expect(authed.body).toHaveProperty('lastSearchAt');
    expect(authed.body).toHaveProperty('searchRunning');
  });

  it('tampered cookie is rejected', async () => {
    const { app } = makeApp({ seed: true });
    const res = await request(app)
      .get('/api/summary')
      .set('Cookie', 'rb_session=admin.9999999999999.ZmFrZQ');
    expect(res.status).toBe(401);
  });

  it('public endpoints stay public (published, stream guard-free, health)', async () => {
    const { app } = makeApp({ seed: true });
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/published')).status).toBe(200);
  });

  it('rate limit: 5 login attempts per minute per IP then 429', async () => {
    const { app } = makeApp({ seed: true });
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/login').send({ password: 'nope' });
      expect(res.status).toBe(401);
    }
    const res = await request(app).post('/api/login').send({ password: 'pw' });
    expect(res.status).toBe(429);
  });

  it('logout sets a cleared cookie (session cookie no longer presented by clients)', async () => {
    const { app } = makeApp({ seed: true });
    const cookie = await login(app);
    expect((await request(app).get('/api/summary').set('Cookie', cookie)).status).toBe(200);
    const res = await request(app).post('/api/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    // server-side signed sessions stay valid until expiry by design (D4);
    // logout works by clearing the browser cookie (Max-Age=0).
    expect(String(res.headers['set-cookie']?.[0] ?? '')).toMatch(/Max-Age=0/);
  });
});

describe('search jobs (01-architecture §3)', () => {
  it('POST /api/search is 202 with jobId; job finishes and seeds review rows when DB has room', async () => {
    const { app } = makeApp({ seed: false, searchDelayMs: 20 });
    const cookie = await login(app);

    const before = await request(app).get('/api/summary').set('Cookie', cookie);
    expect(before.body.reviewCount).toBe(0);

    const res = await request(app)
      .post('/api/search')
      .set('Cookie', cookie)
      .send({ prompt: 'leadership fellowships for undergraduates in Asia', scope: 'all' });
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeGreaterThan(0);

    // wait for the 20ms job timer
    await new Promise((r) => setTimeout(r, 250));

    const after = await request(app).get('/api/summary').set('Cookie', cookie);
    expect(after.body.reviewCount).toBeGreaterThan(0);
    expect(after.body.lastSearchAt).not.toBeNull();
    expect(after.body.searchRunning).toBe(false);
  });

  it('a seeded DB (all 36 URLs present) yields 0 new items — URL dedupe across ALL statuses', async () => {
    const { app, db } = makeApp({ seed: true, searchDelayMs: 20 });
    const cookie = await login(app);
    const before = (
      db.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number }
    ).n;

    const res = await request(app)
      .post('/api/search')
      .set('Cookie', cookie)
      .send({ prompt: 'leadership fellowship in China', scope: 'all' });
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 250));

    const after = (
      db.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number }
    ).n;
    expect(after).toBe(before); // every mock result URL already exists → nothing inserted
  });

  it('invalid search bodies are 400', async () => {
    const { app } = makeApp({ seed: true });
    const cookie = await login(app);
    const res = await request(app).post('/api/search').set('Cookie', cookie).send({ prompt: '' });
    expect(res.status).toBe(400);
  });
});
