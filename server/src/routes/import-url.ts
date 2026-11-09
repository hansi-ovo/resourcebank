import { Router } from 'express';
import { z } from 'zod';
import { CATEGORY_IDS, type CategoryId, type UrlImportResult } from '../../../shared/types';
import { extractionMessages } from '../providers/category-prompts';
import { makeLlm } from '../providers/llm';
import type { JsonLlm } from '../providers/dedup';

/**
 * POST /api/import-url — the manual-add form's auto-recognition box (task 3).
 * Fetches the page (following redirects, so lnkd.in / inkd.in short links
 * resolve to the real target), pulls og:image out of the raw HTML, and asks
 * the same LLM extraction used by the search pipeline for a structured
 * draft. The admin reviews/adjusts the filled form before submitting —
 * nothing is written to the DB here.
 */

const importSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(1000)
    .refine((v) => /^https?:\/\//i.test(v), 'http(s) URL required'),
});

const draftSchema = z.object({
  name: z.string().min(3).max(200),
  summary: z.string().min(30).max(700),
  audience: z.array(z.string().max(80)).catch([]),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  timeline: z.string().max(400).catch(''),
  category: z.string().catch(''),
  quality: z.coerce.number().min(0).max(100).catch(0),
});

export interface ImportUrlDeps {
  /** Injectable LLM seam (tests). Defaults to the configured gateway. */
  llm?: JsonLlm | null;
  /**
   * Injectable page fetcher (tests): returns null when unreachable.
   * Default: real fetch, redirect-follow, HTML→text + og:image scraping.
   */
  pageFetcher?: (url: string) => Promise<PageFetch | null>;
}

export interface PageFetch {
  /** final URL after redirects */
  url: string;
  /** visible text for the LLM (html stripped) */
  text: string;
  /** og:image / twitter:image if the page declares one */
  imageUrl: string | null;
  /** <title> when present */
  title: string | null;
}

export function importUrlRoutes(deps: ImportUrlDeps = {}): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter a valid http(s) URL.' });
      return;
    }

    const llm = deps.llm !== undefined ? deps.llm : makeLlm();
    if (!llm) {
      res.status(503).json({
        error: 'Auto-recognition is unavailable: the LLM gateway is not configured.',
      });
      return;
    }

    const fetchPage = deps.pageFetcher ?? fetchPageWithMeta;
    let page: PageFetch | null = null;
    try {
      page = await fetchPage(parsed.data.url);
    } catch {
      page = null;
    }
    if (!page || page.text.length === 0) {
      res.status(422).json({
        error: 'Could not read that page. It may be unreachable, login-walled, or non-HTML.',
      });
      return;
    }

    try {
      const { system, user } = extractionMessages(
        { title: page.title ?? parsed.data.url, url: page.url, snippet: '' },
        page.text,
        'all',
      );
      // maxTokens generous: dense program pages can push the gateway model
      // past 1500 tokens before finishing the JSON ("LLM JSON is truncated")
      let raw: z.infer<typeof draftSchema>;
      try {
        raw = await llm.chatJson({
          system,
          user,
          schema: draftSchema,
          temperature: 0.1,
          maxTokens: 3000,
        });
      } catch (err) {
        // one retry at a tighter, more directive prompt (truncation recovery)
        if (!(err instanceof Error && /truncated|no JSON|not valid JSON/i.test(err.message))) throw err;
        raw = await llm.chatJson({
          system: `${system}\nKeep the summary under 350 characters and audience under 4 tags. Be terse.`,
          user,
          schema: draftSchema,
          temperature: 0.1,
          maxTokens: 3000,
        });
      }

      const name = raw.name.trim();
      const summary = raw.summary.trim();
      if (name.length < 3 || summary.length < 30) {
        res.status(422).json({ error: 'Could not recognize this page as a program. Fill the form manually.' });
        return;
      }
      const category: CategoryId | null = (CATEGORY_IDS as readonly string[]).includes(raw.category)
        ? (raw.category as CategoryId)
        : null;
      // manual creation stores dates only inside the timeline free-text
      const withDates =
        raw.timeline.trim() ||
        [raw.startsAt, raw.endsAt].filter(Boolean).join(' – ');

      const result: UrlImportResult = {
        name,
        summary,
        url: page.url,
        audience: raw.audience.map((a) => a.trim()).filter(Boolean).slice(0, 12),
        startsAt: raw.startsAt,
        endsAt: raw.endsAt,
        timeline: withDates,
        category,
        imageUrl: page.imageUrl,
        quality: Math.max(1, Math.min(100, Math.round(raw.quality))),
      };
      res.json(result);
    } catch (err) {
      console.warn(
        '[import-url] extraction failed:',
        err instanceof Error ? err.message : String(err),
        `(${parsed.data.url})`,
      );
      res.status(502).json({ error: 'Recognition failed. Try again or fill the form manually.' });
    }
  });

  return router;
}

