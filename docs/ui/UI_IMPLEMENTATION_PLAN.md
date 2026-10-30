# SoleUp UI implementation plan

**Status:** Detailed, phased implementation brief grounded in the repository and current UI screenshots.
**Scope:** Full responsive frontend redesign using Material 3 Expressive ideas and the visual references.
**Contract:** [Design decisions](DESIGN_DECISIONS.md) and [design system](DESIGN_SYSTEM.md) are the visual/product guardrails. Frontend structure may be rebuilt; existing backend behavior, routes, privacy, and data ownership remain authoritative.

## 1. Outcome

Redesign every public and authenticated screen so SoleUp feels like one polished product. The interface should help a user see the next useful thing, act quickly, and understand progress without reading repeated technical explanations. Use the images 1–3 from the original inspiration as the visual anchor: blue/aqua atmosphere, opaque white or tonal surfaces, clear selected states, spacious cards, readable compact charts, and friendly activity identity. Images of SoleUp's current pages identify pain points, especially overlong metric explanation, repeated same-weight panels, dense habit grids, and report-like review pages.

The redesign is allowed to replace the frontend presentation. Agents can add/remove/consolidate components, change composition, introduce a shared component system, and rebuild page layouts. Data still comes from SoleUp's existing authenticated query/service/action paths and existing backend tables. Do not access the database from the browser or recreate domain rules as client-only logic.

## 2. Product and technical baseline

- Product: personal management workspace covering goals/life areas, tasks, calendar/time blocks, habits, notes, review/insights, settings and reminders.
- App: Next.js 16.4 App Router, React 19, Tailwind CSS 4, Radix UI, Geist, FullCalendar 7.1, domain-specific server modules.
- Current shell: desktop sidebar and seven-column mobile navigation; current styles in `src/app/globals.css`; shared UI primitives under `src/components/ui`.
- Routes in the current app include public landing/sign-in and authenticated `/home`, `/goals`, `/goals/[goalId]`, `/goals/areas`, `/goals/archived`, `/plan`, `/plan/today`, `/plan/upcoming`, `/plan/inbox`, `/plan/calendar`, `/track`, `/track/archived`, `/notes`, `/notes/new`, `/notes/[noteId]`, `/notes/archived`, `/review`, `/review/history`, `/review/history/[reviewId]`, and `/settings`.
- The 2026-10-30 implementation log records chunks through 8.3 complete. Search/tags (8.4–8.5), Insights (9), and export/deletion/privacy/security/accessibility/performance work (10) are still todo. Redesign those only after the actual feature exists; do not invent a screen's data or claim planned work shipped.
- Product docs, data model and ADRs govern feature semantics. Preserve date/time zone, recurrence, habit cadence/history, review period locking, note autosave/conflict, reminders, privacy, and user-scope behavior.

## 3. Current screenshot diagnosis translated to requirements

| Current evidence | Redesign requirement |
| --- | --- |
| Home is a stack of same-weight outlined cards with repeated definitions/ranges. | Create clear hero and section hierarchy; put key actionable summaries first; use a responsive grid on wide screens and a purposeful vertical sequence on mobile. Keep one-line explanations and range/as-of context visible, with full counting rules in labelled disclosure. Empty summaries should be compact and useful, not large blank panels. |
| Track legend, range selector and repeated calculation text dominate habit rows. | Let a compact range selector and concise status key support the content. Give each habit a scannable header, cadence, this-week status, compact history, and clear logging/correction actions. Explain the metric once per card through a details affordance; make days legible and touchable. |
| Review shows all navigation and long metric definitions at once. | Make the review an approachable guided flow: clear selected week and progress, one step's content at a time, compact metric summaries, full definitions on demand, and stable Back/Continue/Finish actions. Maintain direct step links and resumability. |
| Settings is an undifferentiated long form. | Group controls into named, spaced sections with a short purpose and obvious save boundary. Separate time/region, reminders, notifications/devices, appearance/accessibility when present, installation, account/privacy/data rights. Do not pretend settings exist before backend support. |
| General use of dark outline surfaces lacks visual role or action hierarchy. | Define semantic color/surface roles, selected/primary/secondary/destructive treatments, spacing and elevation; make both light and dark polished. Give interactive rows and focus/hover/pressed states clear feedback. |

