import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeApp, login, type TestContext } from './harness';

let ctx: TestContext | null = null;
function fresh(): TestContext {
  ctx = makeApp();
  return ctx;
}
function uploadsDir(): string {
  return path.join(ctx!.dir, 'uploads');
}
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

/** 1x1 transparent PNG — a complete, valid image in 70 bytes. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('POST /api/uploads (admin) + GET /api/uploads/:file (public)', () => {
  it('stores a PNG, returns the servable path, and serves it back byte-identical', async () => {
    const { app } = fresh();
    const cookie = await login(app);

    const post = await request(app)
      .post('/api/uploads')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/png')
      .send(PNG_1X1);
    expect(post.status).toBe(201);
    const url = (post.body as { url: string }).url;
    expect(url).toMatch(/^\/api\/uploads\/img-[a-z0-9]+-[a-f0-9]+\.png$/);

    // GET is PUBLIC (display site loads these) 鈥?no cookie
    const get = await request(app).get(url);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toMatch(/image\/png/);
    expect(get.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(get.body as Buffer, PNG_1X1)).toBe(0);

    // the file physically lives in the uploads dir under the generated name
    expect(readFileSync(path.join(uploadsDir(), url.split('/').pop()!)).equals(PNG_1X1)).toBe(true);
  });

  it('rejects a body whose bytes do not match the claimed image type', async () => {
    const { app } = fresh();
    const cookie = await login(app);

    const res = await request(app)
      .post('/api/uploads')
      .set('Cookie', cookie)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('definitely not a jpeg, just text'));
    expect(res.status).toBe(415);
    expect((res.body as { error: string }).error).toMatch(/not a valid image/i);
  });

  it('rejects a non-image content type outright', async () => {
    const { app } = fresh();
    const cookie = await login(app);

    const res = await request(app)
      .post('/api/uploads')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"nope":1}');
    expect(res.status).toBe(415);
  });

  it('requires admin auth for uploads', async () => {
    const { app } = fresh();
    const res = await request(app)
      .post('/api/uploads')
      .set('Content-Type', 'image/png')
      .send(PNG_1X1);
    expect(res.status).toBe(401);
  });

  it('GET only serves generated names 鈥?no traversal, no arbitrary files', async () => {
    const { app } = fresh();
    const cookie = await login(app);
    await request(app).post('/api/uploads').set('Cookie', cookie).set('Content-Type', 'image/png').send(PNG_1X1);

    for (const bad of ['..%2F..%2Frb.sqlite', 'img-x.png', 'rb.sqlite', 'img-aaaaaaaaaaa-0000000000.html']) {
      const res = await request(app).get(`/api/uploads/${bad}`);
      expect(res.status).toBe(404);
    }
  });

  it('manual entry creation accepts a relative /api/uploads image path', async () => {
    const { app } = fresh();
    const cookie = await login(app);

    // previously createSchema required .url() 鈥?uploaded paths were rejected
    const create = await request(app)
      .post('/api/entries')
      .set('Cookie', cookie)
      .send({
        name: 'Uploaded Image Program',
        summary: 'A manual entry whose card art came from a local file upload.',
        url: `https://example.org/upload-${Date.now()}`,
        category: 'fellowships',
        imageUrl: '/api/uploads/img-lz3k9x-abc123def.png',
      });
    expect(create.status).toBe(201);
    expect((create.body as { imageUrl: string }).imageUrl).toBe('/api/uploads/img-lz3k9x-abc123def.png');
  });
});
