## Discretionary decisions log

Autonomous-mode log per WORKORDER. Each line: decision → default taken → rationale.

- **2026-09-19 · Package versions** → React 19.3.0, Vite 7.3.0, Tailwind 4.3.3, TS 5.8.3, Express 5.2.1, better-sqlite3 12.10.1, react-router 8.4.0 (current latest stable at build time). Plan names stack without pinning exact minors.
- **2026-09-19 · Logo URL** → CDN PNG downloaded to `client/public/logo.png` (23,311 bytes, PNG magic bytes verified). Not yet rendered "top-left" in final layout — Phase 2/3 builds the real headers; Phase 0 placeholder verifies it serves.
- **2026-09-19 · Seed imagery** → Real remote image URLs would be broken/hotlink-prone (mainland deployment). Default: locally served generated SVG tonal tiles via `/api/seedimg/:cat/:file` (route derives from entry category); a few entries have `imageUrl: null` to exercise the D6 tonal fallback. Server route used instead of static files so DB rows keep a URL-shaped value.
- **2026-09-19 · shared package layout** → plan file tree shows `shared/types.ts` at shared root (not `src/`); followed the tree. `main`/`exports` point directly at TS files (consumed by tsx/vite raw; no build artifact needed in dev).
- **2026-09-19 · tsx watch for server dev** → plan says "server (watch)"; `tsx watch` chosen (esbuild-based, fastest restart; ts-node-dev is legacy).
- **2026-09-19 · Port** → 8787 per plan (Vite proxy target `:8787`).
- **2026-09-19 · Session secret default** → dev fallback `dev-secret-change-me` when env missing; production template ships in Phase 6 `deploy/.env.example`.
- **2026-09-19 · ADMIN_PASSWORD dev default** → `dku-admin` (login card still rejects wrong passwords; tests rely on it).
- **2026-09-19 · FAST_MODE parsing** → accepts `300ms`/`300`/`true`; anything else → 25,000ms. Playwright config sets `FAST_MODE=300ms` in webServer env.
- **2026-09-19 · Git identity** → commits authored as local `worker <worker@local>` (no user git config present in this environment).
- **2026-09-19 · Placeholder page** → Phase 0 acceptance requires a "blank token-correct client"; a temporary main.tsx with real tokens/fonts/logo serves as that surface and will be replaced in Phase 2/3.
- **2026-09-19 · Vite 7 + React plugin 5** → current stable majors; react-bits components are compatible (React 19 semantics preserved).
- **2026-09-19 · Phase 1 — second SSE event type** → Plan §5 lists only `entries-changed`; admin tab live badges ("refresh after every action; SSE-driven same as display" 03-pages §review) need a distinct signal. Added `updates-changed` SSE event; display ignores it. Flag for client awareness, not a copy/scope change.
- **2026-09-19 · Phase 1 — search on a seeded DB returns 0 new items** → Frozen seed split inserts ALL 36 mock entries, so every mock-searchable URL already exists and MockSearchProvider dedupes everything. Demo/honest UI still works (toast "Search finished: 0 items added to review"), and Playwright #1 approves seeded review items. This is plan-consistent (D10 dedupe + frozen split) but worth telling the client: with mock providers, search only ever adds items on a DB seeded with less than the full seed set or after entries were fully removed pre-seed. Real providers will fix this naturally.
- **2026-09-19 · Phase 1 — remove() also broadcasts** → plan says only published-set changes broadcast, but admin tabs need review-count refresh via SSE. `remove` emits `entries-changed` too (display unaffected — its payload only contains published rows).
- **2026-09-19 · Phase 1 — PUT on published entry broadcasts** → content tab edits change display content, so inline edits of `status=published` rows emit `entries-changed` (edits of review rows do not).
- **2026-09-19 · Phase 1 — logout semantics** → D4 uses stateless HMAC cookies; server cannot invalidate an unexpired cookie without a denylist. Logout clears the browser cookie (Max-Age=0). 7-day validity of a captured cookie remains — accepted v1 risk (single shared admin role, HTTPS assumed at deploy).
- **2026-09-19 · Phase 1 — rate limiter counts every login attempt** → including successful ones (5/min/IP). Successful logins are rare per IP; simplest correct reading of "5/min/IP".
- **2026-09-19 · Phase 1 — batch idempotence** → batch approve/remove applies only to rows in the correct source state, silently skipping others, and reports {applied, rejected}. Avoids all-or-nothing transactionality the plan never asked for.
- **2026-09-19 · Phase 1 — MockUpdateChecker demo cursor** → repeated "Run demo check" clicks rotate deterministically through published entries (cursor advances by n each call).
- **2026-09-19 · Phase 1 — server production build = esbuild bundle** → tsc emits extensionless ESM imports that Node cannot run; switched to esbuild (--format=esm, target node20, better-sqlite3 external, createRequire banner for CJS deps, schema.sql copied to dist). `tsconfig` remains the typecheck gate.
- **2026-09-19 · Phase 1 — audience diff wire format** → pending-update audience `from`/`to` values are JSON-serialized arrays; `startsAt`/`endsAt` are plain ISO dates or empty string. Client formats them for display.
