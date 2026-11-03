import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WechatSearchSource,
  extractMentionedUrls,
  isWechatArticleUrl,
  parseSogouResults,
  parseSogouLinkRedirect,
  parseWechatArticleMeta,
} from '../src/providers/wechat-source';
import type { RawHit } from '../src/providers/types';
import type { SearchSource } from '../src/providers/search-source';

/**
 * Offline tests against fixtures captured from live sogou/wechat pages
 * (2026-11). No network anywhere — the source's fetcher seam is a stub.
 */

const FIX = join(__dirname, 'fixtures');
const read = (name: string) => readFileSync(join(FIX, name), 'utf8');

describe('parseSogouResults', () => {
  it('extracts /link entries with titles from a live results page', () => {
    const results = parseSogouResults(read('sogou-weixin-results.html'));
    expect(results.length).toBeGreaterThanOrEqual(5);
    for (const r of results) {
      expect(r.link).toMatch(/^\/link\?url=/);
      expect(r.title.length).toBeGreaterThan(4);
    }
  });

  it('returns [] for a captcha / empty page', () => {
    expect(parseSogouResults('<html><body>antispider</body></html>')).toEqual([]);
  });
});

describe('parseSogouLinkRedirect', () => {
  it('joins url+= fragments and strips @ markers from the live /link page', () => {
    const signed = parseSogouLinkRedirect(read('sogou-link-redirect.html'));
    expect(signed).toMatch(/^https:\/\/mp\.weixin\.qq\.com\/s\?src=11&timestamp=\d+&ver=\d+&signature=/);
  });

  it('returns null for a captcha page (no fragments)', () => {
    expect(parseSogouLinkRedirect('<html>verify</html>')).toBeNull();
  });
});