### Global hierarchy rule for explanation-heavy surfaces

Never solve the current density problem by deleting product transparency. Show the label, actual value/status, short plain-language explanation, and applicable date range/as-of. Move long counting formula, exclusions, or methodology into a visible “How this is counted” disclosure or details affordance. Keep the disclosure keyboard-accessible and preserve names/definitions in the accessibility tree when needed. Show “Nothing yet” distinctly from 0. Avoid displaying a calculated-at timestamp when it adds no user decision value; if product rules require it, style it as quiet supporting context.

## 4. Cross-cutting frontend and data rules

1. Before code changes, read the relevant local current-version guide from `node_modules/next/dist/docs/` (per repository `AGENTS.md`): App Router layouts, CSS, server/client boundaries, loading/error conventions, forms/actions, or caching as applicable. Follow local deprecation guidance.
2. Keep existing `requireUser`, scoped server queries, Zod validation, Server Actions and service calls. A UI refresh does not weaken authorization or introduce client-to-DB access.
3. Treat current paths, query keys, hashes, notification deep links, and shareable filters as contracts unless a separately approved product decision says otherwise. Preserve route behavior even if navigation placement changes.
4. Keep server components and server data loading by default. Add client components only for interactions needing client state. Do not ship a large static mock layer in place of connected backend data.
5. Preserve existing loading, empty, error, save, conflict, undo, disabled, and pending states. Upgrade their presentation but not their meaning.
6. Delete/replace old visual components only after checking all imports and any tests that exercise their contracts. Keep focused domain logic separate from presentation.
7. Do not introduce new product metrics, scores, streaks, sample numbers, fictional names, fitness-only concepts, or unimplemented Insights/privacy features.
8. Preserve keyboard access, visible focus, screen-reader labels, contrast, reduced motion, mobile safe areas, and all FullCalendar keyboard behavior.
9. Do not add or run tests unless the user asks for testing/verification. Do not claim checks were run if they were not.

## 4a. Version control and delivery workflow

Follow the established repository Git/PR practices in `docs/IMPLEMENTATION_PLAN.md` → **Agent session protocol** for every UI phase. One UI phase is one reviewable chunk, one branch, and one PR; finish/merge the current phase before starting the next.

- Before starting a phase, check `gh auth status`, ensure the checkout is clean and based on the latest `main` (`git switch main`, then `git pull --ff-only origin main`), and confirm the preceding work is merged. UI-0 starts from the latest main containing the current product work; each later UI phase starts only after the previous UI phase PR is merged. If a precondition fails, stop and report it; don't work around it or include unrelated changes.
- Create a phase branch using the existing repository convention, for example `chunk/ui-0-audit`, `chunk/ui-1-design-system`, through `chunk/ui-11-polish`. Never commit directly to `main`, force-push, bypass branch protection, or mix multiple UI phases in a branch/PR.
- Keep the UI phase tracker and handoff notes in this document so the product-feature progress log stays accurate. Update only the current UI phase row and its handoff. Do not mark phases complete before their PR is merged and any requested finish criteria are met.
- Commit with the repository's established format: `chunk ui-<n>: <imperative summary>` and a body covering changes, decisions, actual validation, unverified items, and follow-ups. Do not add attribution trailers.
- Push the phase branch and open a PR to `main` with Summary, Changes, Decisions/deviations, Checks actually run, Unverified/follow-ups, and Manual user steps. Use the repository's configured merge policy and follow the existing auto-merge/check workflow in `docs/IMPLEMENTATION_PLAN.md`.
- Do not copy the product implementation plan's domain-chunk status into this UI tracker. The UI phases are their own track, while still using the same branch, commit, review, and PR discipline.

