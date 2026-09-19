# ⚑ Copy items awaiting client sign-off (03-pages-spec.md flags)

These strings were implemented **verbatim** from the approved copy deck; the ⚑
marker means the client reserved the right to tune the wording after launch.
Post-hoc review list:

| # | Surface | Implemented string | Location |
|---|---|---|---|
| 1 | Search placeholder | `Describe what to look for, e.g. leadership fellowships for undergraduates in Asia` | Admin home search input |
| 2 | Review summary line | `{n} items to review, {m} sites with unchecked updates` (comma join, no middle dot) | Admin home summary |
| 3 | Review empty state | `Nothing to review. Run a search to find new programs.` | Review list tab |
| 4 | Search-finished toast | `Search finished: {n} items added to review` | Admin app toast (fires anywhere) |
| 5 | Content footer note | `Published programs appear on the public site immediately.` | Content management tab footer |
| 6 | Empty category state | `Nothing here yet. New programs are added as they are reviewed.` + link `Browse other categories` | Display content page |

Related client-tunable items (not ⚑ but reserved):

- Showcase strip representative items (first seed entry per category, per
  frozen default) — Hero.tsx `SHOWCASE_ITEMS`; client may re-pick.
- `Fellowships` (plural) chosen over `Fellowship` per Standing defaults.
- `Experiential Programs` (not "Experimental") per D7.

All changes are single-string edits in the components above; no logic couples
to the wording.
