import type { CategoryId, Scope } from '../../../shared/types';

/**
 * Structured per-category prompts (search-upgrade Step 6). Search engines do
 * not need keywords — they need judgement criteria. Each spec tells the query
 * planner what angles to search and the extractor what belongs in the bank.
 * Wording marked ⚑ awaits the client's official per-tag copy (.omo/questions.md);
 * structure stays fixed, only the strings get swapped.
 */

export interface CategoryPromptSpec {
  definition: string;
  include: string[];
  exclude: string[];
  audience: string;
  geo: string;
  sourceQuality: string;
}

export const CATEGORY_PROMPTS: Record<CategoryId, CategoryPromptSpec> = {
  'on-campus': {
    definition:
      'Opportunities based at Duke Kunshan University or run by DKU offices: student government and leadership roles, on-campus employment, campus research assistantships, resident assistant / orientation leader roles, and DKU institute programs open to students.',
    include: [
      'DKU student government and leadership positions',
      'on-campus jobs and work-study roles',
      'RA, orientation leader, peer mentor roles',
      'on-campus research assistant programs',
      'DKU institute centers running student programs',
    ],
    exclude: [
      'opportunities at other universities',
      'off-campus internships or external jobs',
      'regular academic courses for credit',
    ],
    audience: 'enrolled DKU students',
    geo: 'DKU campus, Kunshan, China only',
    sourceQuality: 'official DKU domains (dukekunshan.edu.cn) or pages of DKU offices; anything else is almost certainly out of scope',
  },
  fellowships: {
    definition:
      'Competitive funded fellowships and scholarships open to individual applicants: fully or partially funded graduate study, leadership fellowships, merit scholarships, and funded public-service or gap-year programs.',
    include: [
      'merit scholarships and national awards (Rhodes / Schwarzman / Yenching style)',
      'leadership fellowships with funding',
      'funded graduate study scholarships',
      'funded public-service or service-year programs',
    ],
    exclude: [
      'unpaid honor societies or "networks"',
      'fee-charging "fellowships" run by training companies',
      'attendance grants with no funding details',
    ],
    audience: 'undergraduate students and recent graduates',
    geo: 'global, with strong US / UK / Europe / Asia coverage',
    sourceQuality: 'official foundation, university, or government domains (.org / .edu / .gov); aggregator list pages without an application path are low quality',
  },
  experiential: {
    definition:
      'Hands-on experiential learning programs: summer schools, field research, internships, consulting projects, social-impact fieldwork, and outdoor leadership expeditions.',
    include: [
      'summer programs and summer schools',
      'structured internship placements',
      'field research and social-impact fieldwork',
      'student consulting projects and competitions',
      'expedition-based leadership programs',
    ],
    exclude: [
      'lecture-only online courses',
      'pure scholarship awards with no program component',
      'company recruitment ads',
    ],
    audience: 'undergraduate students',
    geo: 'global',
    sourceQuality: 'official organizer pages with concrete program structure (dates, location, application path)',
  },
  events: {
    definition:
      'Conferences, symposiums, summits, and delegate events (Model UN, youth summits, case competitions) with concrete upcoming dates where students participate as delegates, attendees, or competitors.',
    include: [
      'student-relevant conferences and symposiums',
      'youth summits and delegate programs',
      'Model UN and simulation conferences',
      'case competitions with event dates',
    ],
    exclude: [
      'events that have already happened',
      'single webinars without a distinctive program',
      'pure networking meetups',
    ],
    audience: 'students',
    geo: 'global',
    sourceQuality: 'official event sites with explicit dates and a delegate/registration path; dates MUST be in the future',
  },
  training: {
    definition:
      'Structured training programs and workshops that build leadership and professional skills: leadership academies, executive-style short courses, certificate trainings, and cohort-based workshops.',
    include: [
      'leadership academies and institutes',
      'skills workshops and bootcamps',
      'certificate programs',
      'cohort-based training programs',
    ],
    exclude: [
      'full degree programs',
      'one-off webinars',
      'generic MOOC catalogs',
    ],
    audience: 'students and young professionals',
    geo: 'global',
    sourceQuality: 'official organizer pages with curriculum and cohort dates; landing pages selling vague "masterclasses" are low quality',
  },
};

function specText(scope: Scope): string {
  if (scope === 'all') {
    return `SCOPE: ALL categories — ${Object.entries(CATEGORY_PROMPTS)
      .map(([id, s]) => `${id}: ${s.definition}`)
      .join('\n')}`;
  }
  const s = CATEGORY_PROMPTS[scope];
  return `SCOPE: ${scope}
Definition: ${s.definition}
Include: ${s.include.join('; ')}
Exclude: ${s.exclude.join('; ')}
Audience: ${s.audience}
Geography: ${s.geo}
Source quality: ${s.sourceQuality}`;
}

/** Query-planning prompt: LLM turns the admin's prompt + category spec into diverse web queries. */
export function queryPlannerMessages(prompt: string, scope: Scope): { system: string; user: string } {
  const system = `You plan web searches for a university student-opportunities resource bank.
${specText(scope)}
Return 4 to 7 English search queries that TOGETHER cover different angles:
geography, audience level, year/season, sub-domain, and synonyms of the core topic.
Do not repeat the user's wording verbatim in every query; diversify.
Prefer queries that surface OFFICIAL program pages rather than news or aggregator spam.
Respond with a single JSON object and nothing else:
{"queries":["...","..."]}`;

  const user = prompt.trim()
    ? `Admin prompt: ${prompt.trim()}`
    : 'Admin prompt: (none typed — plan the queries entirely from the category spec above; cover its include-angles from different geographies and audiences.)';
  return { system, user };
}

/** Extraction prompt: turns one fetched page into a structured draft + quality score. */
export function extractionMessages(
  hit: { title: string; url: string; snippet: string },
  pageText: string,
  scope: Scope,
): { system: string; user: string } {
  const system = `You extract structured data for a university student-opportunities resource bank.
${specText(scope)}
Rules:
- Use ONLY facts present in the page text. Never invent dates, deadlines, or URLs.
- summary: 2–3 sentences a student can act on (what it is, who it is for, what it funds/offers).
- audience: short free-form tags, e.g. ["undergraduates","international students"].
- startsAt / endsAt: ISO yyyy-mm-dd from the page, or null when absent.
- timeline: application window text from the page, or "" when absent.
- category: one of on-campus | fellowships | experiential | events | training, judged by the definition above.
- quality (1–100): relevance to the scope definition (0–40) + completeness (clear dates/deadline and application path: 0–40) + authoritative source (0–20).
  Below 70 means the page would waste an admin's review time — score it honestly.
Respond with a single JSON object and nothing else:
{"name":"...","summary":"...","audience":["..."],"startsAt":null,"endsAt":null,"timeline":"","category":"fellowships","quality":0}`;

  const user = `SEARCH HIT
title: ${hit.title}
url: ${hit.url}
snippet: ${hit.snippet}

PAGE TEXT (may be truncated):
${pageText}`;
  return { system, user };
}
