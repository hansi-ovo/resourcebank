import { z } from 'zod';
import { normalizeUrl } from './dedup';
import type { RawHit } from './types';
import type { SearchSource } from './search-source';

/**
 * WeChat official-account search source (SEARCH_SOURCE=wechat).
 *
 * Two complementary channels find mp.weixin.qq.com articles:
 * - Sogou WeChat search (weixin.sogou.com/weixin?type=2) 鈥?the only dedicated
 *   WeChat index, ~20 results per query. Results carry encrypted /link URLs
 *   that must be resolved per hit (JS url+= fragments 鈫?signed mp.weixin URL),
 *   then the article page exposes the permanent link via `var msg_link`.
 * - Tavily with `site:mp.weixin.qq.com` pinned queries 鈥?sparser WeChat
 *   coverage but zero anti-bot friction.
 *
 * Account whitelist: when a non-empty whitelist is given, only articles
 * published by whitelisted accounts survive (Sogou exposes the account name
 * per result; the article page carries `var nickname`). Whitelisted account
 * names are also injected as extra targeted queries.
 *
 * Anti-bot notes (verified 2026-11):
 * - Sogou needs the SUID/SNUID cookie chain obtained from the homepage +
 *   search response; without it /link serves a captcha page.
 * - Signed URLs expire; the permanent msg_link is what gets stored.
 */

/** Case-insensitive account-name matcher used for whitelist filtering. */
export function accountMatchesWhitelist(account: string, whitelist: readonly string[]): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
  const a = norm(account);
  if (a.length === 0) return false;
  return whitelist.some((w) => {
    const n = norm(w);
    return n.length > 0 && (a === n || a.includes(n) || n.includes(a));
  });
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function isWechatArticleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.hostname === 'mp.weixin.qq.com' || u.hostname === 'weixin.qq.com') && /\/s/.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Extracts URLs mentioned in WeChat article text. WeChat strips <a> tags from
 * the rendered body (links survive as plain text or viaShortVars), so the
 * plain-text scan is the reliable path. Filters out wechat/qq/short-link
 * noise and obviously non-program files.
 */
export function extractMentionedUrls(text: string): string[] {
  const urls = [...text.matchAll(/https?:\/\/[^\s锛屻€傦紱銆侊紒锛燂細"'"'锛堬級<>|\[\]]+/g)].map((m) => m[0].replace(/[.,;:)\]]+$/, ''));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    if (/weixin\.qq\.com|\.qq\.com|wechat|t\.cn\/|url\.cn|10086|10010/i.test(raw)) continue;
    let norm: string;
    try {
      norm = normalizeUrl(raw);
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/** Parses a Sogou WeChat results page into (encrypted-link, title, account, snippet) tuples. */
export function parseSogouResults(html: string): Array<{ link: string; title: string; account: string; snippet: string }> {
  const results: Array<{ link: string; title: string; account: string; snippet: string }> = [];
  // txt-box blocks hold the whole result card
  const blocks = html.split('<div class="txt-box">').slice(1);
  for (const b of blocks) {
    // title anchor: <a ... href="/link?url=..." uigs="article_title_N">TITLE</a>
    const link = /<a[^>]+href="(\/link\?url=[^"]+)"[^>]*>/.exec(b)?.[1]?.replace(/&amp;/g, '&');
    const title = (/uigs="article_title_\d+">([\s\S]*?)<\/a>/.exec(b)?.[1] ?? b.slice(0, 600))
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&mdash;/g, '\u2014')
      .trim();
    // account sits in <span class="all-time-y2">AccountName</span>
    const account = /class="all-time-y2"[^>]*>([^<]+)</.exec(b)?.[1]?.trim() ?? '';
    // snippet: <p class="txt-info" ...>...</p>
    const snippet = (/class="txt-info"[^>]*>([\s\S]*?)<\/p>/.exec(b)?.[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .trim();
    if (link) results.push({ link, title: title.slice(0, 200), account, snippet: snippet.slice(0, 400) });
  }
  return results;
}

/** Resolves a Sogou /link redirect page into the signed mp.weixin URL (url+= JS fragments). */
export function parseSogouLinkRedirect(html: string): string | null {
  const frags = [...html.matchAll(/url\s*\+=\s*'([^']*)'/g)].map((m) => m[1]);
  if (frags.length === 0) return null;
  const joined = frags.join('').replace(/@/g, '');
  return /^https?:\/\//.test(joined) ? joined : null;
}

/** Extracts the permanent link + metadata from an article page HTML. */
export function parseWechatArticleMeta(html: string): { msgLink: string | null; title: string | null; account: string | null; publishTime: number | null } {
  // canonical permalink: `var msg_link` (head) or og:url; signed src=11 URLs
  // are session-bound and never stored
  const pickPermanent = (raw: string | undefined): string | null => {
    if (!raw) return null;
    const url = raw.replace(/&amp;/g, '&');
    return /mp\.weixin\.qq\.com\/s/.test(url) ? url : null;
  };
  const msgLink =
    pickPermanent(/var msg_link = "([^"]*)"/.exec(html)?.[1]) ??
    pickPermanent(/<meta property="og:url" content="([^"]*)"/.exec(html)?.[1]);
  const title =
    /var msg_title = '([^']*)'/.exec(html)?.[1] ??
    /var msg_title = "([^"]*)"/.exec(html)?.[1] ??
    /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ??
    null;
  const account =
    /var nickname = htmlDecode\("([^"]*)"\)/.exec(html)?.[1] ??
    /var nickname = "([^"]*)"/.exec(html)?.[1] ??
    /<meta property="og:site_name" content="([^"]*)"/.exec(html)?.[1] ??
    null;
  const ct = /var ct = "(\d+)"/.exec(html)?.[1] ?? /var ct = '(\d+)'/.exec(html)?.[1];
  return { msgLink, title, account, publishTime: ct ? Number(ct) : null };
}

