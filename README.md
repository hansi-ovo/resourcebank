# DKU Leadership Resource Bank

A two-face web application for Duke Kunshan University Leadership Programs:

- **Display app** (`/`): animated English portal — hero page with a clone-flight
  transition into a fully scrollable resource catalog with live updates (SSE),
  plus a top-right keyword search box on `/resources` (program name,
  eligibility, overview — multi-term AND match, sections without matches hide).
- **Admin app** (`/admin`): real web search (Tavily + campus LLM gateway behind
  a provider interface; mock fallback when unconfigured), review workflow
  (approve/remove/edit), weekly update checking, and content management synced
  live to the display site.

English only. Light theme. Logo top-left everywhere.

Admin table interactions:

- **Eligibility (audience) editing** — one action saves: press Enter or click
  Save; both commit any pending tag and persist the list (Escape cancels).
- **Export selected** — check rows on the Review list or Content management,
  then `Export selected` downloads a UTF-8 (BOM) CSV spreadsheet of the checked
  entries (client sheet columns + admin Notes).
- **Manual add auto-recognition** — `POST /api/import-url` fetches a pasted
  link (following redirects, including the lnkd.in / inkd.in interstitial
  embedded-target hop and og:image extraction) and LLM-fills the form's
  Program / Category / Timeline / Web link / Eligibility / Overview / Image
  fields for the admin to review and confirm. Unreachable or login-walled
  pages return a readable 4xx; the admin can always fill the form by hand.
- **Local image upload** — the Image URL fields (manual add form + inline
  edits) accept both a pasted link and a local JPG/PNG/WebP/GIF file
  (`POST /api/uploads`, admin-only, ≤5 MB, magic-byte validated). Files are
  stored next to the SQLite DB (`<data>/uploads/`) under server-generated
  names and served publicly at `/api/uploads/<name>` (immutable cache);
  the DB keeps that servable path as the entry's image URL.

## Deployer quick start (university IT)

One-time setup — see the full **Deployment runbook** below for details:

```bash
git clone <repo-url> /opt/resourcebank && cd /opt/resourcebank
npm install && npm run build          # Node 20 required
cp deploy/.env.example .env           # then set ADMIN_PASSWORD, SESSION_SECRET
                                      # (LLM_API_KEY / TAVILY_API_KEY: apply for your own keys)
# systemd + nginx + backup: follow "Deployment runbook" steps 4-6
```

To pull updates later (deployed copy is a plain git clone):

```bash
cd /opt/resourcebank
git pull
npm install && npm run build
sudo systemctl restart rb             # service name per deploy/rb.service
curl http://localhost:<port>/api/health   # expect {"ok":true}
```

Content lives in SQLite (`server/data/rb.sqlite` outside the repo) —
`git pull` never touches published content.

## Stack

Vite 7 · React 19 · TypeScript 5 · Tailwind CSS v4 · React Router 8 · GSAP 3.15
(ScrollTrigger + transition) · react-bits components (vendored: BlurText,
VariableProximity, FuseButton) · Express 5 · better-sqlite3 (WAL) · zod ·
node-cron. Fonts self-hosted via Fontsource (Bricolage Grotesque + Public Sans).

## Local development (Node ≥ 20)

```bash
npm install
npm run dev            # Express on :8787 (tsx watch) + Vite on :5173
```

Open http://localhost:5173 — the dev password is `dku-admin` unless
`ADMIN_PASSWORD` is set (see `deploy/.env.example` for all env vars).

First run seeds the SQLite DB (`server/data/rb.sqlite`) with 36 mock programs
using a frozen deterministic split: per category, even seed indices are
published, odd indices are in review.

Useful scripts:

```bash
npm run test -w server          # Vitest (63 tests: state machine, dedupe, scoring, auth, SSE, LLM JSON, search pipeline)
npx playwright test             # E2E (37 tests; ISOLATED servers :8799/:5199 + throwaway DB - never touches your dev data)
npm run build                   # typecheck + build server (esbuild ESM) + client (Vite)
node scripts/acceptance.mjs     # API lifecycle walk (login → search → edit → approve → withdraw → SSE)
node scripts/llm-smoke.mjs      # LLM gateway smoke test (lists models, one chat call)
node scripts/pipeline-rehearsal.mjs  # full search pipeline rehearsal (mock Tavily + real LLM)
node scripts/search-report.mjs [scope] ["prompt"]  # one real search round → funnel stats + draft quality report
node scripts/contrast-audit.mjs # WCAG token contrast checks
node scripts/lighthouse.mjs     # a11y/perf (LH_BASE env selects origin)
```

### Real web search (admin app)

The search pipeline is real by default when configured — Tavily finds candidate
pages, the DKU NewAPI gateway (OpenAI-compatible) plans queries, judges
  duplicates, extracts structured drafts, and scores quality (floor 50). Fill in
`.env` (see `deploy/.env.example`):

```
LLM_API_KEY=...            # gateway key (campus VPN required in dev)
LLM_MODEL=gemini-3.5-flash # exact name from the gateway model list
SEARCH_SOURCE=tavily
TAVILY_API_KEY=tvly-...    # free tier: 1000 searches/month
```

Unconfigured (`SEARCH_SOURCE` unset) everything falls back to the offline
`MockSearchProvider` — tests and demos never touch the network. Duplicate
handling: exact-page dedup via URL normalization, plus an LLM entity check —
a newer edition of a known program (…/2027 of …/2026) routes to **Check
updates** as a pending url-diff instead of polluting the review list.

### WeChat official-account search (`SEARCH_SOURCE=wechat` or `tavily,wechat`)

