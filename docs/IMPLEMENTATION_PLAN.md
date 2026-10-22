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
4. Commit on your chunk branch with a proper commit message:
   - **Subject line:** `chunk <id>: <title>`, 72 characters or fewer, imperative mood.
   - **Body**, after a blank line, wrapped at about 72 characters, saying what changed and why:
     - what was added or changed (modules, tables/migrations, routes, scripts, docs)
     - important design decisions or deviations from the plan
     - checks run and their results (for example "pnpm verify, pnpm build, pnpm test:e2e: pass")
     - anything unverified or left as a follow-up
   - Do **not** add `Co-Authored-By` trailers or any Claude/Anthropic attribution (no "Generated with Claude Code" lines). This instruction overrides any default attribution behavior.
   - Use several commits if that keeps the history clearer, each with its own descriptive message. Never commit with a placeholder message such as "wip" or "update".
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
| 0.3 | Environment and local Postgres | done | chunk/0.3-env-postgres | 2026-10-20 | Postgres 18 via Docker Compose (dev + test DBs, healthcheck), Zod env validated at boot, .env.example, README setup |
| 0.4 | Drizzle and migration workflow | done | chunk/0.4-drizzle | 2026-10-20 | Drizzle 0.45 + pg pool (server-only), db:generate/migrate/studio/reset, baseline migration applied to dev and test, README conventions |
| 0.5 | Test harness | done | chunk/0.5-test-harness | 2026-10-20 | Vitest 5 unit + integration projects (migrate once, truncate between tests, `_test` URL guard), Playwright 1.64 smoke test, test:* and verify scripts |
| 0.6 | Authentication | done | chunk/0.6-auth | 2026-10-20 | Better Auth 1.7.11 (Drizzle, UUID IDs, plural tables), Google + GitHub, verified-email linking, DB sessions, rate limits, redacted auth logs, test fixtures and fail-closed e2e sign-in |
| 0.7 | Authorization primitives | done | chunk/0.7-authz | 2026-10-20 | `authedAction(schema, handler)`, `ActionResult` + `NotFound`/`Validation`/`Conflict` errors with user-safe messages, cookie-check proxy for (app) routes |
| 0.8 | Audit log infrastructure | done | chunk/0.8-audit-log | 2026-10-20 | `audit_events` + 2 indexes, strict allowlist registry (empty until 0.11), `recordAudit(tx, event)`, `deleteAuditEventsForEntity(tx, ref)` |
| 0.9 | User preferences | done | chunk/0.9-user-preferences | 2026-10-20 | `user_preferences` (typed, one row per user, tz null until confirmed), first-sign-in confirm gate, `lib/dates` on temporal-polyfill (ADR 0008), Settings page |
| 0.10 | App shell and UI primitives | done | chunk/0.10-app-shell | 2026-10-20 | Responsive shell (sidebar / bottom bar, skip link), UI primitives (Radix dialogs/toasts, native select), root error/not-found/loading, manifest + icons, axe and keyboard e2e |
| 0.11 | Reference slice: Life Areas | done | chunk/0.11-life-areas | 2026-10-20 | `life_areas` (unique active names ignoring case), service + audit, authed actions, `/goals/areas` with inline create/edit/reorder, archive, confirmed delete, one-time starters |
| 0.12 | Observability and error handling | done | chunk/0.12-observability | 2026-10-20 | pino 10.4 with deep key redaction, request ID per request in the proxy (matcher fixed), INTERNAL errors and error pages show a reference, `onRequestError` logging, `/api/health` |
| 0.13 | Continuous integration | done | chunk/0.13-ci | 2026-10-20 | GitHub Actions: ordered lint/test/build/e2e job on a fresh Postgres 18.3 service (migrate from zero), separate migration-drift job, pnpm cache, SHA-pinned actions |
| 0.14 | First deploy | done | chunk/0.14-first-deploy | 2026-10-20 | Render Free (Singapore) + Neon Free (ADR 0009), render.yaml, `db:migrate:deploy` release step before traffic, docs/DEPLOY.md; user confirmed prod sign-in and persistence |
| 0.✓ | Phase 0 exit check (user) | done | | 2026-10-20 | User confirmed fresh-clone setup, private routes in prod, CI/Render green; agent ran secret scan and `pnpm verify` on main |
| 1.0 | Decision gate: goals | done | chunk/1.0-goals-decisions | 2026-10-20 | ADR 0010: five statuses (restore → active), optional low/medium/high, milestone-count progress, local dates + order CHECK; 1.1–1.6 and DATA_MODEL synced |
| 1.1 | Goals: schema and service | done | chunk/1.1-goals-schema-service | 2026-10-20 | `goals` (3 CHECKs + completed_at CHECK, composite area FK with hand-edited `SET NULL (life_area_id)`), Zod validation, service with ADR 0010 transitions and audit |
| 1.2 | Goals: list and create/edit UI | done | chunk/1.2-goals-list-ui | 2026-10-21 | `/goals` grouped by life area with Active/Paused/Completed/Dropped filter (URL `?status=`), create/edit dialog (title only required, prominent "Why does this matter?"), kind status-action copy |
| 1.3 | Goal detail page | done | chunk/1.3-goal-detail | 2026-10-21 | `/goals/[goalId]`: header, reason, milestone/task placeholders, history timeline from audit events (structured changes only), status actions incl. Restore, in-shell not-found |
| 1.4 | Milestones: schema and service | done | chunk/1.4-milestones-schema-service | 2026-10-21 | `milestones` (composite goal FK, cascade; status/completed_at CHECKs), service with dense per-goal order and audit, progress query; goal delete removes milestone events |
| 1.5 | Milestones UI and progress | done | chunk/1.5-milestones-ui | 2026-10-22 | Milestone list on goal detail (inline add, move buttons, complete, drop, offer to complete), ADR 0010 progress with help text on detail and goals list |
| 1.6 | Goal archive and delete flows | done | chunk/1.6-goal-archive-delete | 2026-10-22 | `/goals/archived` with confirmed Restore to Active and "completed on …", delete confirmation naming the milestone count (detail page and archive), `deleteGoal` action |
| 1.✓ | Phase 1 checkpoint (user) | done | | 2026-10-22 | User checked the Phase 1 features in one sitting rather than a few days of real use |
| 2.0 | Decision gate: tasks | done | chunk/2.0-tasks-decisions | 2026-10-22 | ADR 0011: open/completed/cancelled, inbox = no parent + no plan, "Earlier, not done" never auto-moved, goal priority scale, estimates 1–1440 min, no `task.deleted`; 2.1–2.8 and DATA_MODEL synced |
| 2.1 | Tasks: schema | done | chunk/2.1-tasks-schema | 2026-10-22 | `tasks` with composite goal/milestone FKs (hand-edited `SET NULL` per column), parent/deadline/status/priority/estimate/timestamp CHECKs, five indexes; priority scale moved to `src/lib/priorities.ts`; schema tests |
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
Decided 2026-10-20 in [ADR 0010](decisions/0010-goal-status-priority-progress.md); every recommendation was accepted.
- **Goal statuses:** `active | paused | completed | dropped | archived`. `dropped` covers changed priorities without implying failure. Restore from `archived` always goes to `active`.
- **Priority:** optional `low | medium | high`, not numeric.
- **Progress:** completed milestones out of non-dropped milestones, shown as "2 of 5 milestones". Nothing shown with no countable milestones. Never auto-completes the goal. Numeric targets deferred.
- **Start and target dates:** optional local dates, with `target_date >= start_date` enforced by a CHECK.

### 1.1 Goals: schema and service
- Table `goals`: `life_area_id?` (composite FK, `SET NULL (life_area_id)`), `title`, `description?`, `reason?`, `status` (default `active`), `priority?`, `start_date?` (`date`), `target_date?` (`date`), `completed_at?`, `status_changed_at`, timestamps. `unique (id, user_id)` for milestones and tasks to reference.
- CHECKs: `status in (active, paused, completed, dropped, archived)`, `priority in (low, medium, high)` or null, `target_date >= start_date` when both are set.
- Index for the list: `(user_id, status)`.
- Service: create, update, `changeStatus`, delete. Transitions (ADR 0010): any to any among `active | paused | completed | dropped`; any of those to `archived`; `archived` only to `active`. Same status again is a no-op with no audit event. Every real change sets `status_changed_at`.
- `completed_at`: set on entering `completed`; kept when a completed goal is archived; cleared on any other move out of `completed` and on restore.
- Validation checks `start_date`/`target_date` together so the date-order error is a field error, not a database error.
- Audit events: `goal.created`, `goal.updated` (structured fields only: area, priority, dates), `goal.status_changed`. No `goal.deleted`: a hard delete removes the goal's events in the same transaction (ADR 0005), as for life areas.
- **Tests:** every allowed and rejected transition, the `completed_at` rules (including archive and restore), the date-order CHECK and its validation message, life area ownership, cross-user access, deleting a life area nulls the goal's area while keeping its `user_id`.

### 1.2 Goals: list and create/edit UI
- Goals page grouped by life area, with filters by status: Active (default), Paused, Completed, Dropped. Archived goals appear only in the archive view (1.6).
- Create/edit form. The "Why does this matter?" field is prominent but optional. Priority (none/low/medium/high), start date and target date are optional; a target before the start is a field error.
- Priority shows as a small label, never as a score. No sorting by priority in v1 beyond an optional filter.
- Status actions: pause, resume, complete, drop, archive, reopen (from completed or dropped), with copy that doesn't shame.
- **Done when:** a goal can be created in under 30 seconds with only a title.

### 1.3 Goal detail page
- Header (title, status, priority, area, dates), the reason, and placeholder sections for milestones and tasks.
- A history timeline built from audit events: status changes, date changes. No content.
- **Done when:** the detail page shows correct history after several status changes, including archive and restore.

