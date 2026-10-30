# SoleUp design system: Material 3 Expressive for the web

**Status:** Revision 2, 2026-10-30. UI-1 implements these values exactly. If a value turns out wrong in practice (a contrast failure, a rendering bug), the phase that finds it fixes it here and in code in the same PR.

Implementation lives in `src/app/globals.css` (tokens, `@theme`), `src/components/ui/*` (components), `src/components/icons/*` (icons) and `src/components/ui/shapes.ts` (shape library). Components use **utilities generated from roles** (`bg-primary`, `text-on-surface-variant`, `rounded-xl`, `shadow-card`, `ease-spatial-fast`). They never use raw hex values, never use Tailwind palette colours (`bg-blue-500`), and never use arbitrary values for anything that has a token.

---

## 1. Colour

### 1.1 How the palette was made

The seeds are primary `#2F6B93` (reference 1's deep lake blue), tertiary `#E2662E` (reference 4's orange), error `#B3261E` (M3 baseline) and success `#2E7D4F`. Tonal palettes were generated in CIELAB LCh (M3 "tone" is CIELAB L\*). Chroma was reduced until each colour fits the sRGB gamut, and the colours were assigned to roles by M3's tone mapping. Chroma by palette:

| Palette | Chroma |
|---|---|
| primary | 28 |
| secondary | 12 (same hue) |
| tertiary | 60 |
| neutral | 4 (primary hue) |
| neutral-variant | 9 |
| error | 80 |
| success | 48 |

The generator script is in the UI-1 handoff, and UI-1 commits it as `scripts/generate-palette.mts` so the values can be reproduced.

### 1.2 Roles

`canvas` is M3's **surface** role. It is renamed because the legacy utility `bg-surface` (the white card colour) stays as an alias until UI-13 (§12).

| Role (CSS var `--md-<role>`, utility `<prop>-<role>`) | Light | Dark | Use |
|---|---|---|---|
| `primary` | `#26638B` | `#98CCF9` | Filled buttons, active states, progress fill, links |
| `on-primary` | `#FFFFFF` | `#00344E` | Text and icons on primary |
| `primary-container` | `#CBE6FF` | `#024B6F` | Hero cards (Next commitment), FAB, selected chips |
| `on-primary-container` | `#001E2F` | `#CBE6FF` | |
| `inverse-primary` | `#98CCF9` | `#26638B` | Actions in snackbars |
| `secondary` | `#4E6071` | `#B5C9DC` | Focus ring, quiet emphasis, nav active label |
| `on-secondary` | `#FFFFFF` | `#203241` | |
| `secondary-container` | `#D1E5F8` | `#374959` | Nav active indicator, tonal buttons, filter chips (selected), progress track (alt) |
| `on-secondary-container` | `#091D2B` | `#D1E5F8` | |
| `tertiary` (Ember) | `#A23F11` | `#FFB596` | See D-18: celebration and highlight only |
| `on-tertiary` | `#FFFFFF` | `#581E00` | |
| `tertiary-container` | `#FFDBCC` | `#802A00` | `<mark>`, Now chip, celebration sheet art |
| `on-tertiary-container` | `#311400` | `#FFDBCC` | |
| `error` | `#BF0312` | `#FFB4A5` | Errors and destructive actions only |
| `on-error` | `#FFFFFF` | `#690100` | |
| `error-container` | `#FFDAD3` | `#93010B` | Inline error banners |
| `on-error-container` | `#380C00` | `#FFDAD3` | |
| `success` | `#026D3C` | `#78DA9C` | The "Saved" icon, the device "Working" status |
| `on-success` | `#FFFFFF` | `#01391C` | |
| `success-container` | `#94F7B7` | `#00522C` | Success banner (rare) |
| `on-success-container` | `#00210D` | `#94F7B7` | |
| `canvas` (M3 surface) | `#F5FAFF` | `#0F1419` | Page background |
| `surface-dim` | `#D5DBE1` | `#0F1419` | |
| `surface-bright` | `#F5FAFF` | `#353A3F` | |
| `surface-container-lowest` | `#FFFFFF` | `#080F15` | **Cards and list items** (the white cards of the references) |
| `surface-container-low` | `#EEF4FB` | `#171C21` | Grouped section background, rail (large) |
| `surface-container` | `#E8EFF5` | `#1B2025` | Nav bar, scrolled app bar, menus |
| `surface-container-high` | `#E3E9EF` | `#262A2F` | Skeletons, dialogs (dark), chips (unselected) |
| `surface-container-highest` | `#DDE3EA` | `#30353A` | Filled text fields, switch track (off) |
| `on-surface` | `#171C21` | `#DDE3EA` | Primary text |
| `on-surface-variant` | `#3B4854` | `#BAC8D6` | Secondary text, inactive icons |
| `outline` | `#6B7986` | `#8592A0` | Field outlines, outlined buttons, missed-day ring. **Not for text** |
| `outline-variant` | `#BAC8D6` | `#3B4854` | Dividers, hatch pattern, decorative borders |
| `inverse-surface` | `#2C3136` | `#DDE3EA` | Snackbars, tooltips |
| `inverse-on-surface` | `#EBF1F8` | `#2C3136` | |
| `scrim` | `#000000` | `#000000` | At 32 % behind dialogs and sheets |
| `canvas-mist` | `#CBE6FF` | `#002D45` | The top-of-page mist gradient (D-09) |