/** Fetches a page for import: final URL, visible text, og:image, <title>.
 *  LinkedIn-style short links (lnkd.in / inkd.in) serve an HTML interstitial
 *  to non-logged-in fetchers instead of a redirect — the real destination
 *  URL is embedded inside that stub, so follow it (max 2 hops). */
export async function fetchPageWithMeta(url: string): Promise<PageFetch | null> {
  let currentUrl = url;
  for (let hop = 0; hop < 3; hop++) {
    const page = await fetchOne(currentUrl);
    if (!page) return null; // unreachable / non-HTML dead end
    if (!isRedirectStub(page)) return page;
    const next = extractRedirectTarget(page.rawHtml, page.url);
    if (!next || next === currentUrl) return page; // nothing better to follow
    console.log(`[import-url] redirect stub ${currentUrl} -> following ${next}`);
    currentUrl = next;
  }
  return fetchOne(currentUrl);
}

/** A page whose visible content is just a redirect notice (LinkedIn's
 *  `external_link_redirect_interstitial` etc.) — not a real program page. */
export function isRedirectStub(page: PageFetch & { rawHtml?: string }): boolean {
  if (/external_link_redirect_interstitial|d_shortlink_frontend/i.test(page.rawHtml ?? '')) return true;
  return page.text.replace(/\s+/g, '').length < 250;
}

/** The first EXTERNAL link embedded in a redirect stub's HTML (asset URLs,
 *  same-site links, and LinkedIn's own domains excluded). */
export function extractRedirectTarget(html: string, pageUrl: string): string | null {
  const pageHost = hostOf(pageUrl);
  const urls = html.match(/https?:\/\/[^"'<>\s\\]+/g) ?? [];
  for (const raw of urls) {
    const u = raw.replace(/&amp;/g, '&').replace(/[.,)'">\]]+$/, '');
    const host = hostOf(u);
    if (!host || host === pageHost) continue;
    if (/linkedin\.com|licdn|lnkd\.in|inkd\.in/i.test(host)) continue;
    if (/\.(js|css|png|jpe?g|svg|gif|webp|woff2?|ttf|ico|json)(\?|$)/i.test(u)) continue;
    if (u.length < 12) continue;
    return u;
  }
  return null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function fetchOne(url: string): Promise<(PageFetch & { rawHtml: string }) | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html') && !type.includes('text/plain')) return null;
    const html = (await res.text()).slice(0, 500_000);
    const finalUrl = res.url || url;
    let origin: string | null = null;
    try {
      origin = new URL(finalUrl).origin;
    } catch {
      origin = null;
    }
    return {
      url: finalUrl,
      text: htmlToText(html).slice(0, 6000),
      imageUrl: metaImage(html, origin),
      title: titleTag(html),
      rawHtml: html,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** og:image / twitter:image as an absolute URL (resolved against `origin`). */
export function metaImage(html: string, origin: string | null): string | null {
  const m =
    /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image|twitter:image(?::src)?)["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(
      html,
    ) ??
    /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image(?::src)?)["']/i.exec(
      html,
    );
  if (!m) return null;
  const src = m[1]!.trim();
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('//')) return `https:${src}`;
  if (origin && src.startsWith('/')) return `${origin}${src}`;
  return null;
}

function titleTag(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]!).trim().slice(0, 300) || null : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}