### UI phase tracker

Statuses: `todo`, `in progress`, `done`, `blocked`. Update only the phase being worked on.

| Phase | Scope | Status | Branch | Date | Note |
| --- | --- | --- | --- | --- | --- |
| UI-0 | Route and behavior audit | todo | | | |
| UI-1 | Expressive design system | todo | | | |
| UI-2 | App shell and navigation | todo | | | |
| UI-3 | Home | todo | | | |
| UI-4 | Plan and task flows | todo | | | |
| UI-5 | Goals and Life Areas | todo | | | |
| UI-6 | Calendar | todo | | | |
| UI-7 | Track and habits | todo | | | |
| UI-8 | Review and history | todo | | | |
| UI-9 | Notes | todo | | | |
| UI-10 | Settings and account surfaces | todo | | | |
| UI-11 | Whole-app consistency pass | todo | | | |

### UI phase handoff notes

For each phase append one dated note after its PR is ready, following the handoff format in `docs/IMPLEMENTATION_PLAN.md`. Include the phase branch and PR, changed routes/components, preserved backend/URL contracts, actual checks, anything unverified, and follow-ups. Keep this log separate from the existing product chunk handoffs.

## 5. Page-by-page target experience

### Public and account entry

| Route | Target experience |
| --- | --- |
| `/` | A clear, lightweight SoleUp introduction consistent with the app's palette and product promise; one obvious sign-in/get-started action; no invented feature promises. |
| `/sign-in` | Focused branded sign-in surface; simple provider choices, clear loading/error states, no marketing clutter. Preserve provider auth and error copy. |

### Shared authenticated shell

- Desktop: persistent, compact navigation rail/sidebar; logo/wordmark; direct links for Home, Plan, Goals, Track, Notes, Review; Settings and account actions at the lower edge. Plan subnav is contextual. Current page and parent are distinct and accessible.
- Mobile: top app bar with current title/context and a four-destination bottom bar: Home, Plan, Track, More. More opens a proper accessible destination sheet/menu containing Goals, Notes, Review, Settings. Keep Quick Add available without obscuring content. Respect safe-area insets and virtual keyboard.
- All sizes: meaningful page title, optional concise description, one primary action, URL-aware subnav/filter toolbar, bounded content width, consistent page gutters. Avoid the current seven-icon squeeze.

### Home `/home`

- First screen answers “What is next?” Start with a compact welcome/date context and the next commitment or today's focus, depending on real data. Do not show an empty hero that occupies a large area.
- Use a distinct primary “Today” module with planned, due, and needs-a-decision counts linked to their exact sections. A small timeline/next commitment cue can sit beside it on desktop and below on mobile.
- Follow with goals needing a next action and deadlines in the next 7 days; show only enough list rows to support the next decision, with “View all” to the source page.
- Habit summary shows each active habit separately with existing range figure plus this week's progress, no total across habits. Compact, recognizable habit rows; link directly to its Track anchor.
- Reorder or collapse lower-priority sections responsively. Empty states use one sentence plus an actionable CTA. Use compact metric cards, not six tall panels.
- Keep metric definition and date range accessible via short visible copy plus a “How this is counted” disclosure. Preserve `hasData`, links, and as-of semantics. No life score.

### Goals `/goals`, detail `/goals/[goalId]`, areas `/goals/areas`, archived `/goals/archived`