Two app-specific roles are added for data display:

| Role | Light | Dark | Use |
|---|---|---|---|
| `progress-track` | `#B5C9DC` (secondary tone 80) | `#374959` (secondary tone 30) | Unfilled segments of pill bars, arcs and day pills |
| `focus` | = `secondary` | = `secondary` | The focus ring (an alias, so it can be tuned separately) |

### 1.3 Life areas and identity colours

Life areas store one of nine colour names (`src/lib/life-areas.ts`). Each name maps to a **container / on-container / dot** triple. Six of them (blue, teal, violet, pink, amber, green) are also the **identity palettes** that D-07 hashes into.

| Name | Light container / on | Dark container / on | Dot light / dark |
|---|---|---|---|
| gray | `#DDE3EA` / `#171C21` | `#42474D` / `#DDE3EA` | `#72787D` / `#A6ACB2` |
| red | `#FFDAD8` / `#410004` | `#920023` / `#FFDAD8` | `#D0474F` / `#FF8988` |
| orange | `#FFDBCC` / `#301400` | `#7F2B00` / `#FFDBCC` | `#C05928` / `#FE8D59` |
| amber | `#FFDDB6` / `#271900` | `#633F00` / `#FFDDB6` | `#A36B01` / `#E09E3D` |
| green | `#B1F3AA` / `#072100` | `#0C5215` / `#B1F3AA` | `#468544` / `#7ABB75` |
| teal | `#80F5F2` / `#00201F` | `#02504F` / `#80F5F2` | `#028584` / `#40BCBA` |
| blue | `#CAE6FF` / `#011E2E` | `#004C6D` / `#CAE6FF` | `#017FB4` / `#35B5F9` |
| violet | `#E9DDFF` / `#1A0F4F` | `#4D3A80` / `#E9DDFF` | `#816AB6` / `#B89EEE` |
| pink | `#FFD8E8` / `#3D0024` | `#7F2154` / `#FFD8E8` | `#B75685` / `#F18BBB` |

Variables: `--area-<name>-container`, `--area-<name>-on`, `--area-<name>-dot`, exposed as utilities (`bg-area-teal-container`). Text on a container uses `-on`: 13.3:1 in light and at least 7.2:1 in dark. **A colour always comes with the area's name in text** (WCAG 1.4.1). The `ColorSwatch` component (`life-area-colors.tsx`) is rebuilt on these variables, and its Tailwind palette classes are removed.

Life-area calendar items (By area, Timeline) use the container as the fill and `-on` as the text, with a 3 px start border in the dot colour.

### 1.4 Measured contrast (WCAG 2.x relative luminance)

