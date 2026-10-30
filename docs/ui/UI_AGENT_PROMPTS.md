# SoleUp UI redesign: agent prompts

Paste one prompt per session, in order. Each prompt points the agent to its phase in [UI_IMPLEMENTATION_PLAN.md](UI_IMPLEMENTATION_PLAN.md). The plan's §1 adapts the repository's **Agent session protocol** ([`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md#agent-session-protocol)) to this track: one phase is one branch (`chunk/ui-<n>-<slug>`) and one PR, the previous UI phase's PR must merge first (working untracked while it's pending), and the tracker and handoff notes live in the UI plan.

You can start the next session as soon as the previous one has opened its PR. Phases UI-3, UI-4, UI-9 and UI-12 begin with a **sign-off question** (DESIGN_DECISIONS §5). The agent asks you, with its recommendation, before writing code.

Every prompt ends with the same two lines as the product prompts: the subagent rule and a finish line.

---

## Shared preamble (already included in each prompt below)

> Read `CLAUDE.md`, `AGENTS.md`, then `docs/ui/README.md` and, in `docs/ui/UI_IMPLEMENTATION_PLAN.md`, §1–§3, your phase in §6, the §4 tracker and every §7 handoff note. Then read the documents your phase names. Follow the Agent session protocol in `docs/IMPLEMENTATION_PLAN.md` with the changes in UI plan §1. Before writing code, read the relevant guide in `node_modules/next/dist/docs/`. The backend is frozen (UI plan §2.1); if a screen needs data no query returns, stop and ask. Keep every URL, query parameter and anchor contract in `docs/ui/UI_AUDIT.md`. Use only design tokens and the shared components. Product rules: no scores, no streaks, "Nothing yet" is not 0, definitions stay reachable, no shaming copy. Tests are part of done: update specs deliberately, never delete a behaviour assertion, and add axe checks in light and dark at 390×844 and 1280×800. Commit as `chunk ui-<n>: <summary>` with a descriptive body (changes, decisions, real check results, unverified items). No Co-Authored-By or Claude/Anthropic attribution in commits or PRs.

---

### UI-1: Foundations
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, and in docs/ui/UI_IMPLEMENTATION_PLAN.md §1–§3, phase UI-1 in §6, the §4 tracker and the §7 handoffs. Then read docs/ui/DESIGN_SYSTEM.md in full and DESIGN_DECISIONS D-01–D-10, D-25, D-28. Follow the Agent session protocol in docs/IMPLEMENTATION_PLAN.md with the UI plan §1 changes; the previous PR is the one for branch ui-0.0-planning. Read the Next.js guides in node_modules/next/dist/docs/ for next/font, CSS and root layout metadata/viewport before coding.

Build UI-1 only:
(1) globals.css. Add every --md-* role exactly as in DESIGN_SYSTEM §1.2 for light, the prefers-color-scheme dark block and [data-theme="dark"] (keep both dark blocks identical), the life-area variables (§1.3), progress-track, focus and canvas-mist. Map them in @theme inline to --color-<role>, using `canvas` for M3 surface. Add the §2 type scale with emphasized variants, the §3 radius scale, §5 shadows and state layers, the §7 easing/duration tokens (exact linear() strings), the §6 breakpoints medium/expanded/large/xlarge, the .state-layer/.morph-press/.morph-select/.bg-hatch utilities, the canvas mist layer, and the reduced-motion and prefers-contrast blocks. Turn the legacy variables into aliases (§12) so every page re-skins without markup changes.
(2) Replace Geist Sans with Google Sans Flex from next/font/google (variable, ROND/opsz/wdth/GRAD axes the installed font data supports, latin + latin-ext, display swap, --font-sans). Keep Geist Mono.
(3) Add src/lib/theme.ts (THEME_STORAGE_KEY "soleup.theme", resolveTheme, themeInitScript) and render the inline script in <head> with <html suppressHydrationWarning>. Set viewport.themeColor to #F5FAFF / #0F1419.
(4) Add the devDependency @material-symbols/svg-400, pinned exactly after checking the version and licence with `pnpm view`. Add scripts/generate-material-icons.mts for the DESIGN_SYSTEM §9 allowlist: check the package's folder layout first, and fail loudly on a missing name, listing the closest matches. Add the `icons:generate` script, the committed generated paths file, and an Icon component.
(5) Add src/components/ui/shapes.ts (§8 formulas, 120 points each, 64 for sunny resampled to 120 so every shape can morph) and src/lib/identity.ts (FNV-1a → shape + palette).
(6) Add src/lib/breakpoints.ts and use-media-query, and move time-grid-view.tsx's queries onto them with the same pixel values.
(7) Remap calendar-theme.css to M3 roles. Move life-area swatches to the area variables.
(8) Change focusRing in cx.ts to the 3 px focus outline.
(9) Commit scripts/generate-palette.mts reproducing DESIGN_SYSTEM §1 (role table and contrast report).
(10) Add the visual capture harness (UI plan §5): scripts/run-visual.mts, tests/e2e/visual-capture.spec.ts for /home, /plan/today, /track, /review and /settings with seeded data, and the test:visual script.
No page layout changes in this phase.

Tests: unit tests for theme.ts, shapes (point counts, determinism), identity (stability, distribution), Icon markup, and breakpoints (the CSS and JS values match). A new tests/e2e/theme.spec.ts checking data-theme is set before hydration from localStorage, and absent for system. Every existing spec must still pass.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, every route renders in the new palette and font in both themes with no layout breakage (checked in the captures), no raw hex values exist outside globals.css, calendar-theme.css and theme.ts, and the protocol close-out is complete (tracker row, handoff note with real results, PR with screenshots).
```

### UI-2a: Components, part 1
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-2a, the tracker and every handoff note. Then read docs/ui/COMPONENTS.md Parts A–C and DESIGN_DECISIONS D-03, D-22, D-28 and D-30, and the installed radix-ui entry points for ToggleGroup, Checkbox, Switch, RadioGroup and Tooltip. Follow the session protocol with the UI plan §1 changes. Read the Next.js guides on Server and Client Components and route groups before coding.

Build UI-2a only:
- Rewrite Button/buttonClass with the variants filled, tonal, outlined, text, elevated, danger and danger-text; sizes xs/s/m; icon, trailingIcon, pending and fullWidth. Keep the legacy aliases primary→filled, secondary→outlined, ghost→text, sm→xs, md→s so existing callers keep working.
- Add IconButton/IconLink (aria-label required, tooltip on medium+), Fab/FabMenu on Radix DropdownMenu with staggered pill items, and ConnectedButtonGroup (link mode with aria-current; toggle mode on Radix ToggleGroup).
- Add Chip in all five types, Checkbox (square and round), Switch + SwitchRow, RadioGroup + RadioRow, NumberStepper, Tabs (link and panel modes), and ShapeAvatar.
- Restyle Input/Textarea/Select via fieldClass and FormField into the static-inner-label filled field (D-22), keeping the label/hint/error wiring and every existing prop.
- Add the dev-only gallery at src/app/(dev)/dev/ui (notFound() in production, its own minimal layout, light and dark columns side by side) with every component in every state. Note it in the README.
Exact sizes, colours, radii and motion come from COMPONENTS.md and DESIGN_SYSTEM.md: don't improvise values.

Tests: a unit markup test per component (roles, names, aria-pressed/checked/current, disabled, aria-busy, alias mapping, label-to-control wiring). A new tests/e2e/dev-gallery.spec.ts: axe in both themes, Tab reaches every control, the FAB menu opens with Enter, closes with Escape and returns focus, and the link-mode group marks aria-current. Existing specs must pass with labels unchanged; fix components, not tests, if a label broke.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once the gallery shows every Part A–C component in every state in both themes, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-2b: Components, part 2
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-2b, the tracker and every handoff note. Then read docs/ui/COMPONENTS.md Parts D–F and DESIGN_DECISIONS D-23 to D-27, plus the installed radix-ui Dialog, Popover, DropdownMenu, Collapsible and Toast entry points. Follow the session protocol with the UI plan §1 changes.

Build UI-2b only:
- Card + CardHeader (default, hero, tonal, outlined), ListGroup/ListItem (segmented corners, stretched-link rows, selected state), and Disclosure (grid-rows animation).
- Rewrite DialogContent, keeping its props and its onCloseAutoFocus support. Add FormDialog: full screen with an app bar and Save on compact, a centred dialog on medium+, and server-safe until mounted. Restyle ConfirmDialog, keeping its stay-open-until-settled behaviour.
- BottomSheet/ResponsiveSheet (drag handle plus close button plus Escape; drag is never the only way to close), Menu, Popover and Tooltip.
- The toast()/Toaster snackbar restyle, with the same API.
- LoadingIndicator (a shape-morph keyframes loop on 120-point paths, role="progressbar", reduced-motion pulse), Skeleton/LoadingState, EmptyState (art, compact), ErrorState, InlineBanner, FormError on InlineBanner, SaveStatus (role="status"), Badge, PageContainer and PageHeader.
- A gallery entry for each one.
Don't wire the shell yet (that's UI-3).

Tests: unit tests (ListItem corner classes by position, EmptyState heading level, InlineBanner roles, LoadingIndicator role/label, SaveStatus live region). Gallery E2E: FormDialog is full screen at 390 px and centred at 1280 px, Escape restores focus, the sheet closes by button and by Escape, the menu works by keyboard, snackbars are announced, and axe passes in both themes. Every existing dialog/toast behaviour spec still passes.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once every Part D–F component is in the gallery in every state, the existing dialogs re-skin with unchanged behaviour, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-3: App shell and navigation
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-3, the tracker and every handoff note. Then read docs/ui/SCREENS.md §0, COMPONENTS.md Part E, DESIGN_DECISIONS D-11 to D-15 and D-27, and the current src/app/(app)/layout.tsx, src/components/shell/*, quick-add.tsx, shell-search.tsx, search-handoff.ts, sign-out-button.tsx, plan-subnav.tsx, tests/e2e/shell.spec.ts and nav-items.test.ts. Read the Next.js guides on layouts, linking/navigation and client components before coding.

FIRST, before any code: ask the user to sign off amendment 5-C (phone bar Home · Plan · Goals · Track · More, with More holding Notes, Review, Search and Settings). Recommend accepting it, and give the fallback from the UI plan. Record the answer in your handoff.

Build UI-3 only:
- Rewrite the (app) layout with the skip link, NavigationRail (medium+; collapsed 96 px; expanded 256 px by default at large, collapsible, stored in localStorage "soleup.rail" with no first-paint shift), a single <main id="main" tabIndex={-1}>, NavigationBar + FAB menu (compact), the Toaster, the canvas mist, and the time-zone gate with no nav.
- nav-items.ts: add BAR_ITEMS, MORE_ITEMS and PLAN_TAB_ITEMS (Today, Upcoming, Calendar, Inbox, All tasks) and Material Symbol icon names. Keep NAV_ITEMS and isNavItemActive semantics.
- Add MoreSheet (destinations plus account and Sign out), TopAppBar (scroll tint via a sentinel), PageHeader and PageContainer on every existing page with its current title (page bodies unchanged), and PlanTabs replacing PlanSubnav.
- Move Quick Add's trigger into the FAB menu and the rail Create, keeping Q and the dialog. Restyle ShellSearch for the expanded rail, and add search icon links elsewhere (terms are still handed over in memory, never in the URL).
- Hide the FAB per D-12, and hide the bar and FAB while the keyboard is open.
- Update PRODUCT_SPEC §7 per the 5-C answer and the README "UI shell and components" section.

Tests: update nav-items.test.ts (the bar plus More cover every destination). Rewrite tests/e2e/shell.spec.ts for:
- at 390 px: every destination reachable, aria-current on sub-pages, More as a titled dialog closing with Escape and returning focus;
- at 1280 px: every rail destination plus Plan's children, and rail collapse persisting across a reload;
- the FAB menu creating a task, and Q still working;
- the skip link focusing main, and the time-zone gate with no nav;
- axe in both themes and sizes.
Update other specs only where they used the old header button or bar.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once every route is reachable at 390 px and 1280 px, nothing is hidden under the bar, FAB or keyboard, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-4: Home
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-4, the tracker and every handoff note. Then read docs/ui/SCREENS.md §1, COMPONENTS.md Part G (MetricCard, MetricInfo, StatNumber, SegmentedPillBar, WeekStrip, Carousel, HabitWeekChart compact), DESIGN_DECISIONS D-16, D-17 and D-21, PRODUCT_SPEC §8–9, home/page.tsx, home-view.tsx, metric-range.ts, the types in metrics/home.ts, and tests/e2e/home*.spec.ts. Read the Next.js guides on Server Components, loading and error files before coding.

FIRST: ask the user to sign off amendment 5-A (each metric shows its range; the definition and "as of" sit behind a labelled "How this is counted" button). Recommend accepting it, and give the fallback.

Build UI-4 only, using the same six metric calls the page makes today plus user.name and weekStart:
- the greeting app bar (compact) / greeting header (medium+);
- the WeekStrip linking to the calendar Day view through the existing URL builder;
- the Next commitment hero card (kind chip; Now chip from a new pure isCommitmentUnderWay that mirrors commitmentWhenLabel);
- the Today card (StatNumber "planned for today" plus metric chips for due and needs-a-decision, linked to /plan/today#today-<section>);
- the habit Carousel (ShapeAvatar, SegmentedPillBar from thisWeek.done/target, weekProgressFigure, and the "Last 4 weeks: " consistency line; the title links to /track#habit-<id>);
- the Goals-without-a-next-action card (first 3, then a Disclosure, keeping id="goals-without-next-action");
- the Deadlines card (→ /plan?due=next7);
- range captions plus InfoButton on every card;
- "Nothing yet" (hasData false) as EmptyState compact with the current copy and links;
- the large 8/4 grid layout, a page skeleton and a restyled error.
Add pure helpers src/lib/greeting.ts and src/lib/week-strip.ts. Keep RefreshOnNewDay. No score, no combined habit number. Update PRODUCT_SPEC §8–9 per the 5-A answer.

Tests: unit tests for greeting (boundaries in a non-UTC zone), week-strip (each week start, DST, locale), isCommitmentUnderWay, and the component markup. Update home.spec.ts and home-habits.spec.ts: every link target unchanged, Nothing-yet states, the info sheet showing definition, range and as-of, week strip links. Axe in both themes and sizes. Add Home states (empty, populated) to the visual capture.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once SCREENS §1 is met at 390 px and 1280 px in both themes, every link and anchor contract holds, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-5: Plan, Today
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-5, the tracker and every handoff note. Then read docs/ui/SCREENS.md §2, ADR 0011, today-view.tsx, today-timeline.tsx, add-to-today.tsx, task-schedule-editor.tsx, today-habits.tsx, use-habit-log.ts, src/lib/today.ts, and tests/e2e/{today,schedule,habit-logging}.spec.ts.

Build UI-5 only:
- src/components/tasks/task-row.tsx (round complete checkbox labelled "Complete {title}", title opening the task dialog, supporting line with parent, due, planned, estimate and PriorityMark, an overflow menu with the section's existing actions, and inline xs actions at medium+), shared later by UI-6.
- The Timeline data component replacing today-timeline's presentation.
- Rebuild today-view.tsx. Render sections in TODAY_SECTIONS order, with Planned always shown and the others only when non-empty, keeping the today-<section> anchors, labels, hints and plannedSummary. "Add to today" is the Planned section's action, in a ResponsiveSheet. Use the large supporting pane (Schedule and Habits on the right) and the compact WeekStrip.
- Restyle the Today habit rows (ShapeAvatar, one-tap Done with the D-20 morph, Skip and Change amount in the overflow, Undo snackbar unchanged).
- Move the schedule editor popovers into ResponsiveSheet. Add the skeleton and the error restyle.
Calm copy, no red. No new task rules.

Tests: update the three specs for names only (behaviour assertions unchanged). Add a keyboard-only test that completes a task and gives one a new date. Axe in both themes and sizes. Add /plan/today states to the visual capture.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once SCREENS §2 holds, every Today action works by keyboard and pointer, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-6: Plan, task lists, task dialog, Quick Add
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-6, the tracker and every handoff note. Then read docs/ui/SCREENS.md §3, plan/page.tsx, plan/upcoming, plan/inbox, plan-filters.tsx, plan-task-list.tsx, upcoming-view.tsx, inbox-view.tsx, task-form.tsx, task-parent-select.tsx, task-blocks.tsx, task-notes.tsx, delete-task-dialog.tsx, quick-add.tsx, reminder-select.tsx, reminder-status.tsx, src/lib/task-list.ts, src/lib/upcoming.ts, and the plan, upcoming, inbox and journey specs.

Build UI-6 only:
- /plan filter chips with sheets, serialising through src/lib/task-list.ts so every URL stays identical, plus active filter chips and Clear filters.
- Lists on TaskRow.
- Upcoming day groups with DateBadge and the 7/14/30 ConnectedButtonGroup in link mode (?days= parser unchanged; empty days not rendered).
- Inbox multi-select with the contextual action bar (the existing bulk plan-today and assign-to-goal actions).
- The task dialog on FormDialog, in SCREENS field order, with the Time blocks and Linked notes sections and Delete in the footer, keeping the confirmation copy.
- StatusChip, PriorityMark and DateBadge.
- Quick Add as a sheet on compact and a 480 px dialog on medium+.

Tests: update the specs for names. Add an E2E test that applies two filters via the chips, reloads, and gets the same URL and results. Add a keyboard multi-select test in Inbox. Axe in both themes and sizes. Add /plan, /plan/upcoming and /plan/inbox to the visual capture.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once every URL filter round-trips, every task action is reachable, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-7: Calendar
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-7, the tracker and every handoff note. Then read docs/ui/SCREENS.md §4, ADR 0012, ADR 0013, the README calendar paragraphs, plan/calendar/page.tsx, every file in src/components/calendar/, src/lib/{calendar-views,agenda,area-columns,area-timeline,event-form,block-form}.ts, and the calendar, agenda, week-day, area-columns, area-timeline and time-blocks specs.

Build UI-7 only:
- The responsive calendar header: date navigation, a date label button opening the navigation-only DatePicker (month chip row plus an ARIA grid: arrows, PageUp/PageDown, Home/End, Enter navigates to ?date=), a view ConnectedButtonGroup in link mode, and New event / Block time / Agenda days.
- The compact WeekStrip on Day and Agenda.
- Restyle calendar-theme.css and every view's item cards per SCREENS §4 (events in primary-container, blocks in secondary-container, dashed deadlines, a tertiary now line, area colours with AreaChip headings).
- Event, block, move, delete and scope dialogs on FormDialog, with Repeat as a Disclosure, scope as RadioRows and warnings as InlineBanner.
Do NOT change placement maths, keyboard handlers, the onCloseAutoFocus focus return, the dayLink semantics or any URL parameter. Week still falls back to Day below the same width.

Tests: every calendar spec passes (names updated only where needed). Add a DatePicker keyboard E2E test, and axe for each view in both themes and sizes. Check the Week→Day fallback at 390 px. Add the calendar views to the visual capture.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once all five views and every dialog match SCREENS §4 in both themes, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-8: Goals and life areas
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-8, the tracker and every handoff note. Then read docs/ui/SCREENS.md §5, ADR 0010, goals-view.tsx, goal-detail.tsx, goal-form.tsx, goal-tasks.tsx, milestone-list.tsx, delete-goal-dialog.tsx, archived-goals-view.tsx, everything in src/components/life-areas/, linked-notes.tsx, and the goals, goal-detail, goal-tasks, milestones, goal-archive and life-areas specs.

Build UI-8 only:
- /goals: a status ConnectedButtonGroup in link mode (?status= with counts), AreaChip group headings, and goal cards (ShapeAvatar in the area colour, reason, mini MilestoneArc with "x of y milestones", target date, stretched title link, overflow status actions with their current copy) in a 1/2/3-column grid, plus empty states.
- /goals/[goalId]: the header (avatar, h1, StatusChip, AreaChip, target), the Why hero card, Next action as a TaskRow, a full MilestoneArc with MILESTONE_PROGRESS_HELP behind info, milestones on ListGroup (Up/Down kept), task groups, Notes, History in a Disclosure, and the supporting pane at expanded+.
- /goals/areas: the starter offer as a tonal card, the area ListGroup with reorder buttons, and the area form with a swatch RadioGroup labelled by colour name.
- /goals/archived: rows with Restore and an overflow Delete.
Every status transition, the progress maths, the delete-count confirmations and not-found stay as they are.

Tests: update the six specs for names. Add MilestoneArc unit tests (0, 1, 5 and 13 countable; label). Axe on the list, detail, areas and archived pages in both themes and sizes. Add them to the visual capture.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once SCREENS §5 holds, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-9: Track and habits
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-9, the tracker and every handoff note. Then read docs/ui/SCREENS.md §6, DESIGN_DECISIONS D-17 and D-19, ADR 0014, track-view.tsx, habit-strip.tsx, habit-form.tsx, delete-habit-dialog.tsx, archived-habits-view.tsx, use-habit-log.ts, src/lib/habits/* (read only), the types in habits/queries.ts, and the habits, habit-logging and track-history specs.

FIRST: ask the user to sign off amendment 5-B (the habit figure stays visible, and its definition moves behind the card's "How this is counted" button). Recommend accepting it, and give the fallback.

Build UI-9 only:
- The range ConnectedButtonGroup in link mode via trackHref, with rangeDatesLabel and a compact legend explaining each D-19 state once.
- Habit cards (ShapeAvatar, cadenceLabel, targetLabel, goal link, figure, progressLabel, InfoButton with definition, an overflow menu with Edit, Pause/Resume, Archive and Delete…), keeping id="habit-<id>" with a scroll-margin that clears the app bar.
- Range layouts: week → HabitWeekChart, 4w → a 4×7 HabitDayCell grid with row labels moving above the rows below 380 px, 12w → DotMatrix.
- Non-loggable days are not buttons.
- DayLogDialog as a ResponsiveSheet (RadioRow Done/Skip/Clear; NumberStepper plus a "Full target" shortcut for quantity habits).
- The habit form on FormDialog (measure toggle on create only, a cadence RadioRow, day chips honouring week start, steppers, the "applies from this week" InlineBanner).
- Archived habits.
No streaks, percentages or totals. Every figure and label string is used exactly as the query returns it. Update PRODUCT_SPEC §8 per the 5-B answer.

Tests: update the three specs. Add E2E tests that Home's habit link lands with the card visible below the app bar, that a past active day can be logged by keyboard in each range layout, and that non-loggable days aren't focusable buttons. Unit-test the state→class/glyph mapping. Axe in both themes and sizes. Add /track in each range to the visual capture.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once SCREENS §6 holds, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-10: Weekly review
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-10, the tracker and every handoff note. Then read docs/ui/SCREENS.md §7, DESIGN_DECISIONS D-16 and D-20, ADR 0015, review/page.tsx, review/history/**, everything in src/components/reviews/, src/lib/review-flow.ts, the types in metrics/review.ts, and the review and review-history specs. The 5-A answer recorded in the UI-4 handoff applies to the Look back metrics.

Build UI-10 only:
- The ReviewHeader hero (week span, open-until or closed, finished status, other-week link) with Past reviews in the overflow.
- The stepper: "Step n of 4" plus a 4-segment bar on compact, and a step rail with aria-current="step" at expanded+, its links going through reviewHref.
- Look back on MetricCard, using SplitStat for planned vs completed and per-habit rows for the habits figure.
- Reflect as three cards with textareas, the single "Everything here is optional." line, and SaveStatus.
- Adjust as grouped lists with per-row actions and consequences spelled out (no primary button per row).
- Priorities as a filtered picker plus an ordered list with Up/Down/remove and an "n of 10" counter that disables adds at 10.
- A sticky Back/Next/Finish bar.
- The Finish celebration sheet (soft-burst in tertiary-container, "Your review is saved", editable-until date), shown once.
- The read-only review with an info banner, history rows and the detail page with Edit (only while open) and a confirmed Delete.
Keep ?week=&step=, save-on-leave for every in-app navigation, focus moving to the step heading, input kept on error, finishing with nothing filled, and the period lock.

Tests: update both specs. Add E2E tests that a stepper navigation saves and focuses the heading, and that the celebration sheet appears once and closes with Escape. Axe in both themes and sizes. Add the review steps, history and detail to the visual capture.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once SCREENS §7 holds, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-11: Notes and search
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-11, the tracker and every handoff note. Then read docs/ui/SCREENS.md §8, DESIGN_DECISIONS D-33, ADR 0016, everything in src/components/notes/ and src/components/search/, the notes/** routes, the .note-content CSS, and the notes, note-links and search specs. Check the product progress log: build tag UI only if chunk 8.5 has merged.

Build UI-11 only:
- src/app/(app)/notes/layout.tsx with the list–detail layout at large+ (a 360 px list pane with the selected item marked; listNotes wrapped in React cache() so a request reads it once), passing children through unchanged below large.
- The notes list on ListGroup (title or a muted "Untitled", 2-line preview, updatedLabel).
- The editor: a borderless title field with an sr-only label; the M3 floating toolbar (40 px IconButtons, aria-pressed toggles, sticky, docked above the keyboard on compact); SaveStatus in the header; Archive and Delete in the overflow; "Linked to" as input chips with an accessible unlink and a picker ResponsiveSheet; the conflict InlineBanner that keeps the local text; and the "Will link to" preview for ?goal=/?task=.
- The archived note view and archived list.
- The search page: a 56 px rounded SearchBar focused on load, three grouped result sections with counts, <mark> in tertiary-container through Highlighted, the existing empty and common-words copy.
- Search terms never go in the URL, history or logs.
Keep the autosave timing, leave guard, Retry, TipTap allowlist, React-only renderer and link limits unchanged.

Tests: update the three specs. Add E2E tests for list–detail at 1280 px (opening a note keeps the pane and marks it selected) and toolbar keyboard reachability with aria-pressed. Keep the no-terms-in-URL assertion. Axe in both themes and sizes. Add the notes routes and search to the visual capture.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once SCREENS §8 holds, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-12: Settings, appearance, public and system pages
```text
Read CLAUDE.md, AGENTS.md, docs/ui/README.md, UI plan §1–§3, phase UI-12, the tracker and every handoff note. Then read docs/ui/SCREENS.md §9–§10, DESIGN_DECISIONS D-08, ADRs 0007 and 0013, settings/page.tsx, preferences-form.tsx, reminder-settings-form.tsx, push-notifications.tsx, install-help.tsx, src/app/page.tsx, sign-in/page.tsx, sign-in-buttons.tsx, src/app/{error,not-found,loading}.tsx, every route error.tsx and not-found.tsx, and the preferences, reminders, push-devices, pwa, auth and errors specs.

FIRST: ask the user to sign off amendment 5-D (Settings → Appearance: System, Light or Dark, saved per device). Recommend accepting it, and give the fallback.

Build UI-12 only:
- /settings: an in-page index (sticky at large) plus these sections:
  - Time and region, with its own Save.
  - Appearance: a ConnectedButtonGroup toggle using src/lib/theme.ts that applies instantly, "Saved on this device."
  - Reminders: SwitchRows with dependent controls disabled while off, InlineBanners for no device and stopped sweeps, one Save.
  - Notifications: this-device actions and a devices ListGroup with a confirmed Remove.
  - Install the app: Disclosures with this device's open and an Installed chip.
  - Account: name and Sign out.
  Show no phase 10 placeholders.
- The landing page (mist, the shape composition aria-hidden, the product-promise headline, one Sign in button, three feature lines, a privacy line; no invented numbers).
- The sign-in card (outlined provider buttons "Continue with Google/GitHub", the mapped ?error= as an error banner, the no-provider info banner).
- ErrorState on every error boundary (fixed copy, ErrorReference, Try again, Go to Home), not-found screens with context lines and back links, and the root loading indicator.
Update PRODUCT_SPEC per the 5-D answer.

Tests: update the specs for names. Add an E2E test that choosing Dark sets data-theme immediately and after a reload, and System clears it. Each Settings section still saves independently. Axe on the landing page, sign-in, settings, not-found and an error page in both themes and sizes. Add these to the visual capture.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once SCREENS §9–§10 hold, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, and the protocol close-out is complete.
```

### UI-13: Consistency, cleanup and accessibility sweep
```text
Read CLAUDE.md, AGENTS.md, everything in docs/ui/, UI plan §1–§3, phase UI-13, the tracker and every handoff note, then review the captures from each phase.

Build UI-13 only:
- Widen the visual capture to 360/390/768/1024/1280/1600 px × light/dark for every route in docs/ui/UI_AUDIT.md, review every capture, and fix inconsistencies using shared components and tokens (spacing, type roles, radii, states, empty/loading/error parity, focus visibility, overflow, safe areas).
- Remove the legacy token aliases and utilities, Tailwind's default breakpoints, the --fs-* scale, Button/size alias values, and dead components (confirm each with rg and the tests).
- Add scripts/lint-tokens.mts as `pnpm lint:tokens` (legacy utilities, default breakpoint prefixes, Tailwind palette colours, raw hex in .tsx) and add it to `pnpm verify`.
- Add tests/e2e/a11y-sweep.spec.ts: axe on every authenticated route in both themes at 390 and 1280 px.
- Run keyboard walkthroughs of Goals→Today, logging a habit, a weekly review, writing a note and changing a setting.
- Update the README UI section and ARCHITECTURE.md if it describes the UI layer. Mark the tracker done.
Do not change product behaviour.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm lint:tokens, pnpm verify, pnpm build, pnpm test:e2e and pnpm test:visual pass, every route passes axe in both themes, the final handoff lists what's still unverified (real-device PWA, screen reader), and the protocol close-out is complete.
```
