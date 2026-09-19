# 01 — Architecture

## 1. Monorepo layout

```
resourcebank/
├─ client/                     # Vite + React 19 + TS + Tailwind v4
│  ├─ src/
│  │  ├─ components/
│  │  │  ├─ react-bits/         # BlurText, VariableProximity, FuseButton (copied via CLI, pinned)
│  │  │  └─ ui/                 # Chip, Modal, ContextMenu, IconBtn, Spinner, Toast…
│  │  ├─ features/
│  │  │  ├─ display/            # Hero, ShowcaseStrip, HeroTransition, ContentPage,
│  │  │  │                      # CategorySection, SectionTOC, OpportunityCard, EntryModal
│  │  │  └─ admin/              # AdminHome, SearchPanel, ReviewLayout, ReviewListTab,
│  │  │                          # CheckUpdatesTab, ContentManagementTab, EntryTable shared pieces
│  │  ├─ lib/                   # api client, sse, auth, format (dates), entries hooks
│  │  └─ styles/tokens.css      # @theme tokens (see 02-design-system.md)
│  └─ index.html
├─ server/                      # Node 20 + Express
│  └─ src/
│     ├─ db.ts                  # better-sqlite3, WAL mode
│     ├─ schema.sql
│     ├─ seed.ts                # loads shared/seed-data.ts if DB empty
│     ├─ auth.ts                # HMAC-signed cookie, middleware
│     ├─ routes/                # auth, entries, search, updates, stream, demo
│     ├─ providers/
│     │  ├─ SearchProvider.ts       # interface
│     │  ├─ MockSearchProvider.ts   # filters seed set, ~25s delay (env: FAST_MODE=300ms)
│     │  ├─ UpdateChecker.ts        # interface
│     │  └─ MockUpdateChecker.ts     # returns no changes; injectDemo(n) for demo action
│     ├─ jobs/scheduler.ts      # node-cron Mon 09:00 Asia/Shanghai
│     └─ bus.ts                 # emits "entries-changed" → SSE broadcast
├─ shared/
│  ├─ types.ts                  # Category, Entry, EntryDraft, UpdateDraft, SearchJob…
│  └─ seed-data.ts              # ~36 realistic programs (marked clearly as mock data)
└─ package.json                 # workspaces: client, server, shared
```

Two tsconfigs reference `shared/`; no code duplication of types. `npm run dev` runs server (watch) + client (Vite) concurrently; Vite proxies `/api` to Express.

## 2. Data model (SQLite)

```sql
CREATE TABLE entries (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  summary      TEXT NOT NULL,            -- 1–3 sentences
  url          TEXT NOT NULL UNIQUE,     -- dedupe key across ALL statuses
  audience     TEXT NOT NULL,            -- JSON array of strings, e.g. ["Undergraduates","Open to all majors"]
  starts_at    TEXT,                     -- ISO date, nullable
  ends_at      TEXT,                     -- ISO date, nullable (deadline)
  category     TEXT NOT NULL CHECK (category IN ('on-campus','fellowships','experiential','events','training')),
  image_url    TEXT,
  quality      INTEGER,                  -- mock AI confidence 1–100
  status       TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('review','published','removed','withdrawn')),
  source       TEXT NOT NULL DEFAULT 'search',   -- 'search' | 'update-apply'
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE pending_updates (          -- "Check updates" queue
  id          INTEGER PRIMARY KEY,
  entry_id    INTEGER NOT NULL REFERENCES entries(id),
  diff        TEXT NOT NULL,            -- JSON: { field, from, to, note }[]
  detected_at TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','discarded'))
);

CREATE TABLE searches (
  id          INTEGER PRIMARY KEY,
  prompt      TEXT NOT NULL,
  scope       TEXT NOT NULL,            -- 'all' | category id
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  result_count INTEGER
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);   -- e.g. last_search_at
```

### Entry state machine

```
        approve            withdraw
review ──────────▶ published ──────────▶ withdrawn
   │                  ▲                    (removes from display)
   │ remove           │ apply update diff (from pending_updates)
   ▼                  │ (patches entry fields, sets source='update-apply')
removed (terminal)  ──┘
```

- `approve`: review → published; broadcast `entries-changed`.
- `remove`: review → removed (terminal; URL stays unique-blocked so mock search re-suggests nothing already seen — matches brief "项目网址与已有内容不重复").
- `withdraw`: published → withdrawn; broadcast (display drops the card live).
- Applied diffs patch the entry (`updated_at` bumped) and broadcast; the original row is never deleted — "撤回" is reversible only within the fuse window (client-level, then it stays withdrawn; v1 has no re-publish).

## 3. API surface (all JSON; `/api`)

| Method + path | Auth | Behavior |
|---|---|---|
| `POST /api/login` {password} | — | sets `rb_session` cookie (HMAC, 7d); 401 on mismatch |
| `POST /api/logout` | admin | clears cookie |
| `GET /api/entries?status=review\|published` | admin | list (published feeds Content management tab) |
| `GET /api/published` | public | display content page payload (published only, grouped by category order) |
| `GET /api/summary` | admin | counts: review items, sites with unchecked (=pending) updates, last search time |
| `POST /api/search` {prompt, scope} | admin | creates job → 202 {jobId}; server-side timer (25s or 300ms FAST_MODE) then MockSearchProvider filters seed set by scope + prompt keywords, dedupes against ALL existing URLs, scores, takes top 30, inserts as `review`, updates `settings.last_search_at`, broadcasts; job status via summary poll |
| `PUT /api/entries/:id` | admin | inline edits (name, summary, url, audience, category) |
| `POST /api/entries/:id/approve` | admin | review → published |
| `POST /api/entries/:id/remove` | admin | review → removed |
| `POST /api/entries/:id/withdraw` | admin | published → withdrawn |
| `POST /api/entries/batch` {ids[], action} | admin | approve or remove many |
| `GET /api/updates?status=pending` | admin | Check updates list |
| `POST /api/updates/:id/apply` | admin | patch entry (e.g. new deadline), mark applied, broadcast |
| `POST /api/updates/:id/discard` | admin | mark discarded |
| `POST /api/demo/update-check` | admin | injects 2–3 realistic pending diffs (e.g. new deadline, audience changed), broadcasts |
| `GET /api/stream` | public | SSE; events: `entries-changed` (display refetches /published) |