describe('parseWechatArticleMeta', () => {
  it('extracts msg_link / title from the article head fixture', () => {
    const meta = parseWechatArticleMeta(read('wechat-article-head.html'));
    expect(meta.msgLink).toMatch(/^https:\/\/mp\.weixin\.qq\.com\/s\//);
    expect(meta.title).toContain('GitHub');
    // publishTime lives deep in the page; the head fixture legitimately lacks it
    expect(meta.publishTime).toBeNull();
  });

  it('prefers og:url fallback and htmlDecode nicknames on signed-URL variants', () => {
    const html = `<html><head><meta property="og:title" content="海外暑研申请"></head><body><script>
      var msg_link = "";
      var nickname = htmlDecode("易度留学");
      var ct = "1698404400";
    </script></body></html>`;
    const meta = parseWechatArticleMeta(html);
    expect(meta.msgLink).toBeNull(); // empty msg_link + no og:url → null (caller falls back to signed url)
    expect(meta.title).toBe('海外暑研申请');
    expect(meta.account).toBe('易度留学');
    expect(meta.publishTime).toBe(1698404400);
  });
});

describe('isWechatArticleUrl', () => {
  it('accepts mp.weixin.qq.com article urls', () => {
    expect(isWechatArticleUrl('https://mp.weixin.qq.com/s/AbCdEf123')).toBe(true);
    expect(isWechatArticleUrl('https://mp.weixin.qq.com/s?__biz=x&mid=1&sn=y')).toBe(true);
  });
  it('rejects non-article weixin and external urls', () => {
    expect(isWechatArticleUrl('https://mp.weixin.qq.com/mp/profile_ext?action=home')).toBe(false);
    expect(isWechatArticleUrl('https://example.com/s/x')).toBe(false);
    expect(isWechatArticleUrl('not a url')).toBe(false);
  });
});

describe('extractMentionedUrls', () => {
  it('pulls external project urls from a roundup article, dropping wechat noise', () => {
    const text = read('wechat-roundup-text.txt');
    const urls = extractMentionedUrls(text);
    expect(urls.length).toBeGreaterThan(3);
    expect(urls.every((u) => /^https?:\/\//.test(u))).toBe(true);
    expect(urls.every((u) => !/weixin\.qq\.com|qq\.com/.test(u))).toBe(true);
    expect(urls.some((u) => u.includes('github.com'))).toBe(true);
  });

  it('dedupes normalized urls and strips trailing punctuation', () => {
    const urls = extractMentionedUrls(
      'See https://example.com/program, and https://example.com/program. Also https://weixin.qq.com/noise.',
    );
    expect(urls).toEqual(['https://example.com/program']);
  });
});

describe('WechatSearchSource.search', () => {
  /** Fake fetch routed by URL prefix. Counters assert request shapes. */
  function fakeFetch(routes: Array<{ match: RegExp; reply: (url: string) => Response | Promise<Response> }>) {
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request): Promise<Response> => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      calls.push(u);
      const route = routes.find((r) => r.match.test(u));
      if (!route) throw new Error(`no fake route for ${u}`);
      return route.reply(u);
    }) as typeof fetch;
    return { fetcher, calls };
  }

  const sogouResultsHtml = read('sogou-weixin-results.html');
  const linkHtml = read('sogou-link-redirect.html');
  const articleHtml = read('wechat-article-head.html');
  const ARTICLE_URL = 'https://mp.weixin.qq.com/s/JkKaxVubbGkypNde5D3-9g';

  function ok(html: string, headers: Record<string, string> = {}): Response {
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html', ...headers } });
  }

  it('resolves sogou /link → signed url → article → permanent msg_link RawHit', async () => {
    const { fetcher, calls } = fakeFetch([
      { match: /^https:\/\/weixin\.sogou\.com\/$/, reply: () => ok('', { 'set-cookie': 'SUID=test' }) },
      { match: /weixin\?type=2/, reply: () => ok(sogouResultsHtml, { 'set-cookie': 'SNUID=test2' }) },
      { match: /weixin\.sogou\.com\/link\?url=/, reply: () => ok(linkHtml) },
      { match: /^https:\/\/mp\.weixin\.qq\.com\/s\?src=11/, reply: () => ok(articleHtml) },
    ]);
    const src = new WechatSearchSource('tvly-fake', 'https://api.tavily.invalid', 20_000, fetcher);
    const hits = await src.search(['海外暑研 申请']);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    // every hit is a permanent mp.weixin article url (not the signed one)
    for (const h of hits) {
      expect(isWechatArticleUrl(h.url)).toBe(true);
      expect(h.url).not.toMatch(/src=11/);
    }
    // homepage warm-up + search + per-hit /link + article fetches all happened
    expect(calls.some((c) => c === 'https://weixin.sogou.com/')).toBe(true);
    expect(calls.filter((c) => c.includes('/link?url=')).length).toBeGreaterThanOrEqual(1);
    expect(calls.some((c) => c.startsWith('https://mp.weixin.qq.com/'))).toBe(true);
  });

  it('splits queries into a tavily site: channel and keeps tavily wechat hits', async () => {
    const { fetcher } = fakeFetch([
      { match: /^https:\/\/weixin\.sogou\.com\/$/, reply: () => ok('') },
      { match: /weixin\?type=2/, reply: () => ok('') }, // no sogou results
      {
        match: /api\.tavily\.invalid\/search/,
        reply: () =>
          new Response(
            JSON.stringify({
              results: [
                { title: '暑期项目汇总', url: 'https://mp.weixin.qq.com/s/tavilyHit1', content: 'site summary' },
                { title: 'not wechat', url: 'https://example.com/x', content: '' },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      },
    ]);
    const src = new WechatSearchSource('tvly-fake', 'https://api.tavily.invalid', 20_000, fetcher);
    const hits = await src.search(['summer programs in china']);
    expect(hits.length).toBe(1);
    expect(hits[0]!.url).toContain('mp.weixin.qq.com');
  });

  it('still returns hits when sogou fails entirely (tavily fallback)', async () => {
    const { fetcher } = fakeFetch([
      {
        match: /api\.tavily\.invalid\/search/,
        reply: () =>
          new Response(
            JSON.stringify({ results: [{ title: 't', url: 'https://mp.weixin.qq.com/s/fallback1', content: 'c' }] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      },
      // every sogou request dies
      { match: /weixin\.sogou\.com/, reply: () => new Response('', { status: 503 }) },
    ]);
    const src = new WechatSearchSource('tvly-fake', 'https://api.tavily.invalid', 20_000, fetcher);
    const hits = await src.search(['test query']);
    expect(hits.length).toBe(1);
  });

  it('throws when both channels fail', async () => {
    const { fetcher } = fakeFetch([
      { match: /api\.tavily\.invalid\/search/, reply: () => new Response('', { status: 500 }) },
      { match: /weixin\.sogou\.com/, reply: () => new Response('', { status: 503 }) },
    ]);
    const src = new WechatSearchSource('tvly-fake', 'https://api.tavily.invalid', 20_000, fetcher);
    await expect(src.search(['q'])).rejects.toThrow();
  });

  it('satisfies the SearchSource contract (kind wechat)', () => {
    const src = new WechatSearchSource('k', 'https://api.tavily.invalid');
    expect((src as SearchSource).kind).toBe('wechat');
  });
});

// RawHit is the shared currency between source and provider — keep the import used
const _shapeCheck: RawHit | null = null;
void _shapeCheck;
