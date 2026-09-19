# 04 — Build Phases, Acceptance & Handoff

Phases are ordered so each ends in something runnable and reviewable. Worker sessions execute in order; a phase is "done" only when all acceptance boxes pass. No phase depends on pending D14 server facts.

## Phase 0 — Foundations (repo, tokens, shared)

- [ ] npm workspaces: `client` (Vite + React 19 + TS + Tailwind v4), `server` (Node 20 target, Express), `shared`
- [ ] Tailwind v4 `@theme` tokens from `02-design-system.md` §1–2; `styles/tokens.css`
- [ ] Self-hosted fonts: `@fontsource-variable/bricolage-grotesque`, `@fontsource/public-sans` (weights 400–700, tabular nums on `.num`)
- [ ] Download logo PNG from the CDN link (resourcebank.md L13) to `client/public/logo.png` using curl/Invoke-WebRequest (NEVER the Read tool — the build model may not support image input); verify via file size >5KB + PNG magic bytes, not by viewing
- [ ] `shared/types.ts` (Category ids/labels/tints, Entry, EntryDraft, UpdateDraft, SearchJob); `shared/seed-data.ts` (~36 entries per 01-architecture §7, file header comment `MOCK DATA`)
- [ ] Vite dev proxy `/api` → `:8787`; `FAST_MODE` env plumbed to server

**Accept**: `npm run dev` serves a blank token-correct client + a server returning `{ok:true}` from `/api/health`; Visual: logo renders top-left; fonts load (no network calls to Google).

## Phase 1 — Server core (DB, auth, entries, providers)

- [ ] `schema.sql` + `db.ts` (better-sqlite3, WAL); migrations = idempotent `CREATE IF NOT EXISTS`
- [ ] `seed.ts`: if `entries` empty → first-run seed inserts with a FROZEN deterministic split so both faces demo well: per category, even seed indices (0, 2, 4, …) → `published`, odd indices (1, 3, …) → `review` (≈60/40; no worker discretion; split counts printed to server log on first run)
- [ ] Auth: `POST /api/login|logout`, HMAC cookie 7d, middleware + rate limit per 01-architecture §6
- [ ] Entries API: list/get/put; approve|remove|withdraw|batch; `/api/summary`; `/api/published` (grouped, canonical order)
- [ ] Search: job table, `POST /api/search` (202), server timer 25s/300ms, `MockSearchProvider` (scope+keyword scoring, dedupe vs ALL urls, top-30), `settings.last_search_at`
- [ ] Updates: `pending_updates` CRUD-adjacent; apply patches entry + broadcast; discard; `POST /api/demo/update-check` injects 2–3 diffs; scheduler `0 9 * * 1` Asia/Shanghai
- [ ] SSE `/api/stream` + `bus` broadcasting `entries-changed`
- [ ] Vitest suite per 01-architecture §8 (state machine, dedupe, scoring, apply/discard, auth 401/200, batch)

**Accept**: all Vitest green; curl script walks the full lifecycle (login → search FAST → edit → approve → demo check → apply → withdraw) with correct responses; wrong-password login rate-limits at 5.

## Phase 2 — Admin UI

- [ ] Login card + AdminGuard (401 → card, URL preserved)
- [ ] `/admin` home: title, search panel (icon→spinner, locked input, live note), scope pills, last-search line, summary line, ≤5 pending list, `Go to review`, `View site`
- [ ] `/admin/review/:tab` shell: top bar with back, left nav with live count chips
- [ ] Review list: table, inline cell editing (right-click menu + dblclick + hidden keyboard `Edit`), audience tag-input, category picker, Approve/Remove FuseButtons (D12 params), select-all + batch bar, empty states
- [ ] Check updates: grouped diff rows, Apply/Discard FuseButtons, `Run demo check` quiet secondary button (admin only, footer)
- [ ] Content management: published rows + Withdraw FuseButton; footer note
- [ ] Toasts (verb-first, matched to copy deck); SSE refresh on all admin tabs

