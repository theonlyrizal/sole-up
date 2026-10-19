# SoleUp Implementation Plan

**Status:** Working plan, drafted 2026-10-20 after the spec review.
**Scope:** The full MVP, broken into small chunks. Work on one chunk at a time.

## How to use this plan

- **One chunk = one branch = one PR.** A chunk should take roughly half a day to two days. If a chunk grows, split it rather than stretching it.
- **Finish a chunk before starting the next.** "Done when" must hold: tests pass, lint/typecheck/build pass, and docs are updated if behavior changed.
- **Phases end with a dogfood checkpoint.** Use the app for real for a few days, write down what hurts, and adjust the next phase before starting it.
- **Decision gates** (chunk `N.0`) open each phase that still has unsettled product rules. Each gate lists a recommended answer. Record the outcome in `docs/decisions/` before writing schema.
- Chunks name the files they are likely to touch. These are guides, not contracts.

## Agent session protocol

Every agent session implements **exactly one chunk**. The session prompts live in [AGENT_PROMPTS.md](AGENT_PROMPTS.md). If you are an agent, follow these steps in order.

### 1. Read
- `CLAUDE.md` (loaded automatically).
- In this file:
  - this protocol
  - "Settled decisions"
  - "Conventions every chunk follows"
  - **your chunk only**
  - the "Progress log"
  - every entry in "Handoff notes"
- Read other docs (`PRODUCT_SPEC.md`, `DATA_MODEL.md`, ADRs in `docs/decisions/`) only when your chunk refers to them or you hit a conflict.

### 2. Check preconditions. If any fails, stop and tell the user.
- Every earlier chunk in the Progress log is `done`, except rows the user has explicitly marked `skipped`.
- If your chunk is the first of a phase, the previous phase's checkpoint row is `done`. If it is not, ask the user whether to proceed anyway.
- The working tree is clean, and you are on an up-to-date `main`.

### 3. Start
- Create the branch `chunk/<id>-<short-slug>`, for example `chunk/0.3-env-postgres`.
- Set your chunk's Progress log row to `in progress` and add the branch name.

### 4. Stay in scope
- Build only what your chunk describes.
- If you notice other necessary work, record it under "Follow-ups" in your handoff note. Do not do it.
- If the plan is wrong, conflicts with a doc, or conflicts with what earlier chunks built, stop and ask the user.
- If the user approves a change to the plan, edit the affected chunk text in this file and mention the change in your handoff note.

### 5. Subagent rule
Do all coding and testing in the main thread. If you must use a subagent to search files, force its model to `haiku`, and never spawn parallel coding subagents.

### 6. Verify
- Run the chunk's finish-line commands, and report their real results.
- Never mark a chunk `done` while a check is failing.
- If something can only be checked manually by the user (OAuth sign-in, push on a phone, production deploy), ask the user. If they can't confirm, record it as unverified in your handoff note.

### 7. Close out
1. Update your Progress log row: status `done`, date, and a one-line note.
2. Append a handoff note, using the template in "Handoff notes" at the end of this file.
3. Update any doc whose described behavior your chunk changed.
4. Commit on your chunk branch with the message `chunk <id>: <title>`.
5. Do not push or merge unless the user asks. The user merges each chunk before starting the next session.
6. Stop.

### 8. Never
- Commit secrets, or put real values in `.env.example`.
- Create accounts, OAuth apps or cloud resources, or enter credentials yourself. Give the user the exact steps and let them do it.
- Log user content (see "Never log" under Conventions).
- Weaken a check, skip a test, or delete a failing test to reach the finish line.

### Standard commands
Each command exists from the chunk shown.

