# SoleUp Agent Prompts

Paste one prompt per session, in order. Each prompt points the agent to its chunk in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). The plan's **Agent session protocol** covers what every session does: reading, preconditions, branching, scope, verification, the Progress log, handoff notes, and committing.

You can start the next session as soon as the previous one has opened its PR. Each agent:
- opens a PR with auto-merge enabled
- waits for the previous chunk's PR to pass CI and merge, doing uncommitted work on its own chunk in the meantime
- then branches from the updated `main`

That workflow is described in protocol steps 2, 2a and 7.

Rows marked "(user)" in the Progress log are your own checkpoints. They have no prompt.

**Decision-gate sessions (N.0)** are conversations. The agent asks you each question with a recommendation, then records your answers. They write no code.

---

## Phase 0: Foundation

### 0.1: Record decisions and sync docs
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.1 only. Write ADRs 0001–0007 in docs/decisions/ (short format from ARCHITECTURE.md §14) for the Settled decisions table. Update PRODUCT_SPEC.md (§5 MVP list, §12 open questions), DATA_MODEL.md (Task fields, Projects marked later, ActivityEvent → audit event rules, deletion rules), ROADMAP.md (point to the implementation plan) and README.md (summary + docs links), so no doc contradicts a settled decision. Docs only: no code, no package installs.

Subagent rule: Do all work in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel subagents.
Finish line: Stop immediately once every doc listed in chunk 0.1 is updated, a grep for "Projects" and "ActivityEvent" in docs/ shows no contradictions with the settled decisions, and the protocol close-out is complete.
```

### 0.2: Project scaffold
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.2 only. Scaffold the Next.js App Router app in the repo root: TypeScript strict, src/ directory, @/ alias, pnpm, Node version pinned in .nvmrc and package.json engines, ESLint + Prettier, Tailwind with light/dark design tokens as CSS variables, the scripts listed in 0.2, and .gitignore. Check current stable versions before installing; do not guess versions. Do not overwrite CLAUDE.md, docs/ or README.md.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm lint, pnpm typecheck, pnpm format:check and pnpm build pass, the home page renders under pnpm dev, and the protocol close-out is complete.
```

### 0.3: Environment and local Postgres
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.3 only. Add docker-compose.yml with Postgres 15 or newer (dev and test databases, with a healthcheck), src/server/env.ts (Zod-validated, server/client split, fails fast with a readable message), .env.example with placeholders only, and README local setup steps.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once docker compose up -d reports healthy Postgres, the app boots with a valid .env.local and exits with a clear error when DATABASE_URL is missing, pnpm lint, pnpm typecheck and pnpm build pass, and the protocol close-out is complete.
```

### 0.4: Drizzle and migration workflow
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.4 only. Add drizzle.config.ts, src/server/db/client.ts (pooled, server-only), the schema index, and the scripts db:generate, db:migrate, db:studio and db:reset (db:reset refuses to run when NODE_ENV=production). Create an initial migration and document the migration conventions (commit generated SQL; hand-edited SQL allowed for constraints Drizzle can't express) in the README.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm db:migrate applies cleanly from scratch to both the dev and test databases, pnpm lint and pnpm typecheck pass, and the protocol close-out is complete.
```

### 0.5: Test harness
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.5 only. Set up Vitest with unit and integration projects (integration runs against the test database: migrate once, truncate user tables between tests), Playwright with a public-page smoke test, one sample test of each kind, and the scripts test:unit, test:integration, test:e2e and verify. User fixtures and test sign-in belong to 0.6; do not build them here.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify and pnpm test:e2e pass, and the protocol close-out is complete.
```

### 0.6: Authentication
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.6 only. Integrate Better Auth with the Drizzle adapter (UUID user IDs, migrated tables), Google and GitHub providers, account linking only on a verified email, database sessions, a sign-in page, sign-out, auth rate limiting, the createTestUser/asUser integration fixtures, and the fail-closed test-only sign-in shortcut for Playwright. Do not create OAuth apps yourself: give me the exact console steps and callback URLs, and I will put the credentials in .env.local.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e (including shortcut sign-in and sign-out) pass, I've confirmed real Google/GitHub sign-in or you've recorded it as unverified, and the protocol close-out is complete.
```

