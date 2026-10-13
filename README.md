# DKU Leadership Resource Bank

A two-face web application for Duke Kunshan University Leadership Programs:

- **Display app** (`/`): animated English portal — hero page with a clone-flight
  transition into a fully scrollable resource catalog with live updates (SSE).
- **Admin app** (`/admin`): real web search (Tavily + campus LLM gateway behind
  a provider interface; mock fallback when unconfigured), review workflow
  (approve/remove/edit), weekly update checking, and content management synced
  live to the display site.

English only. Light theme. Logo top-left everywhere.

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
npx playwright test             # E2E (28 tests; auto-resets dev DB, FAST_MODE=300ms, SEARCH_SOURCE pinned off)
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
duplicates, extracts structured drafts, and scores quality (floor 70). Fill in
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
