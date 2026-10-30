# SoleUp UI redesign agent prompts

These are implementation briefs for the redesign plan in [UI_IMPLEMENTATION_PLAN.md](UI_IMPLEMENTATION_PLAN.md). Run one phase at a time, keep each handoff reviewable, and do not start a later phase until the current one is reviewed. The user authorizes a substantial frontend rebuild: agents may add, remove, consolidate, or replace presentation components and page composition.

## Version control requirements

Before starting any phase, follow `docs/IMPLEMENTATION_PLAN.md` → **Agent session protocol** for the repository's branch/PR workflow, including its preflight, branch creation, progress tracking, commit format, PR body, merge/check process, and close-out. Treat one UI phase as one chunk, one branch, and one PR. Use the established branch format `chunk/ui-<n>-<slug>` (for example `chunk/ui-3-home`), target `main`, and finish/merge the current phase before creating the next. UI-0 begins on the latest `main` with current product work merged; each subsequent UI phase waits for the preceding UI phase PR to merge. Never commit to `main`, force-push, bypass branch protection, bundle unrelated work, or silently work around a failed precondition. Record phase status and handoff only in the UI phase tracker/handoff section of `UI_IMPLEMENTATION_PLAN.md`; keep the product-feature progress log unchanged. Use descriptive commits in the established `chunk <id>: <imperative summary>` format, no attribution trailers, and the repository's PR/auto-merge/check process. Report PR and merge/check status before stopping.

## Mandatory context and constraints for every phase

- Read `docs/ui/README.md`, `DESIGN_DECISIONS.md`, `DESIGN_SYSTEM.md`, `UI_IMPLEMENTATION_PLAN.md`, and the phase-specific route/ADR/product docs before editing.
- Read the relevant current Next.js guide under `node_modules/next/dist/docs/` before code changes, as required by the repo's `AGENTS.md`; use the guide for the actual APIs being edited and heed deprecations.
- Existing backend tables, authenticated server queries/services/actions, Zod validation, and domain rules are the source of truth. Fetch through existing server paths. Never expose a database client to the browser, duplicate business rules in client code, invent endpoints, or use mock data in place of real records.
- You may replace frontend components freely when needed. Before deleting files, search their imports and preserve any data/domain helper or accessibility behavior still needed. Keep route, query-string, hash, notification deep-link, authorization, user-scoping, audit, privacy, timezone, and error contracts.
- Preserve loading/empty/error/saved/conflict/pending/undo/destructive-confirmation states. Full definitions must remain accessible, but verbose methodology should be behind a labelled disclosure instead of repeated in every card by default.
- Make light and dark themes intentional. Reference visuals are blue/aqua and white surfaces with restrained warm accent. Do not reproduce fake fitness metrics, invented sample data, a life score, streak pressure, or unimplemented features.
- Keep keyboard and screen-reader behavior, visible focus, contrast, reduced motion, touch targets, safe areas, and existing calendar navigation intact.
- Do not add or run tests unless the user asks to test or verify. Do not state that validation passed unless it was actually performed.
- Do not commit, push, or open/merge a PR until the repository session protocol's preconditions and requested review steps are satisfied.
- Handoff: list routes/files changed, backend paths consumed, behavior contracts retained, responsive/light-dark visual review, accessibility observations, actual validation and unverified follow-ups.

## UI-0 — Route and behavior audit

```text
Do UI-0 only. Read the shared context above and the current product spec, data model, implementation plan progress log, and ADRs 0010–0016. Inspect all public and authenticated routes, route components, query functions, server actions, shared UI, loading/error boundaries, existing accessibility/E2E coverage and current responsive shell. Use the supplied current-UI screenshots as evidence: Home repeats long definitions in equal-weight cards; Track overpacks the legend/history/actions; Review exposes too many equally weighted elements and long metrics; Settings lacks grouping. Create docs/ui/UI_AUDIT.md with a complete route inventory and, for every route: data source, interactions, URL/deep-link contracts, existing states, current pain points, target hierarchy, and dependencies on unfinished roadmap chunks. Include baseline viewport/theme screenshot matrix (phone/tablet/desktop × light/dark) and a component migration map that identifies reusable vs replaceable files. Do not change code or product behavior. Do not guess: mark anything you could not inspect.
```

## UI-1 — Material 3 Expressive design system

```text
Do UI-1 only. Read docs/ui/ and inspect current src/app/globals.css, src/components/ui, app layout and all token usages. Read the local current Next.js CSS, font, and client-boundary docs before code. Implement semantic light/dark tokens (background/surfaces, foreground, primary blue, secondary aqua, tertiary warm, outline, error, success, focus), a usable type scale, shape/spacing/elevation roles, focus and reduced-motion rules. Refactor or replace shared Button, Input, Textarea, Select, FormField, Dialog/ConfirmDialog, Toast, Skeleton, EmptyState and ErrorState as needed. Preserve Radix semantics, labels/errors, focus trap/restore, pending/disabled behavior and native form semantics. Create examples only in a non-shipping/dev-only surface if feasible; do not redesign feature routes yet. Update DESIGN_SYSTEM.md only if a concrete implementation decision requires it. Keep old components until import searches prove they are unused. Provide a before/after component and theme handoff, reporting only actual validation.
```

