# SoleUp UI implementation plan

**Status:** Revision 2, 2026-10-30. Replaces revision 1 (commit `c76c3a5`).
**Scope:** A full frontend redesign in Material 3 Expressive, delivered as phases UI-0 to UI-13.
**Source of truth for design:**
- [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) (the D-xx decisions and the product rules in §2);
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (tokens);
- [COMPONENTS.md](COMPONENTS.md);
- [SCREENS.md](SCREENS.md);
- [UI_AUDIT.md](UI_AUDIT.md) (current routes and contracts).

---

## 1. How this track works

- **One phase = one branch = one PR.** A phase takes roughly half a day to two days. If one grows beyond that, split it (UI-2 is already split into 2a and 2b) and record the split in the tracker.
- **The agent session protocol in [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md#agent-session-protocol) applies in full**: read, preconditions, waiting for the previous PR (2a), start, scope, the subagent rule, verify, close-out and the "Never" list. The only differences are:
  - **Branch:** `chunk/ui-<n>-<slug>` (for example `chunk/ui-4-home`).
  - **Previous PR:** the previous **UI phase's** PR. UI-1's predecessor is the PR for `ui-0.0-planning` (this document set).
  - **Progress and handoff:** recorded in **this file** (§4 tracker, §7 handoff notes), not in the product progress log. If a phase changes product docs (`PRODUCT_SPEC.md`, README), say so in its handoff.
  - **Commits:** `chunk ui-<n>: <imperative summary>`, at most 72 characters, with a body covering what changed and why, the decisions, the **checks run with their real results**, and what's unverified or left as a follow-up. **No `Co-Authored-By` trailers and no Claude or Anthropic attribution** (`CLAUDE.md`).
  - **PR body:** the same sections as the product chunks (Summary, Changes, Decisions and deviations, Checks run, Unverified and follow-ups, Manual steps), plus **Screenshots**: links or paths to the `@visual` captures at 390 × 844 and 1280 × 800 in light and dark for the routes the phase touched.
- **Ordering with product chunks (D-35):** UI-1 to UI-3 run before chunk 8.5. After UI-3, product chunks may interleave, and any new UI they add uses the new components.
- **Decision gates:** a phase that depends on a §5 amendment in DESIGN_DECISIONS (5-A to 5-E) **asks the user first**, with a recommendation. If the user declines, the phase uses the fallback written beside that amendment.

## 2. Rules for every phase

1. **The backend is frozen** (D-32 and product rule 8). No changes to `src/server/db/schema/**`, migrations, `src/server/modules/**/{service,actions,queries,validation}.ts`, `src/server/auth/**`, route handlers, or the domain libraries `src/lib/{dates,task-list,calendar-views,agenda,area-columns,area-timeline,upcoming,review-flow,today,schedule,recurrence*,reminders,quiet-hours,search,priorities,goals,milestones,tasks,time-blocks,weekly-reviews}.ts` and `src/lib/habits/**`. **Additive pure helpers** with unit tests are allowed (for example `src/lib/week-strip.ts`, `src/lib/greeting.ts`, `isCommitmentUnderWay`). If a screen needs data no query returns, **stop and tell the user**.
2. **URL contracts are frozen.** Every path, query parameter and hash anchor in [UI_AUDIT.md](UI_AUDIT.md) keeps its meaning, default and invalid-value fallback. Navigation that changes state still goes through the same URL builders (`trackHref`, `reviewHref`, `calendar-views.ts` and `task-list.ts` builders, …).
3. **Product rules** (DESIGN_DECISIONS §2): no scores, no streaks, `hasData` separate from 0, definitions reachable, no shame, privacy.
4. **Read the Next.js docs first.** `AGENTS.md` says this Next.js has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing code: fonts, CSS, layouts, Server and Client Components, loading and error files, `cacheComponents`, and forms or Server Actions as relevant. Heed deprecations.
5. **Tokens only.** No raw hex values, Tailwind palette colours or arbitrary values that duplicate a token in new or rewritten code. Use the role utilities and the type and shape tokens.
6. **Component reuse.** Build on the `src/components/ui` and `src/components/data` components. Don't create page-local copies of a button, card, chip or list item. If a needed variant is missing, add it to the shared component, with a gallery entry and a unit test.
7. **Deletion.** Remove a presentation component only after `rg` shows no imports and no test depends on it. Keep domain hooks (`use-habit-log.ts`, `use-note-autosave.ts`, `use-picker-search.ts`, `useStepSave`, `use-refresh-on-new-day.ts`, `search-handoff.ts`) unless the phase rewrites them with the same behaviour and tests.
8. **Accessibility** (D-28): keyboard paths for every pointer interaction, visible focus, a label for every control, one `h1` per page, landmarks, live regions for async status, reduced motion, and 48 px targets.
9. **Tests are part of done.** This replaces revision 1's "don't add tests", which conflicted with `CLAUDE.md`.
   - **Unit tests** for new pure helpers and components (static markup, the existing pattern).
   - **E2E tests:** update affected specs deliberately when visible names change. **Never delete an assertion of behaviour to get green.** If a behaviour assertion fails, the redesign broke something: fix the code.
   - **Accessibility:** add `expectNoSeriousViolations` for each touched route in light **and** dark, at 390 × 844 **and** 1280 × 800.
   - **Visual capture:** update the `@visual` capture list (§5) for the phase's routes.
10. **Finish-line commands** (real results go in the commit, PR and handoff):
    ```bash
    pnpm verify          # format:check + lint + typecheck + test:unit + test:integration
    pnpm build
    pnpm test:e2e        # needs `docker compose up -d`
    pnpm test:visual     # from UI-1 on: saves screenshots to test-results/visual/
    ```
    From UI-13 on, also run `pnpm lint:tokens`.
11. **Manual checks the agent can't do** (a real phone, installed PWA, screen reader): list them under "Manual steps for the user" and mark them unverified unless the user confirms.

## 3. Shared engineering decisions

- **Server and client split.** Pages stay Server Components that call the queries. Interactive pieces are client islands (`"use client"`) that receive serialisable props. Shell parts that need `usePathname` (`NavigationBar`, `NavigationRail`, `PlanTabs`) are client components inside the server layout.
- **Theme script** (UI-1). `src/lib/theme.ts` exports:
  - `THEME_STORAGE_KEY = "soleup.theme"`;
  - `type ThemeChoice = "system" | "light" | "dark"`;
  - `resolveTheme(choice, prefersDark)`;
  - `themeInitScript()`, a string for an inline `<script>` that reads `localStorage` inside `try/catch`, sets `data-theme` only for `light` or `dark`, and does nothing for `system` (CSS media queries handle that).

  `layout.tsx` renders it in `<head>` with `<html suppressHydrationWarning>`. Unit-test `resolveTheme` and that the script string has no template injection. The Settings toggle (UI-12) writes the key and sets `dataset.theme` straight away.
- **Breakpoints in JS.** `src/lib/breakpoints.ts` exports `BREAKPOINTS = { medium: 600, expanded: 840, large: 1200, xlarge: 1600 }` and `mediaQuery(name)`. CSS `@theme` uses the same numbers. A unit test reads `globals.css` and checks they match.
- **`useMediaQuery` / `useKeyboardOpen` / `useScrolled`** live in `src/components/hooks/`, as client-only hooks with `useSyncExternalStore` (copy the pattern in `time-grid-view.tsx`).
- **Icons pipeline.** `pnpm icons:generate` runs `node scripts/generate-material-icons.mts` and writes `src/components/icons/icon-paths.generated.ts`, which is committed and starts with a "generated, do not edit" header. Adding an icon means editing the allowlist and regenerating. CI doesn't regenerate.
- **Palette script.** `scripts/generate-palette.mts` (committed in UI-1) prints the token table and the contrast report in DESIGN_SYSTEM §1. It documents where the values came from; it isn't wired into the build.
- **Legacy aliases** (DESIGN_SYSTEM §12) exist from UI-1 to UI-13 so pages not yet redesigned stay coherent.

## 4. UI phase tracker

Statuses: `todo`, `in progress`, `done`, `blocked`, `skipped` (user only). Update only your own row.

| Phase | Scope | Status | Branch | Date | Note |
|---|---|---|---|---|---|
| UI-0 | Planning: decisions, system, components, screens, audit, plan, prompts | in progress | ui-0.0-planning | 2026-10-30 | Revision 2 docs. Set to done when its PR merges |
| UI-1 | Foundations: tokens, type, theme, icons, shapes, motion, breakpoints | todo | | | |
| UI-2a | Components: actions, selection, inputs, gallery | todo | | | |
| UI-2b | Components: containment, navigation primitives, feedback, states | todo | | | |
| UI-3 | App shell: nav bar, rail, app bar, FAB menu, More, page structure | todo | | | Needs sign-off 5-C |
| UI-4 | Home | todo | | | Needs sign-off 5-A |
| UI-5 | Plan: Today, task row, timeline, Today habits | todo | | | |
| UI-6 | Plan: All tasks, Upcoming, Inbox, task dialog, Quick Add | todo | | | |
| UI-7 | Calendar and event/block dialogs | todo | | | |
| UI-8 | Goals, goal detail, life areas, archived goals | todo | | | |
| UI-9 | Track, habit form, archived habits | todo | | | Needs sign-off 5-B |
| UI-10 | Weekly review, history, detail | todo | | | Uses 5-A |
| UI-11 | Notes, editor, search (and tags if 8.5 shipped) | todo | | | |
| UI-12 | Settings plus Appearance, landing, sign-in, errors, not-found, loading | todo | | | Needs sign-off 5-D |
| UI-13 | Consistency, cleanup, token lint, accessibility sweep, docs | todo | | | |

## 5. Visual capture harness (built in UI-1, extended by each phase)

- **Spec:** `tests/e2e/visual-capture.spec.ts`. Each test signs in through the existing test sign-in helper, seeds a **representative dataset** through the helpers in `tests/e2e/helpers.ts` (goals with milestones, tasks in every Today section, habits of all three cadences with mixed logs, notes, a started review), and then for each `{route, state}` × `{390x844, 1280x800}` × `{light, dark}` calls `page.emulateMedia({ colorScheme })`, sets the viewport, and runs `page.screenshot({ path: "test-results/visual/<phase>/<route>-<w>-<theme>.png", fullPage: true })`.
- **No assertions on pixels** (D-29).
- **It doesn't run by default.** The spec calls `test.skip(!process.env.SOLEUP_VISUAL, "visual capture only")`. `pnpm test:visual` runs `node scripts/run-visual.mts`, which sets `SOLEUP_VISUAL=1` and spawns `playwright test tests/e2e/visual-capture.spec.ts` so it works in both PowerShell and bash.
- **Output:** `/test-results/` is in `.gitignore`, so the screenshots are never committed. Attach them to the PR or reference their paths in the handoff.

## 6. Phases

Each phase lists **Read**, **Build**, **Tests**, **Done when** and **Out of scope**. File paths are guides, not contracts.

### UI-0: Planning (this document set)
**Delivered:** README, DESIGN_DECISIONS, DESIGN_SYSTEM, COMPONENTS, SCREENS, the UI_AUDIT corrections, this plan, and UI_AGENT_PROMPTS. **Done when** the user has reviewed it and the PR has merged.

### UI-1: Foundations
**Read:** DESIGN_SYSTEM (all of it), DESIGN_DECISIONS D-01 to D-10, D-25 and D-28. Next docs on `next/font`, CSS and `layout.tsx` metadata/viewport. `globals.css`, `layout.tsx`, `calendar-theme.css`, `cx.ts`, `life-area-colors.tsx`, `time-grid-view.tsx`.

**Build:**
1. **`globals.css`.**
   - Add `--md-*` roles for light (`:root`) and dark (both the `prefers-color-scheme` block and the `[data-theme="dark"]` block, kept identical, as today), the area variables, `--md-progress-track`, `--md-focus` and `--md-canvas-mist`.
   - In `@theme inline`, map them to `--color-<role>` (with `--color-canvas` for M3 surface).
   - Add the type scale as `--text-<token>` with `--text-<token>--line-height`, `--letter-spacing` and `--font-weight` (Tailwind v4 font-size tuple variables), plus the emphasized variants as utilities.
   - Add the radius scale (`--radius-xs` … `--radius-4xl`), the shadows (`--shadow-card`, `--shadow-1` … `--shadow-5`), and the easing and duration tokens. Tailwind v4 generates `ease-*` from `--ease-*`. If `duration-*` has no theme namespace, use `duration-(--duration-<token>)` and document that in the file.
   - Add the breakpoints `--breakpoint-medium/expanded/large/xlarge`.
   - Add `.state-layer`, `.morph-press`, `.morph-select`, `.bg-hatch`, the canvas mist layer (`body::before` or a layout element; fixed, `pointer-events: none`, `z-index: -1`), and the reduced-motion and `prefers-contrast: more` blocks.
   - Turn the legacy variables into aliases (DESIGN_SYSTEM §12). Keep the `.note-content` rules, retuned to the new type tokens.
2. **Fonts.** In `layout.tsx`, replace Geist with `Google_Sans_Flex` (variable, `axes: ["ROND", "opsz", "wdth", "GRAD"]` as the installed `next/font` supports, `subsets: ["latin", "latin-ext"]`, `display: "swap"`, `variable: "--font-sans"`). Keep `Geist_Mono` as `--font-mono`. Set `font-variation-settings` per type token for ROND. Check that the font is self-hosted at build time (no runtime Google request).
3. **Theme.** Add `src/lib/theme.ts` and the init script in `<head>` (§3). Update `viewport.themeColor` to the `canvas` values (`#F5FAFF` / `#0F1419`).
4. **Icons.**
   - Add the devDependency `@material-symbols/svg-400` (check the version and Apache-2.0 licence with `pnpm view`, and pin it exactly, as the repo pins every dependency).
   - Write `scripts/generate-material-icons.mts` using the allowlist in DESIGN_SYSTEM §9. Read the package's `rounded/<name>.svg` and `rounded/<name>-fill.svg` (check the folder layout first), extract the `d` attribute, and fail on a missing name.
   - Add the `icons:generate` script, the generated file, `src/components/icons/icon.tsx`, and an `IconName` type.
5. **Shapes.** Add `src/components/ui/shapes.ts` (DESIGN_SYSTEM §8 formulas, 120 points each) and `src/lib/identity.ts` (FNV-1a hash → `{ shape, palette }`).
6. **Breakpoints and hooks.** Add `src/lib/breakpoints.ts`, move `time-grid-view.tsx`'s queries onto it (same pixel values for now, so behaviour doesn't change), and add `src/components/hooks/use-media-query.ts`.
7. **Calendar and life areas.**
   - `calendar-theme.css`: remap to M3 roles (§12).
   - `life-area-colors.tsx`: swatches use `bg-area-<name>-dot`; remove the Tailwind palette classes.
