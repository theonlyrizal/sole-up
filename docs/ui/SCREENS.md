# SoleUp screens

**Status:** Revision 2, 2026-10-30. One section per route or route group. For each screen:
- the **question** it answers first;
- the **data** (the exact existing functions and fields);
- **wireframes** for compact (about 390 px) and expanded or large (about 1280 px);
- the **element → data** mapping;
- **states**, **interactions**, and the **contracts that must survive**.

Component names refer to [COMPONENTS.md](COMPONENTS.md), and colour and type tokens to [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Wireframes show structure, not exact pixels. Sizes come from the component specs.

Conventions in the wireframes:
- `[Button]` is a button; `(chip)` is a chip; `‹ ›` is navigation; `▢` is a card; `▤` is a grouped list.
- `ⓘ` is the metric `InfoButton`; `⋮` is an overflow menu.
- `●` is filled, `◐` partial, `○` ring/missed, `▨` hatched/skipped, `·` unlogged or future.

---

## 0. The shell (UI-3)

**Compact:**
```
┌──────────────────────────────┐  ← TopAppBar (64 + safe top), transparent over the mist
│ ‹  Title               🔍  ⋮ │
│                              │
│   page content …             │
│                              │
│                       ╭────╮ │  ← Fab (56) → FabMenu: New task · New note
│                       │ ＋ │ │
│                       ╰────╯ │
├──────────────────────────────┤
│ ⌂     ☑     ⚑     ⟳     ⋯   │  ← NavigationBar 64 + safe bottom
│Home  Plan  Goals Track  More │
└──────────────────────────────┘
```

**Large:**
```
┌───────────────┬──────────────────────────────────────────────┐
│ SoleUp     ⇤  │  PageHeader: h1 · description      [Actions] │
│ [✎ Create]    │  subnav (tabs / button group)                │
│ 🔍 Search…    │──────────────────────────────────────────────│
│ ⌂ Home        │                                              │
│ ☑ Plan        │   content (max 1240 / 840 / 720)             │
│    Today      │                                              │
│    Upcoming   │                                              │
│    Calendar   │                                              │
│    Inbox      │                                              │
│    All tasks  │                                              │
│ ⚑ Goals       │                                              │
│ ⟳ Track       │                                              │
│ 🗒 Notes       │                                              │
│ ↻ Review      │                                              │
│               │                                              │
│ ⚙ Settings    │                                              │
│ (A) Alex  ⎋   │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

**Must survive:**
- the skip link ("Skip to content" → `#main`, a single `<main id="main" tabIndex={-1}>` in `(app)/layout.tsx`);
- the time-zone confirmation gate, which hides the nav and shows only the form;
- `requireUser()` in the layout and every page;
- `<Toaster />` once;
- Quick Add (`Q`) available on every app page (`QuickAdd` keeps its dialog; its trigger moves into the FAB menu and rail);
- `ShellSearch` handing terms over in memory (never through the URL);
- `aria-current` semantics;
- sign out.

**Time-zone gate** (`(app)/layout.tsx` with `confirmed === false`):
- No nav, no FAB.
- A centred `PageContainer width="reading"` holds a `Card variant="hero"`: the `ShapeAvatar` user monogram, "Confirm your time zone" in `headline-small`, the existing copy, and then `PreferencesForm mode="confirm"` restyled with the new fields.
- Full mist background.

**Tests to update:** `tests/e2e/shell.spec.ts` (nav names, More sheet, rail), `src/components/shell/nav-items.test.ts`. Add: a compact viewport test that every destination is reachable through the bar or More, a keyboard pass through the rail, and axe in light and dark.

---

## 1. Home `/home` (UI-4)

**Question:** "What's next, and what needs me today?"

**Data** (unchanged calls in `src/app/(app)/home/page.tsx`):
- `nextCommitment`, `todayTaskCounts`, `goalsWithoutNextAction`, `listGoalsWithoutNextAction`, `deadlinesNextSevenDays` and `habitsSummary` (all `Metric`s);
- `todayClock(timeZone)`;
- preferences (`locale`, `weekStart`, `timezone`);
- `user.name` for the greeting.

New pure helpers (unit tested): `greetingFor(clock, timeZone)` and `weekDays(today, weekStart, locale)`.

**Compact:**
```
┌──────────────────────────────┐
│ (A) Good morning, Alex   🔍 ⋯│  ← greeting app bar
│     Friday, 30 October       │
│ ╭──╮╭──╮╭──╮╭━━╮╭──╮╭──╮╭──╮ │  ← WeekStrip (today filled primary)
│ │M ││T ││W ││T ││F ││S ││S │ │
│ │26││27││28││29││30││31││ 1│ │
│ ╰──╯╰──╯╰──╯╰━━╯╰──╯╰──╯╰──╯ │
│ ▢ hero ──────────────────────│  ← Next commitment (Card hero)
│ │ ⏱ Next commitment       ⓘ ││
│ │ Thesis writing block      ││  headline-small link → calendar Day ?item=
│ │ Today · 14:30 – 15:30     ││  commitmentWhenLabel, title-medium tabular-nums
│ │ (Time block)  (Now)       ││  kind chip · Now chip only when under way
│ │ [Open in calendar ›]      ││
│ ▢ ─────────────────────────── │  ← Today (MetricCard)
│ │ ☑ Today                 ⓘ ││
│ │ 3 / planned for today     ││  StatNumber → /plan/today#today-planned
│ │ (2 due today) (1 needs a  ││  metric chips → #today-due / #today-decide
│ │  decision)                ││
│ │ Today, Fri 30 Oct         ││  range caption
│ │ [Open Today]              ││
│ Your habits this week   View all ›│  ← section title + link /track
│ ╭───────╮╭───────╮╭─────       │  ← Carousel of habit cards
│ │(R)    ││(M)    ││            │
│ │Read   ││Medit- ││            │
│ │▮▮▯    ││▮▮▮▮▯▯ ││            │
│ │2 of 3 ││4 of 6 ││            │
│ │times  ││days   ││            │
│ │4w: 9 of 10 …  ││            │
│ ╰───────╯╰───────╯            │
│ ▢ ⚑ Goals without a next   ⓘ │
│ │   action                  ││
│ │ 2  goals                  ││
│ │ ▤ Learn Spanish        ›  ││  up to 3 rows, then "View all 5"
│ │ ▤ Run a 10k            ›  ││
│ ▢ 📅 Deadlines in the next ⓘ │
│ │   7 days                  ││
│ │ 4  deadlines   [View in Plan ›]│ → /plan?due=next7
└──────────────────────────────┘
```

**Large** (feed, 12 columns):
```
│ Good morning, Alex                                   [🔍]    │ headline-large emphasized (no app bar)
│ Friday, 30 October                                           │
│ ╭WeekStrip (56×84 capsules)╮                                 │
│ ┌──────── 8 cols ────────────────┐ ┌──── 4 cols ───────────┐│
│ │ Next commitment (hero)         │ │ Goals without a next   ││
│ ├────────────────────────────────┤ │ action                 ││
│ │ Today: 3 planned · chips       │ ├────────────────────────┤│
│ └────────────────────────────────┘ │ Deadlines next 7 days  ││
│                                    └────────────────────────┘│
│ Your habits this week                              View all ›│
│ ┌habit card┐┌habit card┐┌habit card┐┌habit card┐ (grid 4 cols)│
```

**Element → data:**

| Element | Source | Notes |
|---|---|---|
| Greeting | `greetingFor` + first word of `user.name` | No name → "Good morning" |
| Date line | `clock.today` formatted `weekday long, day, month long` in `locale` | |
| WeekStrip | `weekDays(clock.today, weekStart)`; `href = calendarHref({ view: "day", date })` from `src/lib/calendar-views.ts` (use the existing builder) | Today `aria-current="date"` |
| Next commitment | `next.value` (`ScheduleEntry`): kind label `agendaEntryKind`, `title`, `commitmentWhenLabel(...)`, link `calendarItemHref(entry, today, zone)` | "Now" chip (tertiary-container) when the commitment is under way. Add a pure `isCommitmentUnderWay(entry, now)` to `src/lib/schedule.ts` that mirrors `commitmentWhenLabel`'s `!allDay && end !== null && start <= now` branch, and unit-test the two together. Never parse the label string. `next.value === null` → "Nothing coming up in the next 30 days." with [Add an event] → `/plan/calendar` |
| Today | `today.value.planned`, `.due`, `.decide`; anchors `todaySectionAnchor(...)`; labels `TODAY_SECTION_LABELS` | Zero counts show as outlined chips, still linked |
| Habit cards | `habits.value[]`: `ShapeAvatar(id, title)`, `title`, `SegmentedPillBar(value = thisWeek.done, total = thisWeek.target)`, caption `weekProgressFigure(thisWeek, cadenceType, measure)`, second line `TRACK_RANGE_LABELS["4w"] + ": " + formatConsistency(consistency, cadenceType, measure)` | The card title links to `/track#habit-<id>` (`trackHabitAnchor`). No combined number anywhere |
| Goals card | `goals.value` count, `goalList` (first 3; "View all {n}" expands in place with a `Disclosure`, keeping `id="goals-without-next-action"`) | Rows link to `/goals/<id>` |
| Deadlines | `deadlines.value` → `/plan?due=next7` | |
| Range captions and ⓘ | `metric.range` via `metricRangeLabel`, `metricAsOfLabel`, `metric.definition` | D-16 (needs sign-off 5-A; otherwise the definition shows as a visible `body-small` line) |

**States:**
- **Loading:** a page-shaped skeleton (greeting lines, 7 capsules, a hero card, a card, 3 carousel cards).
- **`hasData === false`:** each card shows `EmptyState compact` with today's empty copy and link: Goals → "Add a goal" `/goals`; Habits → "Add a habit" `/track`. A Habits section with no data collapses to one compact card instead of a carousel.
- **Errors:** `home/error.tsx` uses the new `ErrorState`.
- `RefreshOnNewDay` stays mounted.

**Must survive:** the `#goals-without-next-action` id, every link target above, `hasData` vs zero, no score, `home.spec.ts` and `home-habits.spec.ts` behaviour (update names and selectors only).

---

## 2. Plan: Today `/plan/today` (UI-5)

**Question:** "What am I doing today?"

**Data** (unchanged): `listTodayTimeline`, `listTodayTasks` (`Record<TodaySection, PlanTaskItem[]>`), `listTodaySuggestions`, `getTodayHabits`, preferences and clock.

**Compact:**
```
│ ‹ Plan                         🔍 ⋮ │ app bar "Plan"
│ Today  Upcoming  Calendar  Inbox  All│ PlanTabs (Today active)
│ Friday, 30 October                   │ headline-small (h1 "Today")
│ ╭WeekStrip — links to Day view╮      │
│ Schedule                             │ title-medium
│ (All day: Conference ›)              │ all-day chips first
│ ● 09:00  Standup · Event          ›  │ Timeline
│ ◎ 14:30  Thesis block · Time block › │ (Now ring tertiary)
│ ─────────────────────────────────── │
│ Planned for today   3  [+ Add to today] │ header + count badge + section action (tonal xs → ResponsiveSheet)
│ 3 tasks · 1 h 30 min estimated, 1 …  │ hint: plannedSummary(tasks) when non-empty, else TODAY_SECTION_HINTS
│ ▤ ○ Write intro               ⋮      │ round checkbox · title · meta
│ │   Thesis · Due 17:00 · 30 min      │
│ ▤ ○ Call bank                 ⋮      │
│ Due today                   1        │ rendered only when non-empty
│ ▤ …                                  │
│ Needs a decision            1        │ rendered only when non-empty
│ Their deadline has passed. …         │
│ ▤ ○ Renew passport  [Today][New date]│ inline tonal xs buttons + ⋮
│ Earlier, not done           2        │ rendered only when non-empty
│ ▤ …                                  │
│ Habits                               │
│ ▤ (R) Read 20 pages   [✓ Done]  ⋮    │ ⋮ = Skip · Change amount
│ │     1 of 3 so far this week        │
```

**Large:** a two-column supporting-pane layout. Left (7 columns): sections. Right (5 columns, sticky): the Schedule timeline card, then the Habits card. The tabs sit in the `PageHeader` subnav, and the header actions are [Add task] (filled, opens Quick Add) and [Block time] (tonal).

**Task row** (`TaskRow`, shared with every Plan list):
- **Leading:** a round `Checkbox` labelled "Complete {title}". Completing runs the existing action, the row stays briefly with a strikethrough, and a snackbar offers Undo where Undo exists today.
- **Headline:** the title, `body-large`; it opens the task dialog.
- **Supporting line:** the parent (goal or milestone, `on-surface-variant`), the due label, the planned label, the estimate, and `PriorityMark`.
- **Trailing ⋮ menu:** the existing per-section actions (Plan for today, Tomorrow, Pick a date…, Unplan, New due date…, Block time, Edit, Delete…). The two most useful actions for a section show as inline `xs` tonal buttons at medium and wider: Decide → [Do today] [New date]; Earlier → [Today] [Unplan].

**Must survive:**
- The render order is `TODAY_SECTIONS` (planned, due, decide, earlier). "Planned for today" always renders, even when empty, and the others render only when non-empty. Don't confuse this with the *assignment precedence* in ADR 0011, which the server applies.
- The anchors `today-<section>`, the label text, the hint text, and `plannedSummary`.
- "Add to today" stays the Planned section's action, with its suggestion groups (due soon; active goals' next actions).
- Habit one-tap Done / Skip / Change amount / Undo (`use-habit-log.ts`).
- Calm wording: no red.
- `today.spec.ts`, `schedule.spec.ts` and `habit-logging.spec.ts` behaviours.

