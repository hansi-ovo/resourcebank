# 02 — Design System

One system for both apps. The display app gets the expressiveness; the admin app is the quiet sibling using the same tokens. Light theme only (D16).

## 1. Color tokens

Brand anchors (research-verified): DKU green `#006633`, DKU blue `#003399`. They appear at full strength **only** in small moments (focus ring, logo lockup); everywhere else they live as the desaturated tonal ramp that carries structure.

| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#F7F9F7` | page background — near-white with a green whisper (never cream) |
| `--ink` | `#1A2B2A` | primary text — a green-tinted near-black, softer than pure black |
| `--ink-soft` | `#52655F` | secondary text, meta |
| `--mist` | `#E3ECE9` | hairlines, borders, quiet surfaces |
| `--surface` | `#FFFFFF` | cards, tables, modal |
| `--focus` | `#006633` | keyboard focus ring (brand green, 2px, always visible) |
| `--brand-blue` | `#003399` | link underline on hover, admin "View site" emphasis |

### Category tonal ramp (D19) — the structural signature

Five steps from green to blue, all ~S35% lightness band, hue walking 150°→230°. Used for: section rule (3px) + section title accent, TOC tick fills, filter/tag chips (10% tint background + 70% text), hero keyword highlights, showcase strip underlines. Color = category, no label needed.

| Category | Token | Hex |
|---|---|---|
| On-Campus Opportunities | `--cat-on-campus` | `#3E7A5C` |
| Fellowships | `--cat-fellowships` | `#33605B` |
| Experiential Programs | `--cat-experiential` | `#336472` |
| Event & Conference | `--cat-events` | `#3F5F85` |
| Training Programs | `--cat-training` | `#465891` |

Derived tints computed in CSS (`color-mix(in oklab, var(--cat-x) 10%, white)` etc.). Primary CTA ("Get started!") fills with ramp mid-step `#336472`; hover deepens 8%. No gradient washes anywhere.

## 2. Typography (D18)

| Role | Face | Weights | Notes |
|---|---|---|---|
| Display | Bricolage Grotesque Variable (self-hosted) | 200–800, opsz axis | Hero title, section titles, admin "Hi, admin :)", modal titles. **Must stay variable** — VariableProximity interpolates `wght`/`opsz` |
| Body/UI | Public Sans (self-hosted) | 400/500/600/700 | All body, tables, buttons, chips. Tabular numerals for dates/counts |