8. **Focus.** `cx.ts`: change `focusRing` to the 3 px `focus` outline.
9. **Scripts.** Commit `scripts/generate-palette.mts` (the generator behind DESIGN_SYSTEM §1). Add the visual harness (§5): `scripts/run-visual.mts`, `tests/e2e/visual-capture.spec.ts` covering `/home`, `/plan/today`, `/track`, `/review` and `/settings`, and the `test:visual` script.

**Tests:**
- **Unit:** `theme.test.ts` (`resolveTheme`, script string), `shapes.test.ts` (every shape has 120 points so they can morph; the paths are deterministic), `identity.test.ts` (stable output for fixed ids; the distribution covers every shape and palette over 1,000 random UUIDs), `icon.test.tsx` (`aria-hidden`, viewBox), `breakpoints.test.ts` (the CSS and JS values match).
- **E2E:** new `theme.spec.ts`. With `localStorage["soleup.theme"] = "dark"` set by `addInitScript`, `<html data-theme="dark">` is present on the first response's DOM before hydration. `colorScheme: dark` with no stored value gives no `data-theme`. Every existing spec passes unchanged.

**Done when:** the whole app renders in the new palette, font and radii in both themes, with no layout breakage on any route (check the capture set); the finish-line commands pass; and there are no raw hex values outside `globals.css`, `calendar-theme.css` and `theme.ts`.