### 0.7: Authorization primitives
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.7 only. Implement requireUser(), middleware redirecting unauthenticated (app) routes, the shared result/error types (NotFound, ValidationError, Conflict) with user-safe messages, and the authedAction(schema, handler) wrapper, with tests for unauthenticated calls and invalid input.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify and pnpm build pass, and the protocol close-out is complete.
```

### 0.8: Audit log infrastructure
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.8 only. Add the audit_events table and indexes, the typed event-type allowlist with a strict Zod schema per payload, recordAudit(tx, event), and a helper to delete an entity's events inside a transaction (used by hard deletes later). Test that unknown types and extra fields are rejected and that writes roll back with their transaction.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, and the protocol close-out is complete.
```

### 0.9: User preferences
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.9 only. Add the user_preferences table (typed columns, one row per user, created on first sign-in), first-sign-in time zone confirmation (proposed from the browser, never set silently), lib/dates (todayFor and local-date/instant helpers, using one time-zone library chosen after checking current options) and the Settings page for time zone, locale and week start.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass (including the todayFor midnight tests in 3+ zones and a settings round-trip e2e), and the protocol close-out is complete.
```

### 0.10: App shell and UI primitives
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.10 only. Build the authenticated layout with responsive navigation (sidebar on desktop, bottom bar on mobile; only Home, Goals, Plan, Settings), the UI primitives listed in 0.10, root error.tsx/not-found.tsx/loading.tsx, and the web app manifest with icons. No service worker yet.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including a Playwright axe check of the shell with no serious violations and a keyboard-navigation test, and the protocol close-out is complete.
```

### 0.11: Reference slice, Life Areas
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.11 only. Implement Life Areas end to end as the reference template for every later entity: schema with unique(id, user_id) and case-insensitive unique active names, Zod validation, a service with audit events, authed Server Actions, UI (inline create/edit/reorder, archive toggle, confirmed delete, loading/empty/error states) and the optional one-time starter areas. Keep the code idiomatic and small: later chunks will copy it.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including the cross-user test and the "no name in audit payload" test, and the protocol close-out is complete.
```

### 0.12: Observability and error handling
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.12 only. Add the pino logger with a redaction list, request IDs via middleware, server-side error logging with a generic user message that shows the request ID, and /api/health with a database check. Test that redacted fields never appear in log output.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify and pnpm build pass, a forced error shows the same request ID in the UI and the logs, and the protocol close-out is complete.
```

### 0.13: Continuous integration
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.13 only. Create .github/workflows/ci.yml running, in order: install, lint, typecheck, unit tests, integration tests (Postgres service container, migrate from zero), build, e2e smoke test, plus a drift check that fails when pnpm db:generate produces changes. Cache pnpm. Give me the exact steps to make these checks required on main (branch protection or ruleset), so auto-merge waits for CI on every later PR; I apply that setting myself.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once every CI step passes locally in the same order (including the drift check showing no diff), the workflow runs green on this chunk's own PR, you've given me the required-checks steps, and the protocol close-out is complete.
```

### 0.14: First deploy
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 0.14 only. Ask me which Node host and managed Postgres I'm using. Then prepare the production start command, a release step that runs migrations before traffic switches, any host config file, and docs/DEPLOY.md (env vars, OAuth production callback URLs, deploy, rollback, backup/point-in-time-recovery check, restore steps). Walk me through provisioning; I create the accounts, databases and secrets myself.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm build && pnpm start works locally with production-like env, docs/DEPLOY.md is complete, I've confirmed sign-in and a persisted life area on the production URL (or you've recorded it as unverified), and the protocol close-out is complete.
```

---

## Phase 1: Goals and Milestones