| Pair | Light | Dark | Needed |
|---|---|---|---|
| on-surface / canvas | 16.33 | 14.32 | 4.5 |
| on-surface-variant / canvas | 8.93 | 10.86 | 4.5 |
| on-surface-variant / surface-container-highest | 7.25 | 7.26 | 4.5 |
| on-surface-variant / surface-container-lowest | 9.37 | 11.31 | 4.5 |
| primary / canvas (links, text buttons) | 6.17 | 10.88 | 4.5 |
| primary / surface-container (nav bar) | 5.59 | 9.64 | 4.5 |
| on-primary / primary | 6.48 | 7.71 | 4.5 |
| on-primary-container / primary-container | 13.29 | 7.28 | 4.5 |
| on-secondary-container / secondary-container | 13.32 | 7.20 | 4.5 |
| on-tertiary-container / tertiary-container | 13.21 | 7.23 | 4.5 |
| on-error / error | 6.49 | 7.68 | 4.5 |
| error / canvas (field error text) | 6.18 | 10.86 | 4.5 |
| success / canvas | 6.14 | 10.85 | 4.5 |
| inverse-on-surface / inverse-surface | 11.55 | 10.16 | 4.5 |
| inverse-primary / inverse-surface (snackbar action) | 7.71 | 5.02 | 4.5 |
| on-surface / canvas-mist (text over the mist peak) | 13.31 | 11.12 | 4.5 |
| outline / canvas (field border, non-text) | 4.25 | 5.83 | 3.0 |
| primary / progress-track (filled vs unfilled segment) | 3.81 | 5.46 | 3.0 |

`progress-track` against white is 1.70:1. The unfilled part of a bar is decorative because the count is always in text, but the filled-vs-unfilled boundary passes 3:1 (WCAG 1.4.11). Never put text in `outline` or `outline-variant`.

### 1.5 Patterns