`SEARCH_SOURCE` accepts a comma-combination: `tavily,wechat` merges the
plain-web channel and the WeChat channel into one round
(`CompositeSearchSource`, deduped by normalized URL). Same env as `tavily`
(LLM gateway + `TAVILY_API_KEY`). WeChat articles are found through two
channels: Sogou WeChat search (weixin.sogou.com, no key needed but aggressive
rate-limiting — it serves a captcha wall after ~2 rounds of queries from one
IP and may stay walled for minutes; back off and retry later) and Tavily
(weixin articles are sparsely indexed, but whitelisted accounts' official
pages surface reliably). Every article is triaged by the LLM:

- **entry** — the post announces ONE concrete opportunity (program,
  fellowship, summer school, conference, internship, or campus/part-time
  recruitment aimed at students). The article URL itself becomes the
  review-list entry, since WeChat posts have no official program site.
- **roundup** — a resource-bank style post summarizing multiple projects.
  The article is NOT stored; external project URLs mentioned in its text are
  extracted (LLM list ∪ deterministic plain-text scan) and each one is
  fetched and extracted as its own draft, deduped against the DB.
- **skip** — NOT review-worthy. All of the following are dropped:
  * one-off opportunities whose application deadline (shown in the article)
    is already past — the LLM sees today's date and reports the deadline it
    finds, and the pipeline double-checks that ISO date deterministically.
    **Recurring/annual programs with a closed window survive** (they are
    marked recurring and kept);
  * sports competitions (athletic tournaments, races, leagues — academic
    case competitions and hackathons are kept);
  * experienced-hire full-time recruitment ads (社招), news, marketing.
  Internships, part-time and campus recruitment for
  undergraduates/graduates are kept.

### WeChat whitelist

Only whitelisted official accounts' articles enter the review list. Managed
in the admin app: search bar → gear icon (Search settings) → add/remove
account names. Stored live in the settings table; edits apply from the next
search round without a restart. Seeded with `WECHAT_WHITELIST` env (default
"Impact Circle, Microcosmos志愿者营地"). In whitelist mode the account names
themselves become targeted queries, and the WeChat channel also surfaces the
accounts' official non-WeChat pages (Notion, homepages), which go through
the normal extraction + freshness gates.

Maintenance: `node scripts/sweep-expired.mjs [--dry-run]` re-checks the
current review list against today's date (Asia/Shanghai) and moves every
entry with a past `endsAt` to removed.

### Weekly update check (real checker)

Once the LLM gateway is configured (same env as above), the scheduled check —
Monday 09:00 Asia/Shanghai — switches from the offline mock to
`RealUpdateChecker`: it re-reads each published entry's official page and asks
the LLM what changed. Only real, confident differences (deadline, start date,
timeline, audience tags — never guessed) become pending items in **Check
updates**; the admin applies or discards them there. Unreachable pages and
gateway failures are skipped per entry, never crash the round. Set
`UPDATE_CHECKER=off` to pin the mock (tests/e2e do this implicitly via
`SEARCH_SOURCE=off`).

## Production build

```bash
npm run build
# server/dist/index.js  — bundled ESM, Node 20 target (schema.sql alongside)
# client/dist/          — static assets (hashed, immutable) + index.html
node scripts/prod-server.mjs    # optional: Node parity server for measurement
```

## Deployment runbook (defaults until D14 facts arrive)

Defaults (01-architecture §9): Linux server, Node 20, systemd, Nginx,
HTTPS via university certificate, daily 03:00 SQLite backup with 14-day
retention.

1. **Install Node 20** on the server and copy the repo to `/opt/resourcebank`
   (or run the build locally and upload `server/dist/`, `client/dist/`,
   `shared/`, `node_modules/better-sqlite3`, `deploy/`).
2. **Build**: `npm install && npm run build`.
3. **Env**: `cp deploy/.env.example /opt/resourcebank/.env` and set
   `ADMIN_PASSWORD` + `SESSION_SECRET` (openssl rand -base64 32).
4. **systemd**: `cp deploy/rb.service /etc/systemd/system/ && systemctl
   daemon-reload && systemctl enable --now rb`. Check `systemctl status rb`.
5. **Nginx**: copy `deploy/nginx.conf`, substitute `__DOMAIN__`,
   `__TLS_CERT__`, `__TLS_KEY__`, `__CLIENT_DIST__` (→
   `/opt/resourcebank/client/dist`), `__SERVER_PORT__` (→ the Express port).
   `nginx -t && systemctl reload nginx`.
   The config already sets `proxy_buffering off` + `X-Accel-Buffering: no`
   on `/api/stream` (SSE) and gzip on for text assets.
6. **Backups**: `install -m 755 deploy/backup.sh /opt/resourcebank/deploy/`
   then add the crontab line from the script header (daily 03:00).
7. **Verify**: `curl https://<domain>/api/health` → `{"ok":true}`; log into
   `/admin`; open `/` and run the hero → content transition; approve one item
   in Review list and watch it appear on an open display tab; re-run
   Lighthouse on the real host (acceptance: a11y ≥ 95, display perf ≥ 90).

### D14 blanks (pending university server facts)

| Question | Default in use |
|---|---|
| OS / distro | Linux (any systemd distro) |
| Node 20 availability | assumed installable |
| Domain / subpath | `__DOMAIN__` placeholder (root path, no subpath) |
| TLS certificate | university cert via `__TLS_CERT__`/`__TLS_KEY__` |
| Backup target host/path | local `/var/backups/rb/` |
| SQLite data dir | `/opt/resourcebank/data` (systemd ReadWritePaths) |

## Project layout

See `.omo/plans/2026-09-19-dku-resource-bank/` for the full approved plan
(architecture, design system, page specs, build phases). Discretionary
decisions taken during the autonomous build are logged in
`.omo/questions.md`; ⚑-marked copy items await client sign-off.