---

## 3. Plan: All tasks, Upcoming, Inbox, task dialog, Quick Add (UI-6)

### All tasks `/plan`
- **Header:** on compact, the app bar reads "Plan" and the tabs show "All tasks" as active. On medium and wider, `PageHeader` shows the title "All tasks", the [Add task] action, and the tabs.
- **Filter bar** (`PlanFilters` restyle):
  - **Compact:** a horizontally scrolling row of **filter chips**: `Goal ▾`, `Area ▾`, `Priority ▾`, `Planned ▾`, `Due ▾`, `Sort ▾`, `Show closed` (toggle chip). Each `▾` chip opens a `ResponsiveSheet` with a radio list. Active filters render as selected chips with their value ("Due: Next 7 days"), plus a [Clear filters] text button.
  - **Expanded:** the same chips inline.
  - Every change navigates to the same URL the current form builds: **keep `src/lib/task-list.ts` serialization** (`goal`, `area`, `priority`, `planned`, `due`, `sort`, `closed=1`, `status`; defaults omitted).
- **Result line:** "12 tasks" (`body-medium`) and the list as `ListGroup`s grouped as today.
- **Empty and filtered-empty states:** keep both distinct, with "Clear filters" in the filtered one.

### Upcoming `/plan/upcoming`
- **Header:** the range is chosen with a `ConnectedButtonGroup` in link mode, "7 days · 14 days · 30 days", backed by `?days=` (keep the parser's default and fallback). Its date span is in `body-medium`.
- **Days:** each day is a section: `DateBadge` on the left (compact: inline header "Sat 31 Oct · Tomorrow"), then that day's `ListGroup`. A row carries chips that say *why* it's on that day: (Planned) and/or (Due 17:00). It appears once per day, as today.
- **Empty days are not rendered.** The empty range shows `EmptyState`.

### Inbox `/plan/inbox`
- **Header:** the title "Inbox", with the count in the description ("4 tasks with no goal and no plan"); the definition comes from the existing copy.
- **Rows:** each row has a selection `Checkbox` (square) in place of the completion box, plus a ⋮ menu.
- **Selection bar:** once anything is selected, a **contextual action bar** replaces the app bar (compact) or appears sticky above the list (expanded): "{n} selected", [Plan for today], [Assign to goal ▾], [✕ clear]. These are the existing bulk actions.

### Task dialog (`task-form.tsx`, `task-schedule-editor.tsx`, `task-blocks.tsx`, `task-notes.tsx`, `delete-task-dialog.tsx`)
- **Container:** `FormDialog`.
- **Field order:**
  1. Title;
  2. Parent (`task-parent-select`);
  3. a "When" group: Due (date, optional time and zone note), Planned date;
  4. Priority (a `ConnectedButtonGroup` toggle: None, Low, Medium, High);
  5. Estimate (a `NumberStepper` in minutes);
  6. Reminder (`ReminderSelect`).
- **Sections below** the fields (`Disclosure`-free, each a titled card section): **Time blocks** (`task-blocks`) and **Linked notes** (`task-notes` / `linked-notes`).
- **Footer:** status actions (Complete, Cancel task, Reopen) and **Delete…** (danger-text) on the start side.
- **Must survive:** the delete confirmation copy that names kept notes and points open tasks at cancelling; reminder status and snooze; opening by `?item` from search results (the task dialog opens from `/notes/search`).

### Quick Add (`quick-add.tsx`)
- **Trigger:** the FAB menu, the rail Create, and `Q` (ignored while typing in a field, as today).
- **Look:** a small dialog. **Compact:** a bottom sheet anchored above the keyboard, holding a single `TextField` "Task title" and an [Add] filled button, with `Enter` to submit. **Expanded:** a centred 480 px dialog.
- **After adding:** "Added to Inbox" snackbar with an [Open] action (if it exists today).

**Must survive:** `plan.spec.ts`, `upcoming.spec.ts`, `inbox.spec.ts`, `journey.spec.ts`, the URL filter contract, the "Earlier, not done" meaning.

---

## 4. Calendar `/plan/calendar` (UI-7)

**Question:** "When am I doing things?"

**Data** (unchanged): `parseCalendarView` drives `listAgenda` / `listCalendarGrid` + `listPlanTasks` / `listDaySchedule` / `listSchedule`, plus link options and preferences.

**Header** (all views):
- **Compact:** the app bar reads "Calendar" (tabs above). Toolbar row 1: `‹` `Today` `›` and the date label (`title-medium`, a button that opens the `DatePicker` "Go to date"). Row 2: a view `ConnectedButtonGroup` in link mode (Agenda · Day · Areas · Timeline). **Week is hidden on compact**, because the existing Week → Day fallback applies below the `medium`/`expanded` threshold (keep the `useMediaQuery` behaviour, now through `src/lib/breakpoints.ts`).
- **Medium and wider:** one row: date navigation · date label · the view group (Agenda, Week, Day, By area, Timeline) · then [New event] (filled), [Block time] (tonal), and for Agenda the days group (7 · 14 · 30).
- **Day and Agenda on compact** show a `WeekStrip` under the toolbar for quick day jumps (its links keep `view` and set `date`).

**Views:**
- **Agenda** (`agenda-view.tsx`): the FullCalendar list, restyled.
  - **Day headers:** `DateBadge` plus the weekday.
  - **Items:** a `ListItem`-like row: a leading time column (`label-large` `tabular-nums`, "All day" first), a 4 px colour bar (event `primary`, block `secondary`, deadline dashed `outline`), the title, and a kind chip.
- **Week and Day** (`time-grid-view.tsx`):
  - **Grid:** the FullCalendar time grid with a 1 px `outline-variant` slot lattice on `surface-container-lowest`, hour labels in `label-small`, a "now" line (2 px `tertiary` with a 8 px dot), and today's column tinted 6 % `primary`.
  - **Items:** events are `primary-container` cards with radius 8, a 3 px start bar in `primary`, and `label-large` title plus time. Time blocks are `secondary-container` with the block status icon. Timed deadlines are a dashed `outline` marker.
  - **Interaction:** the selection highlight is 12 % `primary`, and dragged items get level 5 with a scale of 1.02. The desktop task panel becomes a `Card` on the right at `large:`.
- **By area and Timeline:** as Week and Day, but each item uses its area's container and on colours with a dot bar (DESIGN_SYSTEM §1.3). Column and row headings carry `AreaChip`. The "No area" heading uses gray. Archived areas are marked with a "(archived)" text suffix and the `archive` icon.
- **Dialogs** (event, block, move-block, delete-event, scope chooser, repeat builder): `FormDialog` with progressive disclosure.
  - **Always visible:** title, all-day `Switch`, start and end.
  - **"Repeat" section:** a `Disclosure` that shows the summary (`describeRecurrence`) when closed.
  - **"Reminder", "Goal / area" and "Notes":** sections.
  - **Scope chooser:** a `RadioRow` list ("This event", "This and following", "All events") with the existing dropped-exceptions warning as an `InlineBanner warning`.

**Must survive:**
- every URL parameter (`view`, `date`, `start`, `days`, `span`, `item`), with invalid-value fallbacks;
- `?item=` opening the dialog;
- arrow-key movement between items (`gridItemTarget`, `timelineItemTarget`);
- `GridMoveNav`;
- the move/resize scope prompt and its keyboard alternative ("Block time" form);
- `onCloseAutoFocus` focus return;
- FullCalendar `dayLink` semantics;
- DST layout;
- `calendar.spec.ts`, `agenda.spec.ts`, `week-day.spec.ts`, `area-columns.spec.ts`, `area-timeline.spec.ts`, `time-blocks.spec.ts`.

---

## 5. Goals `/goals`, `/goals/[goalId]`, `/goals/areas`, `/goals/archived` (UI-8)

### Goals list
**Question:** "Which goals am I working towards, and how are they going?"

**Data:** `getGoalsView(userId, status)` gives `{ status, counts, archivedCount, groups: { area, goals: GoalListItem[] }[], areas }`.

```
Compact
│ Goals                       🔍 ⋮ │  ⋮ = Life areas · Archived goals (n)
│ [Active 4][Paused 1][Completed 2][Dropped] │ ConnectedButtonGroup link mode (?status=), counts from `counts`
│ ● Learning                        │ AreaChip as group header (h2)
│ ▢ (L) Learn Spanish        ⋮     │ Goal card: ShapeAvatar(area colour)
│ │ Why: talk with my grandmother  │ reason, 2 lines, body-medium
│ │ ◠◠◠◡◡ 3 of 5 milestones        │ mini MilestoneArc 72px + text
│ │ Target: 1 Jun 2027             │
│ ● No area                         │
│ ▢ …                               │
```
- **Compact:** [New goal] is a filled button at the end of the status row. It is not in the FAB, which stays global (D-12).
- **Expanded:** groups as sections, with goal cards in a 2-column grid (3 columns at `large`). The header holds [New goal] (filled) and an overflow menu with Life areas and Archived.
- **Card:** the whole card links to `/goals/<id>` through its title (a stretched link). The ⋮ menu has Edit, Pause/Resume, Complete, Drop, Archive (the existing status actions and their kind confirmation copy).
- **Empty:** `EmptyState` art `flag` with "Goals you set show here, grouped by life area." and [New goal]. A filtered status with no goals: "No paused goals." plus a link back to Active.

### Goal detail
**Question:** "Why does this matter, and what's next?"

**Data:** `getGoalDetail` gives `GoalDetail` (goal, area, areas, history, milestones, progress, tasks, nextAction, taskCounts, taskParentOptions, notes, noteLinkCount, locale, timeZone).

```
Compact
│ ‹ Goals                       ⋮  │ ⋮ = Edit · status actions · Delete…
│ (L)  Learn Spanish               │ ShapeAvatar 56 + headline-small (h1)
│ (Active) (● Learning) Target 1 Jun│ StatusChip · AreaChip · target
│ ▢ hero  Why this matters          │ reason (body-large) — the anchor of the page
│ ▢ Next action                     │ nextAction as TaskRow, or "No next action yet" + [Add a task]
│ ▢ Progress                        │ MilestoneArc 200px, "3 of 5 milestones", ⓘ MILESTONE_PROGRESS_HELP
│ ▢ Milestones           [+ Add]    │ ListGroup: drag handle → Up/Down buttons (existing), check, ⋮
│ ▢ Tasks                [+ Add]    │ direct tasks, then per-milestone groups (existing grouping)
│ ▢ Notes                [Link][New]│ linked notes rows (existing actions)
│ ▸ History (12)                    │ Disclosure, closed by default
```
- **Expanded:** a supporting pane. Main (8 columns): Why, Next action, Milestones, Tasks, History. Supporting (4 columns, sticky): Progress arc, Details (status, area, start, target, completed-on), Notes.
- **Must survive:** every milestone action (inline add, move up/down, complete, drop, the offer to complete the goal), contextual task add, task dialog, note link/new/unlink, delete confirmation counts (milestones, tasks, kept notes), restore, the in-shell `not-found`, and the audit history text.

### Life areas `/goals/areas`
- **Header:** "Life areas", with [New area] (filled).
- **Starter offer:** `starter-life-areas-offer` as a dismissible `Card variant="tonal"` with the area chips previewed.
- **List:** a `ListGroup` of active areas. Each row: the colour `ColorSwatch` (16 px), the name, the goal count if available today, ↑ ↓ `IconButton`s (the existing reorder), and ⋮ (Edit, Archive, Delete…).
- **Archived:** a `Disclosure` "Archived (n)".
- **Area form:** `FormDialog` with Name and Colour. Colour is a `RadioGroup` of 9 swatch buttons, 40 px circles, each labelled by its name (`colorLabel`), plus "No colour". The selected swatch gets a `check` and a ring.

### Archived goals `/goals/archived`
A `ListGroup`. Each row shows the avatar, title, "Completed on …" or "Archived on …", and the counts. The trailing [Restore] (tonal xs) has a ⋮ with Delete….

**Tests:** `goals.spec.ts`, `goal-detail.spec.ts`, `goal-tasks.spec.ts`, `milestones.spec.ts`, `goal-archive.spec.ts`, `life-areas.spec.ts`.

---

## 6. Track `/track`, `/track/archived` (UI-9)

**Question:** "How is each habit going?"

**Data:** `getTrackView(userId, now, range)` gives a `TrackView`: `range`, `rangeLabel`, `rangeDatesLabel`, `habits: TrackHabit[]` (active then paused), `archivedCount`, `goals`, `today`, `weekStart`, `locale`, `thisWeekStartLabel`. Each `TrackHabit` is a `HabitListItem` plus `history: HabitHistory` (weeks → days with `state`, `credit`, `dayOfMonth`, `dateLabel`, `stateLabel`, `loggable`, `active`, `target`; plus `figure`, `definition`, `progressLabel`).

```
Compact
│ Track                         ⋮  │ ⋮ = Archived habits (n) · Legend
│ [This week][Last 4 weeks][Last 12 weeks] │ ConnectedButtonGroup link mode → trackHref(range)
│ Oct 12 – Nov 8, 2026             │ rangeDatesLabel, body-medium
│ (● done ◐ part ▨ skipped ○ missed · not yet)  │ Legend: one compact chip row, collapsible
│ Active                            │
│ ▢ (R) Read 20 pages           ⋮  │ habit card; ⋮ = Edit · Pause · Archive · Delete…
│ │ Daily · 20 pages · Goal: Thesis │ cadenceLabel · targetLabel · goal link
│ │ 9 of 10 days · 1 skipped    ⓘ  │ figure in title-medium + ⓘ = definition
│ │ 1 of 3 times so far this week   │ progressLabel (when present)
│ │  — 4w grid —                    │
│ │  M  T  W  T  F  S  S            │ weekday header (label-small)
│ │ Oct 12 ● ● ▨ ● ○ · ●            │ HabitDayCell 44px with dayOfMonth; row label shortLabel
│ │ Oct 19 ● ● ● ◐ ● ● ●            │
│ │ Oct 26 ● ● ○ ● ● ● ▨            │
│ │ Nov 2  ●(●)·  ·  ·  ·  ·        │ today ringed
│ Paused                            │
│ ▢ (M) Meditate   (Paused)  [Resume]│ compact card; history still visible (muted)
```

**Range layouts:**

| `range` | Layout |
|---|---|
| `week` | A `HabitWeekChart` (tall day pills, reference 3 "Favorite Habits") with `progressLabel` as the main figure; no consistency figure, as now |
| `4w` (default) | The 4 × 7 grid of `HabitDayCell` (44 px) with date numbers |
| `12w` | `DotMatrix` (28 px cells, no numbers), with week row labels |

On compact, the 4-week grid fits: 7 × 44 + 6 × 4 = 332 px plus a 48 px row label = 380 px. That's too wide for 360 px phones, so below 380 px **the row label moves above each week row** (a `label-small` line) rather than squeezing the cells.

**Large:** a feed of habit cards in 2 columns, with the week chart wider. The header has [New habit] (filled) and [Archived (n)] (text).

**Logging** (unchanged behaviour, `use-habit-log.ts`, `DayLogDialog`):
- Tapping a loggable day opens a `ResponsiveSheet` titled with the `dateLabel` and described by the habit title.
- **Check habits:** a `RadioRow` list of Done, Skip, or No log (clear).
- **Quantity habits:** a `NumberStepper` with "Full target ({target} {unit})" as a tonal shortcut, plus Skip and Clear.
- The figure updates straight away (the existing optimistic flow), and there's an Undo snackbar where it exists today.
- Days where `loggable` is false are not buttons; they're `role="img"` with their label.

**Must survive:**
- the anchors `id="habit-<id>"` on each card, including the `scroll-margin-top` that clears the app bar;
- the `?range=` contract;
- figure and definition strings exactly as returned (D-16 / 5-B decide visibility only);
- no streaks or percentages;
- backfill limited to `active` days;
- the pause and archive toast copy;
- the delete confirmation naming the log count;
- the "applies from this week" note in the edit form;
- `habits.spec.ts`, `habit-logging.spec.ts`, `track-history.spec.ts`.

**Habit form** (`habit-form.tsx` → `FormDialog`):
1. Title.
2. Measure (`ConnectedButtonGroup` toggle: Check, Quantity; create only, as now), with Unit and Target (`NumberStepper`) when Quantity.
3. Cadence (a `RadioRow` list: Every day / On chosen days / A number of times a week). Chosen days use 7 toggle `IconButton`-style day chips (M, T, W …, labelled with full names), honouring week start. Times a week uses a `NumberStepper` from 1 to 6.
4. Goal (native select).
5. Description (textarea).
6. The "Applies from the week of {date}" `InlineBanner info` when editing a cadence.

**Archived habits:** a `ListGroup` with the avatar, title, "Archived on …" and [Restore] (tonal), and ⋮ Delete… (the confirmation names the log count).

---

## 7. Weekly review `/review`, `/review/history`, `/review/history/[reviewId]` (UI-10)

**Question:** "What happened last week, and what matters next?"

**Data:**
- `getReviewPage` gives `ReviewPage { today, timeZone, weekStart, locale, thisWeek, lastWeek, periodStart, periodEnd, review: ReviewDetail | null, open, otherWeek }`;
- `weeklySummary` gives `WeeklySummary` (six `Metric`s);
- `getAdjustStep` and `getPriorityOptions`;
- `getReviewHistory` and `getReviewView`.

```
Compact
│ Review                      ⋮   │ ⋮ = Past reviews
│ ▢ hero                          │ ReviewHeader
│ │ Week of Oct 26 – Nov 1        │ title-large
│ │ Open until Sun 8 Nov · Not finished │ status chip
│ │ [Review the other week ›]     │ when otherWeek
│ Step 1 of 4 · Look back         │ label-large + progress: 4 segments (SegmentedPillBar-like, horizontal)
│ ━━━━ ──── ──── ────             │
│ Look back                       │ h2 headline-small (focus target, as today)
│ ▢ Tasks completed          ⓘ   │ MetricCard compact: StatNumber 12
│ ▢ Planned vs completed     ⓘ   │ SplitStat: 9 planned | 7 completed
│ ▢ Rescheduled              ⓘ   │
│ ▢ Goals without activity   ⓘ   │
│ ▢ Habits                   ⓘ   │ per-habit rows: avatar · title · figure (HabitPeriodFigure)
│ ▢ Deadlines next week      ⓘ   │
│ ─ sticky bottom action bar ─    │
│ [Back]              [Next: Reflect ›] │ last step: [Finish review]
```
- **Stepper (expanded and wider):** a vertical step rail in the supporting pane (left, 3 columns): four items with a number in a 32 px circle (completed → `check`, current → `primary` filled, others → outlined), each a link (`reviewHref`) with `aria-current="step"`. The content sits in the main pane (7 columns). The action bar is inline at the bottom of the content.
- **Reflect:** three `Card`s, each with a prompt title (Wins / Blockers / Lessons, the existing labels and any hint), a `Textarea` (min 160 px), and the reassurance line "Everything here is optional." once at the top. `SaveStatus` sits in the step header.
- **Adjust:** two sections, "Goals" (active and paused) and "Stalled tasks". Each item is a `ListItem` with a ⋮ menu or inline `xs` tonal buttons for its allowed actions (Pause, Resume, Drop… / Reschedule…, Cancel…, Plan on…). Consequences are spelled out in each confirmation. There is no primary-coloured button per row.
- **Choose priorities:**
  - **Picker:** a search `TextField` filtering the eligible options from `getPriorityOptions`, shown as a `ListGroup` with add buttons.
  - **Chosen list:** an ordered `ListGroup` with position numbers, ↑ ↓ `IconButton`s ("Move {title} up") and remove.
  - **Limit:** a counter "{n} of 10" in `label-large`; at 10 the add buttons disable and a hint explains the limit. An optional note `Textarea` follows.
- **Finish:**
  - On success, a `BottomSheet` "celebration" (D-20) shows the soft-burst art in `tertiary-container`, "Your review is saved", "You can change it until {closesOn}.", and [Done].
  - The page then shows the finished-but-open state: a status chip "Finished" and the steps still editable.
- **Closed review:** `ReadOnlyReview` shows the same layout without inputs, an `InlineBanner info` "This week has closed, so the review is read-only.", and no adjust actions.
- **History:** a `ListGroup` of the week span, "Finished on …" or "Not finished" (neutral chip), and "Open until …" or "Closed on …". Each row links to its detail. The empty state reads "Reviews you start show here."
- **History detail:** the read-only layout, with [Edit review] (tonal; only when open) and ⋮ → Delete… (`ConfirmDialog` copy as today).

**Must survive:**
- `?week=&step=` (defaults omitted);
- save-on-leave for every navigation (step links, Back, Next, Finish, browser back is not intercepted, as today);
- focus moving to the step heading after a step change;
- errors keeping the user's input;
- finishing with nothing filled;
- the period lock;
- current titles and statuses on priorities;
- `review.spec.ts`, `review-history.spec.ts`.

---

## 8. Notes `/notes`, `/notes/new`, `/notes/[noteId]`, `/notes/archived`, `/notes/search` (UI-11)

**Data:** `listNotes(userId, { archived })` gives `NoteListItem { id, title, preview, updatedAt, updatedLabel, archivedLabel }`. Also `getNote` → `NotePage`; `getLinkTarget` for `?goal=`/`?task=`; `listNoteLinks` / `findLinkTargets`; and the `search` Server Action → `SearchResults`.

```
Compact /notes
│ Notes                      🔍 ⋮ │ 🔍 → /notes/search ; ⋮ = Archived notes
│ ▤ Grocery ideas          Oct 29 │ ListItem: title (or "Untitled" muted) · updatedLabel
│ │ Pasta, beans, …                │ preview 2 lines
│ ▤ Thesis outline         Oct 28 │
│                        [+] FAB  │ FAB menu (New note first on this page)

Large /notes/<id> (list–detail, D-33)
┌ list pane 360 ─────────┬ editor ────────────────────────────────┐
│ Notes     [🔍] [+ New] │ ‹ (compact only)   Saved ✓       ⋮     │
│ ▤ Grocery ideas  (sel) │ Title (headline-medium, borderless)    │
│ ▤ Thesis outline       │ B I S  H1 H2 H3  • 1.  ❝  </>  —  ↶ ↷ │ toolbar: floating M3 toolbar, sticky
│ ▤ …                    │                                        │
│                        │ body (note-content, max 720)           │
│ Archived (3) ›         │ ▢ Linked to  [+ Link]                  │
│                        │  (Thesis · Active ✕) (Write intro ✕)   │
└────────────────────────┴────────────────────────────────────────┘
```

- **Editor:**
  - **Title:** a borderless `headline-medium` field labelled "Title" (`sr-only` label).
  - **Toolbar:** an **M3 Expressive floating toolbar**: a `surface-container` pill, level 2, with 40 px `IconButton`s grouped by dividers (the existing commands and shortcuts; toggles use `aria-pressed`). It sticks under the app bar on compact. When the on-screen keyboard is open on compact, it docks above the keyboard (the `visualViewport` offset).
  - **Save state:** `SaveStatus` sits in the app bar or header trailing slot.
  - **Overflow ⋮:** Archive, Delete….
  - **Linked to:** a section below the body. Link chips are `input` chips (goal or task title plus a status chip, ✕ to unlink with an accessible name). [Link] opens the picker `ResponsiveSheet` with a search field and results (`use-picker-search`).
- **Conflict:** an `InlineBanner warning` above the body with the existing text and its actions. The local text stays on screen.
- **Archived note:** read-only `note-content`, an `InlineBanner info` "Archived on … Restore it to edit.", [Restore] (filled), and ⋮ Delete….
- **New note with `?goal=`/`?task=`:** an `input` chip preview "Will link to: {title}" above the title. The "first save creates" behaviour is unchanged.
- **Search** `/notes/search`:
  - **Field:** a large search field (`SearchBar`: 56 px, `rounded-full`, `surface-container-highest`, leading `search` icon, trailing clear), focused on load (as today).
  - **Results:** three sections, Notes, Goals and Tasks, each with a count and up to 20 `ListItem`s. Highlights render through the existing `Highlighted` component as `<mark>` in `tertiary-container`. Tasks open the task dialog.
  - **Empty and "only very common words" states:** use the existing copy.
  - **Privacy:** terms are never put in the URL or logs, and the field value isn't persisted.
- **Tags (8.5, if it has shipped before UI-11):** tags show as `filter` chips in a horizontally scrolling row above the list. On the editor they are `input` chips in the "Linked to" area under a "Tags" label.

**Must survive:** autosave timing (1 s idle, blur, leaving, `pagehide`), the leave guard, Retry, the stale conflict prompt, the TipTap allowlist and the React-only renderer (`note-content.tsx`), no HTML injection, link limits (50), and `notes.spec.ts`, `note-links.spec.ts`, `search.spec.ts`.

---

## 9. Settings `/settings` (UI-12)

**Question:** "How does SoleUp fit my life and devices?"

**Data:** unchanged: `getUserPreferences`, `getReminderSettings`, `listPushDevices`, `sweepHealth`, `env.VAPID_PUBLIC_KEY`.

**Structure.** M3 settings pattern: on compact, a **settings list** whose rows open sub-sections; on medium and wider, sections side by side.
- Compact `/settings` renders **every section on one page** as titled groups. **No new routes**: the page keeps its single-route contract and anchor ids, and an in-page index (`ListGroup` of links to `#time-region`, `#appearance`, `#reminders`, `#notifications`, `#install`) sits at the top.
- Large: a two-column layout. A sticky index on the left (3 columns) highlights the section in view (an `IntersectionObserver`). The sections are on the right (7 columns, `width="reading"`).

**Sections** (in order):
1. **Time and region** (`PreferencesForm mode="settings"`): Time zone (native select with search hint), Locale, Week starts on. Its own [Save] (filled) at the bottom of the card, with save feedback inline (a `SaveStatus`-style row) and field errors as now.
2. **Appearance** (new, D-08 / 5-D): a `ConnectedButtonGroup` toggle of System (`contrast` icon), Light (`light_mode`), Dark (`dark_mode`). It applies instantly with no save button and writes `localStorage["soleup.theme"]`. Supporting text: "Saved on this device." The rail collapse preference isn't shown (it's remembered automatically).
3. **Reminders** (`ReminderSettingsForm`): the master `SwitchRow` "Reminders" ("Send reminders to your devices"), then the dependent controls (dimmed and `disabled` while off, as now):
   - `SwitchRow` "Private notifications" with the existing explanation;
   - "Daily planning nudge" (`SwitchRow` plus a time field);
   - "Weekly review reminder" (weekday select plus time);
   - "Quiet hours" (`SwitchRow` plus start and end times, and the existing warning).
   - The no-device note and the sweep-stopped warning are `InlineBanner`s at the top of the card.
   - One [Save].
