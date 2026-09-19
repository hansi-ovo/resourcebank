# 03 — Pages & Behavior Spec (with copy deck)

All copy below is final deck — worker implements verbatim; client-tunable words marked ⚑. English only (D5). Logo top-left every page (links: display pages → `/`; admin pages → `/admin`).

## Copy deck

**Display hero**
- Title: `DKU Leadership Resource Bank` (BlurText)
- Subtitle: `Discover Opportunities Beyond the Classroom`
- Body: `Leadership development does not happen in a single program—it happens through a series of experiences.` / `This Resource Bank is curated by DKU Leadership Programs to help students discover high-quality opportunities inside and outside Duke Kunshan University, including Fellowships, Event, Conference, and other developmental experiences.` (brief-verbatim; keyword tints: "experiences" → `#3E7A5C`, "Fellowships" → `#33605B`, "Event" → `#3F5F85`, "Conference" → `#3F5F85` — each also scales 1.06em)
- CTA: `Get started!`

**Display content page**
- Section titles: the five category labels (see 00-overview §3), left-aligned, 3px tonal rule
- Empty-category state (prose, not apology): `Nothing here yet. New programs are added as they are reviewed.` + link `Browse other categories` (scrolls to next non-empty section) ⚑
- Card fields: program name, audience chips, image/fallback
- Modal fields: name, summary, audience, dates, image, `Visit website` button

**Admin home**
- Title: `Hi, admin :)`
- Search label: `Search the web for programs`
- Placeholder: `Describe what to look for, e.g. leadership fellowships for undergraduates in Asia` ⚑
- Scope pills: `All`, `On-Campus Opportunities`, `Fellowships`, `Experiential Programs`, `Event & Conference`, `Training Programs` (default All)
- Searching state: icon → spinner; note: `Searching the web. This usually takes a few minutes.`; scope stays locked; other UI stays usable
- Last-search line: `Last search: Sep 19, 2026 14:05` (format `MMM D, YYYY HH:mm`, tabular numerals)
- Date formats (all apps, all surfaces): program dates `MMM D, YYYY` (e.g. `Mar 15, 2027`); ranges `MMM D – MMM D, YYYY` (e.g. `Jan 12 – Mar 15, 2027`); when a value is unknown show nothing, never placeholders like TBD
- Review summary: `{n} items to review, {m} sites with unchecked updates` ⚑ (n/m live from `/api/summary`; comma join, not a middle dot — see design system §7)
- Pending list: up to 5 rows — #, program name, URL (domain only + title attr), category chip
- Link-button: `Go to review` → `/admin/review/review-list`
- Button: `View site` → `/` (opens same tab)

**Admin review page**
- Back: `‹ Admin home` (top bar)
- Tabs (left nav): `Review list`, `Check updates`, `Content management`
- Review list columns: Program, Summary, Website, Audience, Dates, Category, Actions
- Cell edit affordance: right-click menu `Edit` or double-click; editor = inline input, Enter saves, Esc cancels; saved toast `Saved`
- Category cell: chip + `Change` opens the 5-option picker (radio list)
- Actions (review rows): FuseButton `Approve` (→ Content management, toast `Moved to Content management`) and FuseButton `Remove` (toast `Removed`, both undoable 7s)
- Batch: checkbox column + top bar `Approve selected` / `Remove selected` (FuseButtons, batch undo)
- Empty states: `Nothing to review. Run a search to find new programs.` ⚑ / Check updates: `No changes detected. Checks run every Monday.` / Content management: `No published programs yet. Approve items from the Review list.`
- Check updates columns: same + `Detected` date + diff list (field, from → to, note) + `Apply`/`Discard` FuseButtons; applying shows toast `Update applied`
- Content management columns: Program, Summary, Website, Audience, Dates, Category, `Withdraw` (FuseButton, undo 7s; toast `Withdrawn from the public site`)
- ⚑ footer note (content tab, small): `Published programs appear on the public site immediately.`

**Login card** (admin guard): `Admin sign-in` / password input / `Sign in` / error: `Wrong password. Try again.`

**Toasts**: verb-first, past tense: `Saved`, `Approved`, `Removed`, `Update applied`, `Withdrawn from the public site`; undo suffix ` Undo` (button, 7s).

## Page specs

### Display `/` — hero