## UI-2 — App shell and navigation

```text
Do UI-2 only. Read the shared context and inspect route/nav tests, AppNav, nav-items, authenticated layout, QuickAdd, auth/timezone gate and current mobile safe-area behavior. Read local Next.js layout/navigation/client-component docs. Redesign desktop rail and mobile top bar + four-item bottom navigation (Home, Plan, Track, More). More must expose Goals, Notes, Review and Settings through an accessible labelled menu/sheet; Plan retains contextual Today/Upcoming/Calendar/Inbox/All tasks links. Set clear active and active-parent states, page title/action layout, bounded content container, and safe-area/keyboard spacing. Keep all paths, skip link, timezone confirmation, auth boundary, sign-out, Quick Add shortcut and current active-route semantics. Make every route reachable at phone widths and ensure the bottom bar never covers content/dialog controls. Update nav expectations only as needed; don't change feature pages in this phase. Report route coverage and responsive observations.
```

## UI-3 — Home

```text
Do UI-3 only. Read Home sections in docs/ui/UI_IMPLEMENTATION_PLAN.md, PRODUCT_SPEC.md §8–9, Home metric code, home page, current screenshot diagnosis, and local Next.js rendering/loading/error docs. Rebuild /home composition using existing metric props and backend query paths. Above the fold, prioritize the next useful action/commitment and Today counts. Use responsive compact cards; on desktop place related summaries in a grid, on mobile order them by urgency. Include upcoming deadlines, goals with no next action, and each active habit's existing range figure plus this week's progress. Keep lists concise with View all; link every count/card to the exact source section. Show a short explanation and range/as-of context; put full counting formulas/exclusions in a labelled accessible disclosure. Compact empty cards with a useful CTA. Never add a life score or invented record. Preserve hasData vs zero, date/zone formatting, anchor links, and refresh-on-new-day. Replace the old Home components if appropriate and remove only verified-unused presentation files. Provide phone/tablet/desktop and light/dark visual review notes.
```

## UI-4 — Plan, Today, Upcoming, Inbox and task flows

```text
Do UI-4 only. Read ADRs 0011–0013 as relevant, task/Today/Upcoming product sections, route files, query functions, actions, task dialogs, quick add, linked notes and screenshot/route audit. Read local Next.js guides for server data, forms/actions, loading/error and client boundaries. Rebuild /plan, /plan/today, /plan/upcoming and /plan/inbox plus task row/form/dialog/quick-add presentation. Make task title dominant; parent, due/planned dates, priority and estimate secondary. Keep filters/sort in a compact responsive toolbar or filter sheet, preserve URL query values and closed-task toggle. Today order must retain Schedule, planned, needs-a-decision, due, earlier, with existing actions and anchors. Upcoming groups by user's local date and preserves 7/14/30 range. Inbox supports quick capture, bulk planning and goal assignment. Preserve nonjudgmental 'Earlier, not done' semantics, completion/reschedule/cancel/delete distinctions, note linking and all server-action behavior. No new task rules or static data. Visually review empty, populated, pending and error presentations at phone/tablet/desktop.
```

## UI-5 — Goals, milestones, Life Areas and archives

```text
Do UI-5 only. Read ADR 0010, goal/milestone/area specs and data model, all existing goal/area components and route queries/actions, and local Next.js route/error docs. Redesign /goals, /goals/[goalId], /goals/areas and /goals/archived. Goals list: status filters remain URL-backed; organize by life area; show title/status/target, explainable milestone progress and next action with clear grouping. Goal detail: make purpose ('why'), status and next action prominent; present milestones/tasks and linked notes as connected sections; put activity history in secondary disclosure. Areas manager: clear add/edit/reorder/archive and optional starter offer; color always has a text label. Archives emphasize restore and keep delete consequences in confirmation. Preserve all status transitions, progress math, sort/order, due-date/timezone behavior, task/milestone detach behavior, note retention, counts, audit semantics and action boundaries. Frontend structure can be completely replaced; do not change services/schema. Provide responsive and state review.
```

## UI-6 — Calendar, event and time-block UX

```text
Do UI-6 only. Read ADRs 0012 and 0013, calendar routes, FullCalendar wrapper/theme, custom resource views, event/block forms/dialogs, recurrence builder, task panel, move/resize scope prompt, calendar query helpers and local Next.js CSS/client docs. Redesign /plan/calendar for Agenda, Week, Day, By area and Timeline. Keep FullCalendar and custom resource behavior unless a specific issue proves a code change necessary. Build a responsive header with date navigation, view selection and event/block creation; mobile should use readable Agenda/Day rather than shrink a wide grid. Restyle time axis/all-day row/current time/overlaps/selection and event types. Preserve URL date/view/span parameters, local timezone, RRULE expansion/scopes/exceptions, reminders, task link/status behavior, archived/no-area lanes, keyboard movement and move/resize confirmation. Forms should prioritize essential title/time then progressively disclose repeat, reminder and association. No recurrence or data changes. Report accessibility and responsive review.
```