| Command | From chunk | Does |
|---|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` / `pnpm build` | 0.2 | the obvious |
| `docker compose up -d` | 0.3 | starts local Postgres. Integration tests need it running |
| `pnpm db:generate` / `pnpm db:migrate` | 0.4 | Drizzle migrations |
| `pnpm test:unit` / `pnpm test:integration` / `pnpm test:e2e` | 0.5 | test suites |
| `pnpm verify` | 0.5 | `format:check` + `lint` + `typecheck` + `test:unit` + `test:integration` |
| `pnpm worker` | 5.1 | runs the job worker |

## Progress log

Agents update their own row. Statuses are `todo`, `in progress`, `done`, `blocked` and `skipped`. Only the user sets `skipped`. Checkpoint rows marked "(user)" are completed by the user.

| Chunk | Title | Status | Branch | Date | Note |
|---|---|---|---|---|---|
| 0.1 | Record decisions and sync docs | done | chunk/0.1-decisions-docs | 2026-10-20 | ADRs 0001–0007 written; spec, data model, roadmap, architecture and README synced |
| 0.2 | Project scaffold | done | chunk/0.2-project-scaffold | 2026-10-20 | Next.js 16.4 App Router, TS strict, ESLint + Prettier, Tailwind v4 light/dark tokens, Node 24 LTS pinned |
| 0.3 | Environment and local Postgres | todo | | | |
| 0.4 | Drizzle and migration workflow | todo | | | |
| 0.5 | Test harness | todo | | | |
| 0.6 | Authentication | todo | | | |
| 0.7 | Authorization primitives | todo | | | |
| 0.8 | Audit log infrastructure | todo | | | |
| 0.9 | User preferences | todo | | | |
| 0.10 | App shell and UI primitives | todo | | | |
| 0.11 | Reference slice: Life Areas | todo | | | |
| 0.12 | Observability and error handling | todo | | | |
| 0.13 | Continuous integration | todo | | | |
| 0.14 | First deploy | todo | | | |
| 0.✓ | Phase 0 exit check (user) | todo | | | |
| 1.0 | Decision gate: goals | todo | | | |
| 1.1 | Goals: schema and service | todo | | | |
| 1.2 | Goals: list and create/edit UI | todo | | | |
| 1.3 | Goal detail page | todo | | | |
| 1.4 | Milestones: schema and service | todo | | | |
| 1.5 | Milestones UI and progress | todo | | | |
| 1.6 | Goal archive and delete flows | todo | | | |
| 1.✓ | Phase 1 checkpoint (user) | todo | | | |
| 2.0 | Decision gate: tasks | todo | | | |
| 2.1 | Tasks: schema | todo | | | |
| 2.2 | Tasks: service | todo | | | |
| 2.3 | Quick add and Inbox | todo | | | |
| 2.4 | Plan page: task list and filters | todo | | | |
| 2.5 | Today view | todo | | | |
| 2.6 | Upcoming view | todo | | | |
| 2.7 | Tasks in goals and milestones | todo | | | |
| 2.8 | End-to-end journey test | todo | | | |
| 2.✓ | Phase 2 checkpoint (user) | todo | | | |
| 3.1 | Metrics module foundation | todo | | | |
| 3.2 | Home summaries | todo | | | |
| 4.0 | Decision gate: calendar | todo | | | |
| 4.1 | Calendar events: schema and service | todo | | | |
| 4.2 | Event create/edit UI | todo | | | |
| 4.3 | Agenda view | todo | | | |
| 4.4 | Week view | todo | | | |
| 4.5 | Integrations with Today and Home | todo | | | |
| 4.✓ | Phase 4 checkpoint (user) | todo | | | |
| 5.0 | Decision gate: reminders | todo | | | |
| 5.1 | Worker process and pg-boss | todo | | | |
| 5.2 | Service worker and PWA install | todo | | | |
| 5.3 | Push subscriptions | todo | | | |
| 5.4 | Reminders: schema and scheduling | todo | | | |
| 5.5 | Delivery job | todo | | | |
| 5.6 | Reminder UI and preferences | todo | | | |
| 5.7 | Reliability pass | todo | | | |
| 5.✓ | Phase 5 checkpoint (user) | todo | | | |
| 6.0 | Decision gate: habits | todo | | | |
| 6.1 | Habits: schema | todo | | | |
| 6.2 | Cadence engine | todo | | | |
| 6.3 | Habit CRUD UI | todo | | | |
| 6.4 | Logging | todo | | | |
| 6.5 | Track page and history | todo | | | |
| 6.6 | Home integration | todo | | | |
| 6.✓ | Phase 6 checkpoint (user) | todo | | | |
| 7.0 | Decision gate: weekly review | todo | | | |
| 7.1 | Weekly summary queries | todo | | | |
| 7.2 | Reviews: schema and service | todo | | | |
| 7.3 | Review flow UI | todo | | | |
| 7.4 | Review history | todo | | | |
| 7.5 | Review reminder | todo | | | |
| 7.✓ | Phase 7 checkpoint (user) | todo | | | |
| 8.0 | Decision gate: notes | todo | | | |
| 8.1 | Notes: schema and service | todo | | | |
| 8.2 | Notes UI | todo | | | |
| 8.3 | Linking | todo | | | |
| 8.4 | Search | todo | | | |
| 9.1 | Insight definitions and metrics | todo | | | |
| 9.2 | Insights page | todo | | | |
| 9.3 | Dismiss and correct | todo | | | |
| 10.1 | Export | todo | | | |
| 10.2 | Account deletion | todo | | | |
| 10.3 | Privacy notes | todo | | | |
| 10.4 | Security review | todo | | | |
| 10.5 | Accessibility pass | todo | | | |
| 10.6 | Backup restore drill | todo | | | |
| 10.7 | Performance pass | todo | | | |
| 10.✓ | Phase 10 exit check (user) | todo | | | |

## Settled decisions

These were decided on 2026-10-20 and become ADRs in chunk 0.1.

| Area | Decision |
|---|---|
| Audience | The developer first (dogfooding), with public-grade security |
| First loop | Goals → Today |
| Hierarchy | No Projects in v1. A task has at most one parent: a milestone, a goal, or none (inbox) |
| Task dates | `due_date` **or** `due_at` (UTC) + `due_tz` (IANA), enforced by a CHECK. Optional `planned_date` |
| Calendar and reminders | In the MVP, as their own phases after the core loop |
| Platform | Responsive web app, installable as a PWA. Reminders via Web Push |
| Stack | Next.js App Router, TypeScript (strict), PostgreSQL, Drizzle ORM, Zod |
| Hosting and jobs | One Node host running the web app and a worker (pg-boss), on managed Postgres |
| Auth | Better Auth with Google and GitHub OAuth, database sessions, account linking only on a verified email |
| History | State tables are the source of truth. A full audit log is written in the same transaction, with no user content in it |
| Deletion | Archive is a reversible status. Delete is a confirmed hard delete. Deleting a goal moves its tasks to the inbox. Deleting the account cascades everything |

**Defaults** (change them in chunk 0.1 if you disagree):
- **Data:** UUID keys. A per-user week start (default Monday). Changing time zone never rewrites stored local dates.
- **UI:** Tailwind CSS with accessible Radix-based components (shadcn/ui style).
- **Tooling:** pnpm, ESLint + Prettier, Vitest (unit and integration tests against a real Postgres), Playwright (end to end).
- **Logging:** pino with field redaction and request IDs.
- **Encryption:** the database provider's at-rest encryption for v1, documented in the privacy notes.

## Conventions every chunk follows

### Code layout

```text
src/
  app/                    Next.js routes
    (public)/             sign-in, landing
    (app)/                authenticated area: home, plan, goals, track, notes, review, settings
  components/
    ui/                   design-system primitives
    <feature>/            feature components
  server/
    db/
      client.ts
      schema/             one file per domain module
      migrations/         generated by drizzle-kit, committed
    auth/                 Better Auth config + requireUser()
    audit/                audit event types and writer
    modules/
      <domain>/
        validation.ts     Zod schemas for input
        service.ts        domain rules; every function takes userId explicitly
        queries.ts        read models for the UI
        actions.ts        Server Actions: auth → validate → service → revalidate
        *.test.ts
    jobs/                 pg-boss job definitions (Phase 5)
  lib/                    pure helpers (dates, result types), no server-only imports
worker/                   worker process entry (Phase 5)
tests/
  e2e/                    Playwright
  integration/helpers/    test DB setup and fixtures
