# DKU Leadership Resource Bank — Verification Evidence

Date: 2026-09-19 · Machine: Windows (local build workstation) · Node v24.16.0 · npm 11.13.0

## Definition of done (04-build-phases.md §Definition of done)

### 1. All phase acceptance boxes checked; test matrix green

| Phase | Acceptance evidence |
|---|---|
| 0 Foundations | `npm run dev` served token-correct client + `/api/health {ok:true}`; logo verified top-left via Playwright; fonts self-hosted (zero Google Fonts requests); logo PNG 23,311 bytes, PNG magic bytes verified |
| 1 Server core | Vitest **31/31** green (state machine, URL dedupe across statuses, batch, apply/discard, auth 401/200/429, SSE event push, mock scoring); `scripts/acceptance.mjs` **27/27** green (full lifecycle incl. SSE + rate limit at 5 failed/min) |
| 2 Admin UI | Playwright **6/6** (scenarios 1–2, keyboard edit, right-click menu, check-updates flow, reduced-motion FuseButton) |
| 3 Hero + transition | Playwright **3/3** (BlurText/keywords/drift/dock/hover-pause; transition purity — layout properties static while transforms animate; reduced-motion crossfade, no overlay) |
| 4 Content page | Playwright **5/5** (TOC jump + modal ×3 closes, focus trap, deep links, reduced motion, **two-browser live sync**: withdraw → card disappears, approve → card appears) |
| 5 Polish | Playwright **9/9** (responsive 320–1440 ×6, focus rings, manifest/favicon/no-JS/404) + copy-deck **2/2**; contrast audit **17/17**; display initial JS **153KB gz ≤ 180KB**; Lighthouse a11y **95/100/98** |
| 6 Deployment | Fresh-clone dry-run: clone → `npm install` (392 pkgs) → `npm run build` → `node server/dist/index.js` + parity server → health/published/SPA all 200 |

**Full test matrix (final run): 26/26 Playwright + 31/31 Vitest, zero failures.**
`npx playwright test` (auto-resets dev DB per run) and `npm run test -w server`.

### 2. Live demo script

`node scripts/demo.mjs` — run WITHOUT FAST_MODE (honest 25s search):
**15/15 steps passed**; screenshots + JSON results in `.omo/reviews/demo/`.
Flow covered: hero → transition → content page; TOC jump; modal close ×3
(Escape / × / outside); admin login; search with honest 25s wait while editing
a review cell mid-search (non-blocking UI); search-finish toast after a full
page reload mid-job (server-side job state + re-attach); edit persistence
after reload; demo update check → apply; approve → card appears on an open
display tab (fuse window + SSE); withdraw → card disappears live.

### 3. Anti-generic self-critique

See `.omo/reviews/anti-generic-critique.md` — one-paragraph verdict per app
plus screenshot references.

### 4. ⚑ copy items surfaced to client

See `.omo/reviews/flags-for-client.md`.

## Measurement details (production-parity server)

`scripts/prod-server.mjs` (brotli/gzip + immutable caching + font preload —
mirrors the Nginx topology in deploy/nginx.conf):

| Page | a11y | perf | Notes |
|---|---|---|---|
| `/` (hero) | 95 | 72 | CLS 0.001; TBT 40–180ms; transfer ~310KB |
| `/resources` | 100 | 66 | CLS ≤0.08 (skeleton grids); first images eager |
| `/admin` | 98 | 70 | |

All a11y ≥ 95 ✓ (04 Phase 5 acceptance). Perf ≥ 90 not reached on this busy
workstation (dominant cost: Lighthouse-simulated 4× CPU throttle over the
animated-first-paint SPA boot). Structural budgets met — transfer, TBT, CLS.
Recommend re-measuring on the university host per README runbook §Verify
before treating perf < 90 as blocking; Nginx gzip/brotli config included.
See `.omo/questions.md` Phase 5 entry for the full honesty note.

## Reproduction

```bash
npm install
npx playwright test                 # 26 e2e (manages its own dev servers)
npm run test -w server              # 31 vitest
npm run build                       # server dist + client dist
node scripts/prod-server.mjs 4174   # + Express on :8787 → parity measurement
node scripts/demo.mjs               # honest 25s live demo (needs default-mode dev servers)
```
