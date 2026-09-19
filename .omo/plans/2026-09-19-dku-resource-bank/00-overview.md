# DKU Leadership Resource Bank — Plan Overview

Date: 2026-09-19 · Status: approved by client (this plan is the contract for execution)

## 1. What we are building

A production web application for Duke Kunshan University Leadership Programs with two faces sharing one backend:

- **Admin app** (`/admin`): AI-assisted search, a review workflow (approve / remove / edit), weekly update checking, and content management. One admin role, shared-password auth.
- **Display app** (`/`): an animated English-language portal for students — hero page, then a fully scrollable resource catalog fed in real time by the admin's content management.

Language: strictly English on every page (client decision). Logo top-left on every page.

Product logic (from brief, implemented end to end):
1. AI search over the web → results enter the admin Review list.
2. Admin approves/removes; approved items enter Content management.
3. Content management syncs live to the display site (SSE push).
4. A scheduled job re-checks managed sites for changes; admin applies or discards diffs.

The "AI" is **mocked behind provider interfaces** (`SearchProvider`, `UpdateChecker`) with realistic seed data. Real providers are a future drop-in replacement; no code outside the provider layer may know the difference.

## 2. Decision record (settled with client, rounds 1–3)

| # | Decision |
|---|---|
| D1 | Full app with real data layer; AI search mocked behind a provider interface |
| D2 | Vite + React 19 + TypeScript + Tailwind CSS v4; React Router; GSAP (ScrollTrigger + transition timeline); react-bits components copied into the repo |
| D3 | Production deployment to university server (facts pending — see `04-build-phases.md` §Deployment) |
| D4 | Shared password → HMAC-signed httpOnly cookie, 7-day expiry |
| D5 | All text strictly English (admin copy translated from the Chinese brief) |
| D6 | Card/modal images via per-entry `image_url`, with tonal-panel fallback when missing/broken |
| D7 | Category label is **"Experiential Programs"** (not "Experimental") everywhere |
| D8 | Audience ("适用人群") = free-form tag strings per entry, editable inline |
| D9 | Row-cell editing: right-click context menu **and** double-click; hidden keyboard "Edit" button per cell; same inline editor |
| D10 | Mock search: prompt + scope pills; filters a ~36-entry seed set; dedupes against existing URLs; returns top 30 by score; simulated ~25s non-blocking delay (dev fast-mode 300ms) |
| D11 | Monday 09:00 (Asia/Shanghai) scheduled update check; mock returns no changes; admin-only "Run demo check" action injects 2–3 diff rows |
| D12 | FuseButton params: `undoWindow: 7000`, `fuse: "outline"`, `commitOn: "press"`, `settle: "reset"`; used for row ✓/×, batch actions, and Withdraw |
| D13 | Routes: `/` (hero), `/resources#<category>` (content page), `/admin`, `/admin/review/:tab`; no display→admin link |
| D14 | University server facts DEFERRED — deployment section parameterized, defaults Linux + Nginx + Node 20 + systemd + daily SQLite backup |
| D15 | Logo: bundle the CDN PNG into the repo now; swap to official SVG when client provides it |
| D16 | Light theme only in v1 |
| D17 | Hero→content transition = showcase strip expands into the page (GSAP); reduced-motion fallback crossfade |
| D18 | Type: Bricolage Grotesque (variable, display) + Public Sans (body/UI), both self-hosted |
| D19 | Five-category tonal ramp green→blue carries structure (TOC ticks, section rules, chips, highlights) |
| D20 | Hero right side = flat 2D vertical showcase strip (tasteskill.dev-inspired; no 3D cylinder) |

## 3. Canonical category set

| id | Display label | Tonal ramp hex |
|---|---|---|
| `on-campus` | On-Campus Opportunities | `#3E7A5C` |
| `fellowships` | Fellowships | `#33605B` |
| `experiential` | Experiential Programs | `#336472` |
| `events` | Event & Conference | `#3F5F85` |
| `training` | Training Programs | `#465891` |

Open micro-decision (worker default, client may veto later): brief uses "Fellowship" in category lists but "Fellowships" in display prose — default to plural **"Fellowships"** as the label, kept consistent with one series ("…Programs", "…Opportunities").

## 4. Research facts the plan depends on

- **Brand colors** (documented): DKU green `#006633` (Pantone 349C, brand manual + current site CSS), DKU blue `#003399` (Pantone 288C; current site leans `#003A81`). Do **not** use Duke Navy `#012169` — that is a different, darker blue.
- **react-bits** (repo DavidHDev/react-bits): not an npm package; components are installed by copy/CLI (`npx shadcn@latest add https://reactbits.dev/r/<Name>-TS-TW`). Verified components: `BlurText` (dep: motion ^12), `VariableProximity` (dep: motion ^12; needs variable font + containerRef), `FuseButton` (deps: @hugeicons/react + @hugeicons/core-free-icons; uses React 19 boolean `inert`). None of the three need GSAP; GSAP is a direct app dependency for ScrollTrigger and the hero transition.
- **Environment**: university server in mainland China → no Google Fonts CDN (self-host via fontsource), bundle the logo locally, plan SSE proxy settings for Nginx.

## 5. Out of scope (v1)

- Real web-search / crawling / LLM summarization providers (interfaces only)
- Multi-user accounts, roles, per-user permissions
- Dark mode, i18n, pagination beyond top-30, image scraping of source sites
- The actual scheduled diffing logic returning real changes (mock returns none + demo injections)

## 6. Documents in this plan

- `01-architecture.md` — stack, monorepo, data model, state machine, API, providers, sync, jobs, testing, deployment, risks
- `02-design-system.md` — tokens, palette, typography, layout, motion system, a11y, anti-generic audit
- `03-pages-spec.md` — copy deck and page-by-page functional/behavioral spec
- `04-build-phases.md` — phased build order with acceptance criteria and definition of done
