/**
 * Central env config for the server.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal .env loader (zero-dependency). Dev runs via `tsx watch` which does
 * not load env files; production systemd injects them directly, so this is a
 * dev convenience. Existing process.env always wins. Looks in the server cwd
 * first, then the repo root.
 */
function loadDotEnv(): void {
  for (const candidate of [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../.env')]) {
    let raw: string;
    try {
      raw = fs.readFileSync(candidate, 'utf8');
    } catch {
      continue; // missing file — try next candidate
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      const value = m[2].replace(/^["']|["']$/g, '');
      if (!(m[1] in process.env)) process.env[m[1]] = value;
    }
    return; // first .env found wins
  }
}

loadDotEnv();

export type SearchSource = 'off' | 'gateway' | 'tavily' | 'searxng';

function parseSearchSource(v: string | undefined): SearchSource {
  const s = (v || 'off').trim().toLowerCase();
  return s === 'gateway' || s === 'tavily' || s === 'searxng' ? s : 'off';
}

const searchSourceEnv = parseSearchSource(process.env.SEARCH_SOURCE);
const llmConfigured = Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL);

export const config = {
  port: Number(process.env.RB_PORT || process.env.PORT || 8787),
  /**
   * FAST_MODE shortens the simulated search delay (300ms) so Playwright
   * tests and dev demos don't wait the default 25s
   * (01-architecture.md §8; 04-build-phases.md Phase 1).
   * Accepts "300ms", "300", "true" → 300ms.
   */
  searchDelayMs: parseFastMode(process.env.FAST_MODE),
  adminPassword: process.env.ADMIN_PASSWORD || 'dku-admin',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  dataDir: process.env.DATA_DIR || 'data',

  /**
   * Real web search (Steps 0–1 of the search upgrade):
   * - `searchSource: 'off'` (default) keeps the MockSearchProvider — tests and
   *   demos never touch the network.
   * - `'gateway'` uses the DKU NewAPI gateway: an LLM for extraction plus an
   *   LLM search model (web-connected) for finding candidate pages.
   * - `'tavily'` / `'searxng'` are alternative search sources; the LLM is
   *   still the gateway's, so LLM_API_KEY is required for any real source.
   */
  searchSource: searchSourceEnv,
  /**
   * Stale-job sweep threshold. Real pipelines (Tavily + LLM extraction)
   * legitimately run for minutes — 90s would kill live jobs mid-flight.
   */
  searchJobTimeoutMs: Number(
    process.env.SEARCH_JOB_TIMEOUT_MS || (searchSourceEnv !== 'off' && llmConfigured ? 900_000 : 120_000),
  ),
  llm: {
    baseUrl: (process.env.LLM_BASE_URL || 'https://aichat.dukekunshan.edu.cn:3443/v1').replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    /** Main chat model: extraction / scoring / entity dedup. */
    model: process.env.LLM_MODEL || '',
    /** Web-connected model used to find candidate pages. Falls back to `model`. */
    searchModel: process.env.LLM_SEARCH_MODEL || process.env.LLM_MODEL || '',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 120_000),
  },
  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  /** Test/proxy hook — points the Tavily adapter at a compatible endpoint. */
  tavilyBaseUrl: (process.env.TAVILY_BASE_URL || 'https://api.tavily.com').replace(/\/+$/, ''),
  searxngUrl: (process.env.SEARXNG_URL || '').replace(/\/+$/, ''),
  /** Drafts scoring below this are dropped before they reach the review list. */
  searchQualityFloor: Number(process.env.SEARCH_QUALITY_FLOOR || 50),
};

/** True when the LLM gateway is configured (any real search source needs it). */
export function llmReady(): boolean {
  return config.llm.apiKey.length > 0 && config.llm.model.length > 0;
}

/** True when the chosen search source has all its credentials. */
export function searchSourceReady(): boolean {
  switch (config.searchSource) {
    case 'gateway':
      return llmReady();
    case 'tavily':
      return llmReady() && config.tavilyApiKey.length > 0;
    case 'searxng':
      return llmReady() && config.searxngUrl.length > 0;
    default:
      return false;
  }
}

function parseFastMode(v: string | undefined): number {
  if (!v || v === '0' || v.toLowerCase() === 'false') return 25_000;
  if (v.toLowerCase() === 'true') return 300;
  const m = /^(\d+)(ms)?$/.exec(v.trim());
  if (m) return m[1] === '1' && !m[2] && v.trim() === '1' ? 25_000 : Number(m[1]);
  return 25_000;
}