### 1.0: Decision gate, goals
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 1.0 only. Ask me each question in 1.0 one at a time, with its recommended answer and the trade-off, and wait for my answer before the next. Then write an ADR (next free number in docs/decisions/), update chunks 1.1–1.6 in the plan and the Goal/Milestone sections of DATA_MODEL.md to match. No code.

Subagent rule: Do all work in this main thread. Never spawn subagents for this session.
Finish line: Stop immediately once the ADR is written, the plan and DATA_MODEL.md reflect my answers, and the protocol close-out is complete.
```

### 1.1: Goals, schema and service
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 1.1 only. Implement the goals table (composite FK to life_areas with ON DELETE SET NULL (life_area_id) in a hand-edited migration), Zod validation, and a service with create/update/changeStatus/delete, domain-enforced transitions, and the listed audit events. Follow the Life Areas reference slice. No UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including tests for transitions, cross-user access, and life-area deletion keeping the goal's user_id, and the protocol close-out is complete.
```

### 1.2: Goals, list and create/edit UI
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 1.2 only. Build the Goals page (grouped by life area, status filter defaulting to Active), the create/edit form with an optional "why it matters" field, and status actions with copy that doesn't shame.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including an e2e that creates a goal with only a title, and the protocol close-out is complete.
```

### 1.3: Goal detail page
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 1.3 only. Build the goal detail page: header, reason, placeholder sections for milestones and tasks, and a history timeline rendered from audit events (structured changes only, no content).

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including a test that the timeline is correct after several status changes, and the protocol close-out is complete.
```

### 1.4: Milestones, schema and service
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 1.4 only. Implement the milestones table (composite FK to goals, cascade on goal delete) and a service with create/edit/reorder/complete/reopen/drop/delete and audit events. No UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including the database-level cross-user rejection, dense reorder and goal-delete cascade tests, and the protocol close-out is complete.
```

### 1.5: Milestones UI and progress
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 1.5 only. Add the milestone list to goal detail (inline add, drag and keyboard reorder, complete checkbox) and the progress display using the 1.0 definition, with that definition visible as help text.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including keyboard reorder and the zero-milestone progress state, and the protocol close-out is complete.
```

### 1.6: Goal archive and delete flows
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 1.6 only. Add the archived-goals view with restore, and the delete confirmation that states what will be deleted (milestone count for now; task counts arrive in 2.7). Hard delete removes the goal's audit events in the same transaction.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including an e2e covering create → milestone → archive → restore → delete, and the protocol close-out is complete.
```

---

## Phase 2: Tasks, Today and Upcoming

### 2.0: Decision gate, tasks
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 2.0 only. Ask me each question in 2.0 one at a time, with its recommended answer and the trade-off, and wait for my answer before the next. Then write an ADR (next free number), and update chunks 2.1–2.8 and the Task section of DATA_MODEL.md to match. No code.

Subagent rule: Do all work in this main thread. Never spawn subagents for this session.
Finish line: Stop immediately once the ADR is written, the plan and DATA_MODEL.md reflect my answers, and the protocol close-out is complete.
```

### 2.1: Tasks, schema
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 2.1 only. Create the tasks table exactly as specified: composite FKs with per-column SET NULL, the one-parent CHECK, the due_date/due_at/due_tz CHECKs, the estimated_minutes CHECK, and the listed indexes. Use a hand-edited migration where Drizzle can't express a constraint. Schema and constraint tests only; no service or UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes with a test proving each CHECK rejects bad rows and that milestone deletion nulls milestone_id while keeping user_id, pnpm db:generate shows no drift, and the protocol close-out is complete.
```

### 2.2: Tasks, service
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 2.2 only. Implement the task service: create, edit, complete, reopen, cancel, plan, reschedule due, move parent, delete; the derived goalOf and inbox queries; and the listed audit events with old/new dates. No UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including the timed-deadline time-zone round-trip, reopen clearing completed_at, past-date planning and cross-user move rejection, and the protocol close-out is complete.
```

