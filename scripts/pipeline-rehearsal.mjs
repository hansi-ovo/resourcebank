#!/usr/bin/env node
/**
 * Full-pipeline dress rehearsal WITHOUT a real Tavily key:
 *
 *   mock Tavily (POST /search → 3 local fake program pages)
 *     + REAL campus LLM (query planning, entity dedup, extraction, scoring)
 *     + REAL server boot path (config → provider factory → runJob → DB)
 *
 *   node scripts/pipeline-rehearsal.mjs
 *
 * Exits 0 when the round hands at least one draft to the review list and
 * /api/summary reports the funnel stats. Run from the repo root with the
 * campus VPN on (the LLM gateway lives on an internal IP).
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function page(title, body) {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

const PAGES = {
  'p/1': page(
    'Horizon Fellowship 2027',
    `<h1>Horizon Fellowship 2027</h1>
     <p>The Horizon Fellowship is a fully funded one-year program for undergraduate students across Asia, covering tuition, travel and a monthly stipend.</p>
     <p>Applications open January 5, 2027 and close March 1, 2027. Open to undergraduates in their penultimate year; selection includes a semi-finalist interview round.</p>
     <p>Fellows complete two field placements with partner organizations and a capstone leadership project. Apply through the official fellowship portal.</p>`,
  ),
  'p/2': page(
    'Riverline Summer Field Program',
    `<h1>Riverline Summer Field Program 2027</h1>
     <p>A six-week summer field research program for undergraduates interested in environmental leadership. Participants join a research crew, collect field data and present findings at a closing symposium.</p>
     <p>Program dates: June 14 – July 26, 2027. Application deadline: February 20, 2027. Need-based travel grants are available.</p>`,
  ),
  'p/3': page(
    'Pacific Youth Summit 2027',
    `<h1>Pacific Youth Summit 2027</h1>
     <p>The Pacific Youth Summit brings together 300 student delegates for four days of negotiated simulations, leadership workshops and keynote panels.</p>
     <p>Summit dates: August 3–6, 2027, Singapore. Delegate applications close April 15, 2027. Financial aid covers flights for selected delegates.</p>`,
  ),
};

// ── mock Tavily + fake pages ─────────────────────────────────────────────
const mock = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/search') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const port = mock.address().port;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          results: [
            { title: 'Horizon Fellowship 2027', url: `http://127.0.0.1:${port}/p/1`, content: 'Fully funded one-year fellowship for undergraduates in Asia.' },
            { title: 'Riverline Summer Field Program', url: `http://127.0.0.1:${port}/p/2`, content: 'Six-week summer field research program for undergraduates.' },
            { title: 'Pacific Youth Summit 2027', url: `http://127.0.0.1:${port}/p/3`, content: 'Delegate summit with leadership workshops for students.' },
          ],
        }),
      );
    });
    return;
  }
  const p = PAGES[req.url.replace(/^\//, '')];
  if (p) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(p);
    return;
  }
  res.statusCode = 404;
  res.end('nope');
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockPort = mock.address().port;
console.log(`[rehearsal] mock tavily + pages on http://127.0.0.1:${mockPort}`);

// ── boot the real server against the mock ────────────────────────────────
const dir = mkdtempSync(path.join(tmpdir(), 'rb-rehearsal-'));
const PORT = 8991;
const base = `http://127.0.0.1:${PORT}`;
// npm workspaces hoist tsx to the ROOT node_modules — resolve from there.
const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const child = spawn(
  process.execPath,
  [tsxCli, 'src/index.ts'],
  {
    cwd: path.join(ROOT, 'server'),
    env: {
      ...process.env,
      PORT: String(PORT),
      RB_DB_PATH: path.join(dir, 'rb.sqlite'),
      DATA_DIR: dir,
      ADMIN_PASSWORD: 'rehearsal-pw',
      FAST_MODE: '300ms',
      SEARCH_SOURCE: 'tavily',
      TAVILY_API_KEY: 'tvly-rehearsal-fake',
      TAVILY_BASE_URL: `http://127.0.0.1:${mockPort}`,
      LLM_MODEL: process.env.LLM_MODEL || 'gemini-3.5-flash',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  },
);

let up = false;
for (let i = 0; i < 30 && !up; i++) {
  await sleep(1000);
  up = await fetch(`${base}/api/health`)
    .then((r) => r.ok)
    .catch(() => false);
}
if (!up) {
  console.error('\n[rehearsal] FAIL — server did not boot within 30s');
  child.kill();
  process.exit(1);
}
console.log('[rehearsal] server up, posting search…');

const login = await fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: 'rehearsal-pw' }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const api = (p, opts = {}) => fetch(base + p, { ...opts, headers: { ...opts.headers, cookie } });

await api('/api/search', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: 'funded fellowships and summer programs for undergraduates', scope: 'all' }),
});

let sum = null;
const t0 = Date.now();
while (Date.now() - t0 < 5 * 60_000) {
  await sleep(2000);
  sum = await api('/api/summary')
    .then((r) => r.json())
    .catch(() => null);
  if (sum && !sum.searchRunning) break;
}

const review = await api('/api/entries?status=review')
  .then((r) => r.json())
  .catch(() => []);

console.log('\n========== REHEARSAL RESULT ==========');
console.log('lastSearchStats:', JSON.stringify(sum?.lastSearchStats, null, 2));
// Seeds are also source='search', so count only the three mock programs.
const MOCK_NAMES = ['Horizon Fellowship 2027', 'Riverline Summer Field Program', 'Pacific Youth Summit 2027'];
const fresh = (Array.isArray(review) ? review : []).filter((e) =>
  MOCK_NAMES.some((n) => e.name.includes(n)),
);
for (const e of fresh) {
  console.log(`- [${e.category}] ${e.name} (quality=${e.quality}) :: ${e.summary.slice(0, 120)}…`);
}
const ok = Boolean(sum?.lastSearchStats?.returned >= 1) && fresh.length >= 1;
console.log(`\n[rehearsal] ${ok ? '✓ PASS — drafts reached the review list' : '✗ FAIL — see stats above'}`);

child.kill();
mock.close();
try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* Windows may hold the SQLite WAL lock briefly — temp dir is disposable */
}
process.exit(ok ? 0 : 1);