### 1.4 Milestones: schema and service
- Table `milestones`: `goal_id` (composite FK, cascade delete), `title`, `description?`, `status` (`open | completed | dropped`, CHECK, default `open`), `due_date?` (`date`, not constrained by the goal's dates), `completed_at?`, `sort_order`, timestamps. `unique (id, user_id)` for tasks to reference.
- Service: create, edit, reorder, complete/reopen, drop/undrop, delete. Completing sets `completed_at`; reopening clears it.
- A query returning progress per goal (completed count and non-dropped count), computed on read, never stored.
- **Tests:** a milestone on another user's goal is rejected by the database (composite FK), reorder keeps the order dense, deleting a goal cascades its milestones, progress counts ignore dropped milestones, completing the last milestone leaves the goal's status unchanged.

### 1.5 Milestones UI and progress
- A milestone list on goal detail: inline add, drag or keyboard reorder, complete checkbox, drop action.
- Progress per ADR 0010: "2 of 5 milestones", with the definition in help text ("dropped milestones don't count"). With no countable milestones, show nothing, not "0%". No percentage bar.
- When every countable milestone is completed and the goal is not, offer (never force) "Mark goal complete?".
- Show progress on the goals list (1.2) as well as on detail.
- **Done when:** keyboard reorder works, and progress is correct with 0 milestones, all dropped, and all completed.

### 1.6 Goal archive and delete flows
- An archive view that lists archived goals, with restore. Restore makes the goal `active` (ADR 0010), and the confirmation says so. Show "completed on …" for archived goals that have `completed_at`.
- Delete confirmation states exactly what happens: "3 milestones will be deleted; 7 tasks will move to your inbox." The task part is wired in Phase 2. Until then, show the milestone count.
- **Done when:** an end-to-end test covers create → milestone → archive → restore (lands in Active) → delete.

**Phase 1 checkpoint:** create your real goals and use them for a few days.

---

## Phase 2: Tasks, Today and Upcoming

**Goal:** Make goals actionable and plan the day (Journeys A and B).

### 2.0 Decision gate
Decided 2026-10-22 in [ADR 0011](decisions/0011-task-status-planning-priority-estimates.md); every recommendation was accepted.
- **Task statuses:** `open | completed | cancelled`, any to any; same status again is a no-op. `completed_at` is set exactly while completed, `cancelled_at` exactly while cancelled. `in_progress` is deferred.
- **Inbox:** derived, not a status: open tasks with no parent and no `planned_date` (refines ADR 0004). A due date alone doesn't take a task out of the inbox.
- **Overdue planned tasks:** an open task whose planned date is before local today appears under "Earlier, not done" on Today, with one-tap today / pick a date / unplan. Nothing ever moves it automatically.
- **Priority:** optional `low | medium | high`, the same scale and labels as goals.
- **Estimates:** optional `estimated_minutes`, 1–1440, set in the edit form (not in quick add's single field). Actual time is not tracked.
- **Deletion:** a confirmed hard delete that removes the task's audit events (ADR 0005). No `task.deleted` event, as for goals and life areas.

### 2.1 Tasks: schema
- Table `tasks`:
  - `goal_id?`, `milestone_id?` (composite FKs, `SET NULL` per column)
  - `CHECK (num_nonnulls(goal_id, milestone_id) <= 1)`
  - `title`, `notes?`, `status` (default `open`), `priority?`
  - `due_date?`, `due_at?`, `due_tz?`, with `CHECK` that `due_date` excludes `due_at`, and that `due_at` and `due_tz` are both set or both null
  - `planned_date?`, `estimated_minutes?`
  - `completed_at?`, `cancelled_at?`, `sort_order`, timestamps
  - `unique (id, user_id)` for later references (reminders, notes)
- CHECKs (ADR 0011): `status in (open, completed, cancelled)`; `priority in (low, medium, high)` or null; `estimated_minutes between 1 and 1440` or null; `completed_at` set exactly when `status = completed`; `cancelled_at` set exactly when `status = cancelled`; title/notes length.
- Reuse the goals' priority values and labels (move them to a shared module rather than copying them).
- Indexes, adjusted later from real query plans:
  - `(user_id, status, planned_date)`
  - `(user_id, status, due_date)`
  - `(user_id, status, due_at)`
  - `(user_id, milestone_id)`
  - `(user_id, goal_id)`
- **Tests:** each CHECK rejects bad rows. Deleting a milestone sets the task's `milestone_id` to null and keeps `user_id`; the same for deleting a goal and `goal_id`.

### 2.2 Tasks: service
- Operations: create, edit, `changeStatus` (complete, reopen and cancel; any to any per ADR 0011), `plan(date | null)`, `reschedule due`, `move(parent)`, delete.
- Status changes set and clear `completed_at`/`cancelled_at` per ADR 0011. The same status again returns the task unchanged with no event. Completing a task never changes its milestone or goal.
- Derived queries: `goalOf(task)` (direct goal, or the milestone's goal), the inbox query (open, no parent, no planned date).
- Audit events: `task.created`, `task.updated` (changed field names, plus old and new priority and estimate; never title or notes text, like `goal.updated`), `task.completed`, `task.reopened`, `task.cancelled` (each with the status change), `task.planned` (old and new dates), `task.due_changed` (old and new), `task.moved`. These events are what reschedule history and planned-versus-completed rely on.
- Delete removes the task's events in the same transaction (ADR 0005); there is no `task.deleted` event.
- **Tests:** every status pair, including the no-op, with `completed_at`/`cancelled_at`; the timed-deadline round trip across time zones; planning in the past is allowed (backfill); moving to another user's goal is rejected; the inbox query includes a task with only a due date and excludes a planned one; delete removes the task's events.

### 2.3 Quick add and Inbox
- Global quick add (keyboard shortcut plus a button): title first, with optional goal/milestone, planned date and due date fields. No priority or estimate field; those are set when editing.
- An Inbox view for open tasks with no parent and no planned date (ADR 0011), with bulk actions: plan today, assign to a goal. Planning or assigning a task removes it from the inbox.
- **Done when:** capturing a task takes a single field and Enter.

### 2.4 Plan page: task list and filters
- All open tasks, filterable by goal, life area, priority, planned or due window, and status. Sort by due, planned or priority (high → low, no priority last).
- Inline edit of dates and parent. A task edit form for title, notes, priority (none/low/medium/high) and estimate in minutes. Completed and cancelled tasks appear behind a toggle.
- Priority shows as the same small label as goals, never as a score. Estimates show as "45 min" or "1 h 30 min".
- **Done when:** filters are reflected in the URL, so a view can be bookmarked and survives refresh.

### 2.5 Today view
- Sections, open tasks only:
  - **Planned for today**: `planned_date` is today.
  - **Due today**: `due_date` is today, or `due_at` falls within today's local range.
  - **Needs a decision**: `due_date` before today, or `due_at` before now. Never red, no judgement words.
  - **Earlier, not done**: `planned_date` before today (ADR 0011). One-tap actions: plan for today, pick a date, unplan. Nothing moves automatically, at midnight or otherwise.
- Each task appears in one section only. Choose the precedence in this chunk and record it in the handoff note.
- An "Add to today" picker that suggests next actions from active goals and due-soon tasks.
- Complete, unplan and reschedule in one tap. A gentle "nothing planned" empty state.
- "Today" is always computed in the user's time zone.
- **Done when:** integration tests cover the boundaries at 23:59 and 00:01 in a non-UTC zone, and a task planned yesterday shows under "Earlier, not done" with its planned date unchanged.

### 2.6 Upcoming view
- The next 14 days, grouped by local date, merging planned and due items (open tasks only), with a toggle to show the next 30 days.
- **Done when:** a timed deadline appears on the correct local day for the user's zone.

### 2.7 Tasks in goals and milestones
- Task lists on goal detail (direct tasks and those under each milestone). Add a task to a milestone in context.
- "Next action" for each goal: the earliest planned or due open task, or a prompt to add one.
- Task status never changes milestone or goal status, and goal progress stays milestone-based (ADR 0010).
- Goal delete confirmation now reports the real task count (extend `goalDeleteConsequences`, see the 1.6 note), and the inbox move is tested.

### 2.8 End-to-end journey test
- Playwright: create area → goal with reason → milestone → two tasks → plan one today → complete it → check Today and goal progress (unchanged by the task).

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

### 0.3: Environment and local Postgres (2026-10-20)
- **Built:**
  - `docker-compose.yml`: `postgres:18.3-alpine`, port bound to `127.0.0.1:5432`, named volume `postgres-data`. `POSTGRES_DB` creates `soleup_dev`; `docker/postgres/init/01-create-test-database.sql` creates `soleup_test`. The healthcheck uses TCP (`-h 127.0.0.1`), which stays closed while init scripts run, so `healthy` means both databases exist.
  - `src/server/env.ts` (`server-only`): Zod schema, `parseEnv(source)` throwing `EnvValidationError`, and `env` parsed at import. Errors name the variable and never echo its value. Empty values (`KEY=`) count as missing.
  - `src/lib/client-env.ts`: the `NEXT_PUBLIC_*` schema (empty for now) and `readClientEnv()`. The server validates it together with its own schema.
  - `src/instrumentation.ts` → `src/instrumentation-node.ts`: imports the env module at server start and calls `process.exit(1)` with the readable message on `EnvValidationError`. Verified with `next start` and `next dev`.
  - `.env.example`, README "Local setup". Dependencies: `zod` 4.6.7, `server-only` 0.0.1 (pinned).
- **Deviations:** "Done when" says the app is connected to the database. There is no Postgres driver until 0.4 (Drizzle), so this chunk proves the database is healthy and reachable from the host on 5432, and that the app boots with a valid `DATABASE_URL`, but the app does not open a connection yet.
- **Decisions:**
  1. **Postgres 18.** ADR 0003 only requires 15+, and no managed host has been picked yet. Pick the compose image to match the host in 0.14.
  2. **Local dev credentials** (`soleup`/`soleup`) are written in `docker-compose.yml` and in `.env.example`'s `DATABASE_URL`, so a fresh clone works without editing. They are not secrets: the port is bound to localhost only. Every real secret in `.env.example` is empty.
  3. **Auth variables are optional** until 0.6. They are validated only if set (`BETTER_AUTH_SECRET` ≥ 32 chars, `BETTER_AUTH_URL` a URL).
  4. **Validation runs at server boot, not at build.** `pnpm build` passes with no env vars, which keeps CI (0.13) simple.
- **Next chunk should know:**
  - Import `env` from `@/server/env` instead of reading `process.env` in server code. Add new variables to the schema and to `.env.example` together.
  - Public variables must be read with static `process.env.NEXT_PUBLIC_X` references inside `readClientEnv()`, or Next.js won't inline them.
  - Instrumentation code that uses Node APIs must stay in `instrumentation-node.ts`; putting it in `instrumentation.ts` triggers an Edge-runtime build warning.
  - There is no test database URL variable yet. 0.5 should add one (for example `TEST_DATABASE_URL` → `soleup_test`).
  - `docker compose down -v` wipes both databases; the init script reruns on the next start.
- **Unverified:** none. `docker compose up -d --wait` reports healthy (Postgres 18.3, both databases present). The app returns 200 under `next start` and `next dev` with `.env.local`, and both exit with code 1 and a readable list when `DATABASE_URL` is missing or malformed. format:check, lint, typecheck and build pass.
- **Follow-ups:** no automated tests for `parseEnv` yet (no test runner until 0.5). Worth adding a unit test in 0.5.

### 0.4: Drizzle and migration workflow (2026-10-20)
- **Built:**
  - Dependencies (pinned): `drizzle-orm` 0.45.4, `pg` 8.23.1; dev `drizzle-kit` 0.31.11, `@types/pg` 8.23.1. `esbuild`'s build script is denied in `pnpm-workspace.yaml` (drizzle-kit works without it).
  - `drizzle.config.ts`: schema `src/server/db/schema/index.ts`, output `src/server/db/migrations`, `casing: "snake_case"`, `strict`, `verbose`.
  - `src/server/db/client.ts` (`server-only`): one `pg.Pool` from `env.DATABASE_URL`, cached on `globalThis` outside production so hot reloads don't leak pools, with a pool `error` listener. Exports `db` (Drizzle, with the schema) and the `Db` type.
  - `src/server/db/schema/index.ts`: empty schema entry point.
  - `src/server/db/migrations/0000_init.sql` (+ `meta/`): a custom baseline migration (`SELECT 1;`) that only starts the journal.
  - Scripts: `db:generate`, `db:migrate`, `db:studio`, `db:reset` (`scripts/db-reset.mts` drops the `drizzle` and `public` schemas, then `drizzle-kit migrate` runs).
  - README "Database and migrations": commands, targeting the test DB, and migration conventions.
- **Deviations:** none.
- **Decisions:**
  1. **`pg` (node-postgres) as the driver**, not postgres.js: pg-boss (5.1) uses `pg`, so the app keeps one driver.
  2. **snake_case casing** set in both `drizzle.config.ts` and `client.ts`, so schema files use camelCase keys without naming each column.
  3. **The schema entry is `schema/index.ts`, not the folder.** Every new schema file must be re-exported from it; that also makes it visible to relational queries.
  4. **drizzle.config.ts and db-reset load `.env.local` with `process.loadEnvFile`.** They cannot import `@/server/env` (`server-only` throws outside Next.js). Shell variables win over `.env.local`, which is how commands target `soleup_test`.
  5. **`db:reset` also refuses non-local hosts** (`localhost`, `127.0.0.1`, `[::1]`), on top of the required `NODE_ENV=production` refusal, so a stray managed-DB URL can't be wiped.
  6. **Migrations are excluded from Prettier** (`.prettierignore`) so drizzle-kit's output is committed as generated.
- **Next chunk should know:**
  - Import `db` from `@/server/db/client`. Nothing imports it yet, so the app still opens no connection until a module uses it.
  - Hand-written SQL: `pnpm db:generate --custom --name=<slug>` creates a journaled empty file.
  - To migrate or reset the test DB: `DATABASE_URL=postgres://soleup:soleup@localhost:5432/soleup_test pnpm db:migrate` (or `db:reset`). 0.5 can wrap this behind `TEST_DATABASE_URL`.
  - The migration journal lives in the `drizzle` schema, which `db:reset` drops.
  - `scripts/*.mts` run directly with Node 24's type stripping. Keep them to erasable TypeScript syntax and self-contained (no `@/` imports).
- **Unverified:** none. `pnpm db:reset` (drop + migrate from scratch) succeeded on `soleup_dev` and `soleup_test`, each with one journal row; a repeat `db:migrate` is a no-op; `db:reset` exits 1 with `NODE_ENV=production` and with a non-local host. `db:studio` starts. lint, typecheck, format:check and build pass.
- **Follow-ups:** `meta/0000_snapshot.json` and `_journal.json` were reformatted once by Prettier before the ignore rule was added; content is unchanged and drizzle-kit reads them fine.

### 0.5: Test harness (2026-10-20)
- **Built:**
  - Dev dependencies (pinned): `vitest` 5.0.5, `vite` 8.3.4 (Vitest's peer), `@playwright/test` 1.64.1.
  - `vitest.config.mts` with two projects. `unit`: `src/**/*.test.{ts,tsx}` minus integration files. `integration`: `*.integration.test.{ts,tsx}` in `src/` or `tests/integration/`, with `fileParallelism: false`, and `DATABASE_URL` set to `TEST_DATABASE_URL` for its workers.
  - `tests/integration/helpers/`:
    - `database.ts`: `assertTestDatabaseUrl()` (local host and a name ending in `_test`, or it throws) and `truncateUserTables()` (every `public` table, `RESTART IDENTITY CASCADE`).
    - `global-setup.ts`: checks the URL, then migrates once with drizzle-orm's migrator (same `drizzle.__drizzle_migrations` journal as `db:migrate`).
    - `setup.ts`: re-checks the URL, truncates before each test, and closes the pool after each file.
  - `playwright.config.ts`: Chromium only, starts `pnpm dev` locally (reusing a server already on :3000), and `pnpm build && pnpm start` when `CI` is set.
  - Sample tests: `src/server/env.test.ts` (unit, `parseEnv`; closes the 0.3 follow-up), `tests/integration/database.integration.test.ts` (migrated test DB, truncation between tests, URL guard), `tests/e2e/smoke.spec.ts` (home page).
  - Scripts `test:unit`, `test:integration`, `test:e2e`, `verify`. `TEST_DATABASE_URL` added to `.env.example`. README "Testing".
- **Deviations:** none.
- **Decisions:**
  1. **Integration files are named `*.integration.test.ts`** so they can sit next to the module they test (as the code layout suggests) without the unit project picking them up.
  2. **`TEST_DATABASE_URL` is read by the Vitest config only**, not added to the app's env schema: the app never uses it. The config parses `.env.local` instead of loading it, so the dev `DATABASE_URL` cannot leak into test workers.
  3. **The truncation guard is strict** (local host and a `_test` name) because a wrong URL would wipe data. It runs in global setup and again in every file.
  4. **`server-only` is aliased to its no-op entry** in Vitest, so server modules are importable in tests.
  5. **E2E uses `next dev` locally** for fast startup, and a production build in CI. 0.13 can change this if CI time matters.
  6. **Vitest 5 over 4.1**: 4.1.12 is a maintenance release published the same day as 5.0.5, and 5.x has had point releases since September.
- **Next chunk should know:**
  - `src/server/env.ts` parses `process.env` on import. Integration workers have `DATABASE_URL` set, so importing `@/server/db/client` just works there. Unit tests that import it must stub the env first; see `env.test.ts`.
  - For 0.6 fixtures: put them in `tests/integration/helpers/`. Truncation already covers any new `public` table (users, sessions, accounts) with no extra work.
  - Tests in one integration file share a pool and run in order; each test starts with empty tables.
  - Playwright browsers live outside the repo: run `pnpm exec playwright install chromium` once per machine (CI too, in 0.13: `--with-deps`).
  - `.env.local` needs `TEST_DATABASE_URL`. This machine's `.env.local` was updated.
- **Unverified:** none. `pnpm verify` (format:check, lint, typecheck, 6 unit tests, 9 integration tests) and `pnpm test:e2e` (1 test) pass, and `pnpm build` passes. The URL guard rejects `soleup_dev` with a readable error. The CI branch of the Playwright config (`build && start`) was not run.
- **Follow-ups:** none.

### 0.6: Authentication (2026-10-20)
- **Built:**
  - `better-auth` 1.7.11 (pinned). `src/server/auth/auth.ts`: Drizzle adapter (`usePlural`), `generateId: "uuid"`, Google and GitHub providers (enabled only when both ID and secret are set), database sessions (30 days, refreshed daily, no cookie cache), `soleup` cookie prefix, secure cookies on https, rate limiting, errors redirected to `/sign-in?error=<code>`, telemetry off.
  - Schema `src/server/db/schema/auth.ts` + migration `0001_auth.sql`: `users`, `sessions`, `accounts`, `verifications`, all with UUID keys and `timestamptz`. FKs cascade from `users`. Unique `(provider_id, account_id)` on `accounts`.
  - `src/server/auth/session.ts`: `getUserFromHeaders(headers)`, `getCurrentUser()`, `requireUser()` (redirects to `/sign-in`). `providers.ts`: `configuredProviders(env)`. `logger.ts`: redacting Better Auth logger.
  - Routes: `api/auth/[...all]` (Better Auth handler, unexpected errors logged redacted → bare 500), `(public)/sign-in` (provider buttons, readable OAuth error messages, redirects signed-in users to `/home`), `(app)/layout.tsx` (session-aware shell with sign-out), `(app)/home` placeholder, landing page links to sign-in.
  - Client: `src/lib/auth-client.ts`, `components/auth/sign-in-buttons.tsx`, `sign-out-button.tsx`. `src/lib/sign-in-errors.ts`.
  - Env: `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` now required; a half-set provider pair is a boot error; `SOLEUP_TEST_SIGN_IN` added.
  - Test support: `tests/integration/helpers/users.ts` (`createTestUser()`, `asUser(userId)` → `{ userId, headers }` with a real signed session cookie), built on `src/server/auth/test-session.ts`. Test-only `POST /api/test/sign-in` (`src/app/api/test/sign-in/route.ts`), gated by `isTestSignInEnabled` (`NODE_ENV === "test"` and `SOLEUP_TEST_SIGN_IN === "1"`, else 404 before importing anything else).
  - Tests: unit (env, gate matrix + route 404 in every other mode, providers, error messages, logger), integration (fixtures, sessions, forged cookie, sign-out revocation, cascade, unique identity, account linking via Better Auth's real `handleOAuthUserInfo`, unconfigured provider → clean 4xx, rate limit 429, redacted logging on a DB failure), e2e (`tests/e2e/auth.spec.ts`: redirect when signed out, provider buttons, error messages, shortcut sign-in and sign-out).
  - README "Authentication" (incl. OAuth console steps and callback URLs) and "Testing" updates; `.env.example`; DATA_MODEL User note.
- **Deviations:**
  1. **Sign-in and sign-out use the Better Auth browser client, not Server Actions.** Better Auth rate-limits only HTTP requests through its handler; `auth.api.*` calls bypass it.
  2. **Playwright runs its own server on port 3100** in `NODE_ENV=test` against `soleup_test` (migrated in `tests/e2e/global-setup.ts`), with build folder `.next-e2e` (`SOLEUP_NEXT_DIST_DIR` in `next.config.ts`). Next refuses a second `next dev` on the same build folder, and with `NODE_ENV=test` Next does not load `.env.local`, so the config sets every variable. Next adds `.next-e2e` include paths to `tsconfig.json`; they are committed so e2e runs leave the tree clean.
  3. **Build-phase env placeholders** (`src/server/env.ts`): route modules now import the env at build, so during `NEXT_PHASE=phase-production-build` only, missing required values get inert placeholders. Keeps 0.3's "build needs no env". Verified: `next start` without env still exits 1 with the readable list.
  4. **Redacting logger + `onAPIError.throw`** (not in the chunk text): Better Auth's default logging printed SQL params (OAuth state, PKCE verifier, session tokens), violating "Never log". Found during the user's first real sign-in.
- **Decisions:** `trustedProviders: []` and `requireLocalEmailVerified: true`, so linking needs a verified email on both sides; different emails never link. Rate limits in memory (one host, ADR 0003): 100/min per IP and path, 10/min for `/sign-in/*` and `/callback/*`. `timestamptz` for auth tables. Recorded in code comments and README > Authentication.
- **Next chunk should know:**
  - Call `requireUser()` first in every page/action/route; under `cacheComponents` the call must sit inside `<Suspense>`. Use `getUserFromHeaders(headers)` where there is no Next request scope (tests).
  - Integration tests: `const user = await createTestUser(); const { userId, headers } = await asUser(user.id);`. A cross-user test is two `createTestUser()` calls.
  - Integration workers get fixed auth env values and empty OAuth credentials from `vitest.config.mts`.
  - Run `pnpm db:migrate` for the dev DB after adding a migration; integration and e2e setups migrate `soleup_test` themselves (this chunk forgot the dev DB at first).
  - Dev server logs "Could not validate `instant`… NEXT_REDIRECT" when a signed-out visitor hits `/home`. It is Next's instant-navigation validator meeting the auth redirect; harmless. Next's guide suggests `'use cache: private'` on the user read, which was not adopted because it caches the user client-side for minutes after revocation. Decide in 0.10.
  - Unexpected errors in Better Auth now throw to the route handler; `auth.api.*` callers in server code should expect throws for non-API errors.
- **Unverified:** none. The user confirmed real sign-in with Google and with GitHub on 2026-10-20 (the specific linking outcome between the two was not reported separately; linking rules are covered by integration tests). The CI branch of the Playwright config (`build && start` with `NODE_ENV=test`) was not run.
- **Follow-ups:**
  - Production: set `advanced.ipAddress` (`trustedProxies` or `ipAddressHeaders`) for the host's proxy in 0.14, or every client shares one rate-limit bucket. Consider `storage: "database"` if more than one instance ever runs.
  - Create production OAuth apps with production callback URLs in 0.14.
  - 0.12 (observability) should route `logAuth` through pino with the same redaction.
  - 0.13: confirm `next build` under `NODE_ENV=test` for the CI e2e path.

### 0.7: Authorization primitives (2026-10-20)
- **Built:**
  - `src/lib/result.ts`: `ActionResult<T>` (`{ ok: true, data }` or `{ ok: false, error }`), `ActionError` with codes `UNAUTHENTICATED`, `NOT_FOUND`, `VALIDATION` (`fieldErrors` by dotted path, `formErrors`), `CONFLICT`, `INTERNAL`, and `DEFAULT_ERROR_MESSAGES`. Pure, so client components can import it.
  - `src/server/errors.ts`: `DomainError` base with `NotFoundError`, `ValidationError(fieldErrors, message?, formErrors?)` and `ConflictError`, each mapping itself to an `ActionError`.
  - `src/server/auth/authed-action.ts`: `authedAction(schema, handler)` and `createAuthedAction(resolveUserId)` for tests. Order: authenticate → validate (`safeParseAsync`) → `handler(input, { userId })` → map errors. Next.js redirect/notFound errors are rethrown (`unstable_rethrow`).
  - `src/proxy.ts` (Next 16's renamed middleware) + `src/lib/protected-paths.ts` (`APP_ROUTE_SEGMENTS`, `isAppPath`): redirects to `/sign-in` when the `soleup` session cookie is absent on (app) paths.
  - Tests: unit (`authed-action.test.ts`, `proxy.test.ts`, `protected-paths.test.ts`), integration (`tests/integration/authed-action.integration.test.ts`: no cookie and forged cookie rejected, real session runs as the user, invalid input → field errors, proxy accepts a real session cookie).
  - README > Authentication: how to use `authedAction`, the error classes and the proxy list.
- **Deviations:**
  1. **`requireUser()` keeps 0.6's return shape** (`CurrentUser`, with `id`, `name`, `email`, `image`) rather than `{ userId }`; the layout already uses `name`. Actions get `{ userId }` from `authedAction`.
  2. **`authedAction` returns `UNAUTHENTICATED` instead of redirecting**, so a form can show "please sign in again" without losing input. Pages still redirect via `requireUser()`.
  3. **The wrapper lives in `src/server/auth/`** (next to `requireUser()`), errors in `src/server/errors.ts`, result types in `src/lib/result.ts`.
- **Decisions:** Authentication runs before validation, so anonymous callers learn nothing about the input shape. Unexpected errors log only the error class name (`console.error`), never the message, because messages can carry SQL params or user content. Error messages passed to the error classes are shown to users and must be fixed text. Recorded in code comments.
- **Next chunk should know:**
  - Action pattern: `export const renameGoal = authedAction(renameGoalSchema, (input, { userId }) => service.rename(userId, input));` in a `"use server"` file. The handler still must pass `userId` to every service call.
  - Services throw `NotFoundError` for both missing and other users' records.
  - Server Action arguments are typed `z.input<Schema>`; a `FormData` caller must convert to an object first (no helper yet).
  - Add every new top-level folder under `src/app/(app)` to `APP_ROUTE_SEGMENTS`; `protected-paths.test.ts` fails otherwise.
  - Integration tests can call real actions by mocking `next/headers` to return `asUser(...).headers` (see `authed-action.integration.test.ts`).
- **Unverified:** `pnpm test:e2e` was not run in this session (the existing signed-out redirect test now goes through the proxy). `pnpm verify` (format, lint, typecheck, 60 unit, 28 integration) and `pnpm build` pass.
- **Follow-ups:**
  - 0.8 should decide whether `recordAudit` failures surface as `INTERNAL` (current default for any non-domain error).
  - 0.12: route `logUnexpectedActionError` through pino with request IDs.
  - A `FormData` → object helper when the first form-based action lands (0.11).

### 0.8: Audit log infrastructure (2026-10-20)
- **Built:**
  - Schema `src/server/db/schema/audit.ts` + migration `0002_audit_events.sql`: `audit_events` (`id`, `user_id` → `users` on delete cascade, `event_type`, `entity_type`, `entity_id` uuid with no FK, `occurred_at` timestamptz default `now()`, `changes` jsonb), indexes `(user_id, occurred_at)` and `(user_id, entity_type, entity_id)`.
  - `src/server/audit/types.ts`: `AUDIT_EVENTS` allowlist (each entry: `entityType` + a `changes` Zod schema), `defineAuditEvents()` (checks names and strictness at module load), `assertStrictAuditSchema()`, `auditChange(value)` → strict `{ from, to }`.
  - `src/server/audit/record.ts`: `createAuditLog(registry)` → `recordAudit(tx, event)` and `deleteAuditEventsForEntity(tx, { userId, entityType, entityId })`; the app instances are exported. `InvalidAuditEventError`.
  - `DbTransaction` type in `src/server/db/client.ts`.
  - Tests: unit `src/server/audit/types.test.ts` (strictness guard, registry naming); integration `src/server/audit/record.integration.test.ts` (unknown type, inherited keys like `toString`, extra key in `changes`/nested change/envelope, bad values, rollback of the event with its transaction, rollback of the state change when the event is rejected, account-deletion cascade, scoped delete helper and its rollback).
  - README > Database and migrations > Audit log.
- **Deviations:** the allowlist is **empty**: no domain entity exists yet and 0.11 owns the first events (`life_area.*`). Tests use their own registry through `createAuditLog()`, the same code path as the app instance; one test proves the app instance rejects everything today. Also added the delete helper the user asked for (the chunk text only implies it via the audit rules).
- **Decisions:**
  1. **The event's `entity_type` comes from the registry**, not the caller, so a type and its entity can't disagree. Event types are `<entity_type>.<verb>`.
  2. **Strictness is enforced at module load**: every object in a `changes` schema must be `z.strictObject`; records, `any`, `unknown` and `Date` are refused (dates go in as ISO strings). The event envelope is strict too.
  3. **`recordAudit` takes a `DbTransaction`**, so passing the plain `db` is a type error.
  4. **Rejected events throw `InvalidAuditEventError`** (not a `DomainError`), which rolls back the transaction and surfaces as `INTERNAL` through `authedAction` (answers the 0.7 follow-up). Its message lists the event type, paths, Zod issue codes and unrecognized key names only, never values; an unknown type is not echoed.
  5. **`occurred_at` defaults to `now()`** (transaction start), so events in one transaction share a timestamp.
- **Next chunk should know:**
  - Pattern: `await db.transaction(async (tx) => { /* change */; await recordAudit(tx, { type: "life_area.archived", userId, entityId: id, changes: { status: auditChange(...) } }); });`. Add the event to `AUDIT_EVENTS` first; the `type` union is derived from it.
  - Hard delete: call `deleteAuditEventsForEntity(tx, ...)` in the same transaction as the entity delete, and test it.
  - The audit test for "no name is stored" (0.11) can read `audit_events` directly via `auditEvents` from `@/server/db/schema`.
- **Unverified:** none. `pnpm verify` passes (format, lint, typecheck, 76 unit, 44 integration). `pnpm build` and `pnpm test:e2e` were not run (no route or UI changes). Dev DB migrated.
- **Follow-ups:** none.

### 0.9: User preferences (2026-10-20)
- **Built:**
  - Schema `src/server/db/schema/preferences.ts` + migration `0003_user_preferences.sql`: `user_preferences` (`user_id` PK → `users` on delete cascade, `timezone` text **nullable**, `locale` text default `en-US`, `week_start` smallint default 1 with CHECK 0–6, length CHECKs, `created_at`, `updated_at`).
  - `src/lib/dates.ts` (pure, client-safe): `todayFor(tz, now?)`, `localDateOf`, `localDateTimeOf`, `instantFromLocal` (DST `"compatible"`), `startOfLocalDay`, `localDayRange`, `addDays`, `dayOfWeek`, `startOfWeek(date, weekStart)`, `isLocalDate`; types `LocalDate`, `WeekStart`.
  - `src/lib/preferences.ts` (pure): `supportedTimeZones()` (runtime list + `UTC`), `canonicalTimeZone`, `matchTimeZoneOption`, `canonicalLocale`, `COMMON_LOCALES`, `localeOptions`, `localeLabel`, `WEEK_DAYS`.
  - `src/server/modules/preferences/`: `validation.ts` (`savePreferencesSchema`, strict, canonicalizes), `service.ts` (`ensureUserPreferences`, `getUserPreferences`, `savePreferences` in one transaction with `SELECT … FOR UPDATE` and an audit event of changed fields only), `actions.ts` (`savePreferences` via `authedAction`, then `refresh()`).
  - Audit event `user_preferences.updated` (entity ID = user ID) in `AUDIT_EVENTS`.
  - Better Auth `databaseHooks.user.create.after` creates the row on first sign-in.
  - UI: `src/components/preferences/preferences-form.tsx` (shared by both screens), the (app) layout gate ("Confirm your time zone" replaces page content until `timezone` is set), `src/app/(app)/settings/page.tsx`, a Settings link in the header. `settings` added to `APP_ROUTE_SEGMENTS`.
  - Tests: unit `src/lib/dates.test.ts` (todayFor at midnight in 7 zones incl. half/quarter-hour offsets, UTC+14/−11, DST in New York, Santiago's missing midnight; conversions, DST gap/overlap, 23/25-hour days, week starts) and `src/lib/preferences.test.ts`; integration `src/server/modules/preferences/preferences.integration.test.ts` (row created by a real OAuth sign-in, safety-net creation, cascade, DB CHECK, audit only on change, cross-user, unauthenticated, field errors, fixed offsets rejected, `userId` key rejected); e2e `tests/e2e/preferences.spec.ts` (device zone proposed but not stored until confirmed; settings round-trip incl. reload and "Use it"). `auth.spec.ts` now confirms the zone after sign-in.
  - Docs: ADR 0008, DATA_MODEL UserPreference, README "Dates and time zones".
- **Deviations:**
  1. **`timezone` is nullable** (null = not confirmed) instead of defaulting to a zone, so nothing is ever set silently.
  2. **The confirmation form also proposes the browser's locale** and shows week start; it is the same form as Settings. Only an explicit save stores anything.
  3. **Preference changes are audited** (`user_preferences.updated`), which the chunk text didn't mention, following the audit convention. The 0.8 test "rejects the app's allowlist while it is empty" was renamed since the allowlist is no longer empty.
- **Decisions:**
  1. **`temporal-polyfill` 1.0.5** (not 1.0.6, published a week ago) — see ADR 0008. Imported, not global; only `lib/dates.ts` uses it, so it isn't in the client bundle today.
  2. **Zones are stored in the server runtime's canonical spelling.** Node 24's ICU uses legacy names (`Asia/Calcutta`, `Europe/Kiev`); browsers say `Asia/Kolkata`. `matchTimeZoneOption` maps the browser's zone onto the server's list. `UTC` is added (V8 omits it); `Etc/GMT±N` and offsets are not in the list, so they are rejected.
  3. **Row creation is idempotent and also runs on read** (`getUserPreferences`), because Better Auth runs after-create hooks after its transaction commits; a failed hook must not leave a user without a row. Test users inserted directly rely on this.
  4. **Locale labels are computed on the server** and passed to the form, so server and browser Intl differences can't cause a hydration mismatch. The device zone/locale are read with `useSyncExternalStore` (server snapshot `null`).
- **Next chunk should know:**
  - "Today" for a user: `const { timezone } = await getUserPreferences(userId); todayFor(timezone!)`. Inside (app) pages the layout guarantees a confirmed zone is shown before content, but a page still reads `null` in its type; handle it (or add a `requireConfirmedPreferences` helper when the first consumer needs one).
  - e2e tests that sign in a new user must click "Confirm and continue" first. `test.use({ timezoneId })` controls the proposed zone.
  - In dev, a gated render logs Next's "Could not validate … instant navigation … Dropped segment" for the page; harmless, same family as the 0.6 note. If 0.10 wants it gone, move confirmation to its own route outside `(app)` with a redirect.
  - The `PreferencesForm` hand-rolls label/hint/error wiring; 0.10's `FormField`/`Select` primitives should replace it.
- **Unverified:** none. `pnpm verify` (format, lint, typecheck, 106 unit, 56 integration), `pnpm build` and `pnpm test:e2e` (6 tests) pass. Dev DB migrated.
- **Follow-ups:**
  - Move to native Temporal when Node LTS and Safari ship it (ADR 0008).
  - Zone labels are raw IANA names (with legacy spellings on Node 24, e.g. "Europe/Kiev"); consider friendlier labels or upgrading to Node 26 LTS when it lands.

### 0.10: App shell and UI primitives (2026-10-20)
- **Built:**
  - Dependencies (pinned): `radix-ui` 1.7.0 (Dialog, AlertDialog, Toast), dev `@axe-core/playwright` 4.13.0. Both the newest releases at least two weeks old.
  - Shell: `src/app/(app)/layout.tsx` owns `<main id="main">` (pages no longer render their own), a "Skip to content" link, and `<Toaster />`. `src/components/shell/`: `nav-items.ts` (`NAV_ITEMS`: Home, Goals, Plan, Settings; `isNavItemActive`) and `app-nav.tsx` (one `<nav aria-label="Main">`: a fixed bottom bar below `md` with safe-area padding, a sidebar list from `md`; `aria-current="page"`). Navigation is hidden while the time zone is unconfirmed.
  - Primitives in `src/components/ui/`: `Button`/`buttonClass`, `Input`, `Textarea`, `Select`, `FormField`, `Dialog`/`DialogTrigger`/`DialogContent`/`DialogClose`, `ConfirmDialog`, `toast()` + `Toaster`, `EmptyState`, `ErrorState`, `Skeleton`/`LoadingState`; helpers `cx`, `focusRing`, `fieldClass`. New color token `--danger-fg`.
  - Root `error.tsx` (Next 16's `retry` prop), `not-found.tsx`, `loading.tsx`.
  - `src/app/manifest.ts`, `src/app/icon.svg`, `src/app/apple-icon.png`, `public/icons/{icon-192,icon-512,maskable-512}.png`, all generated by `scripts/generate-icons.mts` (rasterizes with Playwright's Chromium, so no image dependency). Root `viewport`: per-theme `themeColor`, `viewportFit: "cover"`.
  - Placeholder `/goals` and `/plan` pages (EmptyState), added to `APP_ROUTE_SEGMENTS`.
  - `PreferencesForm` now uses `FormField`, `Select` and `Button` (closes the 0.9 note); `SignOutButton` uses `Button`.
  - Tests: unit `src/components/shell/nav-items.test.ts` and `src/components/ui/primitives.test.tsx` (server-rendered markup: FormField wiring, Button type, states); e2e `tests/e2e/shell.spec.ts` (sidebar vs bottom bar, exactly four destinations, `aria-current`, axe WCAG 2.0/2.1/2.2 A and AA with no serious or critical violations on Home, Goals, Plan, Settings, the confirm gate, mobile and not-found; keyboard only: skip link, the full Tab order with visible focus, Shift+Tab and Enter to navigate; 404 status; manifest and icons served).
  - README "UI shell and components".
- **Deviations:**
  1. **Goals and Plan are placeholder pages.** The chunk lists them as destinations, but they don't exist until Phases 1 and 2, and links to 404s would be worse. Each phase replaces its placeholder.
  2. **`Select` is a styled native select**, not Radix Select: accessible everywhere, the platform picker on phones, and fine with ~400 time zones.
  3. **Toasts use a small store (`toast()` plus a sibling `<Toaster />`)** instead of a context provider. Wrapping the (app) Suspense boundary in the Radix Toast provider made React client-render the streamed page instead of hydrating it (two copies of the form in the DOM while loading, which broke `preferences.spec.ts`).
  4. **`playwright.config.ts`: local `expect` timeout 15s** (CI keeps 5s). With 13 tests in parallel, the dev server's first compile of a route (`/sign-in` after sign-out) took over 5s and made `auth.spec.ts` flaky.
- **Decisions:** One nav element restyled per breakpoint (not two navs), so there is never a hidden duplicate. `ErrorState` and `error.tsx` show fixed text only, never an error's message. `ConfirmDialog` is an alert dialog (focus starts on Cancel, outside clicks ignored), stays open while `onConfirm` runs, and shows a failed `ActionResult`'s message. Recorded in code comments and the README.
- **Next chunk should know:**
  - Pages under `(app)` render a `<div>`, not `<main>`. Use `LoadingState` as a Suspense fallback and `EmptyState` for empty lists.
  - Forms: `<FormField id={id} label="Name" errors={fieldErrors.name}>{(control) => <Input {...control} name="name" />}</FormField>`.
  - Destructive actions: `<ConfirmDialog trigger={<Button variant="danger">Delete</Button>} title=… description=… confirmLabel="Delete" onConfirm={() => deleteThing({ id })} />`. Confirmations: `toast({ title: "Archived", variant: "success" })`.
  - New destinations: add them to `NAV_ITEMS` and `APP_ROUTE_SEGMENTS`; `shell.spec.ts` asserts the exact nav list, so update it too.
  - e2e: wait for the page's h1 before pressing keys; the shell streams in after the skip link.
  - Reuse `expectNoSeriousViolations(page)` from `shell.spec.ts` (move it to a helper when a second spec needs it).
- **Unverified:**
  - `Dialog`, `ConfirmDialog` and toasts have no consumer yet, so their browser behaviour (focus trap, Escape, focus return, announcements) is not tested here; only Radix's own behaviour backs it. 0.11 (archive/delete) should cover them in e2e.
  - `error.tsx` is not exercised by a test (no route throws); 0.12 can add one with its error-reporting work.
  - PWA install (needs the Phase 5 service worker) and safe-area rendering on a real phone.
  - Checks: `pnpm verify` (format, lint, typecheck, 121 unit, 56 integration), `pnpm build` and `pnpm test:e2e` (13 tests, 3 consecutive clean runs) pass. The CI branch of the Playwright config was not run.
- **Follow-ups:**
  - Not-found and error pages render outside the shell (root boundaries). An `(app)`-level `not-found.tsx` could keep the navigation when the first detail page calls `notFound()` (1.3).
  - The theme override (`data-theme`) is not wired to preferences yet.
  - The dev-only "Could not validate … instant navigation" logs remain (see the 0.6 and 0.9 notes); still harmless.

### 0.11: Reference slice: Life Areas (2026-10-20)
- **Built:**
  - Schema `src/server/db/schema/life-areas.ts` + migration `0004_life_areas.sql`: `life_areas` (fields per the chunk), `unique (id, user_id)`, partial unique index `(user_id, lower(name)) where status = 'active'`, index `(user_id, sort_order)`, CHECKs for status, color, name and description length. Also `user_preferences.life_area_starters` (`accepted` | `dismissed` | null).
  - `src/lib/life-areas.ts` (pure): statuses, color palette, limits, starter names, the `LifeArea` type.
  - `src/server/modules/life-areas/`: `validation.ts`, `service.ts` (create, update, reorder, archive, unarchive, delete, `addStarterLifeAreas`, `dismissStarterLifeAreas`), `queries.ts` (`getLifeAreasView`), `actions.ts`. `answerLifeAreaStarters(tx, …)` in the preferences service. `src/server/db/errors.ts`: `isUniqueViolation(error, constraint)`.
  - Audit events `life_area.created|updated|reordered|archived|unarchived`; `lifeAreaStarters` added to `user_preferences.updated`.
  - UI: `src/app/(app)/goals/areas/` (page + `error.tsx`), linked from the Goals placeholder. `src/components/life-areas/`: the manager (list, move up/down keeping focus, archive, show-archived toggle, restore), inline create and edit forms, `ConfirmDialog` delete, the starter offer.
  - Tests: unit `src/server/db/errors.test.ts`; integration `src/server/modules/life-areas/life-areas.integration.test.ts` (29 tests: DB constraints, domain rules, audit privacy, cross-user through the service and the actions, validation, starters); e2e `tests/e2e/life-areas.spec.ts` (starters; the full manage journey incl. keyboard reorder, Escape and focus return on the edit form and the confirm dialog, axe). `tests/e2e/helpers.ts` now holds `signInAndConfirm` and `expectNoSeriousViolations` (moved from `shell.spec.ts`, as the 0.10 note asked).
  - Docs: README "Feature modules" (the recipe later chunks copy), DATA_MODEL LifeArea and UserPreference.
- **Deviations:**
  1. **Life Areas have their own page, `/goals/areas`**, linked from Goals, rather than a section on the Goals page, so Phase 1 can rebuild `/goals` without carrying them. Easy to move into a section if preferred.
  2. **No `life_area.deleted` event**: a hard delete removes the area's events in the same transaction (ADR 0005), so a delete event would be removed with them.
- **Decisions:**
  1. **"Offered once" is stored** in `user_preferences.life_area_starters`, so a dismissal holds even while the user has no areas. The offer shows only while that is null and the user has no areas. Accepting is refused once answered (no second set on a double submit). Starter names are an enum on the server, not free input.
  2. **Duplicate active names** return a `name` field error on create and edit, and a `ConflictError` on restore. They are caught from the unique index (race-safe), not pre-checked.
  3. **Reorder takes every active ID in the new order.** A stale, partial or foreign list is a `ConflictError` and moves nothing. Only moved areas get an event. Archived areas keep their position; restoring appends to the end.
  4. **`life_area.updated` records the changed field names** (`fields: ["name", …]`) plus color's old and new value, never name or description text.
  5. **Color is a palette key** (CHECK-constrained), not a hex value.
- **Next chunk should know:**
  - Copy this module's shape (README "Feature modules"). `findForUpdate`, `guardDuplicateName` and the savepoint loop in `addStarterLifeAreas` are the patterns for row locking, unique-violation mapping and partial-success inserts.
  - Services expect validated (trimmed) input; test them with clean values and test trimming through the action.
  - 1.1: goals reference `(life_area_id, user_id) → life_areas(id, user_id)`. Deleting an area should `SET NULL (life_area_id)` in a hand-written migration, and the delete confirmation text should then mention goals.
  - Decide in 1.0/1.2 whether archived areas stay selectable for goals.
- **Unverified:** none. `pnpm verify` (format, lint, typecheck, 123 unit, 85 integration), `pnpm build` and `pnpm test:e2e` (15 tests) pass. Dev DB migrated. The `/goals/areas` `error.tsx` is not exercised by a test (same gap as the root one; 0.12).
- **Follow-ups:**
  - Deleting from the edit form leaves focus on the page body once the row is gone; consider moving focus to the list heading.
  - Drag-and-drop reorder could reuse the same `reorderLifeAreas` action later.

### 0.12: Observability and error handling (2026-10-20)
- **Built:**
  - Dependency (pinned): `pino` 10.4.0 (the newest release at least two weeks old).
  - `src/server/logging/`: `logger.ts` (`createLogger(write)`, the app `logger`; JSON lines, ISO UTC time), `redact.ts` (`REDACTED_KEYS`, `*token`/`*secret` suffixes, `redactDeep()`), `serialize-error.ts` (class, SQLSTATE code + constraint/table, stack frames, causes; never the message), `request.ts` (`getRequestId()`, `requestIdFrom(headers)`, `loggerFor(id)`, `getRequestLogger()`, `runWithRequestId()`/`currentRequestId()` on AsyncLocalStorage).
  - `src/lib/request-id.ts` (`REQUEST_ID_HEADER`, `newRequestId`, `isRequestId`). `src/proxy.ts` sets a fresh `x-request-id` on every request and response, replacing any client value; its matcher now covers `/api/*`.
  - `src/lib/result.ts`: `INTERNAL` errors carry `requestId`; `internalError(id)` appends `Reference: <id>` to the message, so every existing error display shows it. `authedAction` logs unexpected errors through pino with the ID (closes the 0.7 follow-up).
  - `src/instrumentation.ts` `onRequestError` → `logRequestError` (request ID, digest, method, path without query, route path and type). Better Auth's logger, the auth route's catch (closes the 0.6 follow-up) and the pg pool error listener write through pino.
  - `ErrorReference` (`src/components/ui/error-reference.tsx`), shown by the root and `/goals/areas` `error.tsx` with the error's digest.
  - `GET /api/health` (`src/server/db/health.ts` `checkDatabase()`, 2 s timeout): 200 ok / 503 unavailable, `no-store`, no details.
  - Test-only `/test-errors/action` and `/test-errors/render` (`src/app/(public)/test-errors/`), behind the test sign-in switch.
  - Tests: unit `logger.test.ts` (every redacted key at top level, nested, in arrays and child bindings; header spellings; error messages, causes and `params` never written; pino's error-message fallback replaced), `request-id.test.ts`, `proxy.test.ts` (IDs on request/response/redirect, forged ID replaced), `health.test.ts`, `api/health/route.test.ts`; integration: same request ID in the action result and the log line, auth DB failure logs the ID and no token, health against the real DB; e2e `errors.spec.ts` (action error shows the ID the proxy put on the action's response, render error page with reference, health). `tests/helpers/logs.ts` `captureLogs()` reads logger output in tests.
  - Docs: README "Logging and errors" (plus Authentication and UI shell notes), ARCHITECTURE §11.
- **Deviations:**
  1. **A rendering error shows the error's digest, not the request ID.** Next.js sends only the digest to the browser, and `error.tsx` can't read headers. The log line holds both, so the reference still finds it. Server Action errors (the common case) show the request ID itself. A digest identifies the error, not the request: the same failure repeated has the same digest.
  2. **Redaction is by key at any depth over the finished line** (`redactDeep` on each JSON line), not pino's `redact` paths: paths can't say "any `body` field at any depth", and pino applies no formatter to child bindings.
  3. **Fixed a pre-existing proxy bug:** the matcher's `\.` lost its backslash when compiled, so the proxy ran only on `/` and the signed-out redirect never happened in the proxy (pages still redirected via `requireUser()`). Now `[.]`.
- **Decisions:** error messages are never logged, not even Postgres ones (they can quote input values); the SQLSTATE code, constraint and table identify the failure. An error logged without a message gets "Unexpected error" (pino would use `error.message`). Request IDs are always generated, never taken from the client. JSON logs in dev too (no pino-pretty transport: transports run in worker threads that Next bundling breaks). Recorded in code comments and the README.
- **Next chunk should know:**
  - Log with `(await getRequestLogger()).info({ field }, "Fixed message")`, or `loggerFor(requestIdFrom(request.headers))` in a route handler. Never put user content in the message. A new kind of sensitive field → add its key to `REDACTED_KEYS`.
  - Tests that trigger logging should call `captureLogs()` (it also keeps the output quiet) and `vi.restoreAllMocks()` afterwards.
  - Code that runs outside a request (the 5.1 worker) uses `logger` directly; a job ID can go in a child binding.
  - 0.13: `/api/health` is ready for the deploy health check (0.14). The e2e test pages need `next build` with the test switch evaluated at request time (`connection()`); not run with a production build yet.
- **Unverified:** the CI branch of the Playwright config (production build) was not run, so `/test-errors/*` behaviour in a production build is untested. When the test switch is off, those pages render the not-found UI from inside a Suspense boundary, so the HTTP status may be 200, not 404. Checks: `pnpm verify` (format, lint, typecheck, 168 unit, 87 integration), `pnpm build` and `pnpm test:e2e` (18 tests) pass. Manually: a forced action error showed `Reference: 6c87960b-…` in the browser and the same `requestId` in the server log; a forced render error showed digest `4246427389`, logged with its request ID.
- **Follow-ups:**
  - Next.js still prints its own `⨯ Error: <message>` with a code frame for uncaught rendering errors (outside pino), so a thrown message containing user content reaches stdout there. Consider filtering it in `instrumentation-node.ts` (or before 10.4's security review).
  - 0.14: decide whether to trust the host's request ID header, where logs are shipped, and their retention (ARCHITECTURE §11).
  - Better Auth's 404-style errors (e.g. "Provider not found") log at `error`; consider mapping them to `warn`.


### 0.13: Continuous integration (2026-10-20)
- **Built:**
  - `.github/workflows/ci.yml`, on every pull request and on pushes to `main`. Job **Lint, test and build** (`ubuntu-24.04`, Postgres `18.3-alpine` service with an empty `soleup_test`): install (`--frozen-lockfile`), lint, format check, typecheck, unit tests, migrate from zero (`pnpm db:migrate`), integration tests, build, Playwright Chromium install (`--with-deps`), e2e; the Playwright report is uploaded on failure. Job **Migration drift**: `pnpm db:generate`, then fails if `git status` shows any change under `src/server/db/migrations` (modified or untracked).
  - pnpm store cached via `actions/setup-node` (`cache: pnpm`); pnpm version from `packageManager`, Node from `.nvmrc`. `permissions: contents: read`; concurrency cancels superseded runs.
  - `tsconfig.json`: `.next-e2e/types/**/*.ts` added to `include`. The CI e2e path (`next build` into `.next-e2e`) appends it otherwise and dirties the tree, like the dev paths 0.6 committed.
  - README "Continuous integration".
- **Deviations:**
  1. **A format check step** runs after lint. The chunk's list doesn't name it, but `pnpm verify` and every chunk's done-when include it.
  2. **"Migrate from zero" is its own step** (`pnpm db:migrate`, the drizzle-kit path) before the integration tests, whose global setup then finds nothing to apply.
  3. **The drift check is a separate, parallel job**, so drift is reported in about a minute instead of after the e2e run, and it doesn't sit between the ordered steps.
- **Decisions:**
  1. **Actions pinned to commit SHAs** (version in a comment), choosing releases at least two weeks old: checkout v7.0.1, setup-node v7.0.0, pnpm/action-setup v6.1.0, upload-artifact v7.0.1.
  2. **E2E still builds the app a second time** (`NODE_ENV=test` into `.next-e2e`, per `playwright.config.ts`) after the plain `pnpm build` step. The build step checks the production build; reusing it for e2e would need a different `NODE_ENV`. Revisit if CI time matters.
  3. No Next.js build cache and no Playwright browser cache yet: not needed at the current size.
- **Next chunk should know:**
  - Required status checks for branch protection are the two job names: `Lint, test and build` and `Migration drift`.
  - A schema change must be committed together with its generated migration, or `Migration drift` fails.
  - CI has no `.env.local`; anything a step needs must be in the workflow. `pnpm build` needs no env (0.3/0.6 placeholders).
- **Unverified:** the workflow has not run on GitHub yet (not pushed, at the user's request), so the service container, cache and SHA pins are untested there. Locally, every step ran in the workflow's order with `CI=true`, twice, each time in a fresh clone (no `.env.local`, no `node_modules`) against a fresh `postgres:18.3-alpine` container: install, lint, format check, typecheck, unit (168), migrate from zero (5 migrations), integration (87), build, e2e (18, production build, no retries), drift check (no changes); the tree was clean afterwards. This also covers the CI branch of the Playwright config left unverified since 0.5, and `/test-errors/*` in a production build (0.12). A deliberately unmigrated table made the drift check report the new migration files. Branch protection is set by the user.
- **Follow-ups:**
  - Dependabot (or Renovate) for the pinned action SHAs and npm dependencies.
### 0.14: First deploy (2026-10-20)
- **Built:**
  - `render.yaml` (Render Blueprint): one free Node web service `soleup` in Singapore, branch `main`, `autoDeployTrigger: checksPass` (deploys only after CI passes), build `corepack enable && pnpm install --frozen-lockfile && pnpm build && pnpm db:migrate:deploy`, start `pnpm start`, health check `/api/health`. Secrets are `sync: false`; `BETTER_AUTH_SECRET` is `generateValue`.
  - `scripts/db-migrate-deploy.mts` (`pnpm db:migrate:deploy`): the release step. drizzle-orm's migrator (same `drizzle.__drizzle_migrations` journal as `pnpm db:migrate`), process env only (no `.env.local`), all pending migrations in one transaction, 30 s connect timeout for a sleeping Neon compute, prints only db name, host and an error code (walks `cause` for the SQLSTATE).
  - `docs/DEPLOY.md`: deploy flow, env vars, production OAuth callbacks, first-time provisioning, rollback, backups (Neon 6-hour PITR plus a manual `pg_dump`), a non-destructive PITR check, restore from PITR or a dump, logs, client-IP rate limiting, free-plan limits, moving to paid.
  - ADR 0009 (production hosting providers); pointers in ADR 0003, the ADR index, README (Docs, Authentication), ARCHITECTURE §11, `.env.example`.
- **Deviations:**
  1. **Migrations run as the last build command, not a pre-deploy step.** Render's `preDeployCommand` is paid-only. It is the same point in the sequence (after build, before the new version takes traffic, old version still serving), and a failure fails the deploy. Move it to `preDeployCommand` on a paid plan.
  2. **Free plans, chosen by the user** (no card): Neon Free's restore window is 6 hours, so DEPLOY.md adds a manual `pg_dump` weekly and before risky migrations.
- **Decisions:**
  1. **Neon direct connection (no pooler) with `sslmode=verify-full`**, one `DATABASE_URL` for app and migrations. pg 8.23 warns that `require` will weaken to libpq semantics in v9; `verify-full` keeps the certificate check.
  2. **Don't set `NODE_ENV` on Render**: `pnpm install` would skip the dev dependencies the build needs; `next start` runs in production regardless.
  3. **Request IDs stay app-generated** (the host's are ignored); logs stay in Render's log viewer, not shipped (closes the 0.12 follow-up).
  4. **Rate-limit client IP:** kept Better Auth's default (`x-forwarded-for` with exactly one address). Verified locally under `next start`: Next fills the header from the socket when absent; one address → own bucket; several → shared bucket plus a one-time warning through pino. DEPLOY.md says how to check it on Render (closes the 0.6 follow-up, pending that check).
  Recorded in ADR 0009, DEPLOY.md and comments in `render.yaml`.
- **Next chunk should know:**
  - Every migration must be backward compatible with the version still serving and the one you may roll back to (expand, then contract). Rollbacks reuse the old build and run no migrations; a dashboard rollback turns auto-deploy off.
  - A new required env var must be added on Render before the deploy that needs it, or the new version fails its boot check (the old one keeps serving).
  - The free web service sleeps after 15 idle minutes, and the plan has no background workers: **5.0 must revisit hosting** before reminders.
- **Unverified:**
  - The user confirmed on 2026-10-20: Google and GitHub sign-in on the production URL, a life area created, and still there after a redeploy.
  - Not reported: the Neon PITR check (branch from past data), whether Render's proxy produces the "could not determine a client IP" warning on a normal sign-in, and Render's log retention on the free workspace.
  - At close-out, `origin/main` did not yet contain this chunk (PR not merged), so the verified deploy did not come from `main`. After merging, confirm the Render service tracks `main` and that the next deploy waits for CI (`checksPass`).
  - Checks: `pnpm verify` (format, lint, typecheck, 168 unit, 87 integration) and `pnpm build` pass; `pnpm start` with a production-like env against a fresh local DB (health 200, (app) redirects, OAuth start URL, test-only routes closed, rate-limit buckets). `db:migrate:deploy` tested from zero, re-run, bad password, host down, failing migration (nothing applied). Documented `pg_dump`/`pg_restore` commands run against local Postgres 18.3. `pnpm test:e2e` not run (no app code changed).
- **Follow-ups:**
  - `/test-errors/*` returns 200 with a static "Forced errors" heading when the test switch is off (no controls render). Move the heading inside the gate or return a real 404.
  - Neon PITR check and the client-IP warning check from DEPLOY.md, if not done yet; 10.6 (restore drill) builds on them.
  - Schedule the weekly `pg_dump` (manual for now).

### 1.0: Decision gate: goals (2026-10-20)
- **Built:** ADR 0010 (goal status, priority, progress and dates) and its index row. Chunks 1.0–1.6 rewritten to match; `DATA_MODEL.md` Goal and Milestone sections and §7; `ROADMAP.md` 1B; `PRODUCT_SPEC.md` §12 (the Phase 1 open question moved to Settled). No code.
- **Deviations:** also edited `ROADMAP.md` and `PRODUCT_SPEC.md`, which still listed goal measurement as in scope and the Phase 1 question as open. Marked `0.✓` done at the user's request after they confirmed items 1, 3 and 5; the agent ran the secret scan and `pnpm verify` on main for items 2 and 4.
- **Decisions:** the user accepted every recommendation. Details derived from those answers and recorded in ADR 0010 (not asked separately): the transition table (any to any among the four live statuses, any to `archived`, `archived` only to `active`; same status is a no-op with no audit event); `completed_at` is kept when a completed goal is archived and cleared on restore; completing the last milestone never completes the goal; milestone `due_date` is not constrained by the goal's dates; progress is computed on read, never stored.
- **Next chunk should know:** 1.1 needs three CHECKs on `goals` (status, priority, date order) and `unique (id, user_id)`; validate the date pair together so the CHECK never surfaces as an INTERNAL error. `life_areas.status` is the pattern for text status + CHECK.
- **Unverified:** none (docs only). `pnpm format:check` run on the changed docs.
- **Follow-ups:** if restoring to `active` proves annoying while dogfooding, ADR 0010 names the alternative (four statuses + `archived_at`) to supersede it.

### 1.1: Goals: schema and service (2026-10-20)
- **Built:**
  - `src/lib/goals.ts` (pure): statuses, priorities, length limits, `GOAL_EDITABLE_FIELDS`, `canChangeGoalStatus(from, to)`, `completedAtAfterStatusChange(...)`, the `Goal` type.
  - Schema `src/server/db/schema/goals.ts` + migration `0005_goals.sql`: `goals` per the chunk, `unique (id, user_id)`, composite FK `(life_area_id, user_id) → life_areas(id, user_id)` **hand-edited** to `ON DELETE SET NULL ("life_area_id")`, indexes `(user_id, status)` and `(life_area_id, user_id)`, CHECKs for status, priority, date order, `completed_at`, and title/description/reason length.
  - `src/server/modules/goals/`: `validation.ts` (`createGoalSchema`, `updateGoalSchema`, `changeGoalStatusSchema`, `goalIdSchema`; the date pair is checked together → `targetDate` field error), `service.ts` (`createGoal`, `updateGoal`, `changeGoalStatus`, `deleteGoal`).
  - Audit events `goal.created|updated|status_changed`. `isForeignKeyViolation()` in `src/server/db/errors.ts`.
  - Tests: unit `src/lib/goals.test.ts` (all 20 status pairs, `completed_at` rules), `validation.test.ts`, `errors.test.ts`; integration `goals.integration.test.ts` (44: CHECKs, composite FK, life-area delete keeps `user_id`, cascade, every allowed and rejected transition through the service, no-ops, `completed_at` incl. archive/restore, audit privacy, delete removes events, cross-user).
- **Deviations:**
  1. **No `goal.deleted` event** (user decision this session): ADR 0005 deletes an entity's events with it, as 0.11 did for life areas. Chunk text updated.
  2. **No `actions.ts` or `queries.ts`** ("no UI" for this chunk); 1.2 adds them with the list and form.
  3. **Extra CHECK `goals_completed_at_check`:** `completed` needs `completed_at`; `completed_at` only on `completed` or `archived`. Makes ADR 0010's rule hold for any write path.
- **Decisions:**
  1. A rejected transition (only `archived` → `paused|completed|dropped`) is a `ConflictError` ("Restore this goal to active before changing its status."). The same status again returns the goal unchanged.
  2. `status_changed_at` and `completed_at` use SQL `now()`, so they equal the audit event's `occurred_at`.
  3. A foreign or missing `lifeAreaId` is caught from the composite FK (race-safe, like 0.11's unique index) and returned as a `lifeAreaId` field error. Archived areas are still accepted; whether they stay selectable is for 1.2.
  4. `goal.updated` records changed field names (including title/description/reason) plus from/to for area, priority and dates only.
  5. `updateGoal` replaces every editable field (like life areas); status changes only go through `changeGoalStatus`.
- **Next chunk should know:**
  - `drizzle-kit` can't express `SET NULL (column)`; the snapshot says plain `set null`, so `db:generate` shows no drift. If the FK is ever regenerated, redo the hand edit (comment in the schema and the SQL). The life-area delete test fails loudly if it's lost (a plain SET NULL nulls `user_id`, which is NOT NULL).
  - Milestones (1.4) reference `(goal_id, user_id) → goals(id, user_id)` via `goals_id_user_id_key`.
  - The life-area delete confirmation (0.11 UI) doesn't mention goals yet.
- **Unverified:** none. `pnpm verify` passes (format, lint, typecheck, 214 unit, 131 integration). `pnpm build` and `pnpm test:e2e` not run (no route or UI changes). Dev DB reset and migrated (local dev data was wiped by `db:reset`).
- **Follow-ups:**
  - Deleting a life area clears goals' `life_area_id` in the database with no `goal.updated` event, so 1.3's history won't show it. Consider recording it in `deleteLifeArea`.
  - Life-area delete confirmation text should say its goals will lose their area (1.2 or 1.6).

### 1.2: Goals: list and create/edit UI (2026-10-21)
- **Built:**
  - `src/lib/goals.ts`: `GOAL_LIST_STATUSES`, `goalListStatus(value)` (unknown → `active`), status and priority labels, `goalStatusActions(status)` (labels plus the toast copy for each action). `src/lib/dates.ts`: `formatLocalDate(date, locale)`.
  - `src/server/modules/goals/queries.ts` (`getGoalsView(userId, status)`: groups in the user's area order, archived areas after active ones, "No area" last; counts per filter; dates formatted in the user's locale on the server) and `actions.ts` (`createGoal`, `updateGoal`, `changeGoalStatus`).
  - UI: `src/app/(app)/goals/page.tsx` (replaces the placeholder) and `error.tsx`; `src/components/goals/goal-form.tsx` (`GoalFormDialog`, create and edit in a Radix dialog) and `goals-view.tsx` (filter links, groups, status actions, empty state per filter). `FormError` moved from the life-area form to `src/components/ui/form-error.tsx` for reuse.
  - Tests: unit (`goalListStatus`, `goalStatusActions` incl. "only allowed transitions" and a no-judgement word check, `formatLocalDate`); integration `goals-ui.integration.test.ts` (11: grouping/order, filters and counts, archived goals excluded, locale dates, cross-user through query and actions, title-only create, validation incl. date order, status moves and the archived restriction); e2e `tests/e2e/goals.spec.ts` (title-only create timed under 30 s and persisted, create from another filter lands on Active; every field incl. the date-order field error, grouping, Escape/focus return on edit, area change; every status action across filters; axe on the page and dialog).
- **Deviations:**
  1. **The status filter is a URL search param** (`/goals?status=paused`, read inside Suspense) rendered as links with `aria-current`, so filters are linkable and server-filtered.
  2. **No priority filter.** The chunk allows an optional one; left out to keep the slice small.
  3. **Life-area delete confirmation now says goals are kept and move to No area** (the 1.1 follow-up, one sentence).
- **Decisions:**
  1. **Archived areas:** not offered for new goals, but a goal's own archived area stays selectable (labelled "(archived)") so editing never silently clears it, and its goals stay grouped under it, marked "(archived area)".
  2. **Copy:** "Drop" toasts "Priorities change, and you can reopen it any time"; Resume and Reopen both go to `active`. Archive needs no confirmation (reversible), matching life areas.
  3. **Order within a group:** creation order. No sorting by priority, which shows only as a small "High priority" label.
  4. **Creating while another filter is open** navigates to Active so the new goal is visible.
- **Next chunk should know:**
  - `GoalFormDialog` takes `goal`, `areas` (all areas from `GoalsView.areas`) and `trigger`; reuse it on the detail page (1.3). Goal titles are not links yet; 1.3 should link them.
  - Status-action buttons are named `"<Action>: <title>"`; edit is `"Edit: <title>"`.
  - Archived goals have no UI until 1.6; the archive toast says they can be restored.
  - Keep e2e tests short: one 20 s journey timed out at Playwright's 30 s limit under parallel load, so the journey is split into three tests.
- **Unverified:** none. `pnpm verify` (format, lint, typecheck, 222 unit, 142 integration), `pnpm build` and `pnpm test:e2e` (21 tests, two consecutive clean runs) pass.
- **Follow-ups:**
  - An optional priority filter, if dogfooding wants one.
  - Deleting a life area still writes no `goal.updated` event for the goals it clears (1.1 follow-up, still open).

### 1.3: Goal detail page (2026-10-21)
- **Built:**
  - Route `src/app/(app)/goals/[goalId]/`: `page.tsx` (UUID check before the query, `notFound()` for a missing or foreign goal; fixed tab title "Goal · SoleUp" so goal titles stay out of browser history), `not-found.tsx` (inside the shell), `error.tsx`.
  - `src/components/goals/goal-detail.tsx`: header (title, status, area, priority label, start/target dates, "Completed on"), description, "Why it matters", placeholder Milestones and Tasks sections, status actions and Edit (reuses `GoalFormDialog`), and the History timeline (`<ol>`, newest first, `<time>` per entry). Back link returns to the filter the goal is listed under.
  - `src/server/modules/goals/history.ts` (pure): `buildGoalHistory(events, { locale, timeZone, areaNames })` and `statusChangeSummary(from, to)`. Each event's `changes` is re-parsed with its `AUDIT_EVENTS` schema; an unknown or malformed event shows as "Changed" with no details.
  - `getGoalDetail(userId, goalId)` in `queries.ts` (null when missing or another user's). `formatInstant(instant, locale, timeZone)` in `src/lib/dates.ts`.
  - Goal titles on the Goals list now link to the detail page.
  - Tests: unit `history.test.ts`, `formatInstant` in `dates.test.ts`, the archived action in `goals.test.ts`; integration `goal-detail.integration.test.ts` (5: header data, cross-user and missing → null, seven status changes incl. archive/restore and a no-op, completed date in the user's zone, edits shown without any text); e2e `tests/e2e/goal-detail.spec.ts` (list link, sections, Pause → Resume → Complete → Archive → Restore → Drop with the timeline checked after each step and after a reload, reason never in the history, back link, axe; not-found for a non-UUID and an unknown UUID inside the shell).
- **Deviations:**
  1. **A "Restore to Active" button on the detail page of an archived goal.** The done-when needs archive and restore in the UI, and the archive view is 1.6. `goalStatusActions("archived")` now returns it (previously empty); archived goals are still not on the Goals list. The label says where it lands (ADR 0010), so no confirmation dialog; 1.6 can add the confirmation it describes to the archive view.
  2. **The timeline also shows `goal.updated` events** (area, priority and date changes with old → new values; edited text fields by name only, e.g. "Edited the title and why it matters"), not only status and date changes. The chunk text lists status and dates; the rest is the same structured data.
- **Decisions:** area names in the timeline are looked up from the user's current areas at read time (never stored in events); a deleted area shows as "A deleted area". Event times show in the user's time zone and locale; "Completed on" is a local date. Recorded in `history.ts` comments.
- **Next chunk should know:**
  - 1.4/1.5: replace the Milestones placeholder in `goal-detail.tsx`; add `milestone.*` events to `AUDIT_EVENTS`. If milestone events should show in the goal's timeline, `getGoalDetail` queries only `entity_type = 'goal'` today: extend it (e.g. by goal ID in the event) and `buildGoalHistory`'s switch.
  - Next keeps the previous route mounted but hidden after client navigation, so `getByText` in e2e can match hidden copies; use role-based locators (they skip hidden elements).
  - Status buttons on the detail page are named by their label only (one goal per page), unlike the list's `"<Action>: <title>"`.
- **Unverified:** none. `pnpm verify` (format, lint, typecheck, 229 unit, 147 integration), `pnpm build` and `pnpm test:e2e` (23 tests) pass. The detail journey takes about 17 s under parallel load, inside Playwright's 30 s limit.
- **Follow-ups:**
  - Deleting a life area still writes no `goal.updated` event, so its goals' timelines don't show losing the area (1.1 follow-up, still open).
  - Archived goals are reachable only by URL until the archive view (1.6).

### 1.4: Milestones: schema and service (2026-10-21)
- **Built:**
  - `src/lib/milestones.ts` (pure): statuses, length limits, `MILESTONE_EDITABLE_FIELDS`, `completedAtAfterMilestoneStatusChange`, the `Milestone` and `MilestoneProgress` types.
  - Schema `src/server/db/schema/milestones.ts` + migration `0006_milestones.sql` (generated, no hand edit): `milestones` per the chunk, `unique (id, user_id)`, composite FK `(goal_id, user_id) → goals(id, user_id) ON DELETE CASCADE`, index `(goal_id, user_id, sort_order)`, CHECKs for status, `completed_at` (set exactly while completed), `sort_order >= 0`, title/description length.
  - `src/server/modules/milestones/`: `validation.ts` (create, update, reorder, change status, id), `service.ts` (`createMilestone`, `updateMilestone`, `reorderMilestones`, `changeMilestoneStatus`, `deleteMilestone`, `deleteMilestoneEventsForGoal`), `queries.ts` (`getMilestoneProgress(userId, goalIds)`).
  - Audit events `milestone.created|updated|reordered|status_changed`. `deleteGoal` now removes its milestones' events in the same transaction (the rows go by cascade).
  - Tests: unit `validation.test.ts` (8); integration `milestones.integration.test.ts` (21: composite-FK rejection with SQLSTATE and constraint name, CHECKs, goal-delete cascade incl. milestone events, account cascade, append order, audit privacy, due date outside the goal's dates, dense reorder and stale/partial/foreign lists, every status move and `completed_at`, no-op, last milestone leaves the goal alone, delete closes the gap, progress with mixed/all dropped/all completed/none, cross-user).
- **Deviations:**
  1. **One `changeMilestoneStatus(id, status)`** covers complete, reopen, drop and undrop (any of the three statuses to any other), following `changeGoalStatus`. Dropping a completed milestone clears `completed_at`.
  2. **No `actions.ts`** ("no UI" for this chunk); 1.5 adds them.
  3. **Delete also closes the gap** in the goal's order, writing `milestone.reordered` for each shifted sibling, so the order stays dense after any write, not only after reorder.
- **Decisions:**
  1. `sort_order` is per goal, dense 0..n-1, across every status (dropped milestones keep their place). No unique index on `(goal_id, sort_order)`: the service keeps it dense and a unique index would need deferring during reorder.
  2. Create, reorder and delete lock the goal row (`FOR UPDATE`) first, so concurrent writers can't share a position; locks are always goal first, then milestones. A missing or foreign goal is `NotFoundError` (the composite FK is the backstop).
  3. Milestones can be added to a goal in any status, archived included; 1.5 decides what the UI offers.
  4. `milestone.created` records `goalId`; `milestone.updated` records changed field names plus the due date's old/new value only.
  5. Progress returns `{ completed, countable }` per goal; goals with no milestones are absent from the map, all-dropped goals have `countable: 0`. Callers show nothing for either.
- **Next chunk should know:**
  - Reorder takes every milestone of the goal (any status) in the new order; a partial list is a `ConflictError`.
  - Events in one transaction share `occurred_at`; sort reorder events by their `sortOrder.to` in tests, not by time.
  - The goal timeline (`getGoalDetail`) still reads only `entity_type = 'goal'`; milestone events carry `goalId` on create only, so showing them there needs a lookup through the milestone (or adding `goalId` to more events).
  - 1.6's delete confirmation can count milestones with a plain `count(*)` on `milestones` by goal and user.
- **Unverified:** none. `pnpm verify` passes (format, lint, typecheck, 237 unit, 168 integration). `pnpm db:generate` shows no drift. Dev DB migrated. `pnpm build` and `pnpm test:e2e` not run (no route or UI changes).
- **Follow-ups:** none new; the 1.1 life-area-delete event gap is still open.

### 1.5: Milestones UI and progress (2026-10-22)
- **Built:**
  - `src/components/goals/milestone-list.tsx` (client): replaces the goal page's Milestones placeholder. Inline add (Enter submits), a checkbox to complete or reopen, Drop and Restore, move up/down buttons, the progress line with the ADR 0010 definition as visible help text, and the "Mark goal complete?" offer when every countable milestone is done (active or paused goals only).
  - `src/server/modules/milestones/actions.ts`: authed `createMilestone`, `reorderMilestones`, `changeMilestoneStatus`. `queries.ts` gained `listMilestones(userId, goalId)`.
  - `getGoalDetail` returns `milestones` and `progress`. `getGoalsView` attaches `progress` to each goal, and the goal row shows "2 of 5 milestones".
  - `src/lib/milestones.ts`: `MILESTONE_PROGRESS_HELP`, `milestoneProgressLabel` (null when nothing is countable), `allCountableMilestonesDone`.
  - Tests: unit `src/lib/milestones.test.ts`; integration `milestone-ui.integration.test.ts` (progress on detail and list for none, all dropped, mixed, all completed; cross-user list); e2e `tests/e2e/milestones.spec.ts` (zero-milestone state, add, keyboard reorder with focus and reload, complete, drop, offer, all-dropped state, list count, axe).
- **Deviations:**
  1. **No pointer drag.** Reorder is by the move up/down buttons, which are keyboard-operable and match the life areas list. Drag and drop was not built. The chunk says "drag or keyboard", and keyboard is done.
  2. **Milestone edit and delete have no UI.** `updateMilestone` and `deleteMilestone` exist in the service, but the chunk doesn't list them and there is no action for them yet.
  3. **Status changes are optimistic** (the checkbox and Drop/Restore update before the server answers). Needed so the checkbox doesn't snap back while the save is in flight.
- **Decisions:**
  1. Progress for a goal whose milestones are all dropped is `{ completed: 0, countable: 0 }` from the query, as ADR 0010 and the 1.4 note describe. The UI shows nothing for it, and `milestoneProgressLabel` returns null.
  2. Keyboard focus after a move stays on the pressed button, or on its partner at either end, as in the life areas list.
  3. The offer to complete only appears for active or paused goals. It never changes the goal by itself.
- **Next chunk should know:**
  - The milestone list's props come from `getGoalDetail`; the goal page refreshes after each action, so the server's order is the truth. The optimistic order reverts when the refreshed props arrive.
  - In e2e, wait for the POST response before `page.reload()`. Focus can stay on a disabled button while the save is still in flight, so `toBeFocused` alone doesn't mean the save finished.
  - Checkboxes are controlled. Use `.click()` and then check the state in e2e, not `.check()`. Playwright's `check()` verifies the state right after the click, before the optimistic update renders.
  - 1.6 can count milestones per goal for the delete confirmation with `listMilestones` or a plain count.
- **Unverified:** none for the automated checks. A manual pass on a phone-width layout and with a screen reader is not done.
- **Follow-ups:**
  - Pointer drag to reorder, if dogfooding wants it.
  - Edit a milestone's title, description and due date (`updateMilestone` needs an action and a dialog or inline editor).
  - Milestone events don't appear in the goal's history timeline yet (the 1.4 note still applies).
  - The `Route "/home": Could not validate that a segment in your UI has instant navigation` message appears in dev-server logs during e2e. It isn't from this chunk.

### 1.6: Goal archive and delete flows (2026-10-22)
- **Built:**
  - Route `src/app/(app)/goals/archived/` (`page.tsx`, `error.tsx`) and `src/components/goals/archived-goals-view.tsx`: archived goals, most recently archived first, each with its area, "Completed on …" when it has `completed_at`, "Archived on …", a Restore confirmation ("It moves back to Active…"; for a completed goal it also says the completed date is cleared) and Delete. Empty state "Nothing archived".
  - `src/components/goals/delete-goal-dialog.tsx`: the shared delete confirmation, used on the archive view and on the goal detail page. Text from `goalDeleteConsequences(milestoneCount)` in `src/lib/goals.ts` ("3 milestones will be deleted." / "It has no milestones."). Live goals are also pointed at archiving.
  - `deleteGoal` Server Action (`goals/actions.ts`). `getArchivedGoals(userId)` in `goals/queries.ts`; `GoalsView.archivedCount` drives an "Archived (n)" link on the Goals page. `countMilestones(userId, goalIds)` in `milestones/queries.ts` (any status).
  - Tests: unit `goalDeleteConsequences`; integration `goal-archive.integration.test.ts` (9: empty, order and count, completed/archived labels in the user's zone, milestone count across statuses and area, cross-user list, action unauthenticated/invalid ID, delete removes the goal, its milestones and every goal and milestone event while another goal keeps its events, cross-user delete refused with nothing removed); e2e `tests/e2e/goal-archive.spec.ts` (create → 3 milestones → archive → archive view → confirmed restore lands in Active with milestones → delete from detail stating "3 milestones will be deleted." → gone; completed-then-archived shows its dates, delete from the archive with Cancel then confirm, axe on the view and the restore dialog).
- **Deviations:**
  1. **The hard-delete transaction was already in place** from 1.1/1.4 (`deleteGoal` removes milestone events, cascades milestones, removes goal events in one transaction). This chunk added the action and UI; no service change.
  2. **Delete is offered on the detail page for any status**, as well as on the archive view, not only on archived goals. The confirmation suggests archiving instead for live goals.
  3. **The detail page's back link for an archived goal now goes to `/goals/archived`** (it went to `/goals`). Its "Restore to Active" button from 1.3 stays without a confirmation: its label already says where it lands. The archive view's Restore confirms.
- **Decisions:**
  1. The `deleteGoal` action doesn't call `refresh()`: refreshing the detail page after its goal is gone would render not-found before the client navigates. The detail page `router.replace`s to where the goal was listed; the archive view calls `router.refresh()`. Comment in `actions.ts`.
  2. The milestone count in the confirmation counts every milestone, dropped ones included, since all of them are deleted. It comes from the page's data at load time, so a milestone added in another tab after loading isn't counted.
  3. Archive order is `status_changed_at` descending (when it was archived).
- **Next chunk should know:**
  - 2.7: extend `goalDeleteConsequences` with the task count ("7 tasks will move to your inbox"), and pass it from `getGoalDetail` and `getArchivedGoals` the same way as `milestoneCount`.
  - Archive-view buttons are named `"Restore: <title>"` and `"Delete: <title>"`; the detail page's Delete is named "Delete".
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 244 unit, 183 integration), `pnpm build` and `pnpm test:e2e` (26 tests) pass. The new spec passed 8 of 8 with `--repeat-each=4`.
- **Follow-ups:**
  - `tests/e2e/preferences.spec.ts` "first sign-in proposes the device's time zone…" is flaky on `main` too (failed 1 of 5 there with `--repeat-each=5`, and once in the first full run here): after "Confirm and continue" and the Settings heading, a reload sometimes still shows the proposed zone. Not from this chunk; likely the reload races the save, as in the 1.5 note about waiting for the POST.
  - Earlier follow-ups still open: life-area delete writes no `goal.updated` event; milestone events aren't in the goal timeline; milestone edit/delete UI.

### 2.0: Decision gate: tasks (2026-10-22)
- **Built:** ADR 0011 (task status, overdue plans, priority and estimates) and its index row; ADR 0004's status line notes the refined inbox definition. Chunks 2.0–2.8 rewritten to match; `DATA_MODEL.md` Task section and §7. No code.
- **Deviations:**
  1. **`task.deleted` removed from 2.2** (user decision this session): it conflicted with ADR 0005, which deletes an entity's events with it, as 1.1 and 0.11 did.
  2. **`task.updated` added to 2.2**: the event list had nothing for edits to title, notes, priority or estimate, which ADR 0005 requires. It follows `goal.updated` (field names; old/new for structured fields only).
  3. **`unique (id, user_id)` added to 2.1**, per the ownership convention, since reminders and note links will reference tasks.
- **Decisions:** the user accepted every recommendation. Details derived from those answers and recorded in ADR 0011 (not asked separately): status transitions any to any with a no-op for the same status; `completed_at`/`cancelled_at` each set exactly while in that status, enforced by CHECKs; completing a task never changes its milestone or goal; the inbox is open tasks with no parent and no planned date, and a due date alone keeps a task in it; past deadlines show as "Needs a decision"; estimates are capped at 1440 minutes and are not in quick add; priority sorts high → low with none last on the Plan page.
- **Next chunk should know:** 2.1 needs CHECKs for status, priority, estimate range, and both timestamp rules, plus ADR 0004's parent and deadline CHECKs; the two parent FKs need hand-edited `SET NULL (goal_id)` / `SET NULL (milestone_id)` like `goals.life_area_id` (see the 1.1 note). Share the goal priority constants instead of copying them. 2.5 must choose and record the section precedence when a task matches more than one Today section.
- **Unverified:** none (docs only). `pnpm format:check` run on the changed docs.
- **Follow-ups:**
  - Goal and milestone deletes clear tasks' parents in the database with no `task.moved` event (the same gap as life-area delete → goals). Consider recording it in 2.7.
  - If dogfooding shows "Earlier, not done" piling up, revisit with a bulk action rather than automatic moves (ADR 0011).

### 2.1: Tasks: schema (2026-10-22)
- **Built:**
  - `src/lib/tasks.ts` (pure): `TASK_STATUSES`, title/notes length limits, estimate bounds (1–1440).
  - `src/lib/priorities.ts` (pure): the shared `PRIORITIES` scale and `PRIORITY_LABELS`. `src/lib/goals.ts` re-exports them under the old goal names, so no goal import changed.
  - Schema `src/server/db/schema/tasks.ts` (exported from `schema/index.ts`) + migration `0007_tasks.sql`: all columns from the chunk, `unique (id, user_id)`, composite FKs `(goal_id, user_id)` and `(milestone_id, user_id)` hand-edited to `ON DELETE SET NULL ("goal_id")` / `("milestone_id")`, indexes `(user_id, status, planned_date)`, `(user_id, status, due_date)`, `(user_id, status, due_at)`, `(user_id, milestone_id)`, `(user_id, goal_id)`, and CHECKs `tasks_parent_check`, `tasks_deadline_check`, `tasks_due_tz_check`, `tasks_status_check`, `tasks_priority_check`, `tasks_estimated_minutes_check`, `tasks_completed_at_check`, `tasks_cancelled_at_check`, `tasks_sort_order_check`, `tasks_title_length_check`, `tasks_notes_length_check`.
  - Tests `src/server/db/schema/tasks.integration.test.ts` (11): defaults; each CHECK rejects a bad row; cross-user goal and milestone rejected; deleting a milestone or goal nulls only its parent column and keeps the task and `user_id`.
- **Deviations:**
  1. **`sort_order` defaults to 0.** The chunk did not say; this keeps inserts simple, with the service to assign real order later.
  2. **Migration file named `0007_tasks.sql`** (drizzle-kit generated a random name; renamed and the journal tag updated to match the existing `000N_<name>` style).
  3. **Shared priority module:** the chunk asked to move the goal priorities rather than copy them. Goal imports keep their old names via re-export.
  4. **Branch stacked on `chunk/2.0-tasks-decisions`:** 2.0 (ADR 0011) is not yet merged to `main`, and 2.1 depends on its decisions. Merge 2.0 first, or rebase this branch onto `main` after that.
- **Decisions:**
  1. Each parent FK is one composite FK with a column-list `SET NULL`, as for `goals.life_area_id`. The schema comment and the migration both say the hand edit must be kept if the FK is regenerated.
  2. Deadline rule: `due_date` and `due_at` cannot both be set (`tasks_deadline_check`), and `due_at`/`due_tz` are both set or both null (`tasks_due_tz_check`). A task may have neither.
  3. `completed_at` and `cancelled_at` are each set exactly while their status holds (ADR 0011).
- **Next chunk should know:**
  - The service must set `completed_at`/`cancelled_at` in the same write as the status, or the CHECKs reject it.
  - `tasks_*` constraint names are stable; tests match them by name.
  - Estimate bounds and length limits live in `src/lib/tasks.ts`; validation should import them rather than repeat the numbers.
- **Unverified:** none. `pnpm verify` passes (format, lint, typecheck, 244 unit, 194 integration). `pnpm db:generate` reports no schema changes. `pnpm build` and `pnpm test:e2e` not run (no route or UI changes).
- **Follow-ups:**
  - The goal and milestone delete paths clear tasks' parents with no `task.moved` event (see 2.0). Decide in 2.7.
  - Integration output shows noisy `Provider not found` Better Auth logs from existing auth tests. Not caused by this chunk; worth a look in a later hardening pass.