- Goals list: title + create action, active/pause/completed/dropped filtering that preserves `?status=`, readable grouped sections by life area, compact goal cards/rows with title, life area, status, target date if set, milestone-based progress and next action. Keep progress formula and its explanation available, without ranking goals by a fabricated score.
- Goal detail: identity/status and “why this matters” as the visual anchor; clear next action; milestones and task groups with contextual create actions; linked notes section; activity/history in a secondary, collapsible area. Keep status transitions and confirmations in an overflow/actions area appropriate to risk.
- Life Areas: clear list and create/edit/reorder/archive actions, show color accessibly (label + swatch, not color alone), starter-area offer as optional and dismissible; delete consequences before confirmation.
- Archived goals: restore as primary action; closed history and delete remain secondary with explicit confirmation/counts.
- Preserve goal status rules, date handling, task/milestone links, audit-backed history, note retention notices, and all existing routes.

### Plan task list `/plan`, Today `/plan/today`, Upcoming `/plan/upcoming`, Inbox `/plan/inbox`

- Plan overview: contextual Plan subnav (All tasks, Today, Upcoming, Calendar, Inbox); title and Quick Add; filters/sorts in a compact toolbar or responsive filter sheet; selected filter chips visible; preserve URL query state and closed-task toggle.
- Task rows: title is dominant; parent goal/milestone, due/planned date, priority and estimate are secondary chips/metadata; quick complete and edit actions are easy to target. Do not draw nested bordered boxes around every title.
- Today: schedule timeline first with all-day and timed items in their correct order. Then sections in existing precedence: planned, needs a decision, due, earlier. Each task offers the existing complete/plan/tomorrow/date/unplan/due-date actions without a maze of nested menus. Habit logging remains a separate, clearly named section lower on the page.
- Upcoming: group tasks by local date, visually distinguish planned day from due date, keep 7/14/30-day range selector, and explain empty dates without rendering a long blank calendar.
- Inbox: focused capture and triage. Make bulk plan and assign-to-goal actions visible when items are selected; avoid requiring users to open every task to route it.
- Keep nonjudgmental language, the “Earlier, not done” meaning, task delete confirmation, quick-add keyboard shortcut, query filters and deep links.

### Calendar `/plan/calendar`

- Page header includes clear view switcher for Agenda, Week, Day, By area, Timeline, date navigation, and event/block creation. On narrow mobile, expose a compact view picker and default to a legible Agenda/Day presentation; never force a desktop week grid to shrink into illegible columns.
- Agenda: group by local day, show all-day first, then chronological items. Differentiate event, deadline and time block with label/icon/style and readable time.
- Week/Day: retain FullCalendar layout and keyboard operation, but theme axis, current time, selection, event cards, all-day row, overflow and dialogs. Ensure text contrast and touch behavior.
- By area/Timeline: preserve row/column semantics, sticky labels and arrow-key navigation; use a controlled palette of life-area colors with non-color labels; handle “No area” and archived areas as already specified.
- Event/block forms and dialogs: progressive disclosure (title/time first, repeat/reminder/association under clear secondary sections), preserve scope prompts, timezone, recurrence, task selection and reminders. Drag/resize must communicate scope and allow keyboard alternatives.

### Track `/track`, archived `/track/archived`, Today habit section

- Track page header: “Track” with concise copy, New habit primary action, Archived as a secondary link/action. Range selector (“This week”, “Last 4 weeks”, “Last 12 weeks”) belongs in a compact segmented control with range dates adjacent, not a full-width toolbar.
- Keep status legend compact and explain each mark once. Do not make users decode tiny glyphs; use shape, label/tooltip, and accessible text.
- Each active habit is a distinct card/row. Header: habit name, measure/unit, cadence, optional linked goal, overflow actions. Prominent weekly progress states the actual numerator/target or existing consistency figure. Do not use streaks or aggregate percentages.
- Replace the current cramped date grid with a legible week-by-week strip: date number with weekday label available, sufficiently large interactive day cells, clear done/partly done/skipped/missed/not-active patterns, and a visible selected/focused day. On desktop show a clear 7-column grid; on small phones use horizontal weekly strips or a compact scrollable week with clear row labels. Never squeeze many labels into one tiny table.
- Daily logging should be one tap for a check habit; quantity logging offers the target shortcut and amount editor; correction/skip/undo affordances stay discoverable. Put pause/archive/edit/delete in a labelled action menu, with destructive confirmation.
- Replace repeated long “How this is counted” paragraphs with one concise status line and a per-habit disclosure containing the full existing definition. Backfill remains only on allowed active dates. Keep range URL and anchor links.
- Archived habits use a simpler list and clear Restore; destructive delete explains retained/removed log consequences accurately.
- Today habit rows: consistent compact design, done/skip actions, amount change, Undo toast. Respect cadence eligibility and user's zone.