export class WechatSearchSource implements SearchSource {
  readonly kind = 'wechat' as const;

  constructor(
    private readonly tavilyApiKey: string,
    private readonly tavilyBaseUrl: string,
    private readonly timeoutMs = 20_000,
    /** Test seam 鈥?inject fetch instead of the network. */
    private readonly fetcher: typeof fetch = fetch,
    /** Static whitelist (tests); ignored when `getWhitelist` is provided. */
    private readonly whitelist: readonly string[] = [],
    /** Live whitelist provider 鈥?re-read every round so admin edits apply
     *  without restart. Takes precedence over the static list. */
    private readonly getWhitelist?: () => readonly string[],
  ) {}

  private currentWhitelist(): readonly string[] {
    return this.getWhitelist ? this.getWhitelist() : this.whitelist;
  }

  async search(queries: string[]): Promise<RawHit[]> {
    const whitelist = this.currentWhitelist();
    // whitelist targeting: the account names themselves are the best queries
    // ("账号名 + 项目机会" surfaces the account's WeChat articles on Sogou and
    // its official pages / Notion / link hubs on Tavily)
    const allQueries =
      whitelist.length > 0
        ? [...new Set([...queries.slice(0, 3), ...whitelist.slice(0, 5)])]
        : queries;
    if (allQueries.length === 0) return [];
    // In whitelist mode the Tavily channel drops the site: pin — whitelisted
    // accounts often publish on their own sites (notion, official homepages)
    // and those pages are exactly the high-quality sources wanted.
    const tavilyQueries =
      whitelist.length > 0
        ? allQueries.map((q) => `${q} 项目 OR 志愿者 OR program OR application`.slice(0, 180))
        : channels(allQueries);
    const [sogou, tavily] = await Promise.allSettled([this.searchSogou(allQueries, whitelist), this.searchTavily(tavilyQueries)]);
    const hits = new Map<string, RawHit>();
    if (sogou.status === 'fulfilled') {
      for (const h of sogou.value) {
        if (!hits.has(h.url)) hits.set(h.url, h);
      }
    } else {
      console.error('[wechat-source] sogou failed:', sogou.reason instanceof Error ? sogou.reason.message : sogou.reason);
    }
    if (tavily.status === 'fulfilled') {
      for (const h of tavily.value) {
        // no-site-pin mode returns non-WeChat pages too (account official
        // sites) — those are legitimate whitelist targets
        if (!hits.has(h.url)) hits.set(h.url, h);
      }
    } else {
      console.error('[wechat-source] tavily site: search failed:', tavily.reason instanceof Error ? tavily.reason.message : tavily.reason);
    }
    if (sogou.status === 'rejected' && tavily.status === 'rejected') {
      throw new Error('both sogou and tavily wechat searches failed');
    }
    return [...hits.values()];
  }

