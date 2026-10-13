import { z } from 'zod';
import type { ChatJsonOptions } from './llm';
import type { ExistingEntryRef } from './types';

/**
 * Dedup for the real search pipeline (search-upgrade Step 4):
 * - Layer 1 `normalizeUrl`: exact-page dedup (tracking params, casing, slashes).
 * - Layer 2 `classifyEntities`: LLM entity judgement — "is this the same
 *   PROGRAM we already have?" — which URL comparison cannot decide
 *   (…/2026 → …/2027 editions; same org, different sub-programs).
 */

/** Structural LLM seam so tests can fake the gateway without network. */
export interface JsonLlm {
  chatJson<T>(opts: ChatJsonOptions<T>): Promise<T>;
}

/**
 * Canonical form of a URL for duplicate-page checks:
 * https, no www, no hash, tracking params stripped, params sorted, no
 * trailing slash. Paths are case-sensitive and NEVER rewritten — a /2026
 * edition page stays distinct from /2027 (that distinction is the LLM's job).
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim().toLowerCase();
  }
  u.protocol = 'https:';
  u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
  // localhost/loopback stays http — real program pages are always https, but
  // local integration mocks (mock Tavily pointing at a local page) are not.
  if (u.hostname === 'localhost' || /^127\./.test(u.hostname) || u.hostname === '[::1]') {
    u.protocol = 'http:';
  }
  u.hash = '';
  for (const p of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|msclkid|igshid|spm$|ref$|source$)/i.test(p)) u.searchParams.delete(p);
  }
  const sorted = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  u.search = '';
  for (const [k, v] of sorted) u.searchParams.append(k, v);
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}

export type EntityVerdict = 'new' | 'duplicate' | 'same_program_new_edition';

export interface CandidateRef {
  name: string;
  url: string;
  summary: string;
}

export interface EntityMatch {
  index: number;
  verdict: EntityVerdict;
  entryId: number | null;
  reason: string;
}

const verdictSchema = z.object({
  matches: z
    .array(
      z.object({
        index: z.number().int().min(0),
        verdict: z.enum(['new', 'duplicate', 'same_program_new_edition']),
        entryId: z.number().int().nullable().catch(null),
        reason: z.string().max(300).catch(''),
      }),
    )
    .catch([]),
});

const CLASSIFICATION_SYSTEM = `You are the deduplication judge for a university student-opportunities database.
Given EXISTING entries and new CANDIDATES, decide for every candidate:
- "duplicate": the same page/content already covered (near-identical URL, or the same page re-listed).
- "same_program_new_edition": the SAME program from the SAME organizer on a NEWER page — e.g. a .../2027 edition of a .../2026 page; the program name is essentially identical apart from the year/cohort, and the theme and audience match.
- "new": a different program — different organizer, a different sub-program of the same organization, or a different theme.
Rules: sharing a root domain alone is NOT enough (organizations host many distinct programs). Year-only differences in an otherwise matching program mean "same_program_new_edition". When unsure answer "new" — a false new is cheap (an admin rejects it), a false duplicate loses a real program.
Respond with one JSON object and nothing else:
{"matches":[{"index":<candidate index>,"verdict":"new|duplicate|same_program_new_edition","entryId":<matching existing id or null>,"reason":"one short line"}]}
Cover EVERY candidate index.`;

/** Token-economy view of a URL (no protocol, truncated). */
function shorten(url: string): string {
  return url.replace(/^https?:\/\//, '').slice(0, 120);
}

const BATCH = 10;
const MAX_EXISTING_SENT = 200;

/**
 * Classifies every candidate against the existing entries. Batches of 10 per
 * LLM call; any batch failure fails OPEN (all "new") — the review list is the
 * safety net and losing a genuinely new program is worse than a duplicate
 * slipping through to an admin.
 */
export async function classifyEntities(
  llm: JsonLlm,
  candidates: CandidateRef[],
  existing: ExistingEntryRef[],
): Promise<EntityMatch[]> {
  const results: EntityMatch[] = candidates.map((_, index) => ({
    index,
    verdict: 'new',
    entryId: null,
    reason: '',
  }));
  if (candidates.length === 0) return results;

  const condensed = existing.slice(0, MAX_EXISTING_SENT).map((e) => ({
    id: e.id,
    name: e.name.slice(0, 120),
    url: shorten(e.url),
    summary: e.summary.slice(0, 160),
  }));

  for (let start = 0; start < candidates.length; start += BATCH) {
    const batch = candidates.slice(start, start + BATCH).map((c, j) => ({
      index: start + j,
      name: c.name.slice(0, 150),
      url: shorten(c.url),
      summary: c.summary.slice(0, 200),
    }));
    try {
      const parsed = await llm.chatJson({
        system: CLASSIFICATION_SYSTEM,
        user: JSON.stringify({ existing: condensed, candidates: batch }),
        schema: verdictSchema,
        temperature: 0,
        maxTokens: 1500,
      });
      for (const m of parsed.matches) {
        if (m.index >= 0 && m.index < candidates.length) {
          results[m.index] = { index: m.index, verdict: m.verdict, entryId: m.entryId, reason: m.reason };
        }
      }
    } catch {
      /* fail-open: keep the default "new" verdicts for this batch */
    }
  }
  return results;
}