### Notes `/notes`, `/notes/new`, `/notes/[noteId]`, `/notes/archived`

- Notes list: create action, search when phase 8.4 exists, tags when 8.5 exists, recent-first entries with title, short text preview and updated date. Search terms stay out of URL/logs per ADR.
- Editor: content-first, calm page with title, unobtrusive save state, formatting toolbar that works on mobile, linked-to section, archive/delete in secondary actions. Keep TipTap allowlist and safe renderer. Do not make the editor a generic settings form.
- Preserve autosave delay/blur/navigation/pagehide behavior, stale-save conflict recovery, Retry and unsaved content, links to goals/tasks, and no note content in logs/audit.
- Archived notes: readable list, restore action, confirmed delete. Don't let archive/delete actions obscure the document.

### Weekly Review `/review`, history `/review/history`, detail `/review/history/[reviewId]`

- Review entry: clear selected week and whether it can still change; switch to other open week; past reviews is secondary navigation. Avoid a large empty hero.
- Show a compact stepper with current step strongly selected and completed/available state communicated without color only. On phones, use a “Step 2 of 4” progress/header plus one step at a time; desktop may show the four step labels in a compact rail.
- **Look back:** compact evidence cards/rows for metrics with value and short explanation; allow full definition/range details on demand. Group by “Follow-through”, “Goals”, “Habits”, “Next week” if this improves scanning, preserving the actual summary metrics and hasData.
- **Reflect:** three optional focused prompts for wins, blockers, lessons; generous text areas; reassure that nothing is required. Keep privacy promise and save-on-leaving behavior.
- **Adjust:** grouped active/paused goal actions and stalled task decisions; make reschedule/cancel/plan consequences explicit and use existing actions. Avoid rendering every possible action as equal primary button.
- **Choose priorities:** searchable/selectable eligible goals/tasks, ordered list with easy keyboard-accessible up/down controls, optional note. Communicate maximum of 10.
- Persistent Back/Continue/Finish controls; save failures visible and retain user input. Finish can be empty; closed review is read-only.
- History list: date range, finished/not finished, edit-until/closed date, newest first; no missing-week placeholders. Read-only detail preserves current priorities and live summary semantics; delete is confirmed.

### Settings `/settings`

- Replace one long form with clear section headings and spaced surfaces. Each section has a concise purpose, labels and supporting guidance, and an explicit save affordance only when its data is saved as a group. Keep current timezone/locale/week start together.
- Reminders: global toggle and private mode; daily nudge, weekly review day/time, quiet hours; concise delivery status banner; explain no-device state and recovery action. Make dependencies and quiet-hour behavior clear without repeating long prose under every checkbox.
- Devices/notifications: device list with readable names, status, last-used where available, revoke/test actions and confirmations.
- Install app: platform-appropriate install instruction/status, not a technical wall of text.
- Future appearance/accessibility, privacy, export, delete account sections appear only after supported by actual code and phase 10. Group destructive account deletion distinctly and explain consequences.
- Preserve all preference persistence, reminder scheduling constraints, device revocation, and truthful delivery warnings.

### Error, loading, not-found and modal states

Redesign root/app and route error, not-found, loading, skeleton, dialog, toast, confirm, form validation and success states in the same visual system. Error states should explain what the user can do next, retain request reference when present, and avoid exposing content. Skeletons reflect the destination's layout. Modal actions are keyboard operable, retain focus, and fit on small screens.