  private async searchSogou(queries: string[], whitelist: readonly string[]): Promise<RawHit[]> {
    const jar = new Map<string, string>();
    const storeCookies = (res: Response) => {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    };
    const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const f = this.fetcher;

    // warm-up: homepage issues SUID etc.
    const home = await f('https://weixin.sogou.com/', { headers: { 'User-Agent': BROWSER_UA } });
    storeCookies(home);

    const hits = new Map<string, RawHit>();
    const searched = queries.slice(0, 5);
    let queryFailures = 0;
    for (const q of searched) {
      try {
        const res = await f(`https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(q)}`, {
          headers: { 'User-Agent': BROWSER_UA, Referer: 'https://weixin.sogou.com/', Cookie: cookieHeader() },
        });
        storeCookies(res);
        if (!res.ok) throw new Error(`sogou HTTP ${res.status}`);
        const html = await res.text();
        if (/antispider/i.test(html)) throw new Error('sogou antispider captcha 鈥?slow down or rotate IP');
        const results = parseSogouResults(html);
        if (results.length === 0) throw new Error('sogou returned no parseable results (captcha or layout change)');
        // whitelist gate BEFORE /link resolution 鈥?non-whitelisted accounts
        // cost nothing (no redirect fetch, no article fetch)
        const allowed = whitelist.length > 0 ? results.filter((r) => accountMatchesWhitelist(r.account, whitelist)) : results;
        for (const r of allowed) {
          try {
            const hit = await this.resolveSogouHit(r, q, cookieHeader(), whitelist);
            if (hit && !hits.has(hit.url)) hits.set(hit.url, hit);
          } catch {
            // single hit resolution failure never fails the round
          }
          // human-pace delay between /link resolutions 鈥?the anti-bot wall
          await sleep(800);
        }
      } catch (err) {
        queryFailures += 1;
        console.error('[wechat-source] sogou query failed:', err instanceof Error ? err.message : String(err));
      }
    }
    // every query failing means the channel is dead (captcha wall, layout
    // change) 鈥?signal it so the combined search can fall back / throw
    if (queryFailures === searched.length) {
      throw new Error(`all ${queryFailures} sogou queries failed`);
    }
    return [...hits.values()];
  }

  /** /link 鈫?signed URL 鈫?article page 鈫?permanent msg_link RawHit. */
  private async resolveSogouHit(r: { link: string; title: string; account: string; snippet: string }, q: string, cookie: string, whitelist: readonly string[]): Promise<RawHit | null> {
    const f = this.fetcher;
    const lres = await f(`https://weixin.sogou.com${r.link}`, {
      headers: { 'User-Agent': BROWSER_UA, Referer: `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(q)}`, Cookie: cookie },
      redirect: 'follow',
    });
    if (!lres.ok) return null;
    const lhtml = await lres.text();
    const signed = parseSogouLinkRedirect(lhtml);
    if (!signed) return null;
    const ares = await f(signed, { headers: { 'User-Agent': BROWSER_UA }, redirect: 'follow' });
    if (!ares.ok) return null;
    const ahtml = await ares.text();
    const meta = parseWechatArticleMeta(ahtml);
    // second whitelist gate on the article page's own nickname (the Sogou
    // result row can miss the account name)
    if (whitelist.length > 0 && !accountMatchesWhitelist(meta.account ?? r.account, whitelist)) {
      return null;
    }
    // msg_link is empty on some signed-URL variants 鈥?the signed URL itself
    // remains fetchable for the whole round, so it's an acceptable fallback.
    const permanent = meta.msgLink ?? signed;
    return {
      title: (meta.title ?? r.title).slice(0, 200),
      url: normalizeUrl(permanent),
      snippet: r.snippet || `寰俊鍏紬鍙枫€?{meta.account ?? r.account ?? '鏈煡'}銆嶇殑鏂囩珷`,
    };
  }

  private async searchTavily(queries: string[]): Promise<RawHit[]> {
    const hits = new Map<string, RawHit>();
    let failures = 0;
    for (const q of queries) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const res = await this.fetcher(`${this.tavilyBaseUrl}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.tavilyApiKey}` },
            body: JSON.stringify({ query: q, topic: 'general', search_depth: 'basic', max_results: 8, include_answer: false }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`tavily HTTP ${res.status}`);
          const parsed = z
            .object({
              results: z
                .array(z.object({ title: z.string().catch(''), url: z.string(), content: z.string().catch('') }))
                .catch([]),
            })
            .parse(await res.json());
          for (const r of parsed.results) {
            if (!isWechatArticleUrl(r.url)) continue;
            // whitelist mode: the queries ARE account names, so results are
            // already account-targeted; title-filtering here would over-drop
            // (article titles rarely repeat the account name). Account
            // precision is enforced at triage/extraction instead.
            const norm = normalizeUrl(r.url);
            if (!hits.has(norm)) {
              hits.set(norm, { title: r.title.slice(0, 200), url: norm, snippet: r.content.slice(0, 400) });
            }
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        failures += 1;
        console.error('[wechat-source] tavily query failed:', err instanceof Error ? err.message : String(err));
      }
    }
    if (failures === queries.length && queries.length > 0) {
      throw new Error(`all ${failures} tavily wechat queries failed`);
    }
    return [...hits.values()];
  }
}

/** Pins every query to the WeChat domain for the Tavily channel. */
function channels(queries: string[]): string[] {
  const out: string[] = [];
  for (const q of queries) {
    const qq = q.replace(/^site:mp\.weixin\.qq\.com\s*/i, '').trim();
    if (qq.length >= 2) out.push(`site:mp.weixin.qq.com ${qq}`);
  }
  // an empty channel would silently "succeed" and mask a total outage
  if (out.length === 0 && queries.length > 0) out.push('site:mp.weixin.qq.com 瀛︾敓 椤圭洰 鏈轰細');
  return out.slice(0, 4);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