Scale (fluid, clamp'd): display 48→76px (hero), 32→40px (section titles), 20→24px (modal/admin titles); body 16px/1.6; small 14px; meta 13px. Body measure ≤ 70ch. Sentence case everywhere — **no ALL-CAPS labels, no tracked eyebrows** (anti-generic rule).

Spacing: 4px base; section padding 96px desktop / 64px mobile; content max-width 1200px, left-aligned (never centered body text).

## 3. Layout concepts

### Display hero `/` (split 7/5)

```
┌────────────────────────────────────────────────────────────┐
│ [logo]                                                     │
│                                                            │
│  DKU Leadership        │      O│n-Campus Opportunities      │
│  Resource Bank         │       │  ── #3E7A5C underline     │
│  (BlurText →           │       │  representative item      │
│   VariableProximity)   │       │  ── Fellowships           │
│                        │       │  (soft 45%, drifts up)    │
│  Discover Opportunities│       │  ── Experiential Programs │
│  Beyond the Classroom  │       │  ── Event & Conference    │
│                        │       │  ── Training Programs     │
│  paragraph, keywords   │       │        ▲ slow drift,      │
│  tinted per ramp       │       │          pauses on hover  │
│                        │       │                           │
│  [ Get started! ]      │       │                           │
└────────────────────────────────────────────────────────────┘
```

### Display content `/resources`

```
┌───────────────────────────────────────────────────────────────┐
│ [logo]                                        │ ━ ━ ━ ━ ━  │◀ TOC
│                                                │ (ticks in  │  collapsed:
│ On-Campus Opportunities                        │  cat tones)│  5 short
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ 3px cat rule   │            │  lines;
│ ┌────────┐ ┌────────┐ ┌────────┐               │  expand on │
│ │ card   │ │ card   │ │ card   │  grid 3→2→1   │  hover,    │
│ └────────┘ └────────┘ └────────┘               │  click =   │
│                                                │  jump      │
│ Fellowships ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                 │            │
│ ┌────────┐ ┌────────┐ …                       │            │
└───────────────────────────────────────────────────────────────┘
```

### Admin shell `/admin`

```
┌──────────────────────────────────────────────┐
│ ‹back   [logo]              [View site ↗]    │ 56px top bar
├────────────┬─────────────────────────────────┤
│ Review     │  (tab content:                  │
│ Check      │   table / forms)                │
│ updates    │                                 │
│ Content    │                                 │
│ management │                                 │
└────────────┴─────────────────────────────────┘
```

## 4. Motion system — every moment earns its keep

Libraries: react-bits (BlurText, VariableProximity, FuseButton — copied, pinned) + GSAP core + ScrollTrigger + Flip (transition). Motion obeys `prefers-reduced-motion` globally: showcase drift, blur reveal, transition, and scroll effects reduce to opacity ≤200ms; interactive state feedback stays.

| Moment | Treatment | Library |
|---|---|---|
| Hero title in | BlurText, word-by-word blur→focus, 80ms stagger | react-bits |
| After title settles | Subtitle + paragraph gradient reveal (lines fade in masked, keywords tint to their category ramp color, one word each scale 1.06em) | GSAP timeline |
| Mouse over title (post-reveal) | VariableProximity: wght 300→800, opsz 12→40, radius 90px, gaussian falloff | react-bits |
| Hero right showcase | Flat 2D vertical strip: one category entry at full size with 3px ramp underline + representative item; neighbors 45% opacity / 0.92 scale; whole ladder drifts upward slowly, pauses on hover (D20) | GSAP ticker |
| Get started! → content | **Signature moment**: strip labels accelerate, clone-flight to the incoming page's section titles (clone-based manual FLIP — full recipe in 03-pages-spec §Transition; `getBoundingClientRect` capture + fixed overlay; transforms only). Reduced-motion: 250ms crossfade | GSAP timeline |
| Content page scroll | Section title + 3px rule: 12px rise + rule wipe as each section enters (once) | ScrollTrigger |
| Card hover | scale 1.02, shadow bloom 0→12px/8%, border→cat tint 200ms; cursor pointer | CSS |
| Buttons | Subtle 0.98 press, tint shift on hover (all buttons incl. admin) | CSS |
| Modal open/close | 240ms scale 0.96→1 + fade; backdrop blur 4px; content stagger 40ms | CSS/GSAP |
| Admin approve/remove/withdraw | FuseButton (params D12): label→"Undo" crossfade, burning outline 7s; Escape undoes | react-bits |
| Admin toast | Bottom-right, tonal tint per action, 4s auto-dismiss | custom |

Deliberately **omitted**: fade-and-slide-up on every section, hover transitions on every table cell, number counters, marquee strips, gradient washes. One signature moment (the transition), everything else disciplined.

## 5. Component treatment notes

- **OpportunityCard**: 4/12 width, 20px radius, 1px `--mist` border, `--surface` fill, no default shadow (shadow only on hover). Content: image area 16:9 (entry image or tonal fallback panel — 12% cat tint background with the program's initial in Bricolage 200 at 120px, tinted 30%), then name (Public Sans 600), audience chips (13px, 10% tint). No arrows, no "Learn more" text — the whole card is the button.
- **EntryModal**: 720px max, image top (same fallback rule), name, summary, audience chips, dates row, "Visit website" button (opens new tab, ramp mid-step), × top-right (32px hit area). Focus trap; Escape/outside-click close; body scroll locked.
- **SectionTOC**: fixed right, vertically centered; collapsed = 5 rounded ticks (28×4px, cat colors); hover/click expands to labels (Public Sans 500, 14px, cat color); active section's tick is full-width 40px. Keyboard: focusable group, Enter jumps; `aria-current` on active.
- **Tables (admin)**: row height 56px, `--mist` row hairlines only (no vertical lines, no zebra), sticky header, category cell = chip; status cell = FuseButton pair (✓ approve / × remove) or "Withdraw" for content tab.
- **Chips**: 10% cat tint bg, cat color text, 6px radius, 999px pill — shared by filters, audience tags, category cells.

## 6. Accessibility floor (non-negotiable)

- Contrast: ink/canvas 12+:1; cat colors on white ≥ 4.5:1 (ramp values verified — `#3E7A5C` 4.6:1 … `#465891` 6.1:1; if a token changes, re-verify); chips use 70% text per token math, re-check at build.
- Visible 2px `--focus` ring on every interactive element, offset 2px.
- Modal: role=dialog, aria-modal, focus trap, restore focus on close.
- TOC, cards, FuseButtons fully keyboard operable; FuseButton exposes phase to aria-live polite ("Approved. Undo available for 7 seconds").
- All motion behind `prefers-reduced-motion` gates (§4). No motion that flashes >3/s (none exists).
- Images: alt = program name; tonal fallback is decorative (aria-hidden initial).

## 7. Anti-generic audit (self-critique, recorded)

- No cream+terracotta, no dark+acid accent, no broadsheet hairline-grid, no single-radius SaaS card kit, no mono meta labels, no `·` meta joins, no `→` suffixes, no ALL-CAPS eyebrows. Structure comes from the tonal ramp + rules that mean "category".
- Signature moment budget: exactly one (the transition). Everything user-triggered is feedback, not decoration.
- Copy deck (see `03-pages-spec.md`) uses sentence case, plain verbs, identical verbs across flow ("Approve" everywhere, never "Accept").