### 2.3: Quick add and Inbox
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 2.3 only. Build global quick add (keyboard shortcut + button, title-first with optional parent/planned/due fields) and the Inbox view with bulk "plan today" and "assign to goal". Add Inbox to navigation under Plan.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including an e2e that captures a task with one field and Enter, and the protocol close-out is complete.
```

### 2.4: Plan page, task list and filters
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 2.4 only. Build the Plan page task list with the filters and sorts listed in 2.4, stored in the URL; inline editing of dates and parent; and a toggle for completed/cancelled tasks.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including filters surviving a page reload, and the protocol close-out is complete.
```

### 2.5: Today view
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 2.5 only. Build the Today view with the four sections in 2.5, the "Add to today" picker, one-tap complete/unplan/reschedule, and the calm empty state. "Today" is always computed in the user's time zone via lib/dates.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including integration tests at 23:59 and 00:01 in a non-UTC zone, and the protocol close-out is complete.
```

### 2.6: Upcoming view
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 2.6 only. Build the Upcoming view: the next 14 days grouped by local date, merging planned and due items, with a 30-day toggle.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including a timed deadline landing on the correct local day for a non-UTC user, and the protocol close-out is complete.
```

### 2.7: Tasks in goals and milestones
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 2.7 only. Show tasks on goal detail (direct and per milestone), add tasks in context, show the per-goal "next action", and make the goal delete confirmation report real task counts, with tasks moving to the inbox.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including a test that deleting a goal moves its tasks to the inbox, and the protocol close-out is complete.
```

### 2.8: End-to-end journey test
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 2.8 only. Write the Playwright journey test described in 2.8. Fix only bugs the journey exposes; record anything larger as a follow-up.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes and pnpm test:e2e passes three consecutive runs, and the protocol close-out is complete.
```

---

## Phase 3: Home v1

### 3.1: Metrics module foundation
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 3.1 only. Create src/server/modules/metrics/ with the { value, definition, range, hasData } contract and the three metrics listed in 3.1. No UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, with tests covering empty data and in/out-of-range data for each metric, and the protocol close-out is complete.
```

### 3.2: Home summaries
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 3.2 only. Build the Home page cards from the metrics module. Each card shows its definition and range and links to the list it counts. Empty data reads "nothing yet". No overall score.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

---

## Phase 4: Calendar

### 4.0: Decision gate, calendar
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.0 only. Ask me each question in 4.0 one at a time, with its recommended answer and the trade-off, and wait for my answer before the next. Then write an ADR (next free number), and update chunks 4.1–4.5 and the CalendarEvent/TimeBlock sections of DATA_MODEL.md to match. No code.

Subagent rule: Do all work in this main thread. Never spawn subagents for this session.
Finish line: Stop immediately once the ADR is written, the plan and DATA_MODEL.md reflect my answers, and the protocol close-out is complete.
```

### 4.1: Calendar events, schema and service
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.1 only. Implement the calendar_events table for one-off events (timed vs all-day shapes enforced by CHECKs, end after start, goal and life-area links with column-list SET NULL, indexes) and a service with CRUD and eventsBetween(localStart, localEnd, tz), with audit events. No recurrence, no UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including range edge cases, events crossing midnight, and DST transition days in a zone with DST, and the protocol close-out is complete.
```

### 4.2: Recurrence engine
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.2 only. Add rrule-temporal behind src/lib/recurrence.ts: the Zod schema for the builder subset in ADR 0012, rule ↔ builder conversion, pure occurrence expansion with exceptions and a 366-day range cap, and a plain-language rule summary. No schema, no UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including the DST, month-end, leap-day, COUNT/UNTIL and exception cases listed in 4.2, and the protocol close-out is complete.
```

