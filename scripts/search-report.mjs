#!/usr/bin/env node
/**
 * Search round reporter — the Step 6 tuning tool.
 *
 *   node scripts/search-report.mjs [scope] [prompt]
 *   e.g. node scripts/search-report.mjs fellowships
 *        node scripts/search-report.mjs training "youth leadership academies in Asia"
 *
 * Posts one search to a RUNNING dev server (default :8787), polls until the
 * job finishes (cap 20 min), then prints the funnel stats and every draft
 * this round added, sorted by quality — the pass-rate view used to tune the
 * per-category prompts (acceptance: >50% of drafts an admin would approve).
 *
 * Uses ADMIN_PASSWORD from the environment/.env (default dku-admin).
 */
import fs from 'node:fs';
import path from 'node:path';

// tiny .env loader (dev convenience; mirrors server/src/config.ts)
for (const dir of [process.cwd(), path.resolve(process.cwd(), 'server')]) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  } catch {
    continue;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  break;
}

const base = process.env.BASE || 'http://localhost:8787';
const password = process.env.ADMIN_PASSWORD || 'dku-admin';
const scope = process.argv[2] || 'all';
const prompt = process.argv[3] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const login = await fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password }),
}).catch((e) => fail(`cannot reach ${base} — ${e.cause?.code || e.message}`));
if (!login.ok) fail(`login failed (HTTP ${login.status}) — check ADMIN_PASSWORD`);
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

const api = (p) => fetch(base + p, { headers: { cookie } }).then((r) => r.json());

const before = await api('/api/summary');
if (before.searchRunning) fail('a search is already running — wait for it first');
const beforeIds = new Set((await api('/api/entries?status=review')).map((e) => e.id));

console.log(`→ posting search (scope=${scope}${prompt ? `, prompt="${prompt}"` : ', tag-only'})…`);
const post = await fetch(`${base}/api/search`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ prompt, scope }),
});
if (post.status !== 202) fail(`search rejected: HTTP ${post.status} — ${await post.text()}`);

const t0 = Date.now();
let sum = null;
for (;;) {
  await sleep(3000);
  sum = await api('/api/summary').catch(() => null);
  if (sum && !sum.searchRunning) break;
  if (Date.now() - t0 > 20 * 60_000) fail('timed out after 20 min');
}

console.log(`\n========== SEARCH ROUND REPORT (scope=${scope}) ==========`);
console.log(`finished in ${Math.round((Date.now() - t0) / 1000)}s`);
const s = sum.lastSearchStats;
if (s) {
  console.log(`funnel: found ${s.candidatesFound} → dedup-skipped ${s.dedupSkipped} → editions ${s.sameProgramEditions} → extract-failed ${s.extractionFailed} → low-quality ${s.lowQuality} → RETURNED ${s.returned}${s.error ? `\nERROR: ${s.error}` : ''}`);
} else {
  console.log('funnel: (mock provider — no stats reported)');
}

const after = await api('/api/entries?status=review');
const fresh = after.filter((e) => !beforeIds.has(e.id)).sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
console.log(`\nnew drafts in review: ${fresh.length}`);
for (const e of fresh) {
  console.log(`  [${e.category}] q=${e.quality ?? '?'}  ${e.name}\n      ${e.summary.slice(0, 150)}\n      ${e.url}`);
}
if (fresh.length > 0) {
  const pass = fresh.filter((e) => (e.quality ?? 0) >= 80).length;
  console.log(`\nquality ≥80 share: ${pass}/${fresh.length} — tune category-prompts.ts if an admin would reject most of these`);
}