## UI-7 — Track and habit UX

```text
Do UI-7 only. Read ADR 0014, habits/Today product sections, cadence and consistency helpers, Track/archived/Today habit components, relevant actions/queries, and local Next.js guides. Fully redesign /track, /track/archived and the Today habit section. Track: compact week-range segmented selector and date context; compact status legend shown once; distinct habit cards with name/measure/cadence/optional goal, this-week progress and a legible history. Replace the dense cramped grid with accessible day cells/weekly strips sized for touch. At phone width, use a clear horizontal week strip or compact scrolling week with weekday labels; no tiny multiweek spreadsheet. Put the full existing consistency calculation in a labelled per-habit disclosure rather than repeating paragraphs. Keep done/partial/skipped/missed/not-active distinctions, quantity target and amount editor, active-day backfill/correction, Undo, pause/resume/archive/restore/delete confirmation and range/anchor URLs. Do not add streaks or combined percentages. Today logging remains one tap when applicable. Warm accent is secondary and never the only indicator. Rebuild components as needed without changing cadence/domain services.
```

## UI-8 — Weekly Review, past reviews and review detail

```text
Do UI-8 only. Read ADR 0015, review product spec and metrics definitions, review routes/flow/step components/actions, current screenshot diagnosis and local Next.js docs. Rebuild /review, /review/history and /review/history/[reviewId] as a calm guided review. Entry should clearly show selected week/open-until/finished state, alternative open week and secondary Past reviews link. Use an expressive compact stepper; phone shows one active step with 'Step n of 4', desktop may show a compact rail. Look back presents compact evidence/value/short explanation and reveals full definition/range on demand; don't stack long full metric paragraphs by default. Reflect offers optional wins/blockers/lessons with clear save state. Adjust groups existing goal and stalled-task actions with consequences. Priorities selector/order controls communicate the max 10. Keep step navigation, URL step parameter, autosave-on-leaving, retry/error/input retention, empty finish, period lock/read-only, linked current titles/statuses, current summary semantics, delete confirmation and reminder links. Do not alter review service or metric logic. Report phone/desktop and keyboard walkthrough observations without claiming unrun validation.
```

## UI-9 — Notes

```text
Do UI-9 only. Read ADR 0016, note content allowlist/privacy requirements, current Notes routes/editor/autosave/link components and local Next.js docs. Redesign /notes, /notes/new, /notes/[noteId] and /notes/archived. List should scan by title, short preview and update date; include search only if 8.4 exists and tags only if 8.5 exists, otherwise no dead controls. Editor is content-first with mobile-usable toolbar, discreet but clear save state, Linked to section, and secondary archive/delete actions. Preserve TipTap allowlist and safe renderer, autosave timing/navigation/pagehide, stale-save conflict recovery, Retry and retained local content, link picker, archive/restore/delete behavior, no content in logs/audit and query privacy. Keep note editor text uninterrupted by decorative surfaces. No HTML injection or new note schema. Remove obsolete presentation components only after import review.
```

## UI-10 — Settings, reminders, notifications and account surfaces

```text
Do UI-10 only. Read preference/reminder/push/PWA routes and forms, ADRs 0007/0013, privacy/data-rights docs if implemented, and local Next.js forms/client/layout docs. Rebuild /settings as grouped, scannable sections rather than one narrow continuous form: Time & region (timezone/locale/week start); Reminders (global/private, nudge, review day/time, quiet hours, truthful sweep/device status); Devices/notifications; Install app; account/privacy/export/delete only where those features have actually shipped. Each group must clearly show save boundary and pending/success/error status. Use concise help copy; keep full delivery caveats accessible without repeating prose under every toggle. Preserve scheduling semantics, quiet hours, permission/revocation/test actions, device limits and truthful status warnings. Destructive account actions must be visually separate and confirmed. Do not render placeholders for phase 10 features that are not implemented.
```

## UI-11 — Whole-app visual consistency and UX pass

```text
Do UI-11 only after UI-1–UI-10 have been reviewed. Walk every route in docs/ui/UI_AUDIT.md and inspect public/authenticated screens, dialogs, menus, empty/loading/error/success states at phone/tablet/desktop and light/dark. Check keyboard focus/order, reduced motion, color contrast, labels, safe areas, overflow and layout shift. Fix concrete consistency/usability issues using existing shared tokens/components; do not change product rules or disable checks. Verify that no old visual components remain accidentally duplicated or dead; remove only confirmed-unused files. Deliver a route-by-route final handoff with before/after screenshots, backend paths/contracts preserved, actual validation, manual checks still needed and remaining issues. Do not claim automated tests or manual checks that were not performed.
```

