# SoleUp redesign: decisions

**Status:** Revision 2, 2026-10-30. The decisions are settled for implementation. Items in §5 still need the user's sign-off before the phase that depends on them.
**Scope:** The full frontend: public pages, the authenticated shell, every route, dialogs, and the loading, empty and error states.

Each decision has an ID, so code comments, PRs and handoff notes can cite it (`D-11`). To change a decision, edit it here in the same PR and say why in the handoff note.

---

## 1. What the redesign is for

SoleUp helps a person decide what matters, plan realistic next steps, follow through, and review what happened ([PRODUCT_SPEC §1](../PRODUCT_SPEC.md)). The current UI works, but every screen uses the same outlined panel, explanations get as much visual weight as the answers, the phone navigation squeezes seven items into one bar, and dense grids (Track, Review) read like spreadsheets.

The redesign should make SoleUp feel **calm, warm, clear and connected**:

- **Calm:** a soft mist background and opaque white cards, colour where it means something, and no alarms.
- **Warm:** rounded, expressive shapes, friendly type, and small moments of celebration that never turn into pressure.
- **Clear:** each screen answers one question first ("what's next?", "how is this habit going?"). Explanations stay one tap away.
- **Connected:** goals, tasks, habits, notes and reviews share one visual language, and every link between them looks the same.

## 2. Product rules the design must never break

These come from `CLAUDE.md`, `PRODUCT_SPEC.md` and ADRs 0010–0016. No visual decision overrides them.

1. **No overall score.** No life score, no percentage across habits or goals, and no gauge that adds unrelated things together. Per-goal milestone progress is fine when it reads "3 of 5 milestones" ([ADR 0010](../decisions/0010-goal-status-priority-progress.md)).
2. **No streaks, trophies, leaderboards or percentages for habits.** Consistency is a count such as "12 of 14 days" ([ADR 0014](../decisions/0014-habit-cadence-logs-consistency.md)). Reference 4's flames and trophies are rejected outright.
3. **"Nothing yet" is not 0.** `Metric.hasData === false` renders a "Nothing yet" state. It never shows a zero.
4. **Every metric keeps its definition, range and "as of"** within reach of the number: visible, or one labelled tap away (D-16, §5).
5. **No shame.** "Missed", "Earlier, not done" and "Needs a decision" use neutral colours. Red is only for errors and destructive actions. Copy never says "late", "failed" or "overdue" in an accusing tone.
6. **The user decides.** No automatic changes. Destructive actions are confirmed, and recoverable actions offer Undo.
7. **Privacy.** Search terms never go in a URL (ADR 0016). Note content never goes in logs. The redesign makes no third-party requests: no remote avatars and no CDN fonts at runtime.
8. **The backend is frozen.** No schema, migration, service, Server Action or query-logic changes. Pages read through the existing authenticated queries in `src/server/modules/**/queries.ts` (plus the metric and service reads already called from pages). If a screen needs data no query returns, **stop and propose a separate backend chunk** (D-32).
9. **URL contracts are frozen.** Every path, query parameter (`?status=`, `?range=`, `?view=&date=&span=&item=&start=&days=`, `?week=&step=`, `?goal=`, `?task=`, Plan filters) and hash anchor (`#habit-<id>`, `#today-<section>`) keeps working exactly as it does today. See [UI_AUDIT.md](UI_AUDIT.md).
10. **AI.** None is added. Nothing in the design implies AI.

## 3. Reference pattern catalogue