**Out of scope:** changing component markup beyond class tokens, and any page layout.

### UI-2a: Components, part 1 (actions, selection, inputs, gallery)
**Read:** COMPONENTS Parts A–C, D-22, D-28 and D-30. Radix docs for ToggleGroup, Checkbox, Switch, RadioGroup and Tooltip (the installed `radix-ui` 1.7 entry points).

**Build:**
- `Button` / `buttonClass` (with the legacy aliases), `IconButton` / `IconLink`, `Fab` / `FabMenu`, `ConnectedButtonGroup` (link and toggle modes), `Chip` (all five types), `Checkbox` (square and round), `Switch` + `SwitchRow`, `RadioGroup` + `RadioRow`, `NumberStepper`, `Tabs` (link and panel modes).
- Restyle `Input`, `Textarea` and `Select` through `fieldClass` and `FormField` (the static inner label), and `ShapeAvatar`.
- The `/dev/ui` gallery (`src/app/(dev)/dev/ui/page.tsx` and a `layout.tsx` with no app shell, a theme toggle and two side-by-side columns forced to `data-theme="light"` and `"dark"` with scoped wrappers). It returns `notFound()` in production. Document it in the README.

**Tests:**
- **Unit** for each component: roles, names, `aria-pressed` / `aria-checked` / `aria-current`, `disabled`, `aria-busy` while pending, the legacy alias mapping, and the FormField label inside the container still linked through `htmlFor` and `aria-describedby`.
- **E2E** `dev-gallery.spec.ts`: the gallery renders, axe passes in both themes, Tab reaches every control, the FAB menu opens with Enter and closes with Escape with focus returning, and the connected group in link mode marks `aria-current`. Also a test that `/dev/ui` returns 404 when `NODE_ENV=production`: assert the guard function in a unit test instead if E2E can't run production.
- Existing specs still pass. If a form's accessible names changed through FormField, fix the component rather than the tests: labels must keep their text.