### 4.3: Recurring events, series, exceptions and scopes
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.3 only. Add rrule to calendar_events and the calendar_event_exceptions table, expand series in eventsBetween, and implement the three edit/delete scopes (this event, this and following, all events) in the service, with audit events. No UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including every scope on timed and all-day series, a split on a DST transition day, and cross-user access, and the protocol close-out is complete.
```

### 4.4: Event create/edit UI
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.4 only. Build the event dialog: default duration, all-day toggle with an inclusive end date, goal and life area, time-zone display when it differs from the user's zone, the repeat builder, and the scope prompt for occurrences. Field-level validation, fully keyboard operable. Add Calendar to the Plan navigation.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

### 4.5: FullCalendar foundation and Agenda view
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.5 only. Add @fullcalendar/react v7 behind one themed client wrapper and build the Agenda view: a chronological list merging events (with occurrences), timed task deadlines and planned tasks for a chosen range.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including axe and keyboard checks on the Agenda, and the protocol close-out is complete.
```

### 4.6: Week and Day views
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.6 only. Build the Week view (from the user's week start, timed events by local time, an all-day row, task deadline markers, overlaps side by side, keyboard navigation) and the Day view as the mobile fallback.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including the overlap rendering, keyboard navigation and axe tests, and the protocol close-out is complete.
```

### 4.7: Time blocks, schema and service
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.7 only. Implement time_blocks and time_block_exceptions, the block service (scopes, status, blocksBetween) and the auto-mark rules on task completion in ADR 0012, with audit events. No UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including every auto-mark rule in 4.7, task delete cascading blocks and their events, and cross-user access, and the protocol close-out is complete.
```

### 4.8: Time blocks UI
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.8 only. Build the "Block time" form, blocks on Week/Day/Agenda, slot select with a task picker, drag to move and resize, the desktop task panel, and block status actions, each drag action with a keyboard path.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including the e2e test in 4.8, and the protocol close-out is complete.
```

### 4.9: Integrations with Today and Home
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.9 only. Show today's events and time blocks as a timeline at the top of Today and the next commitment on Home (via the metrics/query layer, not ad-hoc queries in components).

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

### 4.10: Resource columns by life area
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.10 only. Build our own resource-columns day view with one column per active life area plus "No area". Do not copy or adapt FullCalendar premium code.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including overlap, keyboard and axe tests, and the protocol close-out is complete.
```

### 4.11: Resource timeline by life area
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 4.11 only. Build our own resource timeline with one row per active life area plus "No area" across a day or week. Do not copy or adapt FullCalendar premium code.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including lane placement in a non-UTC zone, keyboard and axe tests, and the protocol close-out is complete.
```

---

## Phase 5: Reminders and Web Push

### 5.0: Decision gate, reminders
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 5.0 only. Ask me each question in 5.0 one at a time, with its recommended answer and the trade-off, and wait for my answer before the next. Then write an ADR (next free number), and update chunks 5.1–5.7 and ARCHITECTURE.md §8 to match. No code.

Subagent rule: Do all work in this main thread. Never spawn subagents for this session.
Finish line: Stop immediately once the ADR is written, the plan and ARCHITECTURE.md reflect my answers, and the protocol close-out is complete.
```

### 5.1: Sweep route and external trigger
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 5.1 only. Add REMINDER_SWEEP_SECRET (env schema + .env.example placeholder; tell me how to generate it, never commit it), the secret-protected POST /api/reminders/sweep route calling a runSweep stub that logs counts only, the pnpm reminders:sweep script, and the DEPLOY.md steps for the secret and the cron-job.org job every 15 minutes (ADR 0013). No worker and no pg-boss. I configure Render and cron-job.org myself.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify and pnpm build pass, including the 401/200 route tests, pnpm reminders:sweep runs locally (show the log line), I've confirmed sweeps every 15 minutes in Render's logs (or you've recorded it as unverified), and the protocol close-out is complete.
```

### 5.2: Service worker and PWA install
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 5.2 only. Add a minimal service worker (push and notificationclick handlers only, no offline caching) and install help, including iOS Add to Home Screen guidance.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, the service worker registers in a production build, I've confirmed installs on desktop and phone (or you've recorded it as unverified), and the protocol close-out is complete.
```

### 5.3: Push subscriptions
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 5.3 only. Add VAPID config (env vars + .env.example placeholders; tell me how to generate keys, never commit them), the push_subscriptions table, subscribe/unsubscribe actions, the Settings device list with revoke, and a "Send test notification" button using the web-push library. Never log subscription keys.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, I've confirmed a test notification on two devices and that revoking stops it (or you've recorded it as unverified), and the protocol close-out is complete.
```

### 5.4: Reminders, schema and scheduling
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 5.4 only. Add the reminder offset columns, the nudge time preference and the reminders table with its partial unique index; write, move or remove reminders in the same transaction as task and event changes (including the rolling next-occurrence row for repeating events); and add claimDueReminders (FOR UPDATE SKIP LOCKED, fire_at before the next sweep) called from runSweep. Sending is 5.5.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including the scheduling, series-scope, concurrent-claim and time-zone-change tests listed in 5.4, and the protocol close-out is complete.
```

### 5.5: Delivery in the sweep
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 5.5 only. Make runSweep deliver what it claims: stale/disabled/no-device skips, quiet-hours hold with a bundled release, send via web-push, delete subscription on 404/410, retries on later sweeps up to 3 then failed, the next-occurrence row after a send or skip, title-or-private payloads with deep links, and TTL to the target (ADR 0013).

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including the overlapping-sweep-sends-once, expired-subscription, skip-reason, quiet-hours, private-payload and never-late-window tests listed in 5.5 (push mocked at the library boundary), and the protocol close-out is complete.
```

### 5.6: Reminder UI and preferences
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 5.6 only. Add reminder controls to the task and event forms (fixed offsets, 10 min pre-filled on new events, the "up to 15 minutes early" hint), snooze (from the notification and in-app, as a separate snoozed row), and the Settings section: global toggle, quiet hours, private mode, daily nudge time.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including a test that the global toggle stops all deliveries, and the protocol close-out is complete.
```

### 5.7: Reliability pass
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 5.7 only. Add the reliability tests listed in 5.7 (DST days, user time-zone change, UTC server vs far-zone user, missed sweeps, a sweep cut off mid-batch, quiet hours on a DST night), per-sweep counts in logs, the last-sweep warning, the pnpm reminders:failed script, and the Neon-usage note for the checkpoint. Fix bugs the tests expose; record anything larger as a follow-up.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify and pnpm build pass, and the protocol close-out is complete.
```

---

## Phase 6: Habits

### 6.0: Decision gate, habits
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 6.0 only. Ask me each question in 6.0 one at a time, with its recommended answer and the trade-off, and wait for my answer before the next. Then write an ADR (next free number) that includes the exact denominator definitions, and update chunks 6.1–6.6 and the Habit/HabitLog sections of DATA_MODEL.md to match. No code.

Subagent rule: Do all work in this main thread. Never spawn subagents for this session.
Finish line: Stop immediately once the ADR is written, the plan and DATA_MODEL.md reflect my answers, and the protocol close-out is complete.
```

### 6.1: Habits, schema and service
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 6.1 only. Create the habits, habit_schedules, habit_pauses and habit_logs tables per ADR 0014 with composite FKs, unique (habit_id, local_date) and (habit_id, effective_from), and a Zod schema validating cadence_config per cadence type and the check/quantity fields, plus the habit service (create, edit, schedule change, pause/resume, archive/restore, delete) with audit events. No UI, no log writes, no consistency calculations.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including cross-user, duplicate-log and invalid-cadence tests, and the protocol close-out is complete.
```

### 6.2: Cadence engine
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 6.2 only. Implement the engine functions the chunk lists (habitDays, consistency, weekProgress and helpers) as pure functions in src/lib/habits/, exactly per ADR 0014, returning their definition text. Pure code only: no database, no UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes with exhaustive unit tests for every week start, mid-week pauses and starts, end dates, the partial-week rounding table, skips, the current-week rule, quantity credit, schedule changes and empty ranges, and the protocol close-out is complete.
```

### 6.3: Habit CRUD UI
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 6.3 only. Build habit create/edit with the measure (check or quantity, unit and target), a cadence picker (edits apply from this week), pause/resume, archive/restore, confirmed delete and the optional goal link. Add the Track destination to navigation.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

### 6.4: Logging
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 6.4 only. Add the habit log service and actions per ADR 0014, the Habits section on Today (one-tap complete/skip with undo, amounts for quantity habits) and the per-habit calendar strip for backfilling and correcting past days, with audit events for corrections.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including a test that correcting a past log updates consistency immediately, and the protocol close-out is complete.
```

### 6.5: Track page and history
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 6.5 only. Build the Track page: each habit's history and consistency for a selectable whole-week range, with the definition visible. No streak counters, percentages or totals across habits.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

### 6.6: Home integration
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 6.6 only. Add a habit consistency metric to the metrics module (reusing the 6.2 engine) and a habit summary card on Home.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

---

## Phase 7: Weekly Review

### 7.0: Decision gate, weekly review
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 7.0 only. Ask me each question in 7.0 one at a time, with its recommended answer and the trade-off, and wait for my answer before the next. Then write an ADR (next free number), and update chunks 7.1–7.5 and the WeeklyReview section of DATA_MODEL.md to match. No code.

Subagent rule: Do all work in this main thread. Never spawn subagents for this session.
Finish line: Stop immediately once the ADR is written, the plan and DATA_MODEL.md reflect my answers, and the protocol close-out is complete.
```

### 7.1: Weekly summary queries
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 7.1 only. Add the weekly summary metrics listed in 7.1 to the metrics module (rescheduled counts come from audit events), each with a definition and a hasData flag. No UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including sparse-data and week-boundary tests, and the protocol close-out is complete.
```

### 7.2: Reviews, schema and service
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 7.2 only. Create the weekly_reviews and weekly_review_priorities tables (exactly-one-target CHECK, composite FKs, unique period per user) and a service with create/update/complete. Review text is never written to audit payloads. No UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including cross-user, duplicate-period and "no text in audit" tests, and the protocol close-out is complete.
```

### 7.3: Review flow UI
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 7.3 only. Build the four-step review flow (look back, reflect, adjust, choose priorities) with progress saved per step, reusing the existing goal and task actions for adjustments. Add the Review destination to navigation.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including an e2e that pauses a goal and plans two tasks for next week inside a review, and the protocol close-out is complete.
```

### 7.4: Review history
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 7.4 only. Build the past-reviews list, a read-only review view, and an edit option.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

### 7.5: Review reminder
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 7.5 only. Add an optional weekly review reminder at a chosen local day and time, reusing the Phase 5 reminder machinery (no new delivery path), configurable in Settings.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including a DST-week scheduling test, and the protocol close-out is complete.
```

---

## Phase 8: Notes

### 8.0: Decision gate, notes
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 8.0 only. Ask me each question in 8.0 one at a time, with its recommended answer and the trade-off, and wait for my answer before the next. Then write an ADR (next free number), and update chunks 8.1–8.4 and the Note/NoteLink sections of DATA_MODEL.md to match. No code.

Subagent rule: Do all work in this main thread. Never spawn subagents for this session.
Finish line: Stop immediately once the ADR is written, the plan and DATA_MODEL.md reflect my answers, and the protocol close-out is complete.
```

### 8.1: Notes, schema and service
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 8.1 only. Create the notes table with the generated search_vector and GIN index, the typed link tables with composite FKs, and a service with audit events that never include title or body. No UI.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, including cross-user link rejection and "no content in audit" tests, and the protocol close-out is complete.
```

### 8.2: Notes UI
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 8.2 only. Build the Notes list and editor with autosave and indicator, a Markdown preview without raw HTML and sanitized, and archive and delete with confirmation. Add Notes to navigation.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including autosave-on-navigation and a test that script in Markdown never executes, and the protocol close-out is complete.
```

### 8.3: Linking
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 8.3 only. Link notes from goal and task detail pages and show linked notes there.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

### 8.4: Search
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 8.4 only. Add search across notes (full-text) and goal and task titles, with highlighted results, scoped to the current user.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including the cross-user search test, and the protocol close-out is complete.
```

---

## Phase 9: Deterministic Insights

### 9.1: Insight definitions and metrics
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 9.1 only. Write docs/METRICS.md (definition, range and caveats for every metric, including "meaningful action" as an explicit list of audit event types) and implement any listed metric not yet in the metrics module. Before writing, confirm the "meaningful action" list with me.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify passes, every metric in the code is documented in METRICS.md and vice versa, and the protocol close-out is complete.
```

### 9.2: Insights page
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 9.2 only. Build the Insights page under Review: each insight shows its evidence, definition and a suggested action link. Use a chart only where it answers the question better than a sentence, and justify any chart in your handoff note.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

### 9.3: Dismiss and correct
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 9.3 only. Add the insight_dismissals table and dismiss-for-period actions, and links from each insight to correct its underlying records.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

---

## Phase 10: Data Rights and Hardening

### 10.1: Export
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 10.1 only. Build Settings → Export: a streamed JSON archive of every user-owned table plus Markdown for notes, scoped to the current user, with the format documented in docs/EXPORT_FORMAT.md.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including a test that iterates over the schema to prove every user-owned table is exported and that no other user's rows are included, and the protocol close-out is complete.
```

### 10.2: Account deletion
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 10.2 only. Build Settings → Delete account: re-authentication, typed confirmation, a single transaction cascading from users, and revocation of sessions and push subscriptions.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass, including a schema-iterating test proving no row anywhere references the deleted user ID and that another user's data is untouched, and the protocol close-out is complete.
```

### 10.3: Privacy notes
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 10.3 only. Write docs/PRIVACY.md and an in-app privacy page covering the topics in 10.3, based on what the code and DEPLOY.md actually do. Ask me about host backup retention rather than guessing. Promise nothing the implementation doesn't guarantee.

Subagent rule: Do all work in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel subagents.
Finish line: Stop immediately once both are written, every claim maps to code or config you've checked, pnpm verify and pnpm build pass, and the protocol close-out is complete.
```

### 10.4: Security review
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 10.4 only. Write a script that lists every Server Action and route handler and checks each for requireUser, validation and user scoping. Add security headers and a CSP, run the dependency audit, confirm rate limits, and run /security-review. Fix high-severity findings; list the rest as follow-ups.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once the script reports no unguarded endpoints, no high-severity findings remain open, pnpm verify, pnpm build and pnpm test:e2e pass, and the protocol close-out is complete.
```

### 10.5: Accessibility pass
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 10.5 only. Add a Playwright axe scan for every page, keyboard-only e2e walkthroughs of each user journey, and fix the violations found. List screen-reader spot checks for me to do manually.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify, pnpm build and pnpm test:e2e pass with zero serious or critical axe violations, and the protocol close-out is complete.
```

### 10.6: Backup restore drill
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 10.6 only. Guide me through restoring production to a scratch database using docs/DEPLOY.md, and give me verification queries (row counts per table, latest timestamps). I run every command against the host. Then update DEPLOY.md with what actually happened and how long it took.

Subagent rule: Do all work in this main thread. Never spawn subagents for this session.
Finish line: Stop immediately once I've confirmed the restore verified, DEPLOY.md reflects the real procedure and timing, and the protocol close-out is complete.
```

### 10.7: Performance pass
```text
Read docs/IMPLEMENTATION_PLAN.md: the Agent session protocol, then chunk 10.7 only. Write a dev-only seed script for a year of realistic data, run EXPLAIN ANALYZE on the main views' queries, and add or remove indexes via a migration based only on that evidence. Record before/after timings in the handoff note.

Subagent rule: Do all coding and testing in this main thread. If you must use a subagent to search files, force its model to haiku and never spawn parallel coding subagents.
Finish line: Stop immediately once pnpm verify and pnpm build pass, every index change is backed by a recorded plan, and the protocol close-out is complete.
```
