/**
 * Phase 1 acceptance: full API lifecycle walk against a FAST_MODE dev server.
 * Node 20+ has global fetch. Run: node scripts/acceptance.mjs
 *
 * NOTE: with SEARCH_SOURCE set to a real source in .env, step 3 runs a REAL
 * web search (slow + quota). Pin SEARCH_SOURCE=off for a mock acceptance run.
 */
const base = process.env.BASE ?? 'http://localhost:8787';
let pass = 0;
let fail = 0;
const step = (name, cond) => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}`); }
};

let cookie = '';

async function api(method, path, body, expectAuth = true) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(expectAuth && cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* raw */ }
  return { status: res.status, json, text };
}

// 0. health
const h = await api('GET', '/api/health', undefined, false);
step('health ok', h.status === 200 && h.json.ok === true);

// 1. login
const login = await api('POST', '/api/login', { password: 'dku-admin' }, false);
step('login ok', login.status === 200 && login.json.ok === true);
step('login sets rb_session cookie', cookie.startsWith('rb_session='));

// 1b. wrong password -> 401 (in a separate cookie jar so ours stays valid)
const savedCookie = cookie;
cookie = '';
const wrong = await api('POST', '/api/login', { password: 'bad' }, false);
step('wrong password 401 + copy-deck error', wrong.status === 401 && wrong.json.error === 'Wrong password. Try again.');
cookie = savedCookie;

// 1c. anonymous guard
const anon = await api('GET', '/api/summary', undefined, false);
step('summary anonymous 401', anon.status === 401);

// 2. summary (seeded)
const sum = await api('GET', '/api/summary');
step('summary reviewCount > 0', sum.json.reviewCount > 0);
step('summary lastSearchAt null before search', sum.json.lastSearchAt === null);

// 3. search — poll until finished instead of a fixed sleep: FAST_MODE mock
// lands in well under a second, but a real search source (SEARCH_SOURCE set)
// legitimately runs for minutes; don't fail the walk on provider latency.
const search = await api('POST', '/api/search', { prompt: 'climate research expedition', scope: 'all' });
step('search 202 with jobId', search.status === 202 && search.json.jobId > 0);
let sum2 = null;
const searchDeadline = Date.now() + 10 * 60_000;
while (Date.now() < searchDeadline) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const s = await api('GET', '/api/summary');
    if (s.json && s.json.searchRunning === false) {
      sum2 = s;
      break;
    }
  } catch {
    /* transient network — next tick retries */
  }
}
step('search finished', sum2 !== null);
step('lastSearchAt set', sum2 !== null && typeof sum2.json.lastSearchAt === 'string');

// 4. inline edit on a review entry
const reviewList = await api('GET', '/api/entries?status=review');
step('review list non-empty', Array.isArray(reviewList.json) && reviewList.json.length > 0);
const target = reviewList.json[0];
const edited = await api('PUT', `/api/entries/${target.id}`, { name: 'Edited Program Name' });
step('edit persists', edited.json.name === 'Edited Program Name');

// 5. approve -> published + public payload
const approved = await api('POST', `/api/entries/${target.id}/approve`);
step('approve -> published', approved.json.status === 'published');
const pub = await api('GET', '/api/published', undefined, false);
const flat = pub.json.flatMap((s) => s.entries);
step('approved visible in public payload', flat.some((e) => e.id === target.id));
step('published payload canonical order', pub.json.map((s) => s.category.id).join(',') === 'on-campus,fellowships,experiential,events,training');

// 6. demo update check -> 2-3 pending diffs
const demo = await api('POST', '/api/updates/demo/update-check');
step('demo injects 2-3', demo.json.inserted >= 2 && demo.json.inserted <= 3);
const pending = await api('GET', '/api/updates?status=pending');
step('pending list matches', pending.json.length === demo.json.inserted);
step('diff has note', typeof pending.json[0].diff[0].note === 'string' && pending.json[0].diff[0].note.length > 0);

// 7. apply first pending
const applied = await api('POST', `/api/updates/${pending.json[0].id}/apply`);
step('apply ok', applied.json.ok === true);
step('applied source=update-apply', applied.json.entry.source === 'update-apply');

// 8. withdraw -> gone from public
const withdrawn = await api('POST', `/api/entries/${target.id}/withdraw`);
step('withdraw -> withdrawn', withdrawn.json.status === 'withdrawn');
const pub2 = await api('GET', '/api/published', undefined, false);
const flat2 = pub2.json.flatMap((s) => s.entries);
step('withdrawn gone from public', !flat2.some((e) => e.id === target.id));

// 9. SSE handshake + event push
const sse = await fetch(base + '/api/stream');
step('SSE content-type', (sse.headers.get('content-type') ?? '').includes('text/event-stream'));
step('SSE no proxy buffering', sse.headers.get('x-accel-buffering') === 'no');
const reader = sse.body.getReader();
const sawFirst = await reader.read();
step('SSE first bytes', new TextDecoder().decode(sawFirst.value).includes('retry'));
// trigger a mutation and watch the stream
const sawEvent = (async () => {
  const dec = new TextDecoder();
  let buf = new TextDecoder().decode(sawFirst.value);
  while (true) {
    const { value, done } = await reader.read();
    if (done) return false;
    buf += dec.decode(value);
    if (buf.includes('event: entries-changed')) return true;
  }
})();
const rl2 = await api('GET', '/api/entries?status=review');
await api('POST', `/api/entries/${rl2.json[0].id}/approve`);
step('SSE entries-changed arrives', (await Promise.race([sawEvent, new Promise((r) => setTimeout(() => r(false), 3000))])) === true);
reader.cancel().catch(() => {});

// 10. rate limit: 6th wrong-password attempt in a minute -> 429
const saved = cookie;
cookie = '';
let lastStatus = 0;
for (let i = 0; i < 6; i++) {
  const r = await api('POST', '/api/login', { password: 'nope' }, false);
  lastStatus = r.status;
}
step('rate limit 429 at 6th attempt', lastStatus === 429);
cookie = saved;

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
