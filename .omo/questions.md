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
