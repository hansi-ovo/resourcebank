# Work Order — DKU Leadership Resource Bank (autonomous execution)

**First actions (before Phase 0):**
1. Read ALL files in this plan directory in order: 00-overview → 01-architecture → 02-design-system → 03-pages-spec → 04-build-phases → this WORKORDER
2. Environment checks: `node -v` (need ≥20), `npm -v`. Host is **Windows** — use PowerShell-compatible commands; shell scripts in `deploy/` target Linux (deployment only) but local dev must work on Windows
3. `git init` + initial commit of `.omo/` + `resourcebank.md` as baseline; commit at the end of every phase (checkpoint discipline)
4. Create `.omo/questions.md` (empty with header line "## Discretionary decisions log") before starting Phase 0

**Plan**: `.omo/plans/2026-09-19-dku-resource-bank/` (5 files — read all before starting)
**Mode**: AUTONOMOUS. Client is away, not answering questions. Never block; apply frozen defaults from `04-build-phases.md` §Standing defaults; record every discretionary call in `.omo/questions.md`.
**Scope**: Phases 0 → 6 in order, from `04-build-phases.md`. Do not reorder or bundle phases. Each phase: implement → run its Accept checks → only then proceed. If an Accept check fails and cannot be fixed within the phase, stop and write `.omo/questions.md` entry rather than pushing broken work forward.
**Out of bounds**: no real AI/crawler integrations, no deployment to any server (Phase 6 produces config files only), no changes to plan tokens without a questions.md note, no editing vendored react-bits sources.
**CRITICAL — image files**: NEVER use the Read tool on binary/image files (logo PNG, any .png/.jpg/.webp). The build model may not support image input and will error. Download the logo with `curl -o` / `Invoke-WebRequest`; verify it only via file size (>5KB) and PNG magic bytes — never by viewing. Playwright screenshots for QA get saved to `.omo/reviews/` as files, not opened.
**When done**: record Definition-of-done evidence (04 §Definition of done) under `.omo/reviews/` and summarize.