```

### Ownership pattern

These rules apply to every table holding user data.

- Every user-owned table has `user_id uuid not null references users(id) on delete cascade`.
- Any table that other tables reference has `unique (id, user_id)`.
- Child foreign keys are composite: `(goal_id, user_id) references goals(id, user_id)`. This stops the database from ever linking records across users.
- **Watch out:** a plain `ON DELETE SET NULL` on a composite key would also null `user_id`. Use PostgreSQL's column-list form, `ON DELETE SET NULL (goal_id)`. That form needs PostgreSQL 15 or later. Drizzle may not express it, so add it in a hand-edited migration and cover it with a test.
- Service functions always filter by `user_id` and the record id together. When a record is missing **or** belongs to someone else, return the same `NotFound`.

### Vertical-slice checklist (each feature chunk)

1. Drizzle schema and migration, including constraints and indexes.
2. Zod input validation shared by actions and forms.
3. Service functions that take `userId` and write audit events inside one transaction.
4. Server Actions that call `requireUser()` first, every time.
5. UI with loading, empty, error, and success states. Keyboard accessible, with visible focus.
6. Tests:
   - service rules (unit and integration)
   - a cross-user access test
   - validation failures
   - an end-to-end test when the chunk completes a user journey

### Audit event rules

- An event stores `user_id`, `event_type` (from an allowlist), `entity_type`, `entity_id`, `occurred_at`, and `changes`. `changes` is JSON holding old and new values of **structured fields only**: status, dates, parent IDs, priority, ordering.
- Never store titles, descriptions, note bodies, reasons, or reflections in an event.
- Write the event in the same transaction as the change.
- When an entity is hard-deleted, delete its events in the same transaction. There is no foreign key to cascade them, so this must be explicit and tested.

### Never log

Note or journal content, goal reasons, review text, tokens, cookies, push subscription keys, or OAuth payloads.

---

## Phase 0: Foundation

**Goal:** A deployed, authenticated, empty app with every cross-cutting pattern proven once.

### 0.1 Record decisions and sync docs
- Create `docs/decisions/` with these ADRs:
  - 0001 stack
  - 0002 auth
  - 0003 hosting and jobs
  - 0004 task hierarchy and dates
  - 0005 history and audit log
  - 0006 deletion
  - 0007 platform and push
- Update:
  - `PRODUCT_SPEC.md`: §5 MVP list (remove Projects, add calendar/reminders sequencing) and §12 (answer the questions that are now settled).
  - `DATA_MODEL.md`: Task fields, Project marked "later", ActivityEvent → AuditEvent rules, deletion rules.
  - `ROADMAP.md`: point to this plan.
  - `README.md`: project summary and a link to the docs.
- **Done when:** no doc contradicts a settled decision.

### 0.2 Project scaffold
- Create a Next.js app (App Router, TypeScript strict, `src/`, path alias `@/`) with pnpm. Pin the Node version in `.nvmrc` and `engines`.
- Set up ESLint and Prettier. Add scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `format`, `format:check`. Test scripts come in 0.5.
- Add Tailwind and a minimal design-token layer: color, spacing, radius and type scale as CSS variables, with light and dark themes.
- Add a `.gitignore` covering env files, build output and coverage.
- **Done when:** `pnpm lint && pnpm typecheck && pnpm build` pass, and the home page renders.

### 0.3 Environment and local Postgres
- Add `docker-compose.yml` with Postgres (a version that supports `SET NULL (col)`, i.e. 15 or later; prefer the version your managed host runs). Create two databases: `soleup_dev` and `soleup_test`.
- Add `src/server/env.ts`, which validates all environment variables with Zod at startup and fails fast with a clear message. Keep a server-only/client split.
- Add `.env.example` with placeholders only: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`.
- **Done when:** a fresh clone plus the README setup steps gives a running app connected to the database.

### 0.4 Drizzle and migration workflow
- Add `drizzle.config.ts`, `src/server/db/client.ts` (pooled connection) and an empty schema index.
- Add scripts: `db:generate`, `db:migrate`, `db:studio`, `db:reset` (dev only, refuses to run in production).
- Document the convention: generated migrations are committed and reviewed, and hand-edited SQL is allowed for constraints Drizzle can't express.
- **Done when:** a trivial migration applies to the dev and test databases from scratch.

### 0.5 Test harness
- Vitest projects:
  - `unit`: pure functions, no database.
  - `integration`: real Postgres test database. Migrate once, then truncate all user tables between tests.
- Playwright config (it starts the app itself) with one smoke test of a public page.
- Scripts:
  - `test:unit`
  - `test:integration`
  - `test:e2e`
  - `verify` (`format:check` + `lint` + `typecheck` + `test:unit` + `test:integration`)
- User fixtures and test sign-in arrive in 0.6, because they need the users table.
- **Done when:** one sample test of each kind passes locally, and `pnpm verify` passes.

### 0.6 Authentication
- Better Auth with its Drizzle adapter: users, sessions, accounts and verification tables, migrated. Configure it to generate UUID user IDs and plural table names (or match whatever the ownership foreign keys reference), so every `user_id` column is a `uuid`. Check the current Better Auth docs for the exact option names.
- Google and GitHub providers. Account linking only when the provider email is verified. Database sessions, httpOnly secure cookies.
- Sign-in page with the two provider buttons. Sign-out. A session-aware layout.
- Rate limiting on auth endpoints (built-in or middleware).
- Test support:
  - Integration fixtures: `createTestUser()`, and `asUser(userId)` to call services as that user.
  - A test-only sign-in shortcut for Playwright, so end-to-end tests never touch OAuth. It is enabled only when `NODE_ENV=test` and an explicit test flag are both set, and it fails closed otherwise. A unit test proves it is unreachable in other modes.
- **Done when:**
  - an end-to-end test signs in through the shortcut and signs out
  - the user confirms a real sign-in with each provider (or it is recorded as unverified)
  - a misconfigured provider fails cleanly

### 0.7 Authorization primitives
- `requireUser()` returns `{ userId }` or redirects or throws. Middleware redirects unauthenticated requests away from `(app)` routes. This is convenience only: real checks live in actions and services.
- A shared result and error type: `NotFound`, `ValidationError`, `Conflict`. Actions map these to user-safe messages.
- An action wrapper: `authedAction(schema, handler)`. It authenticates, validates with Zod, runs the handler, and maps errors.
- **Done when:**
  - an unauthenticated call to a protected action is rejected (test)
  - invalid input returns field errors (test)

