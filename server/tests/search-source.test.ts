import { afterAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { SearxngSearchSource, TavilySearchSource } from '../src/providers/search-source';

/**
 * Offline Tavily adapter test: a local mock speaks the Tavily /search
 * contract; TAVILY_BASE_URL-style injection points the adapter at it.
 * Covers normalization/dedupe/filters, per-query failure tolerance, and
 * total-failure/401 propagation.
 */

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/search') {
    res.statusCode = 404;
    res.end();
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { query } = JSON.parse(body) as { query: string };
    if (query.includes('FAIL')) {
      res.statusCode = 500;
      res.end('boom');
      return;
    }
    if (query.includes('UNAUTH')) {
      res.statusCode = 401;
      res.end('bad key');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        results: [
          { title: 'Program A tracked', url: 'https://a.org/program?utm_source=x', content: 'A program' },
          { title: 'Program A dup', url: 'https://a.org/program', content: 'Same page again' },
          { title: 'logo', url: 'https://a.org/logo.png', content: '' },
          { title: 'not http', url: 'ftp://b.org/file', content: '' },
        ],
      }),
    );
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
afterAll(() => server.close());

describe('TavilySearchSource', () => {
  it('normalizes, dedupes and filters results', async () => {
    const src = new TavilySearchSource('tvly-test', base);
    const hits = await src.search(['good', 'good again']);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ title: 'Program A tracked', url: 'https://a.org/program' });
  });

  it('tolerates one failing query while others succeed', async () => {
    const src = new TavilySearchSource('tvly-test', base);
    const hits = await src.search(['good', 'FAIL me']);
    expect(hits).toHaveLength(1);
  });

  it('throws when every query fails', async () => {
    const src = new TavilySearchSource('tvly-test', base);
    await expect(src.search(['FAIL a', 'FAIL b'])).rejects.toThrow(/all 2 tavily queries failed/);
  });

  it('surfaces auth failure as a thrown error', async () => {
    const src = new TavilySearchSource('tvly-wrong', base);
    await expect(src.search(['UNAUTH'])).rejects.toThrow(/all 1 tavily queries failed/);
  });
});

/**
 * Offline SearXNG adapter test: a local mock speaks the SearXNG
 * GET /search?format=json contract. Covers normalization/dedupe/filters,
 * per-query failure tolerance, total-failure propagation, and the 403
 * hint (JSON format disabled on the instance).
 */
const searxngServer = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method !== 'GET' || url.pathname !== '/search' || url.searchParams.get('format') !== 'json') {
    res.statusCode = 404;
    res.end();
    return;
  }
  const q = url.searchParams.get('q') ?? '';
  if (q.includes('FAIL')) {
    res.statusCode = 500;
    res.end('boom');
    return;
  }
  if (q.includes('FORBID')) {
    res.statusCode = 403;
    res.end('json format disabled');
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      results: [
        { title: 'Program A tracked', url: 'https://a.org/program?utm_source=x', content: 'A program' },
        { title: 'Program A dup', url: 'https://a.org/program', content: 'Same page again' },
        { title: 'logo', url: 'https://a.org/logo.png', content: '' },
      ],
    }),
  );
});
await new Promise<void>((r) => searxngServer.listen(0, '127.0.0.1', r));
const sxBase = `http://127.0.0.1:${(searxngServer.address() as { port: number }).port}`;
afterAll(() => searxngServer.close());

describe('SearxngSearchSource', () => {
  it('normalizes, dedupes and filters results', async () => {
    const src = new SearxngSearchSource(sxBase);
    const hits = await src.search(['good', 'good again']);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ title: 'Program A tracked', url: 'https://a.org/program' });
  });

  it('tolerates one failing query while others succeed', async () => {
    const src = new SearxngSearchSource(sxBase);
    const hits = await src.search(['good', 'FAIL me']);
    expect(hits).toHaveLength(1);
  });

  it('throws when every query fails', async () => {
    const src = new SearxngSearchSource(sxBase);
    await expect(src.search(['FAIL a', 'FAIL b'])).rejects.toThrow(/all 2 searxng queries failed/);
  });

  it('explains a 403 as the JSON-format setting', async () => {
    const src = new SearxngSearchSource(sxBase);
    await expect(src.search(['FORBID'])).rejects.toThrow(/all 1 searxng queries failed/);
  });
});
