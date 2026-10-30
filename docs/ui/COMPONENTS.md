# SoleUp components

**Status:** Revision 2, 2026-10-30. UI-2 builds everything in Parts A–F; later phases may add to it. Data-display components (Part G) are built by the first phase that needs them, which the "Phase" column names.

Rules for every component:

1. **Files.** It lives in `src/components/ui/` (generic) or `src/components/data/` (Part G). It is a Server Component unless it needs state, effects or event handlers. Client components are kept small: a client child inside a server parent is better than a client parent.
2. **Tokens.** It styles itself only with role utilities from [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md): `cx()` for class joins, `focusRing` for focus, `.state-layer` for hover, focus and press.
3. **Behaviour.** It is built on Radix whenever Radix has the primitive. It never re-implements focus trapping, roving tabindex or menus by hand.
4. **Gallery.** It has an entry in `/dev/ui` (D-30) showing every variant and state in light and dark side by side.
5. **Unit tests.** It has a unit test in `src/components/ui/*.test.tsx` that renders static markup (the project's existing pattern, `renderToStaticMarkup` in the node environment). The test checks the accessible markup: roles, names, `aria-*`, `disabled`, and that each variant gets its classes.
6. **Compatibility.** **Existing exports keep their names and props** (`Button`, `buttonClass`, `Input`, `Textarea`, `Select`, `FormField`, `FormError`, `Dialog`, `DialogContent`, `DialogTrigger`, `DialogClose`, `ConfirmDialog`, `toast`, `Toaster`, `EmptyState`, `ErrorState`, `ErrorReference`, `Skeleton`, `LoadingState`). Old prop values keep working as aliases until UI-13, so unredesigned pages don't break.

---

## Part A: Foundation

### `Icon`: `src/components/icons/icon.tsx`
```ts
type IconProps = { name: IconName; filled?: boolean; size?: 18 | 20 | 24 | 32 | 40; className?: string };
```
- Renders `<svg viewBox="0 -960 960 960" width height aria-hidden="true" focusable="false" fill="currentColor">` with the path from `icon-paths.generated.ts`. `IconName` is a union generated from the allowlist.
- An icon is **never** the only label. A component that renders an icon on its own must take an `aria-label` or visible text.

### `ShapeAvatar`: `src/components/ui/shape-avatar.tsx`
```ts
type ShapeAvatarProps = {
  id: string;                 // hashed for shape + palette (DESIGN_SYSTEM §8)
  label: string;              // full title; first grapheme shown
  size?: 32 | 40 | 48 | 56 | 72;
  area?: LifeAreaColor | null; // overrides the hashed palette (goals)
  shape?: ShapeName;           // overrides the hash (user avatar: "cookie-9")
};
```
- **Drawing:** an inline `<svg>` with `<path d={SHAPES[shape]}>` filled with the palette container. The letter is centred in `<text>` (or an absolutely positioned span) in the palette's `-on` colour, using `title-medium` emphasized at 40 px or less and `title-large` emphasized above that.
- **Grapheme:** take the first grapheme of `label` with `Intl.Segmenter("en", { granularity: "grapheme" })` and uppercase it.
- **Semantics:** `aria-hidden="true"`. The title next to the avatar carries the meaning.

### State layer, focus, morph

These are utilities in `globals.css`, described in DESIGN_SYSTEM §3 and §5:
- `.state-layer`
- `.morph-press`: radius from full to 12 px while `:active` (spring);
- `.morph-select`: radius 12 px, and full when `[aria-pressed=true]`, `[aria-checked=true]` or `[data-state=on]`.

---

## Part B: Actions

### `Button`: `src/components/ui/button.tsx` (rewrite, same exports)
```ts
type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "elevated" | "danger" | "danger-text"
  // legacy aliases until UI-13: primary→filled, secondary→outlined, ghost→text
type ButtonSize = "xs" | "s" | "m";            // legacy: sm→xs, md→s
type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant; size?: ButtonSize;
  icon?: IconName;            // leading icon
  trailingIcon?: IconName;
  pending?: boolean;          // shows LoadingIndicator(24) in place of icon, aria-busy, keeps width, disabled
  fullWidth?: boolean;
};
buttonClass(opts): string     // same signature + new options, for <Link>
```

| Size | Height | Padding (inline) | Icon | Text |
|---|---|---|---|---|
| xs | 32 | 12 | 20 | label-large |
| s (default) | 40 | 16 (24 when there's no icon) | 20 | label-large |
| m | 56 | 24 | 24 | title-medium |

| Variant | Container | Content | Border |
|---|---|---|---|
| filled | `primary` | `on-primary` | – |
| tonal | `secondary-container` | `on-secondary-container` | – |
| outlined | transparent | `primary` | 1 px `outline` |
| text | transparent | `primary` | – (inline padding 12) |
| elevated | `surface-container-low` + level 1 | `primary` | – |
| danger | `error` | `on-error` | – |
| danger-text | transparent | `error` | – |

- **Shape:** `rounded-full`, with `.morph-press`.
- **Disabled:** content at 38 % and container at 12 % of `on-surface`, plus `cursor-not-allowed`.
- **Hit area:** the target is at least 48 px. On `xs` and `s` an invisible `::after` extends it vertically.
- **Defaults:** `type="button"` stays the default.
- **Press morph and selection:** M3 Expressive's toggle buttons are done with `aria-pressed` and `.morph-select`. Only the theme picker and filter toggles use them.

### `IconButton`: `src/components/ui/icon-button.tsx`
```ts
type IconButtonProps = ComponentProps<"button"> & {
  icon: IconName; label: string;   // → aria-label (required)
  variant?: "standard" | "filled" | "tonal" | "outlined";
  size?: 40 | 48;                  // container; default 48 on compact, 40 dense
  selected?: boolean;              // toggle: aria-pressed + filled icon
  tooltip?: boolean;               // default true on medium+: Radix Tooltip with `label`
};
```
- **Shape:** circular, with `.morph-press`.
- **Link version:** an `IconLink` with the same look renders `<Link aria-label>`.

### `Fab` and `FabMenu`: `src/components/ui/fab.tsx` (client)
- **`Fab`:** 56 × 56, `primary-container`, radius 20 (`rounded-xl`), level 3, icon 24. `extended` adds a label (56 px tall, 16 px icon padding, 20 px text padding).
- **`FabMenu`:** built on Radix `DropdownMenu`, so focus, arrow keys and Escape come for free. The trigger is the FAB; while open its icon rotates and morphs from `add` to `close` (`expressive-fast-spatial`). The items are **pill-shaped extended buttons** in `primary-container`, 56 px tall, stacked above the FAB, right-aligned, 8 px apart, and staggered in with `expressive-default-spatial`. A scrim (`scrim` at 16 %) appears behind.
- **Items:** `{ icon, label, onSelect | href, shortcut? }`, with `shortcut` shown as a trailing hint ("Q").
- **Position:** on compact the FAB is fixed at `right: 16px; bottom: calc(64px + 16px + env(safe-area-inset-bottom))`. On the rail it's in normal flow at the top.

### `ConnectedButtonGroup`: `src/components/ui/button-group.tsx`
This is M3 Expressive's connected button group, and it replaces segmented buttons.
```ts
type Item = { value: string; label: string; icon?: IconName; href?: string };
type Props = { label: string /* group aria-label */; items: Item[]; value: string;
               onValueChange?: (v: string) => void; size?: "xs" | "s" };
```
- **Two modes:**
  - **Link mode** (every item has `href`): renders `<nav aria-label={label}>` with `Link`s, and `aria-current="page"` on the selected one. Used for URL-backed choices: Track range, calendar view, Agenda `days`, Upcoming `days`, Goals status.
  - **Toggle mode:** Radix `ToggleGroup type="single"`. Used for the in-page theme picker.
- **Look:** buttons sit 2 px apart. The group's outer corners are `full`, and inner corners are `extra-small` (4 px), or `small` (8 px) on s. The selected item morphs to `full` and fills with `secondary-container`, with its icon swapped for `check` when the item has no icon of its own. Unselected items are `surface-container`.
- **Overflow:** horizontal scroll with hidden scrollbars, and the selected item scrolled into view on mount.

---

## Part C: Selection and input

### `TextField` (`Input`, `Textarea`, `Select` restyled): `src/components/ui/{input,textarea,select,field-styles}.ts(x)`
D-22 static inner label. `FormField` stays the API: it renders the label **inside** the container, top left, `label-medium` in `on-surface-variant` (`primary` while focused, `error` when invalid).

| Part | Spec |
|---|---|
| Container | `surface-container-highest`, radius 16 px, min height 64 px, padding 8 px top, 16 px sides, 8 px bottom |
| Label | `label-medium`, 16 px line, 4 px below the top padding |
| Value | `body-large`, `on-surface`, no own border or background |
| Placeholder | `on-surface-variant` at 70 %, only where it adds information (example formats) |
| Focus | 2 px `primary` outline inset (`outline-offset: -2px`), label turns `primary` |
| Error | 2 px `error` outline, `error` icon trailing, and the message below in `body-small` `error` with `aria-describedby` (existing) |
| Hint | `body-small` `on-surface-variant` below the container |
| Disabled | 38 % content, 4 % `on-surface` container |
| Textarea | min 120 px, `resize: vertical`, the label stays fixed at the top |
| Select | native `<select>` (it keeps platform pickers), `appearance: none`, an `expand_more` icon at the end |
| Date / time | native `input[type=date|time|datetime-local]` in the same container; no custom picker replaces them (D-34) |

`fieldClass()` keeps its signature, so callers don't change.

### `NumberStepper`: `src/components/ui/number-stepper.tsx` (client)
- **Use:** quantity habit targets and amounts.
- **Layout:** a field containing `inputMode="decimal"` text, flanked by two 40 px tonal icon buttons (− and +) with `aria-label` "Decrease …" and "Increase …".
- **Values:** steps by 1, with min and max from the props (the existing habit constants). Typing is still allowed, and validation stays where it is today (server Zod).

### `Checkbox`: Radix Checkbox
- **Look:** 18 px box with radius 2. The 48 px target comes from padding.
- **Checked:** `primary` fill with an `on-primary` check that morphs in (`expressive-fast-spatial`).
- **Labels:** wrapped in a `<label>`, so the whole row is clickable. Task completion uses a **round** checkbox variant (`shape="round"`, 24 px circle that fills on check) to match the references' circular day cells.

### `Switch`: Radix Switch
- **Size:** M3 52 × 32 track, full radius.
- **Off:** `surface-container-highest` track with a 2 px `outline` border, and a 16 px `outline` thumb.
- **On:** `primary` track and a 24 px `on-primary` thumb with a `check` icon in `primary`.
- **Pressed:** the thumb grows to 28 px.
- **Motion:** `expressive-fast-spatial`.
- **Labels:** always a visible `<label>`. A row pattern (`SwitchRow`) puts the label and supporting text on the left and the switch on the right, and the whole row toggles.

### `RadioGroup`: Radix RadioGroup
- **Look:** a 20 px ring, with a 10 px dot when selected.
- **Rows:** `RadioRow` follows the same pattern as `SwitchRow`.

### `Chip`: `src/components/ui/chip.tsx`
| Type | Look | Use |
|---|---|---|
| assist | 32 px, radius 8, 1 px `outline-variant`, leading icon | "Open in calendar", "Block time" |
| filter | 32 px, radius 8. Unselected: outlined. Selected: `secondary-container` with a leading `check`, morphs to radius 16 | Plan filters, Notes tags (8.5) |
| input | 32 px, radius 8, trailing ✕ `IconButton` (label "Remove {x}") | Active filter summary, note links |
| status | 24 px, radius 6, `label-medium`, tonal fill by status, icon plus text | Goal and task status, "Paused", "Archived" |
| metric | 32 px pill (`rounded-full`). Filled tonal `primary-container` for a highlighted count, outlined for zero | Today card counts (reference 1's "64 min / 1288 kcal" pills) |

Every chip is a `button` or a link when interactive, and a `span` otherwise.

### `Tabs`: `src/components/ui/tabs.tsx`
- **Primary tabs, link mode:** `<nav aria-label>` with links and `aria-current="page"`.
  - Each tab is 48 px tall, `label-large`, with the active one in emphasized weight and `primary`.
  - The active indicator is 3 px tall with a full radius on top, as wide as the label's content plus 8 px, animated between tabs with `expressive-fast-spatial` (a CSS anchor-positioned underline, or a transform).
  - Used for the Plan subnav (D-15).
- **Secondary tabs, Radix Tabs:** for in-page panels (Settings sections on compact are *not* tabs; see SCREENS).

---

## Part D: Containment

### `Card`: `src/components/ui/card.tsx`
```ts
type CardProps = { as?: "section" | "article" | "div"; variant?: "default" | "hero" | "tonal" | "outlined";
                   padding?: "m" | "l"; headingId?: string; className?: string; children };
```
| Variant | Light | Dark | Radius | Padding |
|---|---|---|---|---|
| default | `surface-container-lowest` + `shadow-card` | `surface-container-low` | 28 (`rounded-2xl`) | 16 compact / 24 medium+ |
| hero | `primary-container`, text `on-primary-container` | same roles | 32 (`rounded-3xl`) | 20 / 28 |
| tonal | `surface-container` | `surface-container` | 28 | 16 / 24 |
| outlined | transparent + 1 px `outline-variant` | same | 28 | 16 / 24 |

- **Card heading parts:** `CardHeader` lays out `title` (`title-medium`, or `title-large` on detail pages), an optional leading `Icon` in a 40 px `secondary-container` circle (reference 1's "Activity Steps" icon tile), and trailing actions: at most one `IconButton` (overflow or info).
- **Clickable cards:** a card is never a button containing other buttons. When the whole card links somewhere, the title is the link, and its `::after` stretches over the card (the "stretched link" pattern).

### `ListGroup` and `ListItem`: `src/components/ui/list.tsx` (D-24)
```ts
<ListGroup label="Planned for today">   // <ul aria-label>, gap-0.5
  <ListItem leading={<Checkbox shape="round"/>} headline="Write intro" supporting="Goal · Thesis"
            meta="Due 17:00" trailing={<IconButton icon="more_vert" label="Actions for Write intro"/>}
            href? onClick? selected? />
```
- **Rows:** min height 56, 72 or 88 px depending on lines. The headline is `body-large` (the `title-medium` weight for emphasis), the supporting text `body-medium` `on-surface-variant` (up to 2 lines, clamped), the meta `label-medium` `on-surface-variant`. Slots are spaced 16 px apart.
- **Corners:** the first item has top corners at 16 px and the rest at 4 px; the last item has bottom corners at 16 px. A single item has every corner at 16 px.
- **Interactive rows:** the row gets `.state-layer`. A row with `href` renders the headline as the link, and stretches it.
- **Selected:** `secondary-container` fill and full-radius morph (used in the Notes list–detail pane).

### `Disclosure`: Radix Collapsible
- **Trigger:** a text button with a trailing `expand_more` that rotates 180° on open.
- **Content:** animated with `grid-template-rows: 0fr → 1fr` (`standard-default-spatial`).
- **Uses:** goal history, archived sections, "More options" in event and block forms.

### `Dialog`, `DialogContent` (rewrite), `FormDialog` (new), `ConfirmDialog` (restyled)
- **`DialogContent`:** the same props as today. Centred, `surface-container-high`, radius 28, padding 24, max width 560 (`size="l"` gives 720). The title is `headline-small`. The close button is an `IconButton`. Enter: scale 0.96 → 1 with an opacity effects spring. The scrim is `scrim` at 32 %.
- **`FormDialog`** (new): adapts by size class (D-23).
  - **Compact:** full screen with an app bar (✕ `IconButton` labelled "Close", the `title-large` title, a **Save** text button that submits the form via its `form` attribute). The content scrolls. Destructive actions sit in a footer row at the bottom.
  - **Medium and wider:** renders as `DialogContent` with the footer actions on the right (Cancel text button, Save filled).
  - **Props:** `{ title, description?, formId, submitLabel, pending, destructive?: ReactNode, trigger?, open?, onOpenChange? }`.
  - **Uses:** goal, task, habit, event, block and life-area forms move to it in their phases.
- **`ConfirmDialog`:** keeps its behaviour (stays open until the action settles, shows a failed `ActionResult` message). It is restyled as a basic dialog: an `icon` slot (`delete` in `error`) above a centred title. Actions sit on the right: **Cancel** (text) and the destructive verb (`danger`).

### `BottomSheet`: `src/components/ui/bottom-sheet.tsx` (client, Radix Dialog underneath)
- **Look:** a modal sheet from the bottom. `surface-container-low`, top radius 28, max height 90 dvh. A 32 × 4 drag handle (an `outline` pill) sits 16 px from the top. The title is `title-large`, and there's a close `IconButton`. Bottom padding is `env(safe-area-inset-bottom) + 16`.
- **Motion:** enter `translateY(100%) → 0` with `standard-default-spatial`.
- **Drag to dismiss:** pointer drag on the handle; dismiss past 30 % or on a fast flick. The close button and Escape always work too.
- **Size classes:** on medium and wider, the same component renders as a `Popover` when given an `anchor`, or as a centred `DialogContent` otherwise. Use `ResponsiveSheet` for that choice.

### `Menu`: Radix DropdownMenu
- **Look:** `surface-container`, radius 12 (`rounded-md`), level 2, min width 112, max width 280, 8 px vertical padding.
- **Items:** 48 px, `body-large` with a leading `Icon` (20 px) and a trailing shortcut hint. Destructive items use `error` text and a separator before them.
- **Uses:** overflow menus (`more_vert`).

### `Popover`, `Tooltip`
- **Popover:** `surface-container`, radius 16, padding 16, level 2.
- **Tooltip:** a plain M3 tooltip, `inverse-surface`, radius 4 (`xs`), `body-small`, 500 ms delay. It is only a hint for icon buttons that already have their `aria-label`.

---

## Part E: Navigation and page structure

### `NavigationBar`: `src/components/shell/navigation-bar.tsx` (client)
- **Layout:** fixed to the bottom, compact only (`medium:hidden`). `surface-container` (level 2 shadow when content sits under it), height 64 + the safe area. Five equal items.
- **Items:** a 56 × 32 `rounded-full` indicator behind the icon, with the label 4 px below in `label-medium`.
  - **Active:** indicator `secondary-container`, `-fill` icon in `on-secondary-container`, label `secondary` and emphasized. The indicator grows from 0 to 56 px wide with `expressive-fast-spatial`.
  - **Inactive:** icon and label `on-surface-variant`.
- **Semantics:** `nav aria-label="Main"`, `aria-current="page"` on the exact page and `"true"` on a parent section (the existing semantics in `app-nav.tsx`).
- **More:** a `button` with `aria-haspopup="dialog"` that opens `MoreSheet`. It is marked current when the path is in its group.

### `MoreSheet`: `src/components/shell/more-sheet.tsx`
- **Contents:** a `BottomSheet` titled "More". It holds a `ListGroup` of destinations (Notes, Review, Search, Settings), each with a 40 px tonal icon tile in its domain tint. Domain tints use the identity palettes: Notes violet, Review pink, Search blue, Settings gray.
- **Account:** a second group shows the user's `ShapeAvatar`, their name, and **Sign out** (the existing `SignOutButton` logic).
- **Navigation:** choosing a link closes the sheet.

### `NavigationRail`: `src/components/shell/navigation-rail.tsx` (client)
- **Collapsed** (medium, expanded, or large when collapsed): 96 px wide, `canvas` background with no border. From the top:
  1. a menu `IconButton` to expand it (large and wider only);
  2. the Create `Fab`, extended with no label, 56 × 56;
  3. a Search `IconButton`;
  4. destinations, 4 px apart: an indicator 56 × 32 with the label below (`label-medium`);
  5. Settings and the account avatar (`ShapeAvatar` 40, opening a `Menu` with the name and Sign out), pinned to the bottom.
- **Expanded** (large and wider, the default there): 256 px wide, `surface-container-low`.
  - **Header:** the SoleUp wordmark (`title-large` emphasized, ROND 100) and a collapse `IconButton` (`left_panel_close`).
  - **Create:** an extended FAB, "Create".
  - **Search:** a full-width search field (the existing `ShellSearch` restyled: 56 px, `surface-container-highest`, `rounded-full`, leading `search` icon). It hands terms over in memory, as it does today.
  - **Destinations:** 56 px rows with full-width `rounded-full` indicators, 16 px leading padding, 8 px between icon and label, `label-large`.
  - **Plan's children** (Today, Upcoming, Calendar, Inbox, All tasks) nest under Plan with 52 px leading padding, 40 px rows, `body-medium`, and are shown while Plan or one of its pages is active.
  - **Footer:** Settings, then the account row (avatar, name, Sign out).
- **Motion:** width transitions with `standard-default-spatial`. Labels fade with `fast-effects`.
- **Sizing:** `aside` with `nav aria-label="Main"` inside, sticky full height with internal scroll on short viewports.

### `TopAppBar`: `src/components/shell/top-app-bar.tsx` (compact only)
```ts
type TopAppBarProps = { title: string; back?: { href: string; label: string }; actions?: ReactNode;
                        variant?: "small" | "greeting" };
```
- **Layout:** sticky top, 64 px plus `env(safe-area-inset-top)`, transparent over the mist. Once `scrollY > 4` it switches to `surface-container` with the `default-effects` colour transition (an `IntersectionObserver` sentinel, no scroll listener).
- **Title:** `title-large`, truncated, and **not** an `h1`: the page's own `h1` is in the content, visually hidden on compact when it would repeat the title.
- **Greeting variant** (Home): the user `ShapeAvatar` (40), a two-line block ("Good morning, Alex" in `title-medium`, and the date "Friday, 30 October" in `body-medium` `on-surface-variant`), and trailing Search and More icon buttons.

### `PageHeader`: `src/components/shell/page-header.tsx` (medium and wider)
```ts
type PageHeaderProps = { title: string; description?: string; actions?: ReactNode; subnav?: ReactNode;
                         back?: { href: string; label: string }; eyebrow?: ReactNode };
```
- **Layout:** the `h1` in `headline-medium` (emphasized at large and wider) and the description in `body-large` `on-surface-variant`, one line, truncated on medium. Actions align to the end; at most one filled button.
- **Back:** rendered as a text button with `arrow_back` above the title.
- **Compact:** the component renders the `h1` as `sr-only` (the app bar shows the title) and moves its actions into the app bar or the page body, as each screen spec says.

### `PageContainer`: `src/components/shell/page-container.tsx`
- **Props:** `width: "overview" | "detail" | "reading"` (DESIGN_SYSTEM §6).
- **Spacing:** margins by size class, and bottom padding that clears the nav bar and FAB on compact.

### `PlanTabs`
`Tabs` in link mode with `PLAN_SUB_ITEMS`, reordered per D-15 into a new constant `PLAN_TAB_ITEMS`; the existing constant stays for the rail. Renders under the app bar on compact, and in `PageHeader.subnav` on medium and wider.

---

## Part F: Communication and states

### `Snackbar`: the `toast()` / `Toaster` restyle
- **Look:** `inverse-surface` / `inverse-on-surface`, radius 4 (`xs`), min height 48, `body-medium`, max width 560. The action button is a text button in `inverse-primary`. A close `IconButton` appears when there's an action.
- **Placement:** see D-27. The Radix viewport classes move to `bottom-[calc(64px+72px+env(safe-area-inset-bottom))]` on compact, and the start side next to the rail on medium and wider.
- **API:** `toast()` is unchanged, plus `variant: "error"` turns the title `error`-tinted on `inverse-surface` (`#FFB4A5` on `#2C3136` measures 8.0:1).

### `LoadingIndicator`: `src/components/ui/loading-indicator.tsx`
- **Shape:** M3 Expressive loading indicator: a 48 px (or 24 / 38) shape that cycles `circle → sunny → cookie-9 → pill → soft-burst`, morphing and rotating (`expressive-default-spatial` per step, 650 ms step, constant rotation). Colour `primary`, with `contained` adding a `primary-container` 48 px circle behind.
- **Implementation:** CSS `@keyframes` interpolating `clip-path: path(…)` between shapes with the **same point count** (all generated with 120 points), plus `transform: rotate`.
- **Semantics:** `role="progressbar"` with `aria-label` (default "Loading"), or `aria-hidden` when inside a button that has `aria-busy`.
- **Reduced motion:** a static circle with an opacity pulse.

### `Skeleton`, `LoadingState`
- **`Skeleton`:** `surface-container-high`, radius matching what it stands in for (`card`, `list-item`, `text`, `circle`), with a shimmer gradient sweep over 1.4 s (none under reduced motion).
- **`LoadingState`:** keeps its API and now renders a `LoadingIndicator` with its label below.
- **Page skeletons:** each route's `loading.tsx` or `Suspense` fallback is a **page-shaped skeleton** (Home: greeting, strip, two cards, carousel), built from `Skeleton`.

### `EmptyState` (restyle, same API, new optional `art`)
- **Layout:** no dashed border. Centred inside its container: a 96 px shape art (`soft-burst` or `arch` in `secondary-container`, with a 40 px icon in `on-secondary-container`), the title in `title-large`, a one-sentence description in `body-medium` `on-surface-variant`, and the action button (tonal, or filled when it's the page's main action).
- **`compact` prop:** a horizontal layout for empty cards inside Home (a 48 px art at the start, text, then a text-button action).

### `ErrorState`, `ErrorReference`, `FormError`, `InlineBanner`
- **`InlineBanner`** (new):
  - **Tones:** `info` (`secondary-container`), `warning` (`tertiary-container`, with the `warning` icon and the word "Warning:" visually hidden), `error` (`error-container`), `success` (`success-container`).
  - **Look:** radius 16, padding 16, a leading icon, a `title-small` title, `body-medium` text, and an optional action.
  - **Uses:** the reminder sweep warning, no-device notes, the stale conflict prompt in notes.
- **`ErrorState`:** an error-tinted `EmptyState` (the `error` icon in `error-container` shape art), the same copy rules, and Retry plus Go home buttons.
- **`FormError`:** an `InlineBanner tone="error"` with `role="alert"`.

### `SaveStatus`: `src/components/ui/save-status.tsx`
- **States:** a compact status pill for autosave:
  - "Saving…": `LoadingIndicator` at 18 px;
  - "Saved": `check` icon in `success`;
  - "Not saved": `error` icon plus a **Retry** text button.
- **Semantics:** `role="status" aria-live="polite"` (the existing notes semantics are preserved).
- **Uses:** notes, and Review step saves.

### `Badge`
- **Small:** a 6 px dot.
- **Large:** 16 px tall with `label-small` text, colour `error` (M3) for notification counts. **SoleUp uses `primary`**, because counts here are neutral.
- **Uses:** the Inbox count on the Plan tab (only if the page already has the count; never add a query for it).

---

## Part G: Data display (`src/components/data/`)

| Component | Phase | Spec |
|---|---|---|
| `MetricCard` | UI-4 | `Card` with `CardHeader` (icon tile, `title-medium` label, `InfoButton`), a body slot, and a range caption (`body-small`, `on-surface-variant`, the `metricRangeLabel` output). When `metric.hasData === false` it renders `EmptyState compact` with the card's "Nothing yet" copy. Props: `{ id, title, icon, metric: Metric<unknown>, empty, todayDate, locale, children }` (the same contract as the current `MetricCard` in `home-view.tsx`, extracted) |
| `MetricInfo` / `InfoButton` | UI-4 | An `IconButton icon="info" label="How this is counted: {title}"` opening a `ResponsiveSheet` titled "How this is counted". It contains `metric.definition` (`body-large`), then a description list of **Range** and **As of** (`<time dateTime>`) using the existing `metricRangeLabel` and `metricAsOfLabel` |
| `StatNumber` | UI-4 | A numeral (`display-small` on compact, `display-medium` on medium and wider, `tabular-nums`, ROND 100) with a unit label (`title-medium` `on-surface-variant`) baseline-aligned after it, as in reference 1's "4.256 / Steps". Optionally a link: the numeral is inside the link, and the accessible name reads "3 planned for today" |
| `SegmentedPillBar` | UI-4 | `{ value: number; total: number; max?: 31; label: string }`. Renders `min(total, max)` vertical pills 6 px wide (8 px on medium and wider), 40 px tall, 4 px apart, `rounded-full`. Pills up to `floor(value)` are `primary`, a partial pill gets a `primary` fill from the bottom proportional to the fraction, and the rest are `progress-track`. When `total > max` the pills stand for proportions, and the visible caption must say the exact count. `role="img" aria-label={label}`. Fills animate up with a 20 ms stagger (`expressive-default-spatial`) on first view only (`IntersectionObserver`), not on every render |
| `WeekStrip` | UI-4 | `{ days: { date, weekdayLetter, dayOfMonth, fullLabel, href }[]; today: LocalDate; selected?: LocalDate }`. Seven `rounded-4xl` capsules 48 × 76 (56 × 84 on medium and wider) in `surface-container-lowest` with `shadow-card` (light). The weekday letter is `label-small`, and the date is `title-medium` inside a 36 px `rounded-full` circle. **Today:** capsule `primary`, letter `on-primary`, date circle `surface-container-lowest` with `on-surface` text (reference 1). **Selected but not today:** a 2 px `primary` ring. Each capsule is a `Link` with `aria-label={fullLabel}`, and today's has `aria-current="date"`. It scrolls horizontally only when narrower than 7 × 48 + 6 × 8. The days come from a new pure helper, `weekDays(today, weekStart, locale)` in `src/lib/week-strip.ts` (unit tested) |
| `Carousel` | UI-4 | M3 "multi-browse" carousel in CSS: `overflow-x: auto; scroll-snap-type: x mandatory`, items `scroll-snap-align: start`, 8 px gaps, 16 px start padding with `scroll-padding`. Items are 156 px wide (compact) and grow on medium. Previous and Next `IconButton`s appear on medium and wider (they scroll by one page). `role="region" aria-roledescription="carousel" aria-label`, and items in a list. No autoplay |
| `HabitWeekChart` | UI-9 (built early in UI-4 for Home's habit card in compact form) | Seven day pills from `HabitHistoryDay[]` with the D-19 visual language. Pill 36 × 88 (compact) or 44 × 104, `rounded-full`. Below each pill: the weekday letter (`label-small`) and date (`label-medium`). Completed days fill from the bottom to `credit`. Today is ringed. In `interactive` mode each pill is the `DayLogDialog` trigger (existing behaviour) with `aria-label={dateLabel: stateLabel}`; otherwise it's `role="img"` on the group with a text summary. A `compact` variant (Home cards) uses pills 10 × 36 without letters |
| `HabitDayCell` | UI-9 | A 44 × 44 `rounded-full` cell for the 4-week grid: the date number centred (`label-large`, `tabular-nums`) and the D-19 state look as fill or ring. The trigger for `DayLogDialog` |
| `DotMatrix` | UI-9 | The 12-week grid: weeks as rows (oldest at the top) × 7 days as columns. 28 px `rounded-sm` (8) cells, 4 px gaps, the D-19 looks without date numbers. A `label-small` weekday header row, and each row headed by `week.shortLabel`. Each cell is a button (`DayLogDialog` trigger) |
| `MilestoneArc` | UI-8 | A 180° arc (reference 2 gauge) as SVG, 200 × 112 (compact) or 240 × 132, stroke width 28 with round caps. `countable` segments (capped at 12; above 12 a continuous arc), 6° gaps. Completed segments are `primary`, open ones `progress-track`, and on hover or focus the open segments show the hatch. The centre text is "3 of 5" in `display-small` with "milestones" in `body-medium` below. `countable === 0` gives no arc: just "No milestones yet". `role="img"` with the aria-label "3 of 5 milestones completed" |
| `SplitStat` | UI-10 | Two figures side by side, split by a 1 px `outline-variant` divider: `display-small` numeral plus `body-medium` label each (reference 4's "60 Days / 27 Days") |
| `StatusChip` | UI-6 | The goal, task and habit status → `Chip type="status"` mapping (icon plus text; colours: active `secondary-container`, paused `surface-container-highest`, completed `success-container`, dropped and cancelled `surface-container-highest` with strikethrough-free text) |
| `PriorityMark` | UI-6 | Priority shown as 1–3 small ascending bars (`label-small` text "High", "Medium" or "Low" beside it on medium and wider; `aria-label` always), never red |
| `AreaChip` | UI-8 | The life-area colour dot plus name, in a `status`-sized chip using the area's container and on colours |
| `DateBadge` | UI-6 | A two-line date block (weekday `label-small`, day `title-large`) for Upcoming and Agenda day headers, today in `primary` |
| `Timeline` | UI-5 | Today's "Schedule": a vertical rail line in `outline-variant`, a 12 px time dot per item (`primary` for events, `secondary` for blocks, `tertiary` ring for "Now"), the time (`label-large` `tabular-nums`), a title link, and a kind chip. All-day items sit first in a horizontal chip row |
| `DatePicker` | UI-7 | Navigation-only month grid in a `ResponsiveSheet` or `Popover`. A header with the month and year (`title-medium`) plus previous and next `IconButton`s. A **month chip row** (reference 1: Feb · Mar · **Apr** · May as `ConnectedButtonGroup` toggle). A 7-column grid of 40 px `rounded-full` day buttons (48 px targets): today ringed, the selected day `primary`, other-month days `on-surface-variant` at 38 % with the hatch. Arrow keys move by day, PageUp/PageDown by month, Home/End go to the week's start or end, and Enter selects (the ARIA grid pattern). **It shows no events.** Used by Calendar "Go to date" |