### 0.8 Audit log infrastructure
- An `audit_events` table: the fields above, plus index `(user_id, occurred_at)` and index `(user_id, entity_type, entity_id)`.
- A typed allowlist of event types in `src/server/audit/types.ts`. Each type has a Zod schema for its `changes` payload.
- `recordAudit(tx, event)`, which validates the payload and rejects unknown keys. This guards against content leaking into the log.
- **Done when:** tests prove an unknown event type or extra payload field is rejected, and that the write rolls back with its transaction.

### 0.9 User preferences
- A `user_preferences` table with typed columns: `timezone` (IANA, validated against the runtime's zone list), `locale`, `week_start` (0–6), `updated_at`. One row per user, created on first sign-in.
- On first sign-in, propose the browser's time zone and let the user confirm it. Never set it silently later.
- `lib/dates`: `todayFor(tz)` and helpers that convert local dates and instants. Use one library for time zones (for example `date-fns` v4 with `@date-fns/tz`; check the current state of `Temporal` at this chunk).
- Settings page: time zone, locale, week start.
- **Done when:** unit tests cover `todayFor` near midnight in at least 3 zones, and the settings round-trip works.

### 0.10 App shell and UI primitives
- Authenticated layout with responsive navigation: a sidebar on desktop and a bottom bar on mobile. Show only destinations that exist (Home, Goals, Plan, Settings). Add others as their phases land.
- Primitives:
  - Button, Input, Textarea, Select, Dialog, ConfirmDialog (for destructive actions), Toast
  - EmptyState, ErrorState, Skeleton
  - FormField (label, hint and error wired with `aria-describedby`)
- `error.tsx`, `not-found.tsx` and `loading.tsx` at the app root.
- A web app manifest and icons. The service worker comes later, in Phase 5.
- **Done when:** keyboard-only navigation works across the shell, and a Playwright axe check on the shell reports no serious violations.

### 0.11 Reference slice: Life Areas
This is the template every later entity copies.
- Schema: `life_areas` with `id`, `user_id`, `name`, `description?`, `color?`, `sort_order`, `status` (active | archived), timestamps, `unique(id, user_id)`, and `unique(user_id, lower(name))` among active areas.
- Service: list, create, rename/edit, reorder, archive/unarchive, delete with confirmation. Each mutation writes an audit event.
- UI: a Life Areas section under Goals, with inline create, edit and reorder, plus an archive toggle.
- Optional starter areas, offered once and never forced.
- **Done when:**
  - the full checklist above is satisfied
  - the cross-user test proves user B can't read, edit or delete user A's area
  - the audit test proves no name is stored in the event

### 0.12 Observability and error handling
- pino logger with a redaction list (auth headers, cookies, any `body`/`content`/`note` fields). A request ID is attached through middleware.
- Errors: log server-side with the request ID, and show the user a generic message plus the ID.
- A `/api/health` endpoint that checks the database connection.
- **Done when:** a forced error shows the request ID in both the UI and the logs, and a test asserts a redacted field never appears in log output.

### 0.13 Continuous integration
- GitHub Actions on each PR, in this order:
  1. install
  2. lint
  3. typecheck
  4. unit tests
  5. integration tests (Postgres service container, migrate from zero)
  6. build
  7. e2e smoke test
- Fail if `db:generate` produces a diff, meaning schema and migrations have drifted.
- **Done when:** CI is green on the PR and blocks merge when red.

### 0.14 First deploy
- Provision the managed Postgres and confirm automated backups and point-in-time recovery are on. Create the web service on the Node host.
- Configure OAuth callback URLs for production. Run migrations as a release step before the new version serves traffic.
- Document the deploy, the rollback, and how to restore from a backup.
- **Done when:** you can sign in on the production URL, create a life area, and see it persist across deploys.

**Phase 0 exit:** the roadmap's Phase 0 acceptance criteria hold.

---

## Phase 1: Goals and Milestones

**Goal:** Turn an ambition into a goal with a reason and checkpoints (Journey A, first half).

### 1.0 Decision gate
- **Goal statuses.** Recommended: `active | paused | completed | dropped | archived`. `dropped` covers changed priorities without implying failure.
- **Priority.** Recommended: an optional `low | medium | high`, not numeric.
- **Progress definition.** Recommended: completed milestones out of all non-dropped milestones, shown as "2 of 5 milestones". No percentage when there are none. Numeric targets are deferred.
- **Start and target dates.** Recommended: local dates only.

### 1.1 Goals: schema and service
- Table `goals`: `life_area_id?` (composite FK, `SET NULL (life_area_id)`), `title`, `description?`, `reason?`, `status`, `priority?`, `start_date?`, `target_date?`, `completed_at?`, `status_changed_at`, timestamps.
- Service: create, update, `changeStatus`, delete. The domain enforces allowed transitions. Leaving `completed` clears `completed_at`.
- Audit events: `goal.created`, `goal.updated` (structured fields only), `goal.status_changed`, `goal.deleted`.
- **Tests:** transition rules, life area ownership, cross-user access, deleting a life area nulls the goal's area while keeping its `user_id`.

### 1.2 Goals: list and create/edit UI
- Goals page grouped by life area, with filters by status (Active is the default).
- Create/edit form. The "Why does this matter?" field is prominent but optional. Target date is optional.
- Status actions: pause, resume, complete, drop, archive, with copy that doesn't shame.
- **Done when:** a goal can be created in under 30 seconds with only a title.

### 1.3 Goal detail page
- Header (title, status, area, dates), the reason, and placeholder sections for milestones and tasks.
- A history timeline built from audit events: status changes, date changes. No content.
- **Done when:** the detail page shows correct history after several status changes.

### 1.4 Milestones: schema and service
- Table `milestones`: `goal_id` (composite FK, cascade delete), `title`, `description?`, `status` (`open | completed | dropped`), `due_date?`, `completed_at?`, `sort_order`, timestamps.
- Service: create, edit, reorder, complete/reopen, drop, delete.
- **Tests:** a milestone on another user's goal is rejected by the database (composite FK), reorder keeps the order dense, deleting a goal cascades its milestones.

### 1.5 Milestones UI and progress
- A milestone list on goal detail: inline add, drag or keyboard reorder, complete checkbox.
- The progress display uses the 1.0 definition, with its definition shown in a tooltip or help text.
- **Done when:** keyboard reorder works, and progress is shown correctly when there are 0 milestones.

### 1.6 Goal archive and delete flows
- An archive view that lists archived goals, with restore.
- Delete confirmation states exactly what happens: "3 milestones will be deleted; 7 tasks will move to your inbox." The task part is wired in Phase 2. Until then, show the milestone count.
- **Done when:** an end-to-end test covers create → milestone → archive → restore → delete.

**Phase 1 checkpoint:** create your real goals and use them for a few days.

---

## Phase 2: Tasks, Today and Upcoming

**Goal:** Make goals actionable and plan the day (Journeys A and B).

### 2.0 Decision gate
- **Task statuses.** Recommended: `open | completed | cancelled`. "Inbox" is derived (no parent and no planned date), not a status. `in_progress` is deferred.
- **Overdue planned tasks.** When a planned date passes, the task appears under "Earlier, not done" on Today. Offer one-tap actions: today, pick a date, unplan. Never move it automatically.
- **Priority.** Recommended: the same scale as goals.
- **Estimates.** Recommended: an optional `estimated_minutes`, captured now so planned-versus-completed works later.

### 2.1 Tasks: schema
- Table `tasks`:
  - `goal_id?`, `milestone_id?` (composite FKs, `SET NULL` per column)
  - `CHECK (num_nonnulls(goal_id, milestone_id) <= 1)`
  - `title`, `notes?`, `status`, `priority?`
  - `due_date?`, `due_at?`, `due_tz?`, with `CHECK` that `due_date` excludes `due_at`, and that `due_at` and `due_tz` are both set or both null
  - `planned_date?`, `estimated_minutes?` (CHECK > 0)
  - `completed_at?`, `cancelled_at?`, `sort_order`, timestamps
- Indexes, adjusted later from real query plans:
  - `(user_id, status, planned_date)`
  - `(user_id, status, due_date)`
  - `(user_id, status, due_at)`
  - `(user_id, milestone_id)`
  - `(user_id, goal_id)`
- **Tests:** each CHECK rejects bad rows. Deleting a milestone sets the task's `milestone_id` to null and keeps `user_id`.

### 2.2 Tasks: service
- Operations: create, edit, complete, reopen, cancel, `plan(date | null)`, `reschedule due`, `move(parent)`, delete.
- Derived queries: `goalOf(task)` (direct goal, or the milestone's goal), the inbox query.
- Audit events: `task.created`, `task.completed`, `task.reopened`, `task.cancelled`, `task.planned` (old and new dates), `task.due_changed` (old and new), `task.moved`, `task.deleted`. These events are what reschedule history and planned-versus-completed rely on.
- **Tests:** the timed-deadline round trip across time zones, reopening clears `completed_at`, planning in the past is allowed (backfill), moving to another user's goal is rejected.

### 2.3 Quick add and Inbox
- Global quick add (keyboard shortcut plus a button): title first, with optional goal/milestone, planned date and due date fields.
- An Inbox view for unplanned tasks with no parent, with bulk actions: plan today, assign to a goal.
- **Done when:** capturing a task takes a single field and Enter.

### 2.4 Plan page: task list and filters
- All open tasks, filterable by goal, life area, priority, planned or due window, and status. Sort by due, planned or priority.
- Inline edit of dates and parent. Completed and cancelled tasks appear behind a toggle.
- **Done when:** filters are reflected in the URL, so a view can be bookmarked and survives refresh.

### 2.5 Today view
- Sections:
  - **Planned for today**
  - **Due today**
  - **Overdue**, shown as "Needs a decision", not in red
  - **Earlier, not done**
- An "Add to today" picker that suggests next actions from active goals and due-soon tasks.
- Complete, unplan and reschedule in one tap. A gentle "nothing planned" empty state.
- "Today" is always computed in the user's time zone.
- **Done when:** integration tests cover the boundaries at 23:59 and 00:01 in a non-UTC zone.

### 2.6 Upcoming view
- The next 14 days, grouped by local date, merging planned and due items, with a toggle to show the next 30 days.
- **Done when:** a timed deadline appears on the correct local day for the user's zone.

### 2.7 Tasks in goals and milestones
- Task lists on goal detail (direct tasks and those under each milestone). Add a task to a milestone in context.
- "Next action" for each goal: the earliest planned or due open task, or a prompt to add one.
- Goal delete confirmation now reports the real task count, and the inbox move is tested.

### 2.8 End-to-end journey test
- Playwright: create area → goal with reason → milestone → two tasks → plan one today → complete it → check Today and goal progress.

**Phase 2 checkpoint:** use Today as your daily driver for at least a week.

---

## Phase 3: Home v1

**Goal:** A calm starting screen that answers "what matters now?"

### 3.1 Metrics module foundation
- `src/server/modules/metrics/`: each metric is a named function that returns `{ value, definition, range, hasData }`. Integration tests use fixed fixtures.
- The first metrics, the ones Home needs:
  - today's planned, due and needs-a-decision counts
  - goals without a next action
  - deadlines in the next 7 days
- **Done when:** each metric has tests for empty data (`hasData: false`) and for data in and out of range.

### 3.2 Home summaries (deterministic)
- A today snapshot: counts and links to planned, due and needing-a-decision tasks.
- Goals without a next action.
- Deadlines in the next 7 days.
- Each card shows its definition and time range. There is no overall score.
- **Done when:**
  - every Home card reads from the metrics module, so definitions live in one place
  - every number links to the list it counts
  - empty data says "nothing yet" rather than "0%"

---

## Phase 4: Calendar

**Goal:** See commitments and dated work in time.

### 4.0 Decision gate
- **Recurring events.** Recommended: not in v1. Revisit after a month of use.
- **Time blocks.** Recommended: deferred. A planned task is not proof of work, and blocks add a second planning model.
- **Views.** Recommended: Week view plus Agenda. A Month view only if dogfooding shows a need.
- **All-day events.** Store a local `start_date`/`end_date` (end exclusive), not instants.

### 4.1 Calendar events: schema and service
- Table `calendar_events`:
  - `title`, `description?`, `location?`, `all_day`
  - Timed events: `start_at`, `end_at` (UTC) and `tz`. All-day events: `start_date`, `end_date`.
  - CHECKs enforce exactly one shape and that the end comes after the start.
  - `goal_id?` (optional context link), `source` (default `internal`), `external_id?`, timestamps.
- Index on `(user_id, start_at)` and on `(user_id, start_date)`.
- Service: CRUD and range queries (`eventsBetween(localStart, localEnd, tz)`).
- **Tests:** range query edge cases, events crossing midnight and DST transitions (for example, a zone with DST such as `America/New_York` on a transition day).

### 4.2 Event create/edit UI
- A form with a sensible default duration, an all-day toggle, and a time-zone display when it differs from the user's zone.
- **Done when:** validation errors are field-level and the form is fully keyboard operable.

### 4.3 Agenda view
- A merged chronological list of events, timed task deadlines and planned tasks for a chosen range.

### 4.4 Week view
- A 7-day grid starting on the user's week start. Timed events are positioned by local time, with an all-day row. Timed task deadlines appear as markers.
- On mobile, fall back to a day view or the agenda.
- **Done when:** overlapping events render side by side, and the grid is navigable by keyboard.

### 4.5 Integrations with Today and Home
- Today shows today's events at the top. Home shows the next commitment.

**Phase 4 checkpoint:** use the calendar for a week. Decide whether a Month view or recurrence is truly needed.

---

## Phase 5: Reminders and Web Push

**Goal:** Reliable reminders that work without the app open.

### 5.0 Decision gate
- **What can remind.** Recommended:
  - timed task deadlines
  - timed events
  - an optional daily planning nudge at a chosen local time
- **Defaults.** Recommended: none on by default for tasks, 10 minutes before for events. Each item can be overridden.
- **Quiet hours.** Recommended: a per-user start and end in local time. Reminders inside quiet hours are delivered when quiet hours end, or skipped if stale, per user setting.
- **Notification content.** Recommended: title only by default, with a privacy option for "You have a reminder".

### 5.1 Worker process and pg-boss
- A `worker/index.ts` entry that starts pg-boss on the same database, with graceful shutdown, a health log line and a heartbeat.
- Deploy it as a second process on the host. Document how to run it locally (`pnpm worker`).
- **Done when:** a test job enqueued from the web app is processed by the worker locally and in production.

### 5.2 Service worker and PWA install
- A minimal service worker: push and notification-click handlers only. Offline caching is not in scope.
- An install prompt or help text, including iOS "Add to Home Screen" guidance, since iOS needs it for push.
- **Done when:** the app installs on desktop and on a phone.

### 5.3 Push subscriptions
- Generate VAPID keys and add them to the environment and `.env.example`.
- A `push_subscriptions` table: `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent_label`, `created_at`, `last_success_at`, `failed_count`. Treat the keys as secrets and never log them.
- Subscribe and unsubscribe actions. A device list in Settings with a revoke button. A "Send test notification" button.
- **Done when:** the test notification arrives on two devices, and revoking stops delivery.

### 5.4 Reminders: schema and scheduling
- A `reminders` table:
  - `entity_type` (`task | event | daily_nudge`), `entity_id?`
  - `fire_at` (UTC), `offset_minutes?`, `status` (`scheduled | sent | cancelled | failed | skipped`)
  - `attempts`, `last_error_code?`, `sent_at?`
  - a unique constraint preventing duplicate reminders per entity and offset
- Scheduling happens in the **same transaction** as the entity change. Creating, rescheduling, completing, cancelling or deleting a task or event creates, moves or cancels its reminders.
- A sweeper job every minute picks due reminders with `FOR UPDATE SKIP LOCKED` and enqueues delivery.
- **Tests:** rescheduling moves `fire_at`, completing cancels, deleting cancels, and a time-zone change recomputes only daily nudges.

### 5.5 Delivery job
- Idempotent: check status before sending, and mark it sent in a transaction.
- Send with the `web-push` library. A 404 or 410 deletes the subscription. Other errors retry with backoff up to N attempts, then mark `failed`.
- Respect quiet hours and the privacy content setting. Clicking a notification deep-links to the item.
- **Tests:** a duplicate job run sends once, an expired subscription is removed, and quiet hours defer delivery.

### 5.6 Reminder UI and preferences
- Add a reminder from the task and event forms. A snooze action from the notification and in the app.
- Settings: enable or disable reminders globally, quiet hours, content privacy, daily nudge time.
- **Done when:** disabling reminders globally stops all deliveries (test).

### 5.7 Reliability pass
- Tests for DST transition days, a user changing time zone, the server running in UTC versus a user in a far zone, and a worker restart mid-batch.
- Basic visibility: a job failure count in the logs, and an admin-only query to see failed reminders.

**Phase 5 checkpoint:** rely on reminders for a week, and track any missed or duplicated notifications.

---

## Phase 6: Habits

**Goal:** Track repeated behaviors accurately and without streak pressure (Journey C).

### 6.0 Decision gate
- **Cadences.** Recommended:
  - `daily`
  - `weekly_days` (specific weekdays)
  - `times_per_week` (N per week, counted on the user's week start)
- **Log statuses.** Recommended: `completed | skipped`. "Missed" is never stored; it is derived only for display, and only for days strictly in the past.
- **Quantity habits.** Recommended: deferred.
- **Denominators:**
  - daily: active days in the range, excluding paused periods
  - weekly_days: scheduled days in the range
  - times_per_week: weeks × N
- **Skips.** Recommended: excluded from the denominator. Document this.

### 6.1 Habits: schema
- Table `habits`: `title`, `description?`, `cadence_type`, `cadence_config` (validated JSON: weekdays or count), `start_date`, `end_date?`, `status` (`active | paused | archived`), `goal_id?`, timestamps.
- Table `habit_pauses` with `(habit_id, start_date, end_date?)`, so history stays correct across pauses.
- Table `habit_logs` with `(habit_id, local_date)` unique, `status`, `note?`, timestamps.

### 6.2 Cadence engine (pure functions)
- `expectedOccurrences(habit, pauses, range)` and `consistency(habit, logs, pauses, range) → { completed, expected, skipped, definition }`.
- Exhaustive unit tests: week boundaries for each week start, a pause in the middle of a week, a start date in the middle of a week, an end date, and ranges with no data.

### 6.3 Habit CRUD UI
- Create and edit with a cadence picker. Pause, resume and archive. An optional goal link.

### 6.4 Logging
- A "Habits" section on Today with one-tap complete or skip, and undo.
- A calendar strip per habit for backfilling and correcting past days.
- **Done when:** correcting a past log updates consistency immediately, and the audit log records the correction.

### 6.5 Track page and history
- A Track destination in the navigation. Each habit shows its history and consistency for the selected range, with the definition visible.
- No streak counters by default. If streaks are added, keep them optional and never the main number.

### 6.6 Home integration
- A habit summary card on Home that uses the metrics module.

**Phase 6 checkpoint:** track real habits for two weeks, and validate that the numbers feel fair.

---

## Phase 7: Weekly Review

**Goal:** A short reflection that produces an adjustment, not a dashboard (Journey D).

### 7.0 Decision gate
- **Period.** Recommended: the user's week, from the week-start day to the following week-start day, in local dates.
- **Structure.** Recommended:
  - wins (text)
  - blockers (text)
  - lessons (text, optional)
  - priorities for next week (links to goals and tasks, plus optional free text)
- **Rules.** Recommended: one review per period, editable afterward. Skipping a week is fine and never flagged.

### 7.1 Weekly summary queries
- Using the metrics module, for a period:
  - tasks completed, planned versus completed, rescheduled count (from audit events)
  - goals with no activity in the period
  - habit consistency
  - upcoming deadlines next week
- Each metric carries its definition and a `hasData` flag.

### 7.2 Reviews: schema and service
- Table `weekly_reviews`: `period_start`, `period_end`, `wins?`, `blockers?`, `lessons?`, `priorities_note?`, `completed_at?`, timestamps, unique `(user_id, period_start)`.
- Table `weekly_review_priorities`: `review_id`, `goal_id?` or `task_id?` (exactly one), `sort_order`, with composite FKs.

### 7.3 Review flow UI
- Four steps:
  1. **Look back:** the summary from 7.1.
  2. **Reflect:** wins, blockers, lessons.
  3. **Adjust:** inline actions to pause or drop a goal, reschedule or cancel stalled tasks, plan next week.
  4. **Choose priorities:** pick goals and tasks for next week.
- Progress is saved per step, so the flow can be resumed.
- **Done when:** an end-to-end test completes a review that pauses one goal and plans two tasks for next week.

### 7.4 Review history
- A list of past reviews, a read-only view, and an edit option.

### 7.5 Review reminder
- An optional weekly push reminder at a chosen local day and time, built on the Phase 5 machinery.

**Phase 7 checkpoint:** do three real weekly reviews, and cut any step that feels like ceremony.

---

## Phase 8: Notes

**Goal:** Keep information connected to the goals it supports.

### 8.0 Decision gate
- **Format.** Recommended: Markdown text, rendered without raw HTML and sanitized.
- **Links.** Recommended: typed join tables (`note_goals`, `note_tasks`) instead of polymorphic `entity_type`/`entity_id`, so foreign keys and ownership are enforced.
- **Search.** Recommended: Postgres full-text search (a `tsvector` generated column with a GIN index).
- **Deferred:** backlinks between notes, tags, attachments.

### 8.1 Notes: schema and service
- Table `notes`: `title`, `body`, `archived_at?`, timestamps, `search_vector` generated, GIN index.
- Link tables with composite FKs and cascade on both sides.
- Audit events record created, updated and archived, **never the body or title**.

### 8.2 Notes UI
- A Notes list sorted by updated date. An editor with an autosave indicator and a preview toggle. Archive and delete with confirmation.
- **Done when:** a draft is not lost on navigation (autosave), and rendered Markdown cannot execute script (test).

### 8.3 Linking
- Link a note from goal or task detail, and show linked notes on those pages.

### 8.4 Search
- Search across notes, plus goal and task titles, with highlighted results.
- **Done when:** search returns only the current user's data (cross-user test).

---

## Phase 9: Deterministic Insights

**Goal:** A few explainable insights that help decide what to change.

### 9.1 Insight definitions and metrics
- Write `docs/METRICS.md` with each metric's definition, range and caveats. Implement any metric not already in the metrics module, with tests.
- Candidates:
  - goal inactivity (days since the last meaningful action)
  - planned versus completed
  - overdue trend
  - habit consistency trend
  - workload next week (estimated minutes)
- Define "meaningful action" explicitly as a list of audit event types.

### 9.2 Insights page
- A Reviews / Insights destination. Each insight shows its evidence, its definition, and a suggested action link. No charts unless a chart answers the question better than a sentence.

### 9.3 Dismiss and correct
- Dismiss an insight for a period, and correct the underlying records from the insight.
- An `insight_dismissals` table: `insight_key`, `period_start`, `period_end`, `created_at`, unique `(user_id, insight_key, period_start)`.

---

## Phase 10: Data Rights and Hardening (before inviting anyone)

### 10.1 Export
- Settings → Export: a JSON archive of every user-owned table, plus Markdown for notes, generated on demand and streamed. Document the format.

### 10.2 Account deletion
- Settings → Delete account. Re-authentication is required, plus typed confirmation.
- The delete is a single transaction that cascades from `users`. It also revokes push subscriptions and sessions.
- **Test:** after deletion, no row in any table references the user ID. Make this generic by iterating over the schema.

### 10.3 Privacy notes
- `docs/PRIVACY.md` and an in-app page covering:
  - what is stored
  - where it is hosted
  - backup retention and what deletion does and does not reach
  - logs and their retention
  - no AI processing yet

### 10.4 Security review
- Audit every Server Action and route handler for `requireUser`, validation and ownership scoping (a script lists them all).
- Security headers and a CSP. Dependency audit. Confirm rate limits.
- Run `/security-review` on the codebase.

### 10.5 Accessibility pass
- An axe scan on every page in Playwright, a keyboard walkthrough of each journey, and a screen-reader spot check.

### 10.6 Backup restore drill
- Restore production to a scratch database, verify the data, and document how long it took.

### 10.7 Performance pass
- Seed a year of realistic data, run `EXPLAIN ANALYZE` on the main views, and add or remove indexes based on the evidence.

**Phase 10 exit:** ready to invite others.

---

## Phase 11: Invited Beta (outline only; plan in detail when reached)

- Onboarding: a first goal and first next action in under 2 minutes, which is the activation metric.
- An in-app feedback form that sends no content without consent.
- Product metrics from database aggregates only (activation, weekly review completion, 4- and 8-week retention). No third-party trackers.
- Optional email as a reminder fallback, which needs an email provider.
- Passkeys as a sign-in option.

## Later (do not plan until the prerequisites hold)

| Feature | Prerequisite |
|---|---|
| Projects as a task parent | Dogfooding shows non-goal work needs grouping |
| Time blocks, recurring events, calendar sync | A clear repeated need from real use |
| AI-assisted weekly review (roadmap Phase 3) | Phases 7 and 9 stable, a provider ToS review, a provider adapter, cost limits |
| User-controlled memory (roadmap Phase 4) | The AI review is in use and trusted, and the memory policy is written |
| Personalized and proactive planning | Memory is in place, plus user controls for frequency and tone |
| Behavioral prediction | Research shows it beats transparent rules |

---

## Handoff notes

Each session appends one entry, newest last, and never edits earlier entries. Keep it short. It exists so the next session doesn't have to rediscover what you learned.

Template:

```markdown
### <id>: <title> (YYYY-MM-DD)
- **Built:** what now exists (files/modules, tables, routes, scripts).
- **Deviations:** anything done differently from the chunk text, and why. "None" is fine.
- **Decisions:** choices made during the chunk, and where they're recorded (ADR, chunk text, code comment).
- **Next chunk should know:** gotchas, helpers to reuse, patterns established.
- **Unverified:** checks that couldn't be run, or are waiting on the user.
- **Follow-ups:** out-of-scope work noticed, not done.
```

<!-- Agents: append entries below this line. -->


### 0.1: Record decisions and sync docs (2026-10-20)
- **Built:** `docs/decisions/` with an index (`README.md`) and ADRs 0001 stack, 0002 auth, 0003 hosting and jobs, 0004 task hierarchy and dates, 0005 history and audit log, 0006 deletion, 0007 platform and push. Updated `PRODUCT_SPEC.md` (§4 model, §5 MVP list and sequencing, journeys A/B, §7 Plan, §12 split into settled/still open), `DATA_MODEL.md` (Task fields, Project and TimeBlock status, ActivityEvent replaced by AuditEvent with its rules, deletion rules, §7 settled/open), `ROADMAP.md` (points to this plan, phase mapping, 1C/1E/1F), `README.md` (summary and docs links).
- **Deviations:** also edited `ARCHITECTURE.md` (module map: Projects marked later, `activity` → `audit`; §3 and §14 point to the ADRs), because it listed Projects as a v1 module and the finish line requires no contradicting doc.
- **Decisions:** the "Defaults" under Settled decisions were adopted unchanged: tooling/UI/logging recorded in ADR 0001, data defaults (UUIDs, week start, time zone rule) in ADR 0004, encryption in ADR 0003. Calendar views, recurring events and time blocks, and reminder types/payload content, are deliberately left open for the 4.0 and 5.0 gates, not recorded as settled. Goal delete also deletes milestones (consistent with chunk 1.4), recorded in ADR 0006.
- **Next chunk should know:** `docs/` was git-ignored at the start of this chunk; at the user's request it is now tracked (only `CLAUDE.md` stays ignored). Commit doc updates, including the Progress log and handoff notes, with your chunk.
- **Unverified:** none (docs only; no build or test commands exist yet).
- **Follow-ups:** `AGENT_PROMPTS.md` was not reviewed for consistency beyond the grep.

### 0.2: Project scaffold (2026-10-20)
- **Built:**
  - A Next.js 16.4.2 App Router app in the repo root, generated with `create-next-app@16.4.2` (app-tw template): `src/app/` (layout, home page, `globals.css`), `@/*` → `src/*`, TypeScript strict.
  - Toolchain: pnpm 11.24.0 (`packageManager`), Node 24.22.0 in `.nvmrc`, and `engines.node` `^24.19.0`. ESLint flat config (Next core-web-vitals + typescript + eslint-config-prettier), and Prettier with `prettier-plugin-tailwindcss`.
  - Scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`next typegen && tsc --noEmit`), `format`, `format:check`. Every dependency is pinned to an exact version.
  - `.gitignore` covers env files (except `.env.example`), build output, coverage and Playwright output. It still ignores `CLAUDE.md`. `.gitattributes` forces LF line endings, so `format:check` passes on Windows checkouts with `autocrlf`.
  - README setup steps.
- **Deviations:** none.
- **Decisions:**
  1. **TypeScript 6.0.3, not 7.0.2.** `typescript-eslint`, which eslint-config-next uses, supports only `<6.1`.
  2. **ESLint 9.39.5, not 10.** The react, import and jsx-a11y plugins bundled in eslint-config-next only declare support up to ESLint 9, and create-next-app itself installs `^9`. ESLint 9 is end-of-life upstream.
  3. **Node 24 (Active LTS).** Node 26 is not LTS yet.
  4. **Template defaults kept** in `next.config.ts`: `cacheComponents: true` and `partialPrefetching: true`. Tailwind runs through `@tailwindcss/turbopack`, so there is no PostCSS config.
  5. **Design tokens.** Raw CSS variables live on `:root` (`--bg`, `--surface`, `--fg-muted`, `--corner-*`, `--fs-*`, `--space-unit`). `@theme inline` maps them to utilities such as `bg-surface`, `text-muted`, `border-border`, `rounded-md`, `text-lg` and the spacing scale. The theme follows the OS, and `data-theme="light"|"dark"` on `<html>` overrides it. All of this is documented in a comment in `globals.css`.
- **Next chunk should know:**
  - `next dev` rewrites a managed block in `AGENTS.md`. The file is committed so the tree stays clean. It never touches `CLAUDE.md`.
  - Next 16 ships its docs in `node_modules/next/dist/docs/`. Check them for current APIs.
  - With `cacheComponents` on, request-time data (cookies, sessions) must be read inside `<Suspense>`. This matters for 0.6.
  - The two dark-theme token blocks in `globals.css` must stay identical.
  - Prettier needs the `tailwindStylesheet` option to sort the custom token utilities.
- **Unverified:** none. lint, typecheck, format:check and build pass. The home page renders under `pnpm dev` in light and dark, with no console errors.
- **Follow-ups:**
  - Move to ESLint 10 once eslint-config-next's plugins support it.
  - Move to TypeScript 7 once typescript-eslint supports it.