**Accept**: Playwright admin scenario (01-architecture §8 #1–2) green; a11y walk of tables (keyboard edit path works); `prefers-reduced-motion` respected on FuseButton (instant state, no fuse burn).

## Phase 3 — Display hero + transition

- [ ] react-bits components copied & pinned: `npx shadcn@latest add https://reactbits.dev/r/BlurText-TS-TW`, `.../VariableProximity-TS-TW`, `.../FuseButton-TS-TW` (record installed file hashes in commit message)
- [ ] Hero: split layout, BlurText title, gradient reveal + keyword tints, CTA; post-reveal VariableProximity on title (container ref = left column)
- [ ] Showcase strip: ladder drift (GSAP ticker), docked entry emphasis, hover pause, mobile static pills
- [ ] Transition (signature): timeline per 03-pages §Transition; route swap under overlay; reduced-motion crossfade

**Accept**: Playwright display scenario #3 up to arrival on `/resources`; transition visually verified at 60fps (transform/opacity only; no layout props animated); reduced-motion crossfade verified.

## Phase 4 — Display content page

- [ ] `/resources`: sections, rules, card grid; image + tonal fallback panels
- [ ] Cards: hover treatment; click → modal (focus trap, ×/backdrop/Escape close, `Visit website`)
- [ ] SectionTOC: ticks, hover/focus expand, click/Enter jump, scroll-spy `aria-current`, deep links `#category`
- [ ] ScrollTrigger section reveals (12px rise + rule wipe, once) with reduced-motion gate
- [ ] SSE live sync: approve/withdraw on admin tab reflects on open display tab ≤1s (fade-swap 150ms)
- [ ] Empty category states

**Accept**: Playwright #3–5 green; two-browser live-sync demo recorded; Lighthouse a11y ≥ 95 display pages.

## Phase 5 — Polish + hardening

- [ ] Cross-page focus states audit (2px ring, 2px offset, every interactive element)
- [ ] Contrast audit incl. chips/tints at 70% (re-verify token math; fix tokens, not components, if borderline)
- [ ] Responsive sweep 320–1440px (hero split stacks, TOC hides <960, admin table → horizontal scroll with sticky first column)
- [ ] Copy deck diff pass (verbatim, ⚑ items listed for client)
- [ ] `manifest`/favicon (logo), 404 page (quiet, tonal), no-JS notice on display
- [ ] Bundle budget: display initial ≤ 180KB gz JS; fonts subset woff2; GSAP tree-shaken (no Premium plugins)

**Accept**: full Playwright suite green; Lighthouse (a11y ≥95, perf ≥90 display) both apps; manual reduced-motion pass recorded.

## Phase 6 — Deployment scaffolding (parameterized, D14 pending)

- [ ] `server` build to ESM `dist/`; client `dist/` statics
- [ ] Nginx config file in repo (`deploy/nginx.conf`): statics + `/api` proxy + `proxy_buffering off;` on `/api/stream`
- [ ] systemd unit `deploy/rb.service`; env template `deploy/.env.example` (ADMIN_PASSWORD, SESSION_SECRET, PORT, FAST_MODE)
- [ ] Backup script `deploy/backup.sh` (daily 03:00, 14-day retention) + crontab
- [ ] README: local dev, build, deploy runbook; D14 blanks listed at top (OS, Node availability, domain/subpath, TLS cert, backup target)

**Accept**: fresh-machine runbook dry-run by a worker who has never seen the repo succeeds end-to-end locally; deployment itself waits for D14 facts.

## Definition of done (project)

1. All phase acceptance boxes checked; test matrix green
2. Live demo script: login → search (wait UI honestly ~25s) → edit → approve → demo check → apply → open display tab → card appears → withdraw → card disappears; TOC jump; modal close ×3 ways
3. Anti-generic self-critique recorded (screenshots, one-paragraph verdict per app) in `.omo/reviews/`
4. ⚑ copy items surfaced to client for wording sign-off

## Execution notes for workers

- One phase = one work-order session (start-work); never bundle phases
- Follow `02-design-system.md` tokens exactly; token changes require a note in the PR description
- react-bits components are vendored: do not "upgrade" or edit them beyond the props we pass; fixes go in wrappers
- GSAP only transforms/opacity; `will-change` only on the transition overlay
- Flag anything ambiguous in `.omo/questions.md` rather than improvising on: state machine edges, auth, copy deck verbatim-ness
- **AUTONOMOUS MODE (client directive, 2026-09-19): the client is away and will not answer questions. Never block on any decision; take the sensible default, record it in `.omo/questions.md` as a line item, and continue. ⚑ copy items are post-hoc client sign-off material, not blockers. D14 server facts arrive later; Phase 6 stays parameterized until then.**

## Standing defaults (frozen — worker applies without asking)

| Question | Frozen default |
|---|---|
| Fellowships vs Fellowship label | `Fellowships` (plural) |
| Seed split on first run | even indices published / odd review (per category) |
| "Go to review" affordance | link-button + right-chevron icon (brief mandates an arrow icon; overrides the no-arrow default) |
| Check-updates schedule time | Monday 09:00 Asia/Shanghai |
| Search delay non-fast mode | 25s simulated |
| Blank hero on mobile | static label pills (no drift) |
| ⚑ showcases items | first seed entry name per category, client re-picks later |