4. **Notifications** (`PushNotifications`):
   - **This device:** the status line and [Turn on notifications on this device] (filled) or [Send a test notification] (tonal).
   - **Devices:** a `ListGroup` of devices. Each row has a `devices` icon, the label, "Added …", "Last delivered …", and a failure count chip, with ⋮ → Remove… (`ConfirmDialog`).
5. **Install the app** (`InstallHelp`): three `Disclosure`s (iPhone & iPad, Android, Computer), with this device's one opened by default and an "Installed" `success` chip when running standalone.
6. **Account** (UI-12 shows only what exists): the name and Sign out (tonal). The phase 10 sections (Export, Delete account, Privacy) are added by those chunks into this layout with these patterns: **Export** is a card with a filled button; **Delete account** is a separate card with an `error`-outlined border, `danger` button and typed confirmation per its own spec.

**Must survive:** every field name and action, `preferences.spec.ts`, `reminders.spec.ts`, `push-devices.spec.ts`, `pwa.spec.ts`, the per-section loading states (skeleton cards), and truthful status text.

---

## 10. Public, system and error screens (UI-12)

- **Landing `/`:**
  - Full-height mist. Centred on compact, split on expanded.
  - The headline is "Decide what matters. Plan what's realistic. See how it went." in `display-small`/`display-large` with ROND 100 (product promise copy from PRODUCT_SPEC §1).
  - One [Sign in] filled `m` button.
  - A decorative composition of 3 identity shapes (cookie-9 `primary-container`, clover-4 `secondary-container`, soft-burst `tertiary-container`) floating behind, `aria-hidden`, static under reduced motion.
  - Three short feature lines with icons: Goals → Today, Habits counted kindly, Weekly review. No screenshots or invented numbers. A footer with the "Your data stays yours" privacy line.
- **Sign in `/sign-in`:**
  - A `Card` (max 400 px) on the mist: the wordmark, "Sign in to SoleUp" (`headline-small`), one-line reassurance, and provider buttons as **outlined `m` buttons** with the provider name ("Continue with Google" / "Continue with GitHub"). Use the brand marks as inline SVG: each provider's trademark guidelines allow their logo on sign-in buttons. Keep the existing provider logic.
  - The mapped `?error=` message as an `InlineBanner error`.
  - "No provider is configured" as an `InlineBanner info`.
- **Error boundaries** (`src/app/error.tsx` and every route `error.tsx`): the new `ErrorState` with the fixed copy, `ErrorReference` (digest), [Try again] (filled, `reset()`), [Go to Home] (text).
- **Not found** (root and the in-shell `not-found.tsx` for goals, notes and reviews): the arch shape art with a `search_off`-style icon (use `search` if absent), "We couldn't find that" plus the context line ("This goal may have been deleted."), and [Back to Goals].
- **Loading** (`src/app/loading.tsx`, route fallbacks): a centred `LoadingIndicator` 48 px for the root; page skeletons per route elsewhere.
- **Test-only routes** (`/test-errors/*`): they get the restyled error UI automatically. No other change.