**Done when:** the gallery shows every Part A–C component in every state in both themes; pages that use `Button` and fields pick up the new look without code changes; the finish-line commands pass.

### UI-2b: Components, part 2 (containment, navigation primitives, feedback, states)
**Read:** COMPONENTS Parts D–F, D-23 to D-27.

**Build:**
- `Card` + `CardHeader`, `ListGroup` / `ListItem`, `Disclosure`.
- Rewrite `DialogContent`; add `FormDialog` (adapting by size class through `useMediaQuery("medium")`, server-safe: render the dialog variant until mounted); restyle `ConfirmDialog`.
- `BottomSheet` / `ResponsiveSheet`, `Menu`, `Popover`, `Tooltip`.
- Restyle `toast()` / `Toaster` as snackbars (placement per D-27, using the UI-3 bar height constant; until UI-3 lands, keep today's offsets).
- `LoadingIndicator`, `Skeleton` / `LoadingState`, `EmptyState` (with `art` and `compact`), `ErrorState`, `InlineBanner`, `FormError` (on `InlineBanner`), `SaveStatus`, `Badge`, and the `PageContainer` and `PageHeader` shells (the shell wiring itself is UI-3).
- Gallery entries for everything above.

**Tests:**
- **Unit:** `ListItem` corner classes by position; `EmptyState` heading level; `InlineBanner` roles; `LoadingIndicator` role and label; `SaveStatus` live region.
- **E2E** (gallery): `FormDialog` is full screen at 390 px and centred at 1280 px; Escape closes it and focus returns; the sheet close button works and Escape closes it; the menu works by keyboard; a snackbar is announced (`role="status"`); axe passes in both themes.
- Existing dialog and toast specs pass: `ConfirmDialog`'s behaviour of staying open until the action settles is covered in `goal-archive.spec.ts`, `life-areas.spec.ts` and others.

**Done when:** every Part D–F component is in the gallery in every state, the existing dialogs re-skin without behaviour changes, and the finish-line commands pass.

### UI-3: App shell and navigation
**Read:** SCREENS §0, COMPONENTS Part E, D-11 to D-15, D-27. `(app)/layout.tsx`, `app-nav.tsx`, `nav-items.ts`, `quick-add.tsx`, `shell-search.tsx`, `search-handoff.ts`, `sign-out-button.tsx`, `plan-subnav.tsx`, `shell.spec.ts`, `nav-items.test.ts`.
**Gate:** ask for sign-off on amendment **5-C** (the five-item bar plus More). Fallback if declined: a seven-item rail on every size class except compact, where the bar shows Home, Plan, Track, Notes and More, as revision 1 had it. Record the answer.

**Build:**
- Rewrite `(app)/layout.tsx`:
  - the skip link;
  - `NavigationRail` (`hidden medium:flex`);
  - a content column holding `<main id="main" tabIndex={-1}>`;
  - `NavigationBar` and `Fab` (compact);
  - `Toaster`;
  - the mist layer;
  - the time-zone gate (no nav, as before), restyled per SCREENS §0.
- Rail collapse state per D-11 (`localStorage["soleup.rail"]`, read after mount; the default expanded at `large:` gives no layout shift, because CSS decides the first paint and the stored "collapsed" applies after hydration with no width animation on that first apply).
- `nav-items.ts`:
  - keep `NAV_ITEMS` (every destination) and `isNavItemActive`;
  - add `BAR_ITEMS` (Home, Plan, Goals, Track) and `MORE_ITEMS` (Notes, Review, Search → `/notes/search`, Settings);
  - add `PLAN_TAB_ITEMS` (D-15 order);
  - replace the icon names with Material Symbol names.
- `MoreSheet`, `TopAppBar`, `PageHeader` / `PageContainer` wired in as page building blocks; `PlanTabs` replaces `PlanSubnav` on the Plan pages (only the subnav, not the page bodies).
- Move Quick Add's trigger into the FAB menu and the rail Create. The `Q` shortcut and the dialog stay unchanged.
- Restyle `ShellSearch` for the expanded rail, and an icon button that links to `/notes/search` in the collapsed rail and the compact app bars. In-memory handoff unchanged.
- `SignOutButton` placement in the rail account row and the More sheet.
- Hide the FAB per D-12. Add `useKeyboardOpen` and hide the bar and FAB when the keyboard is open.
- Every existing page gets at least a `TopAppBar` (compact) and a `PageHeader` (medium and wider) with its current title, so no page is left without a title bar. The page bodies keep their old markup until their phase. Apply `PageContainer` widths.
- Update `PRODUCT_SPEC.md` §7 (5-C) and the README "UI shell and components" section.

**Tests:**
- **Unit:** `nav-items.test.ts` (`BAR_ITEMS ∪ MORE_ITEMS ⊇` every `NAV_ITEMS` href; active matching for More's group).
- **E2E** `shell.spec.ts`:
  - at 390 px, every destination is reachable (the bar and More), `aria-current` is right on a sub-page, More opens a dialog with a title, and Escape closes it with focus returning to More;
  - at 1280 px, the rail shows every destination and Plan's children when on Plan, and collapse and expand persist across a reload;
  - the FAB menu creates a task through Quick Add, and `Q` still works;
  - the skip link focuses `main`;
  - the time-zone gate shows no nav;
  - axe on `/home` in both themes at both sizes.
- Update any spec that clicked the old "Add task" header button or the seven-item bar.

**Done when:** every route is reachable on compact and large; no content sits under the bar, FAB or keyboard; the finish-line commands pass; the captures show the new shell.

### UI-4: Home
**Read:** SCREENS §1, COMPONENTS Part G (MetricCard, MetricInfo, StatNumber, SegmentedPillBar, WeekStrip, Carousel, HabitWeekChart compact), D-16, D-17, D-21. PRODUCT_SPEC §8–9, `home/page.tsx`, `home-view.tsx`, `metric-range.ts`, `metrics/home.ts` (types only), `home.spec.ts`, `home-habits.spec.ts`.
**Gate:** ask for sign-off on **5-A**. Fallback: MetricCard shows the definition as a visible `body-small` line under the value, plus the range caption, and puts only "As of" behind the info button.

**Build:**
- `src/components/data/*` for the listed components.
- Pure helpers `src/lib/greeting.ts` (`greetingFor(now, timeZone)`) and `src/lib/week-strip.ts` (`weekDays`), plus `isCommitmentUnderWay` in `src/lib/schedule.ts` (additive).
- Rebuild `home-view.tsx` (split it into `home/greeting.tsx`, `home/next-commitment-card.tsx`, `home/today-card.tsx`, `home/habit-carousel.tsx`, `home/goals-card.tsx`, `home/deadlines-card.tsx`) and `home/page.tsx` (pass `user.name` and `weekStart`).
- `home/loading` skeleton and `error.tsx` restyle.
- Keep `RefreshOnNewDay`.
- Update PRODUCT_SPEC §8–9 per the 5-A answer.

**Tests:**
- **Unit:** `greeting.test.ts` (boundaries at 05:00, 12:00 and 18:00 in a non-UTC zone), `week-strip.test.ts` (each week start, DST weeks, locale letters), `schedule.test.ts` additions (under way vs `commitmentWhenLabel`), and component markup tests (StatNumber accessible name; SegmentedPillBar `role="img"` and label; MetricCard "Nothing yet" when `hasData` is false).
- **E2E:** update `home.spec.ts` and `home-habits.spec.ts` (every count still links to the same href; "Nothing yet" states; the habit title links to `/track#habit-…`; the info sheet shows the definition, range and as-of; the week strip links to the Day view) plus axe in both themes and sizes.

**Done when:** SCREENS §1 is met at 390 px and 1280 px in both themes; every link and anchor contract holds; there's no score; the finish-line commands pass.

### UI-5: Plan, Today
**Read:** SCREENS §2, ADR 0011, `today-view.tsx`, `today-timeline.tsx`, `add-to-today.tsx`, `today-habits.tsx`, `use-habit-log.ts`, `src/lib/today.ts`, `today.spec.ts`, `schedule.spec.ts`, `habit-logging.spec.ts`.

**Build:**
- `TaskRow` (in `src/components/tasks/task-row.tsx`), shared with UI-6: the round complete checkbox, the supporting line, the overflow menu with the existing per-section actions, and inline `xs` actions at medium and wider.
- `Timeline` (data) replacing the presentation of `today-timeline.tsx`.
- Rebuild `today-view.tsx`: sections, hints and anchors, "Add to today" as a `ResponsiveSheet`, the large supporting pane, and the `WeekStrip` (compact).
- Restyle `today-habits.tsx` rows: `ShapeAvatar`, the one-tap Done (tonal xs) with the D-20 morph, and Skip and Change amount in the overflow, with Undo unchanged.
- Restyle `task-schedule-editor` popovers into `ResponsiveSheet`.
- Today's loading skeleton and error restyle.

**Tests:** update `today.spec.ts`, `schedule.spec.ts` and `habit-logging.spec.ts` for names (behaviour assertions unchanged); add axe in both themes and sizes; check keyboard-only completion and rescheduling of a task.

**Done when:** SCREENS §2 holds; every Today action works by keyboard and pointer; the finish-line commands pass.

### UI-6: Plan, task lists, task dialog, Quick Add
**Read:** SCREENS §3, `plan/page.tsx`, `plan-filters.tsx`, `plan-task-list.tsx`, `upcoming-view.tsx`, `inbox-view.tsx`, `task-form.tsx`, `task-parent-select.tsx`, `task-blocks.tsx`, `task-notes.tsx`, `delete-task-dialog.tsx`, `quick-add.tsx`, `reminder-select.tsx`, `reminder-status.tsx`, `src/lib/task-list.ts`, `src/lib/upcoming.ts`, and the plan, upcoming, inbox and journey specs.

**Build:** filter chips with sheets (URL serialisation through `task-list.ts`); the list rebuild on `TaskRow`; Upcoming day groups with `DateBadge` and the days group in link mode; Inbox selection plus the contextual action bar; the task dialog on `FormDialog` (field order per SCREENS); `StatusChip`, `PriorityMark` and `DateBadge`; Quick Add as a sheet on compact.

**Tests:** update the specs for names; add an E2E test that applies two filters through the chips, reloads, and finds the same URL and results; axe; keyboard multi-select in Inbox.

**Done when:** every URL filter round-trips, every task action is reachable, and the finish-line commands pass.

### UI-7: Calendar
**Read:** SCREENS §4, ADR 0012, ADR 0013 (reminder fields), `plan/calendar/page.tsx`, every file in `src/components/calendar/`, `src/lib/{calendar-views,agenda,area-columns,area-timeline,event-form,block-form}.ts`, and the calendar specs. The README's calendar paragraphs.

**Build:**
- The responsive calendar header (view group in link mode, date navigation, `DatePicker` "Go to date", action buttons).
- The compact `WeekStrip`.
- Restyle the FullCalendar wrapper and `calendar-theme.css` (item cards per SCREENS), `agenda-view`, `time-grid-view` and its task panel, `area-columns-view` and `area-timeline-view` (area colours and `AreaChip` headings), and `view-nav`.
- Dialogs on `FormDialog`, with Repeat as a `Disclosure`, the scope chooser as `RadioRow`s, and warnings as `InlineBanner`.
- Do not change the item-placement maths or any keyboard handler logic.

**Tests:** every calendar spec passes, with names updated if needed; add axe for each view in both themes; check the date picker by keyboard (arrows, PageUp/PageDown, Enter navigates to `?date=`); check that at 390 px Week falls back to Day as before.

**Done when:** all five views and every dialog match SCREENS §4 in both themes and the finish-line commands pass.

### UI-8: Goals and life areas
**Read:** SCREENS §5, ADR 0010, `goals-view.tsx`, `goal-detail.tsx`, `goal-form.tsx`, `goal-tasks.tsx`, `milestone-list.tsx`, `delete-goal-dialog.tsx`, `archived-goals-view.tsx`, `life-areas-manager.tsx`, `life-area-form.tsx`, `starter-life-areas-offer.tsx`, `linked-notes.tsx`, and the goal, milestone and life-area specs.

**Build:** the status group in link mode, goal cards with a mini `MilestoneArc`, the detail page with its supporting pane and full-size `MilestoneArc`, `AreaChip`, history in a `Disclosure`, the milestone list on `ListGroup` (Up and Down buttons kept), the area manager with the swatch radio picker, and archived goals.

**Tests:** update the specs for names; add `MilestoneArc` unit tests (segments for 0, 1, 5 and 13 countable; label text); axe on the list and detail in both themes and sizes.

**Done when:** SCREENS §5 holds, every status action, milestone action and delete-count confirmation behaves as before, and the finish-line commands pass.

### UI-9: Track and habits
**Read:** SCREENS §6, ADR 0014, `track-view.tsx`, `habit-strip.tsx`, `habit-form.tsx`, `delete-habit-dialog.tsx`, `archived-habits-view.tsx`, `use-habit-log.ts`, `src/lib/habits/*` (read only), `habits/queries.ts` (types), and the habits, habit-logging and track-history specs.
**Gate:** ask for sign-off on **5-B**. Fallback: the definition stays visible under the figure as `body-small`.

**Build:**
- The range group in link mode, the compact legend, habit cards, `HabitWeekChart` (week), the 4-week grid of `HabitDayCell`, and `DotMatrix` (12 weeks).
- `DayLogDialog` as a `ResponsiveSheet` with `RadioRow` and `NumberStepper`.
- The habit form on `FormDialog` (cadence `RadioRow`, day chips, steppers).
- The archived list.
- `scroll-margin-top` on the `#habit-<id>` anchors.
- Update PRODUCT_SPEC §8 (chunk 6.5 text) per the 5-B answer.

**Tests:** update the specs; add an E2E test that Home's habit link lands with the card visible below the app bar; a keyboard test that logs a past active day in each range layout; and checks that non-loggable days are not buttons. Unit-test the D-19 state → class and glyph mapping. Axe in both themes and sizes.

**Done when:** SCREENS §6 holds, there are no streaks or percentages, and the finish-line commands pass.

### UI-10: Weekly review
**Read:** SCREENS §7, ADR 0015, `review/page.tsx`, `review/history/**`, every file in `src/components/reviews/`, `src/lib/review-flow.ts`, `metrics/review.ts` (types), and the review and review-history specs.

**Build:** `ReviewHeader` as a hero card, the stepper (compact progress plus the expanded step rail), Look back on `MetricCard` and `SplitStat`, Reflect cards with `SaveStatus`, Adjust lists, the Priorities picker and ordered list with its counter, the sticky action bar, the Finish celebration sheet, read-only and history pages, and the detail page with a delete confirmation.

**Tests:** update the specs; add an E2E test that changing steps through the stepper saves (the existing save-on-leave assertions) and focuses the step heading; the celebration sheet appears once after Finish and closes with Escape; axe in both themes and sizes.

**Done when:** SCREENS §7 holds, the lock and save semantics are unchanged, and the finish-line commands pass.

### UI-11: Notes and search
**Read:** SCREENS §8, ADR 0016, every file in `src/components/notes/` and `src/components/search/`, `notes/**` routes, `globals.css` `.note-content`, and the notes, note-links and search specs. Check the product progress log for 8.5's status.

**Build:**
- `notes/layout.tsx` list–detail (D-33, with `cache()`).
- The list on `ListGroup`, and the editor page (borderless title, floating toolbar docking above the keyboard, `SaveStatus`, "Linked to" `input` chips and picker sheet, the conflict banner).
- The archived note view and the archived list.
- The search page (`SearchBar`, grouped results, `<mark>` styling).
- Tag UI only if 8.5 has merged.

**Tests:** update the specs; add an E2E test of the list–detail layout at 1280 px (opening a note keeps the list pane and marks it selected); the toolbar is reachable by keyboard with correct `aria-pressed`; search terms are not in the URL after searching (already asserted; keep it); axe in both themes and sizes.

**Done when:** SCREENS §8 holds, the autosave, conflict, leave guard and privacy contracts are intact, and the finish-line commands pass.

### UI-12: Settings, appearance, public and system pages
**Read:** SCREENS §9–10, ADRs 0007 and 0013, `settings/page.tsx`, `preferences-form.tsx`, `reminder-settings-form.tsx`, `push-notifications.tsx`, `install-help.tsx`, `src/app/page.tsx`, `sign-in/page.tsx`, `sign-in-buttons.tsx`, `src/app/{error,not-found,loading}.tsx`, every route `error.tsx` and `not-found.tsx`, and the preferences, reminders, push-devices, pwa, auth and errors specs.
**Gate:** ask for sign-off on **5-D** (Appearance). Fallback: no Appearance section; theme follows the system only.

**Build:** the Settings layout (index and sections), the Appearance toggle (`src/components/preferences/appearance-setting.tsx`, client, using `theme.ts`), the restyled forms (`SwitchRow`s, time fields, `InlineBanner`s), the devices `ListGroup`, the install `Disclosure`s, the landing page, the sign-in card, the error, not-found and loading screens, and the time-zone gate polish if not done in UI-3. Update PRODUCT_SPEC (5-D).

**Tests:** update the specs; add an E2E test that choosing Dark sets `data-theme="dark"` immediately and after a reload, and System removes it; each Settings section saves independently (the existing assertions); axe on the landing page, sign-in, settings, not-found and error pages in both themes and sizes.

**Done when:** SCREENS §9–10 hold and the finish-line commands pass.

### UI-13: Consistency, cleanup and accessibility sweep
**Read:** everything in `docs/ui/`, then the captures from every phase.

**Build:**
- Walk every route in UI_AUDIT at 360, 390, 768, 1024, 1280 and 1600 px wide in both themes (the capture spec widened for this phase), and fix inconsistencies using the shared components.
- Remove the legacy aliases, legacy utilities, Tailwind default breakpoints, the `--fs-*` scale, dead components (`app-nav.tsx`, `plan-subnav.tsx`, the old metric card, and others found by `rg`), and Button and size alias values.
- Add `pnpm lint:tokens` (`scripts/lint-tokens.mts`) and include it in `pnpm verify`.
- Update the README "UI shell and components" section, `docs/ARCHITECTURE.md` if it describes the UI layer, and this plan's tracker.
- Run a keyboard walkthrough of the core journeys: Goals → Today, log a habit, run a review, write a note, change a setting.
- Spot-check with a screen reader if available, otherwise list it as a manual step.

**Tests:** the full finish-line set plus `pnpm lint:tokens`, axe on **every** authenticated route in both themes at both sizes (one parametrised spec, `a11y-sweep.spec.ts`), and the journey spec passing.

**Done when:** no legacy tokens remain, every route passes axe in both themes, and the final handoff lists anything still unverified (real-device PWA, screen reader).

## 7. Handoff notes

Append one note per phase, newest last. Template:

```markdown
### UI-<n>: <title> (<date>)
- **Branch / PR:** chunk/ui-<n>-<slug>, #<pr>
- **Routes and components:** created / rewritten / deleted (paths)
- **Data paths consumed:** query and action functions used (unchanged)
- **Contracts kept:** URLs, anchors, behaviours checked, and how
- **Decisions and deviations:** D-xx followed or changed (and the DESIGN_DECISIONS edit), gate answers (5-x)
- **Checks run:** each command with its real result
- **Screenshots:** test-results/visual/ui-<n>/… (or PR attachments)
- **Accessibility:** axe results, keyboard walkthrough notes, known issues
- **Unverified:** for example real phone, screen reader
- **Follow-ups:** for the next phases, or F-x
```

### UI-0: Planning (2026-10-30)
- **Branch:** ui-0.0-planning. **PR:** not opened yet.
- **Delivered:** revision 2 of `docs/ui/`: README, DESIGN_DECISIONS, DESIGN_SYSTEM, COMPONENTS, SCREENS, UI_AUDIT corrections (8.4 Search shipped; Notes error boundary; hash contracts), this plan, and UI_AGENT_PROMPTS.
- **How values were checked:**
  - M3 motion springs, corner scale, and navigation bar and rail sizes were checked against Google's `androidx` Compose Material 3 token sources.
  - The colour roles were generated from the reference seeds, with WCAG contrast measured for every text and container pair (DESIGN_SYSTEM §1.4).
  - Google Sans Flex's availability, with its ROND axis, was confirmed in the installed `next/font` data.
  - `@material-symbols/svg-400` 0.48.2 (Apache-2.0) was confirmed on npm.
- **Open for the user:** sign-off on amendments 5-A to 5-D (asked at UI-3, 4, 9 and 12); ordering with chunk 8.5 (D-35).
- **Checks run:** docs only. No code changed, so no test suite was run.