1. Split 7/5 layout per design doc §3. Left: title (BlurText, words, 80ms stagger) → after settle, subtitle+body gradient reveal → CTA fades in last. After full reveal, title area becomes VariableProximity (wght 300→800, opsz 12→40, radius 90, gaussian).
2. Right: showcase strip (D20). Structure: the 5 category labels, each with a 3px tonal underline and a small representative item line (e.g. `Laidlaw Scholars` under Fellowships ⚑ items chosen from seed at build). Vertical ladder, one entry "docked" at full opacity/size, neighbors 45%/0.92; ladder drifts up ~40px per cycle (each label cycles through docked position). Hover pauses drift. On mobile (<960px): static 2×3 wrap of tinted label pills; no drift.
3. CTA → transition (below) → route to `/resources`.
4. Reduced motion: title appears immediately; body fades 200ms; strip static; transition = 250ms crossfade.

### Transition (signature moment)

Clone-based shared-element transition (manual FLIP — do NOT use Flip.getState across the route change; source labels unmount when `/` unmounts):

0. Prep (on click): capture each label's `getBoundingClientRect()` (source rects). Create a fixed-position overlay (top z-index) containing clones of the 5 labels, positioned exactly at the captured rects.
1. 0–0.35s: hero content fades to 12% opacity; overlay labels scale 1→2.2× in place; underlines stretch to 40vw
2. t=0.15s: route swaps to `/resources` beneath the overlay (incoming section-title DOM now exists, page itself at opacity 0)
3. 0.35–0.75s: measure each section title's rect on the incoming page; overlay clones fly (translate+scale only) to their matching title rects
4. 0.75–1.1s: clones fade out as the real section titles fade in at identity; section rules wipe; TOC ticks stagger 40ms; section-1 cards rise 12px; overlay unmounts

Reduced motion: skip the overlay entirely; 250ms crossfade.

### Display `/resources` — content page

1. Sections in canonical order; each: title (left) + 3px rule in cat color + card grid (12-col, cards 4-col → 2-col <1024 → 1-col <640).
2. Data: `/api/published` on mount; SSE `entries-changed` → refetch, affected sections fade-swap 150ms. Deep link `#<categoryId>` scrolls (respecting reduced motion) and sets active TOC.
3. Card: image area (entry image, `object-fit: cover`, or tonal fallback); name; audience chips. Hover: scale 1.02 + shadow + border→cat tint (200ms). Click/Enter → modal.
4. Modal: content per copy deck; `Visit website` → `url` new tab `rel="noopener"`; close = ×, backdrop click, Escape; focus trap + restore.
5. TOC right rail: 5 ticks (28×4px rounded, cat colors), hover/expand on the rail zone; expanded shows labels; click/Enter scrolls to section; scroll-spy sets active (tick grows 40px, `aria-current`). Below 960px: TOC hides; sections are naturally browsable.
6. Empty category: state prose (above), never an empty grid.

### Admin `/admin` — home

1. Title `Hi, admin :)` top (Bricolage 32→40px).
2. Search panel: input (full width of content column), send icon button bottom-right inside input (32px hit). Scope pills below (single-select, default All). Submit → icon→spinner + note + input disabled (scope locked); nothing else disabled. On finish: toast `Search finished: {n} items added to review` ⚑; `Last search` line updates; pending list + summary refresh.
3. Summary line + pending list (≤5): # (1–5), name, domain, chip. Row click → `/admin/review/review-list`.
4. `Go to review` link-button with chevron icon; `View site` button → `/`.

### Admin `/admin/review/:tab`

- Shell per design doc §3; tabs map `review-list` | `check-updates` | `content-management`; invalid tab redirects `review-list`.
- Review list: table per copy deck; editable cells (name, summary, website, audience — right-click/double-click/keyboard); audience editor = tag input (Enter adds, backspace removes chip); category = chip + picker; actions = Approve/Remove FuseButtons (params D12); batch bar appears when ≥1 checkbox selected; checkbox in header = select-all (visible rows).
- Check updates: rows = pending diffs grouped under their entry (entry name + current values, then diff lines `Deadline: Mar 1 → Mar 15, 2027 — moved per program page`); Apply/Discard per row (FuseButtons). Applying patches entry + toast; discarding marks discarded (row leaves list).
- Content management: published rows + `Withdraw` FuseButton; withdrawal broadcasts to display immediately (verify card disappears live on an open display tab).
- All tabs: live summary badge on `Review list` / `Check updates` tab labels (count chips, 10% tint); refresh after every action; SSE-driven same as display.

### Login

`/admin/*` unauthenticated → shell renders login card centered (no page redirect; URL preserved). `Sign in` → cookie → resumes guarded route.

## Definition of done (per page)

- Matches copy deck verbatim (⚑ items flagged in PR description for client review)
- Keyboard-only walk-through passes (tab order sensible, everything operable)
- Reduced-motion path verified
- Playwright scenarios for the page (01-architecture §8) green
- Lighthouse a11y ≥ 95
