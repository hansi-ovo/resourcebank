#!/usr/bin/env node
/**
 * Expired-review sweeper — one-off maintenance for the review list.
 *
 *   node scripts/sweep-expired.mjs [--dry-run]
 *
 * Scans every review-status entry with an endsAt (application deadline) in
 * the past (Asia/Shanghai) and moves it to status=removed (the same
 * transition the admin Reject action uses). Entries without a deadline are
 * left alone — only verifiably expired items are touched.
 *
 * Uses ADMIN_PASSWORD from the environment/.env (default dku-admin) against
 * the RUNNING dev server (default :8787), so SSE listeners stay consistent.
 */
import fs from 'node:fs';
import path from 'node:path';

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
const dryRun = process.argv.includes('--dry-run');

const todayIso = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })).toISOString().slice(0, 10);

const login = await fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password }),
});
if (!login.ok) {
  console.error(`✗ login failed (HTTP ${login.status})`);
  process.exit(1);
}
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const api = (p, opts = {}) => fetch(base + p, { ...opts, headers: { cookie, ...(opts.headers ?? {}) } });

const entries = await (await api('/api/entries?status=review')).json();
const expired = entries.filter((e) => e.endsAt && e.endsAt < todayIso);

console.log(`review entries: ${entries.length}; today (Asia/Shanghai): ${todayIso}`);
if (expired.length === 0) {
  console.log('no expired deadlines in review — nothing to do');
  process.exit(0);
}

console.log(`\nexpired (${expired.length}):`);
for (const e of expired) {
  console.log(`  [${e.id}] endsAt=${e.endsAt}  ${e.name}`);
}

if (dryRun) {
  console.log('\n--dry-run: nothing changed');
  process.exit(0);
}

const res = await api('/api/entries/batch', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ids: expired.map((e) => e.id), action: 'remove' }),
});
if (!res.ok) {
  console.error(`✗ batch remove failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  process.exit(1);
}
const { applied, rejected } = await res.json();
console.log(`\nremoved ${applied} expired entries (${rejected} rejected — status changed meanwhile)`);