## 6. Delivery phases

Each implementation phase should be a reviewable vertical slice and may rebuild the frontend components in its scope. Do not combine the whole app into one massive rewrite.

### UI-0 — Route and behavior audit

Inventory every route and its server query/action source, existing UI components, query/hash contract, key states, keyboard interactions, and screenshot baseline. Record a route map in `docs/ui/UI_AUDIT.md`. Identify current dark-mode setting and include light/dark before captures. No code changes.

### UI-1 — Expressive design system

Implement semantic light/dark tokens, surfaces, type roles, shape/spacing/elevation, focus and reduced-motion tokens; replace or consolidate shared controls, cards, chips, fields, tabs, disclosure, dialogs/sheets, toast, empty/error/loading patterns. No domain/page rewrite yet. Deliver a small visual reference page or component gallery route only if it can be dev-only and does not ship as a public feature.

### UI-2 — App shell and navigation

Redesign desktop sidebar, mobile top/bottom navigation and More surface, global Quick Add placement, page header/subnav, content widths, focus/current-page semantics, safe-area and keyboard handling. Make every current route reachable before page restyling.

### UI-3 — Home

Build Home as specified above with real existing metrics. Resolve current screenshots' repeated-card hierarchy and excessive explanatory text. This is the first complete application of the system and should set reusable overview-card patterns.

### UI-4 — Plan and task flows

Redesign `/plan`, Today, Upcoming, Inbox, task rows/forms/dialogs, quick add, task notes/linked-note presentation and confirmation states. Preserve every task action/filter/deep link and Today section anchor.

### UI-5 — Goals and Life Areas

Redesign goals list/detail, status filters, life areas manager, archived goals, goal/milestone/task grouping, progress, linked notes, and create/edit/status/delete flows.

### UI-6 — Calendar

Redesign Agenda/Week/Day/By-area/Timeline presentation and all event/block controls. Keep FullCalendar and custom resource logic unless an implementation need is proven; this phase is presentation and responsive interaction, not rewriting recurrence semantics.

### UI-7 — Track and habits

Redesign Track/history, habit cards/strips, range selection, habit CRUD, archived habits, Today logging and quantity/correction flows. Specifically resolve the current screenshot's crowded grid, overlong repeated definitions, weak card separation, and action density.

### UI-8 — Review and history

Redesign review entry, week selection, four steps, metric look-back, reflect/adjust/priorities, finish/read-only states, past history and detail. Make it a guided flow, not a vertically stacked report.

### UI-9 — Notes

Redesign list/editor/new/archive and linked note components. Search/tags controls are included only if chunks 8.4/8.5 have shipped; otherwise preserve a clean extension point and do not show dead controls.

### UI-10 — Settings and account surfaces

Redesign preferences, reminders, devices, install experience and any supported privacy/export/account controls. Include each only when the corresponding feature exists.

### UI-11 — Whole-app consistency pass

Review public pages, all authenticated routes, dialogs, mobile/desktop, light/dark, keyboard focus, reduced motion, safe-area, content overflow and page states. Fix real discrepancies and prepare a route-by-route visual handoff. This is a visual/UX pass and does not authorize weakening existing checks.

## 7. Phase handoff and done criteria

Every phase handoff records: routes/files/components replaced, actual backend query/action paths used, preserved route and domain contracts, before/after screenshots at phone/tablet/desktop and light/dark as relevant, major decisions, accessibility observations, validation actually performed, and remaining follow-ups. No report may claim unrun checks. Keep tests unchanged unless a test needs a contract update; add/run tests only when the user explicitly asks for tests or verification.

The full redesign is complete when every existing route has been reviewed and implemented in the shared system; Home, Track, Review and Settings issues above are visibly resolved; no routes or data flows are lost; no mock data is substituted for backend data; light/dark and responsive states are coherent; and the final handoff covers all routes.

