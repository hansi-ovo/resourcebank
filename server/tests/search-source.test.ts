import { afterAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { TavilySearchSource } from '../src/providers/search-source';

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