Validation with zod at every boundary; all dates transmitted as ISO strings, rendered per format spec (`03-pages-spec.md` §Copy deck).

## 4. Providers (the mock seam)

```ts
interface SearchProvider {
  // returns 0–30 drafts; must NOT contain any url already present in DB (any status)
  search(prompt: string, scope: Scope, existingUrls: Set<string>): Promise<EntryDraft[]>;
}
interface UpdateChecker {
  // returns diffs for published entries; mock returns [] 
  check(entries: PublishedEntry[]): Promise<UpdateDraft[]>;
}
```

`MockSearchProvider` scoring: base 60 + 20 if category matches scope + 0–20 by prompt keyword hits in name/summary; ties → earlier seed index. The 25s delay is server-side only (job timer), during which the UI shows the loading state; **never blocks other endpoints** (async job, no global lock).

`MockUpdateChecker.injectDemo()` picks 2–3 published entries deterministically and produces believable diffs: shifted deadline, new start date, audience tag added — each with a one-line `note` ("Deadline moved from Mar 1 to Mar 15, 2027").

Scheduler: `node-cron` `0 9 * * 1` (Asia/Shanghai) calls `UpdateChecker.check()`; results (none, in v1) would be inserted as `pending`. The demo action reuses the same insertion path — code identical to what a real checker would do.

## 5. Real-time sync (display)

Server `bus` emits on any mutation that changes the published set (approve, withdraw, update apply). `GET /api/stream` is a public SSE endpoint; the display page subscribes and refetches `/api/published` on `entries-changed`, applying a quiet 150ms fade-swap on affected sections only (no layout thrash). Nginx config must set `proxy_buffering off` on `/api/stream` (noted in deployment).

## 6. Auth

- `ADMIN_PASSWORD` from env (server). Login sets httpOnly, SameSite=Lax, signed `rb_session` (HMAC-SHA256 with `SESSION_SECRET` env), 7-day expiry.
- Middleware: everything under `/api/entries`, `/api/updates`, `/api/search`, `/api/summary`, `/api/demo` requires admin; `/api/published` and `/api/stream` are public. Login rate-limited (5/min/IP).
- Client: `/admin` routes render through an `<AdminGuard>` that shows the login card on 401. No display→admin links (per D13); admins navigate by URL.

## 7. Seed data policy

`shared/seed-data.ts`, ~36 entries, 7–8 per category, real-world leadership/fellowship program names with **illustrative** summaries/dates (clearly commented "MOCK DATA — replace via real SearchProvider"; nothing here ships to the display site without admin approval, so factual drift is safe). Include a handful with plausible `image_url: null` to exercise the tonal fallback, and at least 3 overlapping-topic entries to make top-30 scoring/dedupe visible in demos.

## 8. Testing

- **Vitest (server)**: state machine transitions; URL dedupe across statuses; batch ops; update apply patches fields + broadcast; mock provider scoring/dedupe/limit-30; auth middleware (401/200 paths).
- **Playwright (client, FAST_MODE=300ms)**:
  1. Admin: login → search (wait for finish) → approve one → it appears in Content management → withdraw it → gone from display payload.
  2. Edit: double-click cell → change name → persists after reload.
  3. Display: hero renders → transition to content page → TOC hover/click jumps to category → open modal → close via × and outside click and Escape.
  4. A11y: modal focus trap; keyboard focus visible everywhere; TOC operable by keyboard.
  5. `prefers-reduced-motion: reduce` → no BlurText animation, no showcase drift, transition replaced by crossfade.
- Lighthouse a11y ≥ 95 on both apps (light theme, contrast checked from tokens).

## 9. Deployment (parameterized — D14 facts pending)

Defaults until client supplies server facts: Linux, Node 20, systemd unit (`node server/dist`), Nginx reverse proxy serving `client/dist` statics + `/api` → Express (with `proxy_buffering off` for `/api/stream`), HTTPS via university cert, daily 03:00 `sqlite3 .backup` to `/var/backups/rb/` + 14-day retention. Dockerfile optional once facts are known. **Nothing in build phases 1–6 depends on these answers.**

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| react-bits assumes React 19 / Tailwind v4 semantics | We target exactly React 19 + Tailwind v4 (D2); components copied into repo and pinned — no runtime registry dependency |
| Fonts unavailable in mainland China | Self-host via `@fontsource-variable/bricolage-grotesque` + `@fontsource/public-sans` bundled at build |
| Logo is a transient cloud link | Download and commit the PNG now (D15); one-file swap for SVG later |
| SSE behind Nginx buffering | Explicit `proxy_buffering off` + `X-Accel-Buffering: no` header on the stream route |
| 25s mock delay annoys developers/tests | `FAST_MODE=300ms` env; Playwright always runs with it |
| Search job state lost on server restart | Jobs are in-DB (`searches` table); on boot, any unfinished job older than 90s is closed as failed — UI just shows "Last search" after it |
| Hero transition jank on low-end devices | GSAP timeline uses transforms/opacity only; `will-change` scoped to the overlay; reduced-motion crossfade path always available |