The five images are described in [README.md](README.md#the-reference-images). Each row is a pattern we **take**, how it maps onto SoleUp's **real data**, and what we **refuse**.

| Pattern (reference) | SoleUp use | Real data behind it | Refused |
|---|---|---|---|
| Pale sky background with opaque white cards floating above (1, 2, 3) | **Canvas mist**: a CSS gradient wash at the top of every app page, with opaque `surface-container-lowest` cards (D-09) | none (decoration) | Photographic clouds or mountains, blur behind text, gradients inside cards |
| Avatar with "Today's Habit" header and round menu button (1, 3) | **Greeting header** on Home: monogram in an expressive shape, "Good morning, {first name}", today's date; round icon buttons for Search and More | `requireUser().name`, the user's local clock | Remote OAuth photos (privacy, D-07); "Jane Cooper" sample names |
| Week strip of tall day capsules, today filled (1, 2, 3) | **Week strip** on Home, Today, and the Day/Agenda calendar on compact. Each chip links to that day's calendar view | `todayClock(zone)`, `weekStart` preference | Per-day "completion" dots (no such data) |
| Square activity tiles with 3D illustrations (1, 3) | **Habit cards carousel** on Home: shape-avatar monogram, title, weekly pill progress | `habitsSummary` → `HabitSummaryItem` | 3D emoji or illustrations (no habit icon field; licensing). Follow-up F-1 |
| "Activity Steps": big numeral, 0…target scale, row of thin progress pills, metric pills (1, 2) | **Segmented pill bar**: Today card ("3 planned for today" with chips for due and needs-a-decision); habit week progress ("2 of 3 times", one pill per expected unit) | `todayTaskCounts`, `HabitWeekProgress.done/target` | Step counts, kcal, km, minutes; any bar not backed by a count |
| "Progress Goal 78 %" semicircle gauge with hatched remainder (2, 3) | **Milestone arc** on goal detail: one arc segment per countable milestone (up to 12), filled when completed, labelled "3 of 5 milestones" | `MilestoneProgress { completed, countable }` | "Total your score", a percentage numeral, combining goals |
| "Favorite Habits" weekday bars with hatched inactive days and one highlighted day (3) | **Habit week chart** on Track: seven day pills, completed filled to the day's credit, skipped hatched, missed outlined, today ringed | `HabitHistory.weeks[].days[]` (`state`, `credit`) | "+83 %" labels, a "favourite" ranking |
| Month chip row and month grid with joined range highlights (1, 3) | **Date picker** (navigation only): calendar "Go to date", task due and plan date fields | none; it writes dates through existing forms | A month **view** of events (ADR 0012 rules out a Month view) |
| Habit list rows with icon tile, metadata and a "Start" pill (1, 3) | **Today habits list**: shape avatar, title, schedule or progress label, a one-tap **Done** filled-tonal button, and Skip in the overflow | `getTodayHabits` → `TodayHabit` | "Start" timers, locations, durations |
| Four-item bottom bar with filled active icon (1, 3) | **Navigation bar** with five items and a pill indicator (D-11) | — | — |
| Warm gradient header and greeting (4) | Rejected as a page header. The warmth moves to the **Ember tertiary** colour, used sparingly (D-18) | — | Orange as the main colour; streak copy |
| Dot-matrix heatmap texture (4) | **Dot matrix** for Track's 12-week range: 7 × 12 rounded squares, each a real day | `HabitHistory` for 12 weeks | Decorative heatmaps with no data |
| Bottom sheet with drag handle; edit form of labelled field containers; Save plus icon-button action row (4) | **Sheets** on compact (D-23). **Filled fields with a static inner label** (D-22). A **sticky action bar** in full-screen dialogs: a wide primary action, with icon buttons for secondary and destructive actions | — | Gradient buttons, "Congrats!" pop-ups for routine actions |
| Streak week row of flame circles; "60 days goal / 27 completed" split stat (4) | The **split stat** layout for count pairs (Review "Planned vs completed": planned \| completed) | `weeklySummary.plannedVersusCompleted` | Flames, goal-days counters |
| Donut ring "78 %" with legend (5) | Rejected | — | Composite percentages |
| Activity icon grid picker; slider with value bubble (5) | Rejected for now. There's no icon field (F-1). Quantity targets keep a number field with − and + steppers | — | Glossy 3D buttons, glassmorphism |
| Raised centre "+" in the bottom bar (5) | Rejected in favour of an M3 **FAB menu** above the bar, bottom right (D-12) | — | — |
| Onboarding hero with product photo and one CTA (5) | **Landing page** hero: mist background, the shape motif, one "Sign in" CTA | — | Stock photos, promises of unbuilt features |

## 4. Decisions

### Foundations

**D-01 · Material 3 Expressive, adapted for the web.** We use M3 Expressive's colour roles, tonal surfaces, type scale with emphasized styles, corner scale, shape library, spring motion, state layers and component anatomy. We change three things for the web and for SoleUp:
- keyboard, focus and screen-reader behaviour follow WCAG 2.2 AA and the ARIA practices, including where M3's Android behaviour differs;
- density is a little higher on expanded widths;
- field labels are static (D-22).

**D-02 · A fixed brand palette, not dynamic colour.** The colours come from reference 1's deep lake blue (`#2F6B93`) and are built into M3-style tonal palettes (tone = CIELAB L\*). The primary role is `#26638B` in light mode and `#98CCF9` in dark mode. There is no wallpaper-based dynamic colour: the web has no wallpaper source, and a predictable identity helps recognition. All values and contrast ratios are in [DESIGN_SYSTEM §1](DESIGN_SYSTEM.md#1-colour).

**D-03 · Our own components, on Radix and Tailwind.** We keep `radix-ui` for behaviour (dialog, dropdown menu, popover, tabs, toast, switch, checkbox, radio group, tooltip, collapsible, toggle group, scroll area) and style it with M3 tokens. Rejected:
- **`@material/web`:** maintenance mode, Lit web components that fight React 19 SSR/hydration and Tailwind, and no Expressive components.
- **MUI / Material UI:** an Emotion runtime, a large bundle, it duplicates Radix, and it styles M2/M3 rather than Expressive.

**D-04 · Google Sans Flex as the one UI typeface.** Load it with `next/font/google` (`Google_Sans_Flex`, variable, axes `wght`, `wdth`, `opsz`, `ROND`, `GRAD`; checked as available in the installed Next 16.4 font data). It is Google's Expressive brand face, and its `ROND` (roundness) axis gives Expressive emphasis without a second family. Display and headline styles use `ROND 100`. Body text uses `ROND 0` for legibility. **Geist Sans is removed.** **Geist Mono stays** for note code blocks. Fallback stack: `ui-sans-serif, system-ui, sans-serif`. Subsets: `latin`, `latin-ext`.

**D-05 · Material Symbols Rounded icons, compiled to inline SVG.** Add `@material-symbols/svg-400` (Apache-2.0) as a **devDependency** only. The script `scripts/generate-material-icons.mts` reads an allowlist (in [DESIGN_SYSTEM §9](DESIGN_SYSTEM.md#9-iconography)) of outline and `-fill` variants, and writes `src/components/icons/icon-paths.generated.ts` (committed). An `<Icon name filled size />` component renders `<svg aria-hidden>`. Rejected:
- **The icon font:** render-blocking, a multi-MB download, and a flash of ligature text.
- **Hand-drawn icons:** inconsistent strokes.
- **`lucide-react`:** not Material.

The current hand-written nav icons in `app-nav.tsx` are replaced.

**D-06 · An expressive shape library, used deliberately.** About 14 of M3 Expressive's 35 shapes are implemented as SVG path data normalized to a 0–1 box (`src/components/ui/shapes.ts`): `circle`, `square`, `slanted`, `arch`, `semicircle`, `oval`, `pill`, `triangle`, `arrow`, `fan`, `diamond`, `clam-shell`, `pentagon`, `gem`, `very-sunny`, `sunny`, `4-sided-cookie`, `6-sided-cookie`, `7-sided-cookie`, `9-sided-cookie`, `12-sided-cookie`, `4-leaf-clover`, `8-leaf-clover`, `burst`, `soft-burst`, `boom`, `soft-boom`, `flower`, `puffy`, `puffy-diamond`, `ghost-ish`, `pixel-circle`, `pixel-triangle`, `bun`, `heart`. Only the subset in DESIGN_SYSTEM §8 is built. They are used **only** for:
- identity avatars (D-07);
- the user monogram;
- empty-state art;
- the loading indicator;
- the selected-day marker;
- the Create FAB icon container on the rail;
- the celebration sheet.

Shapes never hold body text, never act as a button's only affordance, and never vary at random from render to render: each one is deterministic, chosen by hashing the item's id.

**D-07 · Identity avatars, without a schema change.** Habits, goals and the user get a `ShapeAvatar`: the first grapheme of the title, uppercased, centred in a shape.
- **Shape:** picked by a stable hash of the entity id from the identity shape set.
- **Colour, for goals:** the life area's colour when the goal has one.
- **Colour, for habits and goals without an area:** hashed into the six identity palettes (blue, teal, violet, pink, amber, green).
- **The user:** the monogram from `user.name`, in `primary-container`. We don't load the OAuth profile picture (no third-party image requests; privacy rule 7).

Follow-up **F-1** (needs an ADR and a migration, outside this track): an optional `icon` per habit and goal from a curated Material Symbols list.

**D-08 · Theme: System by default, with a per-device override.**
- **Where it lives:** Settings → Appearance offers System, Light and Dark. The choice is stored per device in `localStorage["soleup.theme"]`. Its scope matches what it is (a display preference for one device), and it avoids a schema change.
- **Before paint:** an inline `<script>` in `src/app/layout.tsx` `<head>` (about 10 lines, no external file) sets `document.documentElement.dataset.theme` before first paint. `<html suppressHydrationWarning>`.
- **Browser chrome:** `viewport.themeColor` gets the new `surface` values.
- **Light is the reference's hero look.** Dark is designed with equal care: it is not an inversion.

**D-09 · Canvas mist.** The app background is `surface`. A fixed, non-interactive layer behind content adds two soft radial gradients from `canvas-mist-top` (the primary tone 90 in light, tone 17 in dark) fading to transparent over the first 360 px. There are no image files, and no `backdrop-filter`. Cards are opaque. Under `prefers-contrast: more` the mist is removed.

**D-10 · Window size classes become Tailwind breakpoints.** M3's classes are added as named breakpoints in `@theme`:

| Class | Width | Tailwind variant |
|---|---|---|
| compact | < 600 px | (default, mobile first) |
| medium | 600–839 px | `medium:` |
| expanded | 840–1199 px | `expanded:` |
| large | 1200–1599 px | `large:` |
| extra-large | ≥ 1600 px | `xlarge:` |

The JS media queries in `time-grid-view.tsx` (`48rem`, `64rem`) move to `src/lib/breakpoints.ts`, which mirrors the CSS values. Tailwind's default `sm/md/lg/xl/2xl` stay available until UI-13, when every use is migrated and the defaults are removed (`--breakpoint-*: initial`).

### Navigation and structure

**D-11 · Navigation by size class.**

| Size class | Pattern | Destinations |
|---|---|---|
| compact | **Navigation bar**, bottom, 64 px plus the safe area. Pill indicator 56 × 32 behind the icon. Labels always shown | **Home · Plan · Goals · Track · More** |
| medium, expanded | **Collapsed navigation rail**, 96 px, left | Create FAB, then Home, Plan, Goals, Track, Notes, Review; Settings at the bottom; Search as an icon button above the FAB |
| large, extra-large | **Expanded navigation rail**, 256 px, collapsible to 96 px (the state is stored in `localStorage["soleup.rail"]`) | Same as the collapsed rail, plus labels inline, Plan's sub-pages nested under Plan, a search field, and the account row at the bottom |

**More** (compact) opens a modal bottom sheet with: Notes, Review, Search, Settings, then the user's name and **Sign out**.
- **Why five items:** Goals is half of the core loop (Goals → Today, PRODUCT_SPEC §12), so it earns a bar slot. Notes and Review are used daily or weekly, but less often than Plan and Track.
- **Rejected:** keeping all seven (51 px per item at 360 px wide, which is what's wrong today), and four with Goals hidden (revision 1).
- When the current page is in More (`/notes…`, `/review…`, `/settings`), the More item shows as active, so `aria-current` still marks the location.

**D-12 · Create through a FAB menu.**
- **compact:** a 56 px FAB (Expressive "medium" FAB in `primary-container`, `add` icon) sits bottom right, 16 px above the navigation bar. It opens an M3 **FAB menu**: **New task** (opens the existing Quick Add dialog) and **New note** (goes to `/notes/new`).
- **Rail:** a "Create" extended FAB at the top opens the same menu.
- **Shortcut:** the `Q` shortcut still opens Quick Add.
- **Page actions stay on the page.** Each page's own primary action (New goal, New habit, New event, Block time) lives in its header, not in the FAB.
- **Where the FAB is hidden:** the FAB is hidden on `/notes/*` editor routes, on Review steps, and while a full-screen dialog or the on-screen keyboard is open. On those screens it would cover content or compete with the page's main action.

**D-13 · Top app bars, compact only.**
- **Pages:** each page gets a 64 px small app bar. The title is `title-large`. The leading slot is a back arrow on detail routes and empty on top-level pages. The trailing slots hold up to 2 icon buttons (Search, then page overflow).
- **Home:** gets the **greeting header** instead (D-15, SCREENS §Home).
- **Scrolling:** the app bar is transparent over the mist at the top of the page, and switches to `surface-container` once scrolled (an effects spring).
- **Medium and wider:** no app bar. Each page renders a **page header** (D-14).

**D-14 · Page header, medium and wider.** One row with the `headline-medium` title (Expressive emphasized at large widths), an optional one-line `body-medium` supporting text, and actions aligned to the end (at most one filled button plus a tonal or text button and an overflow menu). Subnavigation sits directly below. Content is bounded: 1240 px for overviews and lists, 840 px for detail, 720 px for forms and reading (DESIGN_SYSTEM §6).

**D-15 · Plan subnavigation as M3 primary tabs.** The tabs read Today · Upcoming · Calendar · Inbox · All tasks, in that order, since Today is the daily landing. They are links in a `nav aria-label="Plan"` that only *look* like tabs. `/plan` stays the "All tasks" route (an unchanged URL contract). On compact they scroll horizontally under the app bar. On the large rail the same items are also nested under Plan. The current `PlanSubnav` is replaced.

### Data display and copy

**D-16 · Metric transparency with progressive disclosure (needs sign-off: §5-A).** Every metric card shows:
- its **label**;
- its **value** (or "Nothing yet");
- a **visible range caption** ("Today, Fri 30 Oct" or "Oct 26 – Nov 1");
- an **info icon button** labelled "How this is counted: {label}".

The button opens a popover on medium and wider, or a bottom sheet on compact, with the full `definition`, the range, and "As of {time}". The definition text comes from the `Metric` unchanged. This replaces today's always-visible paragraph and footer.

**D-17 · Allowed visualizations.** Each one must have a text equivalent, either visible or in the accessible name:

| Form | Used for | Text equivalent |
|---|---|---|
| Segmented pill bar | Habit week progress, Today counts | "2 of 3 times so far this week" |
| Week strip | Navigating dates | Each chip's `aria-label` is the full date |
| Habit week chart (7 day pills) | Track and Home habit cards | Each day's `stateLabel` |
| Dot matrix | Track, 12-week range | Each cell is a button whose label is `dateLabel: stateLabel` |
| Milestone arc | Goal detail and goal cards | "3 of 5 milestones" |
| Timeline | Today's schedule and the calendar | Times and titles as text |
| Split stat | Review's "planned vs completed" | Both numbers are text |

Forbidden: pie or donut charts, cross-entity percentages, sparklines with no axis, a decorative chart with no data.

**D-18 · Ember, the tertiary colour, is used sparingly.** The tertiary palette (from reference 4's orange, `#E2662E`, and in tone 40 `#A23F11`) is allowed only for:
- the habit **Done** confirmation morph;
- the **Review finished** celebration sheet;
- search highlights (`<mark>`, as `tertiary-container`);
- the Track identity tile in the More sheet and the rail tooltip;
- the "Now" chip on a commitment that's under way.

It is never used for errors, warnings, missed days or destructive actions.

**D-19 · Neutral visual language for habit states.** No state uses red:

| `HabitDayState` | Look |
|---|---|
| `completed` | Filled `primary`, from the bottom up to `credit`. A full fill gets a check glyph |
| `extra` | Filled `secondary-container` with a small "+" |
| `skipped` | 45° hatch in `outline-variant` and a "–" glyph |
| `missed` | 1.5 px `outline` ring, empty |
| `unlogged` | Empty, with a `surface-container-high` fill |
| `today` | 2 px `primary` ring and a bold date |
| `future` | `surface-container`, at 60 % opacity |
| `inactive` | Dotted `outline-variant` ring at 40 % opacity |
| `not_scheduled` | No container; the date is in `on-surface-variant` |

Each state also has a different glyph or pattern, so colour is never the only signal (WCAG 1.4.1).

**D-20 · Restrained celebration.**
- **Habit Done:** the icon morphs from circle to check-in-cookie (an expressive fast spatial spring) and the button changes to "Done ✓". A snackbar offers Undo.
- **Review finished:** a sheet with a soft-burst shape and "Your review is saved. It stays editable until {date}."
- That is all: no confetti, sounds, streak counts or badges. Celebration motion follows reduced-motion settings.

**D-21 · Voice and copy.** Sentence case. Plain words. Second person. No exclamation marks except "Welcome back" (none at all elsewhere). Existing copy that encodes a rule (section labels such as "Earlier, not done", and definitions) is reused word for word from `src/lib/*` constants. The Home greeting uses the first word of `user.name`, or no name if it's empty: "Good morning" (05:00–11:59), "Good afternoon" (12:00–17:59), "Good evening" (otherwise), worked out in the user's zone.

### Interaction

**D-22 · Filled fields with a static inner label.** Fields are 64 px tall containers in `surface-container-highest` with radius `large` (16 px).
- **Label:** a `label-medium` label always sits top left inside the container (no floating animation).
- **Value:** the value is `body-large` underneath.
- **Focus:** a 2 px `primary` outline.
- **Error:** a 2 px `error` outline, plus an error icon and the message below.

Supporting text sits below the container. This matches reference 4's field cards and avoids the overlap and contrast problems of floating labels. `FormField` keeps its `aria-describedby` wiring.

**D-23 · Dialogs and sheets by size class.**

| Use | compact | medium and wider |
|---|---|---|
| Create or edit forms (goal, task, habit, event, block, area) | **Full-screen dialog**: an app bar with ✕, the title, and a **Save** text button; the content scrolls; destructive actions sit at the bottom | Centred dialog, max 560 px wide (720 px for event/block), radius `extra-large` 28 px |
| Pickers, menus with explanations, the metric info, More | **Modal bottom sheet**: drag handle, radius 28 px at the top, max 90 dvh, a close button always present, and swipe-down to dismiss as an extra option | Popover or menu anchored to its trigger |
| Confirmations (delete, discard) | Basic dialog, 312 px minimum | Basic dialog |

Every dialog and sheet uses Radix Dialog for focus trap, Escape, focus restore and the accessible title. A sheet's drag gesture is never the only way to close it.

**D-24 · Grouped lists are the default way to show collections.** Tasks, notes, goals, habits in lists, devices and review history are M3 Expressive **segmented list groups**:
- each item is its own `surface-container-lowest` container with a 2 px gap between items;
- the outer corners of the group use `large` (16 px) and the inner corners `extra-small` (4 px);
- an item's leading slot holds a checkbox, an avatar or an icon. Its trailing slot holds a meta label and at most one icon button.

Cards are kept for summaries and heterogeneous content. Lists are never nested inside bordered boxes.

**D-25 · Motion.** Use the M3 springs from DESIGN_SYSTEM §7, rendered as CSS `linear()` easings:
- **Expressive spatial springs:** small components that move or change shape (the nav indicator, FAB menu, chips, switch, button press morph, checkbox, day cells);
- **Standard spatial springs:** large containers (sheets, dialogs, expanding sections, the rail);
- **Effects springs:** colour and opacity.

There are no route transitions in this track (the View Transitions API is deferred to a later decision). Under `prefers-reduced-motion: reduce`, spatial movement becomes a 0 ms jump with a `fast-effects` fade, and the loading indicator stops morphing and pulses its opacity.

**D-26 · Loading.**
- **Route and section loading:** skeletons that mirror the final layout (same cards and rows) on `surface-container-high` with a gentle shimmer (none under reduced motion).
- **Actions slower than 400 ms:** the M3 Expressive **loading indicator** (a morphing shape, 48 px; 24 px inside buttons).
- **Pending buttons:** keep their width and label, and set `aria-busy`.

**D-27 · Feedback.**
- **Confirmations** use snackbars (the existing `toast()` API, restyled): `inverse-surface`, 4 s, or 8 s with an action.
- **Placement:** on compact they sit 16 px above the navigation bar (and above the FAB). On medium and wider they sit bottom left after the rail.
- **Errors that need action** stay inline, using `FormError`, `ErrorState` and field errors.

**D-28 · Accessibility baseline: WCAG 2.2 AA.**
- **Touch targets:** at least 48 × 48 px for primary controls (M3). For dense grids the absolute floor is 24 × 24 px (WCAG 2.5.8): only Track's 12-week dot matrix, which uses 28 px cells.
- **Focus indicator:** a 3 px outline in `secondary`, offset 2 px; inset on bars and rails.
- **Contrast:** checked for every pair (DESIGN_SYSTEM §1.4).
- **Semantics:** every icon-only button has an `aria-label`; landmarks are `header`, `nav`, `main`; one `h1` per page; headings in order.
- **Live status:** live regions for save status and snackbars.

### Engineering

**D-29 · Tests follow the redesign; they don't stop it.**
- **E2E selectors:** E2E tests use roles and names. A phase that changes visible names updates the affected specs in the same PR, and must not weaken an assertion of behaviour.
- **Accessibility checks:** each phase adds `expectNoSeriousViolations` for its routes in **light and dark** (`page.emulateMedia({ colorScheme })`) and at **390 × 844 and 1280 × 800**.
- **Visual capture:** a capture spec (`tests/e2e/visual-capture.spec.ts`, tagged `@visual`, excluded from the default run) saves screenshots to `test-results/visual/` for the handoff. It asserts nothing, so screenshots from the Windows dev machine and the Linux CI don't have to match.

**D-30 · A dev-only component gallery.** `/dev/ui` lives at `src/app/(dev)/dev/ui/page.tsx` and calls `notFound()` when `process.env.NODE_ENV === "production"`. It shows every component in every state, in both themes side by side. It is not added to the nav or to `APP_ROUTE_SEGMENTS` (it needs no session).

**D-31 · Dependencies.** The only planned addition is `@material-symbols/svg-400` (devDependency, D-05). The carousel, sheets, charts, shapes and date picker are built with CSS (scroll-snap, `clip-path`, SVG) on Radix primitives. Any other dependency needs a written reason in the phase handoff and the user's approval first.

**D-32 · Data access.** Server Components call the same query functions the pages call today. Allowed: new **pure** presentation helpers in `src/lib/` (for example `weekDays(today, weekStart)` or `greetingFor(hour)`), each with unit tests. Not allowed without the user's approval: new queries, changes to existing query results, schema changes, new Server Actions, new route handlers.

**D-33 · Notes uses a list–detail layout on large screens and wider.** `src/app/(app)/notes/layout.tsx` renders the notes list pane (360 px) beside `children` at `large:` and wider. Below `large:` the layout passes `children` through unchanged. `listNotes` is wrapped in React `cache()` inside the layout and page, so a request reads it once. Search and Archived stay full pages, with the pane hidden.

**D-34 · The calendar keeps its views.** Agenda, Week, Day, By area and Timeline stay. FullCalendar stays and is restyled through `calendar-theme.css` with the new roles. No Month view (ADR 0012): the month grid exists only inside the date picker.

**D-35 · Ordering with the feature chunks.** Run UI-1 to UI-3 (tokens, components, shell) **before** chunk 8.5 Tags: they touch every page, and running both at once would conflict. After UI-3, feature chunks may interleave with UI phases, but any new UI must use the new components. Tags UI then follows SCREENS §Notes.

## 5. Product-doc amendments that need the user's sign-off

The redesign changes described behaviour in `PRODUCT_SPEC.md` in these places. The owning phase updates the doc **after** the user confirms. If the user declines, the phase keeps the current always-visible behaviour, styled as quiet supporting text.

| ID | Current text | Proposed change | Phase |
|---|---|---|---|
| 5-A | §8: "Each card shows its definition, range and the time it was worked out"; §9: "Show the time range and definition for every metric." | Each card shows its range; the definition and "as of" are one labelled tap away ("How this is counted") | UI-4 (Home), UI-10 (Review) |
| 5-B | §8 (chunk 6.5): Track shows "always visible beside it, how it is counted" | The figure is visible, and the definition is behind the habit card's "How this is counted" button | UI-9 |
| 5-C | §7: the navigation destinations list | Add: "On phones the bar shows Home, Plan, Goals, Track and More; More holds Notes, Review, Search and Settings." | UI-3 |
| 5-D | (none) | Settings → Appearance: System, Light or Dark, per device | UI-12 |
| 5-E | README "UI shell and components" | Rewritten for the new shell, components, icons and the gallery | UI-3, UI-13 |

## 6. Follow-ups outside this track

- **F-1** An optional `icon` for habits and goals (an ADR, a migration and a picker). Afterwards the avatar shows the icon instead of the monogram.
- **F-2** Route-level transitions with the View Transitions API, once Next's support is stable for this project's version.
- **F-3** A "Completed today" count on Home, which needs a new metric in `metrics/home.ts`. This would make the Today card a real progress bar.
- **F-4** Per-day markers on the Home week strip (events, deadlines), which needs a new read query.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Restyling everything breaks many E2E specs at once | Legacy token aliases keep unredesigned pages coherent (UI-1). One route group per phase. Selectors are updated deliberately in each phase (D-29) |
| Colour hashing gives two neighbouring habits the same look | The shape *and* the colour are hashed independently (14 × 6 combinations), the title is always shown, and identity never carries meaning |
| Expressive motion feels busy | Springs are limited to the components in D-25. Large sections never animate in on render. Reduced motion is respected |
| Mist and white surfaces look washed out in sunlight | Text contrast is ≥ 7:1 for body text on all surfaces (DESIGN_SYSTEM §1.4). The mist sits only at the top of the page |
| The five-item bar plus a FAB crowds 360 px phones | The FAB sits above the bar, not in it. Each bar item is 72 px at 360 px. Labels are short, single words |
| Google Sans Flex's variable axes add weight | A single variable file with `latin` and `latin-ext` subsets, `display: swap`, and size-adjusted fallback metrics from `next/font` |