- **Hatch** (skipped days, a goal arc's open remainder on hover): `repeating-linear-gradient(135deg, var(--md-outline-variant) 0 2px, transparent 2px 6px)`. Utility `bg-hatch`.
- **Dots** (inactive days): a `1.5px dotted` border in `outline-variant` at 40 % opacity.

## 2. Typography

The family is **Google Sans Flex** (D-04), variable `--font-sans`. `font-optical-sizing: auto`. Tracking is listed in px, as M3 publishes it; convert it to `em` in CSS (`tracking ÷ size`).

| Token (`text-<token>`) | Size / line height (px) | Weight | Tracking (px) | ROND | Use |
|---|---|---|---|---|---|
| `display-large` | 57 / 64 | 400 | −0.25 | 100 | Landing hero only |
| `display-medium` | 45 / 52 | 400 | 0 | 100 | **Metric numerals** (Today count, Track figure numerator) |
| `display-small` | 36 / 44 | 400 | 0 | 100 | Metric numerals on compact cards |
| `headline-large` | 32 / 40 | 400 | 0 | 100 | Greeting (expanded) |
| `headline-medium` | 28 / 36 | 400 | 0 | 100 | Page titles (medium+) |
| `headline-small` | 24 / 32 | 400 | 0 | 100 | Greeting (compact), dialog titles (full-screen) |
| `title-large` | 22 / 28 | 400 | 0 | 50 | App bar title, card titles on detail pages |
| `title-medium` | 16 / 24 | 500 | 0.15 | 0 | Card titles, list item headlines |
| `title-small` | 14 / 20 | 500 | 0.1 | 0 | Section labels in cards |
| `body-large` | 16 / 24 | 400 | 0.5 | 0 | Default body, field values, note text |
| `body-medium` | 14 / 20 | 400 | 0.25 | 0 | Supporting text, list supporting lines |
| `body-small` | 12 / 16 | 400 | 0.4 | 0 | Captions, range captions, timestamps |
| `label-large` | 14 / 20 | 500 | 0.1 | 0 | Buttons, tabs, chips |
| `label-medium` | 12 / 16 | 500 | 0.5 | 0 | Nav labels, field labels, badges |
| `label-small` | 11 / 16 | 500 | 0.5 | 0 | Day-of-week letters, axis ticks |

**Emphasized variants** (`text-<token>-emphasized`) keep the size and line height but change the weight: display, headline and title-large go to **500**; title-medium and title-small to **700**; body to **500**; label to **700**. Use emphasized styles for: the selected tab and nav label, the today date in strips, the metric numeral when it's the page's main answer, and the page title at `large:` and wider. **At most one emphasized display or headline per screen.**

Numbers use `font-variant-numeric: tabular-nums` (utility `tabular-nums`) wherever they line up or change in place (counts, times, dates in strips).

Note body (`.note-content`) uses `body-large` with line height 1.6. Headings inside notes map h1 to `title-large`-emphasized, h2 to `title-medium`-emphasized and h3 to `title-small`-emphasized. Code uses Geist Mono 0.9 em.

The legacy `text-xs … text-3xl` utilities stay until UI-13 (§12).

## 3. Shape

Values are verified against `androidx…/tokens/ShapeTokens.kt`.

| Token | Radius | Utility | Use |
|---|---|---|---|
| none | 0 | `rounded-none` | Full-bleed bars |
| extra-small | 4 px | `rounded-xs` | Inner corners of grouped list items, badges, checkboxes (2 px) |
| small | 8 px | `rounded-sm` | Chips, tooltips, snackbars, menus' items |
| medium | 12 px | `rounded-md` | Menus, small cards, date-strip inner circles |
| large | 16 px | `rounded-lg` | Fields, list group outer corners, nav-rail active indicator (expanded) |
| large-increased | 20 px | `rounded-xl` | Compact cards, FAB (medium) |
| extra-large | 28 px | `rounded-2xl` | **Cards**, dialogs, bottom sheets (top corners) |
| extra-large-increased | 32 px | `rounded-3xl` | Hero cards (Next commitment, greeting card) |
| extra-extra-large | 48 px | `rounded-4xl` | Day capsules in the week strip, celebration sheet art |
| full | 9999 px | `rounded-full` | Buttons, nav indicators, filter chips, avatars, switch |

Tailwind's `--radius-*` variables are replaced to match this table. **Note:** `rounded-sm/md/lg` change size in UI-1 (legacy 4, 8, 12 px become 8, 12, 16 px). That's intended: every existing corner gets one notch rounder.

**Shape morph on press** (Expressive): buttons and icon buttons go from `full` to `medium` (12 px) while `:active` or pressed, using `expressive-fast-spatial`. Toggle and selected buttons rest at `medium` and go back to `full` when selected. FABs go from `xl` (20 px) to `lg` (16 px). Disabled under reduced motion.

## 4. Spacing and sizing

The base unit is 4 px (Tailwind `--spacing: 0.25rem`, unchanged).

| Token | px | Use |
|---|---|---|
| 1 | 4 | Icon-label gap in nav bar items |
| 2 | 8 | Chip gaps, inline gaps |
| 3 | 12 | Gaps between stacked items in a card |
| 4 | 16 | Card padding (compact), page margin (compact) |
| 5 | 20 | Card padding (hero, compact) |
| 6 | 24 | Card padding (medium+), page margin (medium+), gaps between cards |
| 8 | 32 | Section gaps |
| 10 | 40 | Page top padding (medium+) |
| 12 | 48 | Large section gap on Home (expanded+) |

Fixed sizes:

| Element | Size |
|---|---|
| Interactive target | min 48 × 48 (primary), 40 × 40 (dense inline icon buttons with 8 px spacing), 24 × 24 floor (dot matrix 28) |
| Nav bar | 64 px + `env(safe-area-inset-bottom)` |
| Nav bar indicator | 56 × 32, full |
| Rail collapsed | 96 px wide; item: indicator 56 × 32, label below, 4 px gap; top space 44 px |
| Rail expanded | 256 px wide (M3 range 220–360); item: 56 px tall full-width indicator, 16 px leading, 8 px icon-label |
| App bar (compact) | 64 px |
| FAB | 56 × 56 (medium Expressive FAB on compact), radius `xl` 20; extended FAB 56 px tall on the rail |
| Button heights | XS 32, S 40 (default), M 56, L 96, XL 136 (M3 Expressive sizes; only XS, S and M are used) |
| Text field | 64 px tall (static inner label, D-22) |
| List item | 56 (one line), 72 (two lines), 88 (three lines) |
| Week-strip day capsule | 48 × 76 on compact, 56 × 84 on medium and wider |
| Habit day pill (week chart) | 36 × 88 on compact, 44 × 104 on medium and wider |
| Habit day cell (4-week grid) | 44 × 44 |
| Dot matrix cell (12 weeks) | 28 × 28, 4 px gap |

## 5. Elevation and state layers

M3 elevates mainly with **tone**. Shadows are kept for floating surfaces.

| Level | Shadow (light) | Use |
|---|---|---|
| 0 | none | Cards on the canvas (tone does the work), rail |
| `shadow-card` (brand) | `0 1px 2px rgb(23 28 33 / 0.04), 0 8px 24px -12px rgb(38 99 139 / 0.18)` | Cards on the mist (reference 1's floating white cards). **Dark: none** |
| 1 | `0 1px 2px rgb(0 0 0 / .3), 0 1px 3px 1px rgb(0 0 0 / .15)` | Elevated buttons (rare) |
| 2 | `0 1px 2px rgb(0 0 0 / .3), 0 2px 6px 2px rgb(0 0 0 / .15)` | Nav bar when content scrolls under it, menus |
| 3 | `0 1px 3px rgb(0 0 0 / .3), 0 4px 8px 3px rgb(0 0 0 / .15)` | FAB, FAB menu items, snackbars, dialogs |
| 4 | `0 2px 3px rgb(0 0 0 / .3), 0 6px 10px 4px rgb(0 0 0 / .15)` | FAB hover |
| 5 | `0 4px 4px rgb(0 0 0 / .3), 0 8px 12px 6px rgb(0 0 0 / .15)` | Dragged item (time block drag) |

In dark mode, levels 1–5 keep the same shadows, but the surface also steps up one container tone (for example, a dialog uses `surface-container-high`).

**State layers.** Every interactive surface gets an overlay in its content colour (`currentColor`) through `::before`:

| State | Opacity |
|---|---|
| hover | 8 % |
| focus-visible | 10 % (plus the focus ring) |
| pressed | 10 % |
| dragged | 16 % |
| disabled | content at 38 %, container at 12 % of on-surface |

Utility: `.state-layer` (relative, overflow hidden, `::before` inset 0, `background: currentColor`, opacity from `--state`, transition `default-effects`).

**Focus ring:** `outline: 3px solid var(--md-focus); outline-offset: 2px`. Nav items, list items and day cells inside bars use `outline-offset: -3px`. The existing `focusRing` helper in `cx.ts` is updated, not replaced.

## 6. Layout

| Size class | Columns | Margin | Gutter | Navigation | Content max width |
|---|---|---|---|---|---|
| compact < 600 | 4 | 16 | 16 | Bar + FAB | full |
| medium 600–839 | 8 | 24 | 24 | Collapsed rail | full |
| expanded 840–1199 | 12 | 24 | 24 | Collapsed rail | 1040 |
| large 1200–1599 | 12 | 32 | 24 | Expanded rail (or collapsed) | 1240 |
| extra-large ≥ 1600 | 12 | 40 | 24 | Expanded rail | 1240 (content centred in the remaining width) |

Page shells (UI-3 builds them as components):
- `PageContainer width="overview"` 1240, `"detail"` 840, `"reading"` 720.
- `pt-4 pb-28` on compact (clears the FAB and bar), `pt-10 pb-16` on medium and wider.

**Canonical layouts** (M3):
- **Feed:** Home, Track, Goals list. Responsive card grid, `grid-cols-1` → `expanded:grid-cols-2` → `large:grid-cols-3` for small cards.
- **List–detail:** Notes at large and wider (D-33).
- **Supporting pane:** goal detail and review at expanded and wider (main 2/3, supporting 1/3).

Fixed and sticky elements respect `env(safe-area-inset-*)`. The bottom padding of `main` on compact is `calc(64px + env(safe-area-inset-bottom) + 72px)`, which clears the bar and the FAB. When the keyboard is open (the `visualViewport` height drops below 75 % of `innerHeight`), the nav bar and FAB hide. The `useKeyboardOpen` hook is in UI-3.

## 7. Motion

Spring parameters were checked against Google's `ExpressiveMotionTokens.kt` and `StandardMotionTokens.kt`. Each spring was converted to a CSS duration plus a `linear()` easing by sampling the damped-spring step response (mass 1) at 25 points until it settles within 0.1 %.

| Token (`--ease-<t>` / `--duration-<t>`) | Damping / stiffness | Duration | Overshoot | `linear()` easing |
|---|---|---|---|---|
| `expressive-fast-spatial` | 0.6 / 800 | 360 ms | 9.5 % | `linear(0, 0.075, 0.249, 0.458, 0.659, 0.827, 0.952, 1.034, 1.078, 1.094, 1.091, 1.076, 1.056, 1.037, 1.02, 1.007, 0.998, 0.993, 0.991, 0.991, 0.992, 0.994, 0.996, 0.998, 1)` |
| `expressive-default-spatial` | 0.8 / 380 | 440 ms | 1.5 % | `linear(0, 0.053, 0.174, 0.321, 0.47, 0.605, 0.719, 0.811, 0.881, 0.932, 0.967, 0.99, 1.004, 1.012, 1.015, 1.015, 1.014, 1.012, 1.009, 1.007, 1.005, 1.004, 1.002, 1.002, 1)` |
| `expressive-slow-spatial` | 0.8 / 200 | 600 ms | 1.5 % | `linear(0, 0.052, 0.171, 0.317, 0.464, 0.598, 0.713, 0.805, 0.875, 0.927, 0.964, 0.988, 1.003, 1.011, 1.014, 1.015, 1.014, 1.012, 1.01, 1.008, 1.006, 1.004, 1.003, 1.002, 1)` |
| `standard-fast-spatial` | 0.9 / 1400 | 230 ms | 0.2 % | `linear(0, 0.052, 0.168, 0.307, 0.445, 0.569, 0.675, 0.76, 0.828, 0.879, 0.918, 0.946, 0.965, 0.979, 0.988, 0.994, 0.998, 1, 1.001, 1.001, 1.002, 1.001, 1.001, 1.001, 1)` |
| `standard-default-spatial` | 0.9 / 700 | 320 ms | 0.2 % | `linear(0, 0.05, 0.164, 0.3, 0.436, 0.56, 0.665, 0.752, 0.82, 0.873, 0.912, 0.941, 0.962, 0.976, 0.986, 0.993, 0.997, 0.999, 1.001, 1.001, 1.002, 1.001, 1.001, 1.001, 1)` |
| `standard-slow-spatial` | 0.9 / 300 | 490 ms | 0.2 % | `linear(0, 0.051, 0.164, 0.301, 0.437, 0.561, 0.667, 0.753, 0.821, 0.874, 0.913, 0.942, 0.962, 0.977, 0.986, 0.993, 0.997, 0.999, 1.001, 1.001, 1.002, 1.001, 1.001, 1.001, 1)` |
| `fast-effects` | 1.0 / 3800 | 150 ms | 0 | `linear(0, 0.058, 0.181, 0.321, 0.456, 0.574, 0.672, 0.751, 0.813, 0.861, 0.897, 0.924, 0.945, 0.96, 0.971, 0.979, 0.985, 0.989, 0.992, 0.994, 0.996, 0.997, 0.998, 0.999, 1)` |
| `default-effects` | 1.0 / 1600 | 240 ms | 0 | `linear(0, 0.062, 0.191, 0.337, 0.475, 0.594, 0.692, 0.769, 0.829, 0.874, 0.908, 0.934, 0.952, 0.966, 0.976, 0.983, 0.988, 0.991, 0.994, 0.996, 0.997, 0.998, 0.999, 0.999, 1)` |
| `slow-effects` | 1.0 / 800 | 330 ms | 0 | `linear(0, 0.059, 0.183, 0.325, 0.461, 0.579, 0.677, 0.755, 0.817, 0.864, 0.9, 0.927, 0.947, 0.961, 0.972, 0.98, 0.986, 0.99, 0.993, 0.995, 0.996, 0.997, 0.998, 0.999, 1)` |

Tailwind exposes these as `ease-<token>` and `duration-<token>`. Never pair an overshooting easing with `opacity` or `color`: effects tokens only.

**Where each spring goes** (D-25):

| Motion | Token |
|---|---|
| Nav indicator grow (width 0 → 56) | `expressive-fast-spatial` |
| Button press shape morph | `expressive-fast-spatial` |
| Switch thumb, checkbox check | `expressive-fast-spatial` |
| FAB menu items (staggered 30 ms, scale 0.6 → 1, translate 16 px) | `expressive-default-spatial` |
| Chip select | `expressive-fast-spatial` |
| Habit Done check morph | `expressive-default-spatial` |
| Day pill fill height | `expressive-default-spatial` |
| Milestone arc segment fill | `expressive-slow-spatial` |
| Bottom sheet / dialog enter (translate or scale 0.96 → 1) | `standard-default-spatial` |
| … and exit | `standard-fast-spatial` |
| Rail expand / collapse (width) | `standard-default-spatial` |
| Disclosure expand (`grid-template-rows: 0fr → 1fr`) | `standard-default-spatial` |
| Scrim, colour, state layer, app bar tint | `default-effects` |
| Snackbar enter | `standard-fast-spatial` + `fast-effects` |

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` sets every spatial `--duration-*` to `0ms`, keeps effects tokens at 150 ms, and disables shape morph, stagger and shimmer.

## 8. Shape library (D-06)

`src/components/ui/shapes.ts` exports `SHAPES: Record<ShapeName, string>`: SVG path data in a 100 × 100 box, generated once at module load from pure polar functions, rounded to 2 decimals, with a unit-tested snapshot. Only these are built:

| Name | Formula (θ ∈ [0, 2π), r in a 100-unit box, centre 50,50) | Used for |
|---|---|---|
| `circle` | r = 50 | Default avatar, loading frame 1 |
| `cookie-4` | r = 50 · (0.86 + 0.14·cos 4θ) | Identity |
| `cookie-6` | r = 50 · (0.88 + 0.12·cos 6θ) | Identity, today marker |
| `cookie-9` | r = 50 · (0.9 + 0.1·cos 9θ) | Identity, user avatar default |
| `cookie-12` | r = 50 · (0.92 + 0.08·cos 12θ) | Identity, Done morph target |
| `clover-4` | r = 50 · (0.7 + 0.3·\|cos 2θ\|^0.6) | Identity |
| `clover-8` | r = 50 · (0.78 + 0.22·\|cos 4θ\|^0.6) | Identity |
| `sunny` | r = 50 · (0.9 + 0.1·cos 8θ) with 64 samples | Loading frame 2 |
| `soft-burst` | r = 50 · (0.82 + 0.18·cos 10θ)^1.2 | Celebration sheet, empty states |
| `flower` | r = 50 · (0.75 + 0.25·\|cos 2.5θ\|) | Identity |
| `puffy-diamond` | superellipse \|x\|^1.6 + \|y\|^1.6 = 1, rotated 45°, plus 0.06·cos 4θ ripple | Identity |
| `pill` | stadium, 100 × 60 | Loading frame 3 |
| `arch` | rectangle with a semicircular top | Empty-state art |
| `gem` | regular pentagon with corners rounded to 18 % | Identity |

Sample 120 points per shape (64 for `sunny`) and join them with straight segments. That is smooth at avatar sizes up to 96 px. These are **approximations** of the M3 shapes (the official ones come from AndroidX `graphics-shapes` `RoundedPolygon`). If an exact port is wanted later, it replaces this one file.

Identity set (D-07, in hash order): `cookie-9, clover-4, cookie-6, flower, gem, clover-8, cookie-4, puffy-diamond, cookie-12`.
Hash: FNV-1a 32-bit over the id string. `shape = set[h % 9]` and `palette = IDENTITY[(h >>> 8) % 6]`.

## 9. Iconography

**Material Symbols Rounded, weight 400, grade 0, optical size 24.** Default size 24 px. Nav and rail icons are 24 px. Dense icons are 20 px. Inline text icons are 18 px. Active nav icons use the `-fill` variant.

Allowlist for `scripts/generate-material-icons.mts`. The script must fail loudly on a missing name, and show the closest names it found:

```
home, checklist, flag, cycle, sticky_note_2, rate_review, settings, search, add, close, arrow_back,
more_vert, more_horiz, menu, check, check_circle, radio_button_unchecked, schedule, event,
calendar_month, today, date_range, inbox, upcoming, edit, delete, archive, unarchive, restore,
pause, play_arrow, notifications, notifications_off, dark_mode, light_mode, contrast, devices,
install_mobile, language, info, error, warning, chevron_left, chevron_right, expand_more,
expand_less, drag_indicator, arrow_upward, arrow_downward, link, link_off, label, format_bold,
format_italic, format_strikethrough, code, format_quote, format_list_bulleted,
format_list_numbered, format_h1, format_h2, format_h3, horizontal_rule, undo, redo, logout,
person, view_agenda, view_week, view_day, view_column, view_timeline, timer, block, history,
celebration, skip_next, event_repeat, filter_list, sort, visibility, visibility_off, lock, public,
keyboard, dock_to_right, left_panel_close, left_panel_open, add_task, note_add, flag_circle,
task_alt, pending, bedtime, trending_flat
```

The destination icons are home (Home), checklist (Plan), flag (Goals), cycle (Track; fall back to `event_repeat` if `cycle` is missing), sticky_note_2 (Notes), rate_review (Review), settings (Settings), search (Search) and more_horiz (More).

## 10. Content style (D-21)

- **Sentence case** everywhere ("New habit", not "New Habit").
- **Buttons are verbs**: Save, Done, Skip, Plan for today, Link a note.
- **Numbers before nouns, as words a person would say**: "3 planned for today", "2 of 3 times so far this week".
- **Rule copy comes from constants.** Use the `src/lib/*` constants as they are: `TODAY_SECTION_LABELS`, `TODAY_SECTION_HINTS`, `REVIEW_STEP_LABELS`, `TRACK_RANGE_LABELS`, `GOAL_STATUS_LABELS`, `MILESTONE_PROGRESS_HELP`, metric `definition` strings, and the `HabitHistoryDay.stateLabel` / `dateLabel` values. If the redesign needs shorter labels, add a **new** constant beside the old one. Don't edit text that tests and definitions depend on.
- **Empty states**: one sentence on what will appear, plus one action. Never "You have no…".
- **Errors**: what happened, then what to do. Keep `ErrorReference` for internal errors.

## 11. Dark theme specifics

- Cards use `surface-container-low` on `canvas` (not `-lowest`), so they lift by tone. There is no `shadow-card`.
- The mist uses `canvas-mist` dark (`#002D45`) at 60 % strength.
- Primary-filled elements become pale (`#98CCF9`), with dark text (`on-primary #00344E`). Check every filled control by eye in dark mode.
- FullCalendar's variables follow automatically through `calendar-theme.css` (§12).

## 12. Migration from the current tokens (UI-1)

`globals.css` keeps the legacy variables as **aliases**, so pages that haven't been redesigned re-skin consistently straight away:

| Legacy var / utility | Becomes |
|---|---|
| `--bg` / `bg-bg` | `var(--md-canvas)` |
| `--surface` / `bg-surface` | `var(--md-surface-container-lowest)` |
| `--surface-muted` / `bg-surface-muted` | `var(--md-surface-container)` |
| `--fg` / `text-fg` | `var(--md-on-surface)` |
| `--fg-muted` / `text-muted` | `var(--md-on-surface-variant)` |
| `--border` / `border-border` | `var(--md-outline-variant)` |
| `--accent` / `bg-accent`, `text-accent` | `var(--md-primary)` |
| `--accent-fg` | `var(--md-on-primary)` |
| `--focus` | `var(--md-focus)` |
| `--danger` / `--danger-fg` | `var(--md-error)` / `var(--md-on-error)` |
| `--success` | `var(--md-success)` |
| `--corner-sm/md/lg` | 8 / 12 / 16 px |
| `--fs-*` | unchanged until UI-13 |

`calendar-theme.css` is remapped to M3 roles in UI-1:

| FullCalendar variable | M3 role |
|---|---|
| event | `primary-container` / `on-primary-container` |
| today | 6 % primary |
| now line | `tertiary` |
| highlight | 12 % primary |
| button | `surface-container-high` |

UI-13 removes every alias and every legacy utility use. It deletes the default Tailwind breakpoints and the `--fs-*` scale, and adds a CI-friendly check: `pnpm lint:tokens`, a small Node script that greps `src/` for `bg-surface\b`, `text-muted\b`, `bg-accent`, `border-border`, `\b(sm|md|lg|xl):`, `bg-(red|blue|…)-\d` and raw `#hex` in `.tsx`, and exits non-zero on any match.
