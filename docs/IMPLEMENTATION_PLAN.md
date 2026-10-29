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
- `gh auth status` succeeds. It is needed for pull requests.
- Start on `main` with a clean working tree, and run `git pull --ff-only origin main`.
- **Find the previous chunk's pull request**, the one whose head branch starts with `chunk/<previous-id>-`:
  ```bash
  gh pr list --state all --json number,headRefName,state,mergedAt
  ```
  Then:
  - **Merged:** continue.
  - **Open**, with checks running or auto-merge pending: go to step 2a.
  - **Open with failing checks or a merge conflict, or closed without merging:** stop and tell the user. Do not fix another chunk's PR unless the user asks.
  - **No PR exists:** the previous chunk isn't finished. Stop.
  - Chunk 0.1 has no previous PR.
- After the previous PR merges, every earlier chunk in the Progress log on `main` is `done`, except rows the user marked `skipped`.
- If your chunk is the first of a phase, the previous phase's checkpoint row is `done`. If it is not, ask the user whether to proceed anyway.

### 2a. Wait for the previous PR, working untracked in the meantime
While the previous PR is open with checks pending:
- **Do not** create your branch, commit, push or open a PR yet.
- You **may** make untracked progress on local `main`: read, plan, and write your chunk's code and tests as uncommitted changes.
  - Don't edit the Progress log or Handoff notes yet. The previous PR is changing them.
  - Avoid files the previous PR touches. List them with `gh pr diff <n> --name-only`.
- Wait with `gh pr checks <n> --watch`, which blocks until the checks finish, rather than a polling loop.
  - Then confirm the merge with `gh pr view <n> --json state,mergedAt`. Auto-merge can lag a minute or two after checks go green, so re-check a few times with short waits.
  - If the checks fail, or the PR is still unmerged about 10 minutes after going green, stop and tell the user.
- Once it has merged, move your work onto the updated `main`:
  ```bash
  git stash push --include-untracked -m "chunk <id> untracked progress"
  git switch main
  git pull --ff-only origin main
  git stash pop
  ```
- Resolve any conflicts. Read the handoff note that just merged, and adjust your work to it before continuing.

### 3. Start
- Create the branch from the updated `main` with `git switch -c chunk/<id>-<short-slug>`, for example `chunk/0.3-env-postgres`. Uncommitted work comes along with it.
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
5. **Push and open a pull request:**
   ```bash
   git push -u origin chunk/<id>-<short-slug>
   gh pr create --base main --title "chunk <id>: <title>" --body-file <scratch-file>
   ```
   The PR body has these sections, with no Claude/Anthropic attribution anywhere:
   - **Summary:** what the chunk delivers, in 1–3 sentences.
   - **Changes:** modules, tables/migrations, routes, scripts, docs.
   - **Decisions and deviations** from the plan.
   - **Checks run**, each with its real result.
   - **Unverified and follow-ups.**
   - **Manual steps for the user**, if any (env vars, OAuth settings, host configuration).
6. **Enable auto-merge:** `gh pr merge <n> --auto --squash --delete-branch`.
   - Use squash unless the repo disallows it. Check with `gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed`.
   - Before chunk 0.13 lands, and before the user sets required checks, there is no CI, so the PR may merge immediately. That is expected.
7. **Watch your own CI:** `gh pr checks <n> --watch`.
   - If a check fails because of your chunk, fix it on the same branch with a descriptive commit and push. Auto-merge stays on. Repeat until green.
   - If the failure is outside your chunk (CI infrastructure, missing repository secrets, a flaky test in another area), stop and tell the user.
8. **Report** the PR URL, the final check status, and whether it has merged. Then stop. Do not start the next chunk.

### 8. Never
- Push to `main` directly, force-push to `main`, merge with failing checks, or bypass branch protection (no `--admin`).
- Disable or change auto-merge on another chunk's PR.
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
| `pnpm reminders:sweep` | 5.1 | runs one reminder sweep locally (no worker in v1, ADR 0013) |
| `pnpm reminders:failed` | 5.7 | prints failed reminders by error code and age, no content |

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
| 2.2 | Tasks: service | done | chunk/2.2-tasks-service | 2026-10-22 | Service (create, edit, status, plan, reschedule due, move, delete) with ADR 0011 rules and eight `task.*` events, `goalOf` and inbox queries; no UI |
| 2.3 | Quick add and Inbox | done | chunk/2.3-quick-add-inbox | 2026-10-23 | Global quick add (Add task button + Q key; title, Enter), `/plan/inbox` with bulk plan today and assign to goal, Inbox under Plan in the sidebar and a Plan sub-nav |
| 2.4 | Plan page: task list and filters | done | chunk/2.4-plan-task-list | 2026-10-23 | `/plan` task list: goal/area/priority/planned/due filters and due/planned/priority sort in the URL, inline dates + parent, edit dialog (priority, estimate), closed tasks behind a toggle |
| 2.5 | Today view | done | chunk/2.5-today-view | 2026-10-23 | `/plan/today`: four sections (precedence planned → decide → due → earlier), "Add to today" picker (due soon + active goals' next actions), one-tap complete/plan/tomorrow/pick a date/unplan/new due date, calm empty state |
| 2.6 | Upcoming view | done | chunk/2.6-upcoming-view | 2026-10-23 | `/plan/upcoming`: tomorrow through day 7 by default ("Within a Week"; 14 or 30 via `?days=`) by local date, plans and deadlines merged (both days shown, same day once), timed deadlines on their local day in the user's zone |
| 2.7 | Tasks in goals and milestones | done | chunk/2.7-goal-tasks | 2026-10-23 | Goal detail Tasks section (next action, direct + per-milestone groups with add in context), delete confirmation with real task counts, goal/milestone delete detaches tasks with `task.moved` events |
| 2.8 | End-to-end journey test | done | chunk/2.8-e2e-journey | 2026-10-23 | `tests/e2e/journey.spec.ts`: area → goal with reason → milestone → two tasks → plan one via Add to today → complete → Today clear, goal progress unchanged; no app bugs found |
| 2.✓ | Phase 2 checkpoint (user) | done | | 2026-10-23 | User marked done the day Phase 2 finished, without the planned week of using Today daily |
| 3.1 | Metrics module foundation | done | chunk/3.1-metrics | 2026-10-23 | `src/server/modules/metrics/`: `Metric<V>` contract (`value`, `definition`, `range` with `asOf`, `hasData`), `todayTaskCounts`, `goalsWithoutNextAction`, `deadlinesNextSevenDays`; no UI |
| 3.2 | Home summaries | done | chunk/3.2-home-summaries | 2026-10-23 | `/home`: Today, Goals without a next action (named, from a new list variant) and Deadlines in the next 7 days cards, each with definition, range and "as of"; numbers link to their lists; "Nothing yet" with no data; no score |
| 4.0 | Decision gate: calendar | done | chunk/4.0-calendar-decisions | 2026-10-23 | ADR 0012: RRULE recurrence (rrule-temporal, three scopes), task-bound time blocks with status + auto-mark, FullCalendar v7 Week/Day/Agenda, all-day end exclusive; Phase 4 now 4.1–4.11 |
| 4.1 | Calendar events: schema and service | done | chunk/4.1-calendar-events | 2026-10-23 | `calendar_events` (shape + end CHECKs, column-list `SET NULL` goal/area FKs, 4 indexes), service CRUD with `calendar_event.created`/`.updated`, `eventsBetween` by instant/local-date overlap; no UI |
| 4.2 | Recurrence engine | done | chunk/4.2-recurrence-engine | 2026-10-23 | `src/lib/recurrence.ts` on `rrule-temporal` 2.2.8 (no global Temporal): builder-subset Zod schemas, rule ↔ builder, pure floating-time `expandOccurrences` with exceptions and the 366-day cap, `describeRecurrence`; no schema, no UI |
| 4.3 | Recurring events: series, exceptions and scopes | done | chunk/4.3-recurring-events | 2026-10-23 | `rrule` + `calendar_event_exceptions` (snapshot exceptions, migration 0009), `eventsBetween` expands series, this/following/all edit and delete with exception carry-over, dropped reported back, exception audit events; no UI |
| 4.4 | Event create/edit UI | done | chunk/4.4-event-dialog | 2026-10-23 | `/plan/calendar` (Calendar under Plan) listing 30 days, event dialog (60-min default, inclusive all-day end, goal → area, zone note), repeat builder with field errors, scope prompt naming dropped exceptions via dry-run previews |
| 4.5 | FullCalendar foundation and Agenda view | done | chunk/4.5-agenda-view | 2026-10-23 | `@fullcalendar/react` 7.1.1 behind one token-themed, client-only `Calendar` wrapper; `/plan/calendar` is the Agenda (events + occurrences, plans, timed deadlines) for `?start=&days=7\|14\|30` (default 30 from today), items open their dialogs |
| 4.6 | Week and Day views | done | chunk/4.6-week-day-views | 2026-10-24 | `/plan/calendar?view=week\|day&date=`: FullCalendar time grids from the user's week start, all-day row, timed deadlines as dashed markers, overlaps side by side, arrow-key moves between items, Week → Day below `md` |
| 4.7 | Time blocks: schema and service | done | chunk/4.7-time-blocks | 2026-10-26 | `time_blocks` + `time_block_exceptions` (24-hour CHECKs, task cascade, migration 0010), block service with three scopes, `setTimeBlockStatus`, `blocksBetween` with task and lane, auto-mark on completion, task delete removes blocks and their events; no UI |
| 4.8 | Time blocks UI | done | chunk/4.8-time-blocks-ui | 2026-10-27 | "Block time" form (Plan, Today, task dialog, grid toolbar), blocks on Week/Day/Agenda, slot select → task picker, drag to move/resize with a scope prompt, desktop task panel, block dialog with status, "Also complete the task" and "End series here" |
| 4.9 | Integrations with Today and Home | done | chunk/4.9-today-home-integrations | 2026-10-27 | Today opens with a "Schedule" timeline (events + blocks, all-day first); Home's "Next commitment" card from `nextCommitment` in `metrics/home.ts`; links open the item's dialog on Day via `?item=` |
| 4.✓ | Phase 4 checkpoint (user) | done | | 2026-10-27 | User confirmed the checkpoint done; no Month view or event dragging requested, no plan changes |
| 4.10 | Resource columns by life area | done | chunk/4.10-resource-columns | 2026-10-27 | `/plan/calendar?view=areas&date=` "By area": our own day view, a column per active life area + "No area" (archived area marked, only while it holds items), side-by-side overlaps, arrow keys across columns, axe |
| 4.11 | Resource timeline by life area | done | chunk/4.11-resource-timeline | 2026-10-27 | `/plan/calendar?view=timeline&span=day\|week&date=` "Timeline": our own component, a row per active life area + "No area" on a horizontal axis (week by default), lanes for overlaps, sticky row headings, arrow keys along/across rows, axe |
| 5.0 | Decision gate: reminders | done | chunk/5.0-reminders-decisions | 2026-10-27 | ADR 0013: stay free, no worker/pg-boss, cron-job.org sweep every 15 min (never late, up to 15 early); deadlines, events (rolling next occurrence) and a daily nudge; quiet hours hold/bundle/skip stale; title or private payload; 5.1–5.7 rewritten |
| 5.1 | Sweep route and external trigger | done | chunk/5.1-sweep-route | 2026-10-27 | Required `REMINDER_SWEEP_SECRET`, `POST /api/reminders/sweep` (constant-time Bearer check, same 401, no body) → `runSweep(now)` stub logging counts only; `pnpm reminders:sweep` calls the local route; DEPLOY.md secret + cron-job.org steps; production check unverified |
| 5.2 | Service worker and PWA install | done | chunk/5.2-service-worker-install | 2026-10-27 | `public/sw.js` (push + notificationclick only, no fetch/cache; payload text as given, same-origin deep link focusing an open tab), registered on every page, uncached with its own CSP; Settings "Install the app" with iOS Home Screen guidance; desktop install confirmed, phone unverified |
| 5.3 | Push subscriptions | done | chunk/5.3-push-subscriptions | 2026-10-28 | Required VAPID env (pair checked), `push_subscriptions` (endpoint unique, known push hosts only, 20/user), subscribe/unsubscribe/revoke/test actions on `web-push` 3.6.7, Settings "Notifications" device list; user confirmed two browsers + revoke |
| 5.4 | Reminders: schema and scheduling | done | chunk/5.4-reminders-scheduling | 2026-10-28 | `reminders` (migration 0012, one-scheduled partial unique index), item offsets + `daily_nudge_time`, sync in the task/event/preferences transactions (rolling next occurrence, nudge per zone), `claimDueReminders` under `SKIP LOCKED` in `runSweep`; no sending |
| 5.5 | Delivery in the sweep | done | chunk/5.5-sweep-delivery | 2026-10-28 | `runSweep` sends via `web-push` (stale → disabled → no_device → quiet-hours hold, bundled release), 404/410 deletes the device, 3 attempts then `failed`, rolls series/nudge, title-or-private payloads with deep links, TTL to stale; migration 0013 adds the delivery prefs + `held_until` |
| 5.6 | Reminder UI and preferences | done | chunk/5.6-reminder-ui | 2026-10-29 | Reminder select in task/event forms (events pre-fill 10, series-wide, early hint), dialog status with in-app snooze, notification snooze actions → `POST /api/reminders/[id]/snooze`, Settings → Reminders (switch, private, quiet hours, nudge, no-device note) |
| 5.7 | Reliability pass | done | chunk/5.7-reliability-pass | 2026-10-29 | `reliability.integration.test.ts` (DST, zone change, far zones on UTC, missed/cut-off sweeps, DST quiet hours) found 3 bugs, fixed; skips by reason in the sweep log, `reminder_sweep_status` + Settings warning, `pnpm reminders:failed`, Neon note in DEPLOY.md |
| 5.✓ | Phase 5 checkpoint (user) | done | | 2026-10-29 | User marked done without the week of relying on reminders; production setup (sweep secret, VAPID keys, cron-job.org), phone checks, the missed/late/duplicate log, `pnpm reminders:failed` and Neon compute readings are deferred to a whole-app check later |
| 6.0 | Decision gate: habits | done | chunk/6.0-habits-decisions | 2026-10-29 | ADR 0014: three cadences, check or quantity (partial credit), completed/skipped with derived "Missed", versioned schedules, exact week-based denominators, skips excluded; 6.1–6.6 and DATA_MODEL synced |
| 6.1 | Habits: schema and service | done | chunk/6.1-habits-schema-service | 2026-10-29 | `habits`, `habit_schedules`, `habit_pauses`, `habit_logs` (migration 0015, hand-edited `SET NULL (goal_id)`, one-open-pause index), per-type cadence Zod schemas, service with versioned schedules, pause/archive rows and `habit.*` events; no UI, logs or consistency |
| 6.2 | Cadence engine | done | chunk/6.2-cadence-engine | 2026-10-29 | `src/lib/habits/consistency.ts`: `isActiveDay`, `weekTarget`, `habitDays`, `consistency`, `weekProgress`, `formatConsistency`, `cutToOneDecimal`, with definition text; exact credit sums; current week for quantity amended in ADR 0014 |
| 6.3 | Habit CRUD UI | done | chunk/6.3-habit-crud-ui | 2026-10-29 | Track in the nav (`/track`, `/track/archived`), create/edit dialog (measure on create only, unit + target, daily/chosen days/N a week picker, seven days → daily, "applies from this week" note), pause/resume, archive/restore, delete naming the log count, optional goal link; edits save in one transaction |
| 6.4 | Logging | done | chunk/6.4-habit-logging | 2026-10-29 | `setHabitLog`/`clearHabitLog` (active days up to today in the saved zone, value by measure, row lock, `habit.logged|log_changed|log_removed`), Today "Habits" section (one tap done/skip, full-target Done, Change amount, Undo toast), Track two-week strip with figure for backfills and corrections |
| 6.5 | Track page and history | done | chunk/6.5-track-history | 2026-10-29 | `/track?range=` (4w default, 12w, week) from the saved zone and week start, strip by week with row labels, figure + always-visible definition, "This week" as progress (`weekProgressFigure`), `src/lib/habits/track-range.ts`; no streaks, percentages or totals |
| 6.6 | Home integration | done | chunk/6.6-home-habits | 2026-10-29 | `habitsSummary` in `metrics/home.ts` (engine via exported `engineData`/`engineInput`, Track's 4-week range), Home "Habits" card: each active habit's own figure + this week's progress, title linking to its Track row (`#habit-<id>`); no combined number |
| 6.✓ | Phase 6 checkpoint (user) | done | | 2026-10-29 | User marked done at the start of 7.0, without the planned two weeks of tracking real habits |
| 7.0 | Decision gate: weekly review | done | chunk/7.0-review-decisions | 2026-10-29 | ADR 0015: user-week periods, optional wins/blockers/lessons + up to 10 linked priorities, open during its week and the next then read-only, nothing required to finish, live summary, `weekly_review` reminder kind; 7.1–7.5 and DATA_MODEL synced |
| 7.1 | Weekly summary queries | done | chunk/7.1-weekly-summary | 2026-10-29 | `src/server/modules/metrics/review.ts`: `weeklySummary` with six `Metric`s (tasks completed, planned vs completed, rescheduled, goals without activity, habits, deadlines next period), each with definition, range, `hasData`; computed live; no UI |
| 7.2 | Reviews: schema and service | done | chunk/7.2-review-schema-service | 2026-10-29 | `weekly_reviews` + `weekly_review_priorities` (migration 0016: period/length/exactly-one CHECKs, composite cascading FKs, unique period and targets), service (start, save text, set priorities, finish, delete) refusing writes once closed, `weekly_review.*` events with no text; no UI |
| 7.3 | Review flow UI | done | chunk/7.3-review-flow-ui | 2026-10-29 | Review in the nav (`/review?week=&step=`), opens last week unless finished, started client-side on opening; Look back / Reflect / Adjust (pause/resume/drop goals, reschedule/cancel stalled tasks, plan next week) / Choose priorities, each saved on leaving; Finish with nothing filled; closed review read-only |
| 7.4 | Review history | done | chunk/7.4-review-history | 2026-10-29 | Past reviews at `/review/history` (newest first, Finished on / Not finished, open until / closed on, no skipped-week counts), read-only `/review/history/[id]` (text, current priorities, summary as of now), Edit only while open, confirmed delete action |
| 7.5 | Review reminder | done | chunk/7.5-review-reminder | 2026-10-29 | `weekly_review` reminder kind (migration 0017: kind CHECK, `kind` added to the one-scheduled index, `weekly_review_day`/`_time` both-or-neither CHECK), scheduled and rolled like the nudge, "Time for your weekly review" → `/review`, Settings → Reminders day + time with the quiet-hours warning |
| 7.✓ | Phase 7 checkpoint (user) | done | | 2026-10-29 | User marked done at the start of 8.0, without the planned three real weekly reviews |
| 8.0 | Decision gate: notes | done | chunk/8.0-notes-decisions | 2026-10-29 | ADR 0016: TipTap rich text stored as validated JSON + derived `body_text`, `note_goals`/`note_tasks` join tables, English FTS (generated `search_vector`, GIN), tags on notes; 8.1–8.4 rewritten, 8.5 Tags added, DATA_MODEL synced |
| 8.1 | Notes: schema and service | done | chunk/8.1-notes-schema-service | 2026-10-30 | `notes` (generated English `search_vector` + GIN, title/body_text CHECKs) and `note_goals`/`note_tasks` (composite cascading FKs), migration 0018; shared allowlist, Zod schema and `toBodyText` in `src/lib/notes/`; save with the stale-`updated_at` conflict, archive/restore, link/unlink (50 max), delete; `note.*` events with no content; no UI |
| 8.2 | Notes UI | done | chunk/8.2-notes-ui | 2026-10-30 | Notes in the nav (`/notes`, `/notes/new`, `/notes/[id]`, `/notes/archived`), TipTap 3.32.0 editor cut to the 8.1 allowlist (pasted attributes re-parsed), autosave (1 s, blur, leaving, `pagehide`) with Saving…/Saved/Not saved + Retry, conflict prompt, leave guard, React-only read-only renderer, archive/restore, confirmed delete |
| 8.3 | Linking | done | chunk/8.3-note-linking | 2026-10-30 | Editor "Linked to" (goal/task picker with status, unlink), goal "Notes" and task dialog "Linked notes" (Link a note, New note linked on first save via `saveNote` `linkTo`, unlink), goal/task delete confirmations name kept notes; task delete added (action + confirmed dialog) with the user's approval |
| 8.4 | Search | todo | | | |
| 8.5 | Tags | todo | | | |
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
| Hosting and jobs | One Node host running the web app and a worker (pg-boss), on managed Postgres. For v1 on free hosting, the worker is replaced by a sweep route called every 15 minutes ([ADR 0013](decisions/0013-reminders-sweep-and-delivery.md)) |
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
  lib/                    pure helpers (dates, result types), no server-only imports
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
- The upcoming days, grouped by local date, merging planned and due items (open tasks only), with tabs for "Within a Week" (the default, the next 7 days), the next 14 days and the next 30 days. (The week tab was added at the user's request after 2.6 shipped with a 14-day default.)
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
Decided 2026-10-23 in [ADR 0012](decisions/0012-calendar-recurrence-time-blocks-views.md). The user chose recurrence and time blocks in v1, against the gate's recommendation.
- **Recurring events:** in v1, for events **and** time blocks.
  - **Engine:** `rrule-temporal` behind `src/lib/recurrence.ts`. A series row holds the rule, and occurrences are expanded at query time and never stored.
  - **Exceptions:** per-series exception rows, keyed by the occurrence's original start.
  - **Patterns:** the form's repeat builder (daily, weekly on weekdays, monthly by day or nth/last weekday, yearly, interval, ends never/after N/on date), and the server accepts only those rule parts.
  - **Scopes:** edit and delete offer this event / this and following / all events.
- **Time blocks:** in v1, in their own table.
  - **Task:** each block is for exactly one task (required, deleted with the task) and shows the task's title. Timed only, at most 24 hours.
  - **Status:** user-set `scheduled | done | skipped`. A past block that's still `scheduled` reads "Not marked". Marking a block done never completes the task.
  - **Auto-mark:** completing the task marks its started one-off blocks done, and only today's started occurrences of a repeating block. A repeating series is never ended automatically: its future occurrences show "End series here".
  - **Creating:** the "Block time" form, selecting a grid slot, dragging a task from a desktop task panel, or dragging a block to move or resize it.
- **Views:** Week (from the user's week start, all-day row, deadline markers), Day as the mobile fallback, and Agenda. No Month view; decide at the checkpoint.
  - **Renderer:** FullCalendar v7 (`@fullcalendar/react`, MIT), used for rendering only. The server expands occurrences, and our own dialogs own create and edit.
- **All-day events:** local `start_date`/`end_date`, end exclusive. The form shows an inclusive end.
- **Resource views:** lanes are life areas. Built as our own components in 4.10–4.11, after the checkpoint.

### 4.1 Calendar events: schema and service
- Table `calendar_events` (one-off events only; recurrence is 4.3):
  - `title`, `description?`, `location?`, `all_day`
  - Timed events: `start_at`, `end_at` (UTC) and `tz`. All-day events: `start_date`, `end_date` (`date`, end exclusive).
  - CHECKs enforce exactly one shape and that the end comes after the start. Title/description/location length CHECKs.
  - `goal_id?` and `life_area_id?`: composite FKs with `ON DELETE SET NULL (goal_id)` / `SET NULL (life_area_id)` in a hand-edited migration (see the 1.1 note).
  - `source` (default `internal`), `external_id?`, timestamps, `unique (id, user_id)` (exceptions, reminders and note links will reference events).
- Index on `(user_id, start_at)` and on `(user_id, start_date)`.
- **Service:**
  - CRUD. Delete is a confirmed hard delete that removes the event's audit events (ADR 0005).
  - `eventsBetween(localStart, localEnd, tz)`: timed events by instant overlap, and all-day events by local-date overlap.
  - Audit events (`calendar_event.created`, `.updated`): structured fields only, never title, description or location.
- **Tests:** range query edge cases (an event ending exactly at the range start is excluded), events crossing midnight, DST transition days in `America/New_York`, all-day end exclusivity, cross-user access, goal and life-area deletes clearing the link and keeping `user_id`.

### 4.2 Recurrence engine
- Add `rrule-temporal` (check the version and licence first), and import it only in `src/lib/recurrence.ts`. Confirm that it works with the `temporal-polyfill` module import and not a global `Temporal` (ADR 0008). If it needs a global, stop and ask.
- A Zod schema for the builder subset in ADR 0012:
  - `FREQ` daily/weekly/monthly/yearly with `INTERVAL`
  - `BYDAY` (weekly; monthly with an ordinal, including `-1`)
  - `BYMONTHDAY`
  - `COUNT` or `UNTIL`, not both

  Plus functions to turn a stored rule into builder values and back. Anything else is rejected.
- `expandOccurrences(series, rangeStart, rangeEnd, exceptions)`. It is pure (no DB), and its range is at most 366 days.
  - **Timed:** local wall-clock time anchored in the series' `tz`, with each occurrence lasting the series' elapsed duration.
  - **All-day:** dates.
  - Cancelled exceptions are removed, and overridden ones are moved and patched.
- A plain-language summary of a rule ("Every 2 weeks on Mon and Thu, until 20 Dec 2026") for the form and dialogs.
- **Tests (unit):**
  - weekly across both `America/New_York` DST transitions (stays at 09:00 local)
  - monthly on the 31st and on the last Friday
  - yearly on 29 Feb
  - `COUNT` and `UNTIL` boundaries
  - exceptions (cancel and move)
  - a range edge at an occurrence's exact start and end
  - the 366-day cap
  - round trip from rule to builder and back

### 4.3 Recurring events: series, exceptions and scopes
- Add `rrule?` to `calendar_events` (a series row holds its first occurrence's times). Add the table `calendar_event_exceptions`:
  - `event_id` (composite FK, cascade) and `user_id`
  - `original_start_at?` / `original_start_date?`, matching the series shape, and unique per event
  - `kind` (`cancelled | modified`)
  - override fields: start/end, title, description, location, `goal_id?`, `life_area_id?`
  - timestamps
- `eventsBetween` now expands series through `src/lib/recurrence.ts` and returns occurrences with their series id and original start, so the UI can address one occurrence.
- **Service scopes** (ADR 0012):
  - **this event:** upsert an exception, or a cancellation for delete
  - **this and following:** in one transaction, set `UNTIL` on the old series, create the new series, and move or drop later exceptions
  - **all events:** edit the series and drop exceptions that no longer match
  - Each operation returns what it dropped, so the UI can confirm.
- Audit events for series and exception changes (structured fields, the rule and the scope; never text). Deleting a series removes its and its exceptions' events.
- **Tests:**
  - each scope for edit and delete, on timed and all-day series
  - a split on a DST transition day
  - exceptions carried over or dropped on a split
  - deleting the first occurrence with "this and following" (deletes the series)
  - cross-user access to a series and to an exception

### 4.4 Event create/edit UI
- A Calendar entry under Plan (sidebar, Plan sub-nav and mobile), with an event dialog:
  - title, an all-day toggle, start and a sensible default duration (60 min), and an inclusive end date for all-day events
  - location, description, goal (pre-fills its life area) and life area
  - a time-zone display when the event's zone differs from the user's
- The repeat builder, with the rule summary from 4.2.
- On an occurrence of a series, edit and delete ask for the scope. The confirmation names any exceptions that will be dropped.
- Until 4.5, the calendar page lists upcoming events plainly (the dialog needs a place to live).
- **Done when:** validation errors are field-level (including the builder's), and the dialog and builder are fully keyboard operable.

### 4.5 FullCalendar foundation and Agenda view
- Add `@fullcalendar/react` v7 (check the version, licence and React 19 peer first). Use its built-in subpaths (`/list`, `/timegrid`, `/interaction`) and no v6 packages.
- One client wrapper component in `src/components/calendar/`, themed with the app's Tailwind tokens in light and dark. It renders feeds that the server has already expanded.
- **Agenda** (`list` view): a chronological list for a chosen range (URL parameter), merging events (with occurrences), timed task deadlines and planned tasks. Clicking an item opens its dialog. Time blocks join in 4.8.
- **Done when:**
  - items show on the correct local day in the user's zone
  - axe passes
  - the list is keyboard operable
  - the range survives a refresh

### 4.6 Week and Day views
- **Week** (`timeGridWeek`): starts on the user's week start. Timed events are positioned by local time, all-day events sit in the all-day row, and timed task deadlines appear as markers. Planned tasks stay on Today, Upcoming and Agenda.
- **Day** (`timeGridDay`) is the fallback on mobile widths.
- Navigation (previous, next, today) is reflected in the URL. Clicking an event opens its dialog.
- **Done when:**
  - overlapping events render side by side
  - the grid is navigable by keyboard
  - axe passes on Week and Day

  If FullCalendar's grid can't meet the keyboard bar, stop and ask (ADR 0012).

### 4.7 Time blocks: schema and service
- Table `time_blocks`:
  - `task_id` (required, composite FK, `ON DELETE CASCADE`)
  - `start_at`, `end_at` (UTC), `tz`, `rrule?`
  - `status` (`scheduled | done | skipped`, default `scheduled`)
  - timestamps
  - CHECKs: end after start, at most 24 hours, status values. For one-off blocks, `status` is the block's status.
- Table `time_block_exceptions`: `block_id` (composite FK, cascade), `user_id`, `original_start_at` (unique per block), `kind` (`cancelled | modified`), override start/end, `status?`, timestamps.
- **Service:**
  - CRUD with the three scopes, reusing 4.3's approach
  - `setStatus(block or occurrence)`
  - `blocksBetween(localStart, localEnd, tz)`, with each block's task title, task status and lane (the task's goal's life area via `goalOf`)
  - audit events, including status changes
- **Auto-mark:**
  - **Where:** the task service's `changeStatus` to `completed` calls the block service in the same transaction.
  - **One-off blocks:** started and still `scheduled` blocks become `done`.
  - **Repeating blocks:** only occurrences that started on the user's local day of completion and are still `scheduled` become `done`.
  - **Never:** skipped blocks, future blocks, reopen and cancel change nothing.
  - **Audit:** one event per block or occurrence, marked as automatic.
- Task delete deletes its blocks, their exceptions and all their audit events in one transaction.
- **Tests:**
  - every auto-mark rule above, including a series started weeks ago (only today's occurrence is marked) and a completion just after midnight in a non-UTC zone
  - scopes on repeating blocks
  - the 24-hour CHECK
  - task delete cascading blocks and their events
  - cross-user access

### 4.8 Time blocks UI
- **"Block time" action** on a task (Plan list, Today, task dialog): date, start, duration (defaults to the estimate, else 60 min) and the repeat builder. The task dialog lists its upcoming blocks.
- **On the grid** (Week and Day):
  - Blocks are styled differently from events.
  - Selecting a slot opens a task picker, which creates a block.
  - Dragging moves a block and resizing changes its length. On a repeating block, both ask for the scope.
  - **Desktop only:** a task panel beside the Week grid that you drag open tasks out of to create blocks.
- **On a block:** set its status (done or skipped, or back to scheduled); "Also complete the task?" as a separate action; "Not marked" for past scheduled blocks; "Task completed" plus "End series here" on future occurrences of a series.
- Agenda includes blocks.
- **Done when:** every drag action has a keyboard path through the form, and the e2e test creates a block by form and completes its task, which marks the block done.

### 4.9 Integrations with Today and Home
- Today shows a timeline of today's events and time blocks at the top, with all-day events first.
- Home shows the next commitment: the next event or block that hasn't ended. It is a metric in `metrics/home.ts` with one card (see the 3.2 note).
- **Done when:** a timed event and a block on today's local date appear on Today in a non-UTC zone, and Home's card links to the item in the calendar.

**Phase 4 checkpoint:** use the calendar and time blocks for a week. Decide whether a Month view is needed and whether events should be draggable on the grid like blocks. The resource views (4.10–4.11) follow the checkpoint.

### 4.10 Resource columns by life area
- A day view with one column per active life area, plus "No area". Events go by their `life_area_id`, and blocks by their task's goal's area.
- Our own component, built from scratch (do not copy or adapt FullCalendar's premium code), reusing the 4.6 positioning and overlap rules where possible.
- **Done when:** overlaps within a column render side by side, the grid is keyboard navigable, and axe passes.

### 4.11 Resource timeline by life area
- One row per active life area plus "No area", across a chosen range (a day or a week) on a horizontal time axis. Our own component, built the same way as 4.10.
- **Done when:** items land in the right lane and position in a non-UTC zone, the timeline is keyboard navigable, and axe passes.

---

## Phase 5: Reminders and Web Push

**Goal:** Reliable reminders that work without the app open.

### 5.0 Decision gate
Decided 2026-10-27 in [ADR 0013](decisions/0013-reminders-sweep-and-delivery.md). The user chose to stay on the free hosting (ADR 0009), against the gate's recommendation of a paid Render instance plus Render Postgres.
- **Hosting:** no worker process and no pg-boss in v1 (both would keep Neon Free awake and run out its allowance).
  - A secret-protected `POST /api/reminders/sweep` route in the web app claims and sends due reminders.
  - cron-job.org (free) calls it **every 15 minutes**.
  - **Never late:** each sweep sends what is due before the next sweep, so reminders arrive up to 15 minutes early.
- **What can remind:** timed task deadlines, timed events (including occurrences of repeating events) and an optional daily planning nudge at a local time. Not time blocks, date-only deadlines or all-day events.
- **Repeating events:** a rolling "next occurrence" row. The series' setting applies to every occurrence, with no per-occurrence override.
- **Defaults:** one reminder per item, from 0/10/30/60/1440 minutes before.
  - Tasks get none by default. New events get 10 minutes, and existing events get none.
  - The nudge is off until a time is chosen. Nothing is delivered without a subscribed device, and there is a global off switch.
- **Quiet hours:** optional, off by default (suggesting 22:00–07:00). Reminders that come due inside are held, then delivered at the end, bundled when there are several, unless they're stale (the item started or passed), in which case they're skipped.
- **Content:** title and time by default, never descriptions, locations or notes. Private mode sends "You have a reminder · <time>" with no title in the payload. The nudge and bundles never carry titles.

### 5.1 Sweep route and external trigger
- **Env:** `REMINDER_SWEEP_SECRET` (at least 32 random bytes) in the env schema and as a placeholder in `.env.example`. Tell the user how to generate it, and never commit a value.
- **Route:** `POST /api/reminders/sweep`.
  - Bearer secret compared in constant time, with the same `401` for a missing or wrong secret. Outside the session proxy, and no request body.
  - It calls `runSweep(now)` in `src/server/modules/reminders/sweep.ts`. Until 5.4 that does nothing but log one line: start, counts (all zero), duration.
  - It never logs the secret or any content.
- **`pnpm reminders:sweep`:** runs one sweep against the configured database, for local use (there is no cron locally).
- **`DEPLOY.md`:**
  - setting the secret on Render
  - creating the cron-job.org job (every 15 minutes, `POST`, the header, the longest timeout it allows)
  - the Render free-hours note (one service awake all month)
  - Neon usage to watch
- Update `render.yaml`'s comment that says the Phase 5 worker needs a paid plan.
- **Production check (user):** for an hour, the sweep lines appear in Render's logs every 15 minutes. If a cold start makes calls fail, add a second cron-job.org call every 10 minutes to a new route that doesn't touch the database (not `/api/health`, which does) and document it.
- **Done when:**
  - integration tests cover `401` without the secret or with a wrong one, and `200` with counts with the right one
  - the user has confirmed the production check, or it is recorded as unverified

### 5.2 Service worker and PWA install
- A minimal service worker: push and notification-click handlers only. Offline caching is not in scope.
  - The click handler opens the payload's deep-link URL (focusing an open tab when there is one).
  - The push handler shows the payload's text as given. It never fetches titles.
- An install prompt or help text, including iOS "Add to Home Screen" guidance, since iOS needs it for push.
- **Done when:** the app installs on desktop and on a phone.

### 5.3 Push subscriptions
- Generate VAPID keys and add them to the environment and `.env.example`. Add the `web-push` library (check the version and licence first).
- A `push_subscriptions` table: `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent_label`, `created_at`, `last_success_at`, `failed_count`. Treat the keys as secrets and never log them.
- Subscribe and unsubscribe actions. A device list in Settings with a revoke button. A "Send test notification" button, which sends directly from the action (there is no queue).
- **Done when:** the test notification arrives on two devices, and revoking stops delivery.

### 5.4 Reminders: schema and scheduling
- **Item settings:** nullable `reminder_offset_minutes` on `tasks` and `calendar_events`, with a CHECK for 0/10/30/60/1440. `user_preferences` gets `daily_nudge_time?` (local `HH:MM`).
- **A `reminders` table** (ADR 0013):
  - `kind` (`task_deadline | event | daily_nudge`), with composite FKs `task_id?`/`event_id?` (cascade). A CHECK ties each kind to its link.
  - `target_at` (the deadline or the occurrence's start; the nudge's local time as an instant), `occurrence_start?` (a repeating event's original start), `fire_at` (UTC)
  - `status` (`scheduled | sending | sent | skipped | failed`), `skip_reason?` (`stale | disabled | no_device`), `attempts`, `last_error_code?`, `claimed_at?`, `sent_at?`, timestamps
  - `snoozed` (boolean, default false; 5.6)
  - a partial unique index: at most one `scheduled`, non-snoozed row per task, per event, and per user for the nudge
  - an index on `(status, fire_at)` for the sweep
- **Scheduling in the same transaction as the item change:**
  - **Tasks:** setting or changing the offset, setting, moving or clearing `due_at`, and reopening write or move the `scheduled` row. Completing, cancelling, a date-only deadline or a removed offset delete it.
  - **Events:** create (the form pre-fills 10 for new events; the service takes what it's given), edit in all three scopes, and delete. A series gets the rolling row for its next occurrence that is still to fire: a cancelled occurrence is skipped, and a moved one uses its new start.
  - **Nudge:** the next local occurrence of `daily_nudge_time` in the user's zone. A time-zone change recomputes only the nudge.
  - A target already past gets no row.
- **Claim:** `claimDueReminders(now, horizon)` moves rows with `fire_at < now + 15 min` from `scheduled` to `sending` with `FOR UPDATE SKIP LOCKED`, in a short transaction. `runSweep` calls it, and sending is 5.5. Until then, claimed rows stay `sending` (test data only).
- **Tests:**
  - rescheduling moves `fire_at`; completing, cancelling and deleting remove the row; reopening restores it
  - a date-only deadline gets none
  - each event scope on a series, including the next occurrence cancelled or moved and a split
  - two concurrent claims never claim the same row
  - a time-zone change moves only the nudge
  - cross-user access
  - the offset CHECK

### 5.5 Delivery in the sweep
- `runSweep` sends what it claimed with `web-push` to each of the user's subscriptions, then records `sent` in a transaction.
  - A row left in `sending` by a cut-off request is claimed again once `claimed_at` is 10 minutes old. A duplicate is accepted; a lost reminder is not.
  - A 404 or 410 deletes that subscription. Other errors leave the row `scheduled` for the next sweep, up to 3 attempts, then `failed` with the error code.
  - The push TTL runs until `target_at` (at least 60 seconds).
- **Before sending, in order:**
  1. **Stale** (deadline passed or task not open, occurrence started, nudge's local day over): `skipped` / `stale`.
  2. **Reminders turned off:** `skipped` / `disabled`.
  3. **No subscription:** `skipped` / `no_device`.
  4. **Quiet hours** in the user's current zone: held. The row stays `scheduled` and isn't claimed until the end.
- **Quiet hours:** the first sweep at or after the end sends the held reminders that aren't stale. Several go as one "N reminders from quiet hours" notification that opens Today.
- **Repeating events:** after a row is sent or skipped, the same transaction inserts the row for the next occurrence (the 5.4 helper).
- **Payload:**
  - title and time ("Dentist · 14:00 (in 10 min)", "Due 17:00 · Submit visa form"), or in private mode "You have a reminder · 14:00" with no title in the payload
  - the nudge is "Time to plan your day"
  - the deep link: the task's dialog; the event's dialog on Day (`?item=`, 4.9); Today for a bundle or the nudge
  - payloads are never logged
- **Tests (push mocked at the library boundary):**
  - an overlapping or repeated sweep sends once
  - an expired subscription is removed
  - retries, then `failed`
  - every skip reason
  - quiet hours hold, release, bundle and skip stale, including quiet hours that cross midnight
  - private mode leaves the title out of the payload
  - the next occurrence is inserted after a send
  - the never-late window (a reminder due 14 minutes after the sweep is sent; one due 16 minutes after waits)

### 5.6 Reminder UI and preferences
- **Task and event forms:** a reminder select (none, at the time, 10/30 min, 1 hour, 1 day before).
  - New events pre-fill 10 minutes. On a series the reminder applies to every occurrence, and the "this event" scope doesn't show it.
  - The hint says "Reminders may arrive up to 15 minutes early."
  - The item's dialog shows its next reminder, or the last one skipped ("Skipped: quiet hours").
- **Snooze** from the notification (a service-worker action posting to an authenticated route) and in the app: 15 minutes or 1 hour. It inserts a new `scheduled` row with `snoozed = true` for the same target, outside the one-per-item index, so a series' next-occurrence row is untouched. A snoozed row goes stale like any other.
- **Settings:**
  - reminders on or off
  - quiet hours (off by default, suggesting 22:00–07:00)
  - private mode
  - the daily nudge time (off by default, with a warning when it falls inside quiet hours)
  - a note when no device is subscribed
- **Done when:** turning reminders off stops all deliveries (test), and the forms are keyboard operable with field-level errors.

### 5.7 Reliability pass
- **Tests:**
  - DST transition days (a deadline, a repeating event and the nudge, in `America/New_York`)
  - a user changing time zone
  - the server in UTC with a user in a far zone (`Pacific/Kiritimati`, `Pacific/Pago_Pago`)
  - missed sweeps catching up and skipping stale reminders
  - a sweep cut off between sending and recording
  - quiet hours on a DST night
- **Visibility:**
  - each sweep logs claimed, sent, skipped (by reason) and failed counts and its duration
  - a `last_sweep_at` record, with a warning on Settings when no sweep has run for an hour, so a stopped cron-job.org is noticed
  - `pnpm reminders:failed` prints failed reminders by error code and age, with no content (there is no admin role)
- **The checkpoint:** record how to read Neon's monthly compute use, and the threshold (about 80 CU-hours) at which to widen the interval or move to paid hosting (ADR 0013).

**Phase 5 checkpoint:** rely on reminders for a week, and track any missed, late or duplicated notifications and Neon's compute use.

---

## Phase 6: Habits

**Goal:** Track repeated behaviors accurately and without streak pressure (Journey C).

### 6.0 Decision gate
Decided 2026-10-29 in [ADR 0014](decisions/0014-habit-cadence-logs-consistency.md), which holds the exact denominator definitions. Later chunks follow it rather than this summary. The user chose full quantity habits, against the gate's recommendation to defer them, and the "Missed" label instead of "Not logged". The sixth question (versioned schedules) was added beyond the gate's five.
- **Cadences:**
  - `daily`
  - `weekly_days`: 1–6 chosen weekdays, 0 = Sunday … 6 = Saturday
  - `times_per_week`: N = 1–6 per user week, counted from the saved week start
- **Measure:** `check` or `quantity`. A quantity habit has a `unit` and a per-day `target` (above 0, 2 decimals). Partial credit `min(value ÷ target, 1)` per day, never carried over. Measure and unit are fixed at creation.
- **Logs:**
  - one per habit per local date, `completed | skipped`
  - `value` only on a completed quantity log
  - "Missed" never stored: derived for past counted days with no log, in neutral styling
  - no per-day Missed for `times_per_week`
- **Schedules:** cadence and target are versioned in `habit_schedules`, effective from the start of the current user week. Past weeks keep theirs.
- **Denominators:** over whole user weeks.
  - Today counts only once it has a completed log.
  - `daily`/`weekly_days`: counted days (active, scheduled, not skipped, past or logged today).
  - `weekly_days`: completions on other weekdays are "extra", not counted.
  - `times_per_week`:
    - a partial week expects `round(N × active days ÷ 7)`
    - each skip lowers the week's target by one
    - completions are capped at the target
    - the current week counts only what's done (`min(done, target)`); for quantity habits it expects the completed days, up to the target (amended in 6.2)
- **Skips:** excluded from the denominator, never a miss, and always shown next to the figure.
- **Shown as:** "12 of 14 days · 2 skipped" or "7 of 9 times". Never a percentage, a score or a total across habits. With nothing expected, there is no figure.

### 6.1 Habits: schema and service
- **Tables** (ADR 0014), each with `user_id`, `unique (id, user_id)` where referenced, and composite FKs `(habit_id, user_id) → habits(id, user_id)` with cascade:
  - `habits`:
    - `title`, `description?`, `measure` (`check | quantity`), `unit?`, `start_date`, `end_date?`
    - `status` (`active | paused | archived`), `status_changed_at`, `goal_id?`, timestamps
    - CHECKs: status, measure, `unit` set exactly for `quantity`, `end_date >= start_date`, lengths
    - the goal FK hand-edited to `ON DELETE SET NULL (goal_id)` (see the 1.1 note)
  - `habit_schedules`:
    - `habit_id`, `effective_from` (local date), `cadence_type` (`daily | weekly_days | times_per_week`), `cadence_config` (jsonb), `target?` (numeric, above 0, at most 99,999.99), timestamps
    - `unique (habit_id, effective_from)`
  - `habit_pauses`:
    - `habit_id`, `start_date`, `end_date?` (exclusive: the first active day again)
    - CHECK `end_date > start_date`
    - a partial unique index: at most one open pause (`end_date is null`) per habit
  - `habit_logs`:
    - `habit_id`, `local_date`, `status` (`completed | skipped`), `value?` (numeric, same bounds as `target`), `note?`, timestamps
    - `unique (habit_id, local_date)` and an index `(user_id, local_date)`
    - CHECKs: status, a skip has no `value`, `value > 0`
- **Validation (Zod):**
  - `cadence_config` per type: `{}`, `{ days }` with 1–6 distinct weekdays 0–6, `{ timesPerWeek }` 1–6
  - `target` and `unit` required for `quantity` and refused for `check`
  - the date pair checked together
- **Service** (create, edit, change schedule, pause, resume, archive, restore, delete), with the ADR's rules:
  - **Create** writes the habit and its first schedule (`effective_from` = the start of the week holding `start_date`) in one transaction.
  - **Change schedule** upserts the row for the current week's start. It can't change `measure` or `unit`.
  - **Pause** opens a pause from today, or from tomorrow if today has a log. **Resume** closes it today, or deletes it if it would be empty. **Archive** opens one if none is open. **Restore** goes to `active` and closes it.
  - **Delete** is a hard delete that removes the habit's events.
  - Audit events `habit.created|updated|status_changed|schedule_changed`, with no title, description, unit or target number in them.
  - Deleting a goal clears habits' `goal_id` with a `habit.updated` event for each, in the same transaction (like 2.7's `task.moved`).
- **No log writes** (6.4 owns them) and no consistency (6.2).
- **Tests:**
  - every CHECK and unique index, including a duplicate log and a second open pause
  - invalid cadence configs per type
  - quantity/check field rules
  - pause/resume/archive/restore rows, including a same-day pause and resume
  - a second schedule edit in one week replacing the first
  - the goal-delete `SET NULL` keeping `user_id`
  - delete removing children and events
  - cross-user access
  - audit privacy

### 6.2 Cadence engine (pure functions)
- **In `src/lib/habits/`** (pure, no server imports), exactly per ADR 0014 "Consistency":
  - `scheduleForWeek(schedules, week)`
  - `isActiveDay(habit, pauses, date)`
  - `weekTarget(N, activeDays)` (integer form `floor((2·N·a + 7) / 14)`)
  - `habitDays(input)` (each day's state for history strips: inactive, not scheduled, completed with credit, extra, skipped, missed, unlogged (a past `times_per_week` day), today, future)
  - `consistency(input) → { completed, expected, skipped, atTarget?, definition }`
  - `weekProgress(input)` (the current week's done of target, for "so far this week")
  - `formatConsistency(result, cadence, measure)` (cut to one decimal, "Nothing expected in this range" at 0)
- **Input:** the habit, its schedules, pauses and logs, a whole-week range, `today` and the week start.
- **Definition text** is built from the habit's schedule, and names the partial-week, skip, today/this-week and partial-credit rules.
- **Exhaustive unit tests:**
  - week boundaries for all seven week starts
  - a start date, end date or pause in the middle of a week
  - N = 1–6 against 0–7 active days (the rounding table)
  - skips lowering a week's target to 0
  - the current week never lowering the figure
  - today unlogged vs logged
  - `weekly_days` extras
  - quantity credit below, at and above the target, and the weekly cap
  - a schedule change mid-history
  - a week-start change regrouping weeks
  - logs on inactive days ignored
  - empty ranges and ranges before the start

### 6.3 Habit CRUD UI
- A Track destination in the navigation (`NAV_ITEMS`, `APP_ROUTE_SEGMENTS`, `shell.spec.ts`) with the habits list: active and paused, and archived behind a link.
- **Create/edit dialog:**
  - title, description, measure (on create only; "can't be changed later"), unit and target for quantity
  - a cadence picker: daily / chosen weekdays / N times a week; all seven weekdays becomes daily
  - start and end dates, and the optional goal link (active and paused goals)
  - a cadence or target edit says it applies from the start of this week
- **Status actions:** pause, resume, archive, restore (to active), and delete behind a confirmation naming how many logs go with it.
- **Done when:** keyboard-operable forms with field-level errors, axe passes, and the e2e test covers create (check and quantity), a schedule edit, pause/resume and archive/restore.

### 6.4 Logging
- **Log service and actions:** set (create or change) and clear a log.
  - Only on active days, on or before today in the user's saved zone. No future logs.
  - `value` is required for completed quantity logs and refused otherwise.
  - Events `habit.logged|log_changed|log_removed` on the habit (local date, status from/to, `value` by name only; never the note).
- **A "Habits" section on Today:**
  - Which habits show: active habits on an active day, when today is scheduled (`weekly_days`), or while the week's target isn't met (`times_per_week`), plus any already logged today.
  - One tap completes (a quantity habit logs its full target, and "Change amount" takes another value) or skips, with undo in the toast.
  - `times_per_week` rows show "1 of 3 so far this week".
- **A calendar strip per habit** (the `habitDays` states) for backfilling and correcting past active days. "Missed" is neutral, and extras and inactive days are marked.
- **Done when:** correcting a past log updates consistency immediately, and the audit log records the correction (tests); cross-user, future-date and inactive-day logs are refused.

### 6.5 Track page and history
- Each habit on Track shows:
  - its history (the strip, by week)
  - its consistency for the selected range: the last 4 weeks (default) or the last 12, each including the current week, or this week alone
  - the definition visible next to the figure
- **"This week"** shows the week in progress ("1 of 3 so far this week" for `times_per_week`), not a consistency figure.
- The range is in the URL, and the dates are worked out on the server from the saved zone and week start.
- No streak counters, percentages or totals across habits. If streaks are ever added, keep them optional and never the main number.

### 6.6 Home integration
- A `habitsSummary` metric in `metrics/home.ts`, reusing the 6.2 engine (never recounting).
  - Active habits, each with its last-4-weeks consistency and this week's progress.
  - `range`, `asOf` and a definition.
  - `hasData` = the user has any active habit.
- A "Habits" `<MetricCard>` on Home listing each habit's figure, linking to Track. No combined number across habits.

**Phase 6 checkpoint:** track real habits for two weeks, and validate that the numbers feel fair.

---

## Phase 7: Weekly Review

**Goal:** A short reflection that produces an adjustment, not a dashboard (Journey D).

### 7.0 Decision gate
Decided 2026-10-29 in [ADR 0015](decisions/0015-weekly-review-period-structure-lock.md). Later chunks follow it rather than this summary. The user chose a lock a week after the period ends, against the gate's recommendation of "editable afterward". Two questions were added beyond the gate's three: the exact lock rule, and what finishing requires.
- **Period:** the user's week. `period_start` is a week's first day under the week start at creation, `period_end = period_start + 7` (exclusive), both local dates. One review per period. Saved periods never move with a zone or week-start change.
- **Structure:** wins, blockers, lessons (text, each optional, up to 5,000 characters), and priorities for next week: up to 10 ordered links to goals or tasks, plus an optional priorities note. "Next week" is the period after the reviewed one.
- **Open window:** a period is open while today (current zone) is before `period_end + 7`, so only last week and this week are open. A review can be started, edited, finished and given priorities only while open, then it is read-only, with no correction path. Closed, never-reviewed weeks can't be reviewed later, and that is never flagged.
- **Finishing:** nothing is required. "Finish review" sets `completed_at`. A finished review stays editable while open. An unfinished review that closes shows as "Not finished", neutrally, and is never counted.
- **Default period** for the flow: last week if it has no finished review, otherwise this week.
- **Derived in the ADR, not asked:** the summary is computed live and never stored; adjustments are ordinary goal/task changes, not locked; delete is allowed at any time, behind a confirmation; deleting a linked goal or task removes the priority; the `weekly_review.*` events; the reminder's settings and rules (7.5).

### 7.1 Weekly summary queries
- **In `src/server/modules/metrics/review.ts`**, for a period `[period_start, period_end)`, each a `Metric<V>` with `definition`, `range` (the period), `asOf` and `hasData`. Computed from records every time, never stored (ADR 0015).
- **Instants** (completion times, audit `occurred_at`) are placed on local dates in the user's current zone.
- **Metrics and their definitions** (the definition text says the same in plain words):
  - **Tasks completed:** tasks now `completed` whose `completed_at` falls in the period.
  - **Planned versus completed:** "planned" = tasks that, at any time, had a plan date in the period (from `task.created` and `task.planned` events, so a plan moved out of the week still counts as planned); "completed" = those of them counted in "Tasks completed".
  - **Rescheduled:** tasks with at least one `task.planned` or `task.due_changed` event in the period that moved an existing plan date or deadline later. Counted per task, not per move.
  - **Goals with no activity:** goals now `active`, created before `period_end`, with no audit event in the period on the goal, its milestones or its current tasks, and no completed log of its linked habits in the period. Named, as Home's "Goals without a next action" are.
  - **Habits:** each habit active or paused now, via the 6.2 engine (`engineData`/`engineInput`) over the period as a one-week range. The current week uses `weekProgress`, a past week `consistency`, worded with `formatConsistency`/`weekProgressFigure`. If the period isn't a whole week under the current week start (the week start changed since), the habits metric says it isn't available for that week instead of counting.
  - **Deadlines next period:** open tasks with a deadline in `[period_end, period_end + 7)`.
- **No UI.**
- **Tests:** sparse data (`hasData` false per metric), week boundaries for several week starts and a zone ahead of UTC, a plan moved out of the week, a deadline moved earlier (not rescheduled), activity only through a milestone, a task or a linked habit, the misaligned-period habits case, cross-user.

### 7.2 Reviews: schema and service
- **Tables** (ADR 0015), each with `user_id`, and `unique (id, user_id)` on `weekly_reviews`:
  - `weekly_reviews`:
    - `period_start`, `period_end`, `wins?`, `blockers?`, `lessons?`, `priorities_note?`, `completed_at?`, timestamps
    - `unique (user_id, period_start)`
    - CHECKs: `period_end = period_start + 7`, each text up to 5,000 characters
  - `weekly_review_priorities`:
    - `review_id`, `goal_id?` or `task_id?` (exactly one, a CHECK), `sort_order`, timestamps
    - composite FKs `(review_id, user_id)`, `(goal_id, user_id)`, `(task_id, user_id)`, all `ON DELETE CASCADE`
    - unique `(review_id, goal_id)` and `(review_id, task_id)`, unique `(review_id, sort_order)`
- **Validation (Zod):** text trimmed, empty → null, up to 5,000 characters; priorities a list of at most 10 distinct `{ goalId } | { taskId }`.
- **Service** (start, save text, set priorities, finish, delete), with the ADR's rules:
  - **Start** takes a period start, which must be this week's or last week's first day under the current week start. It returns the existing review for that period if there is one, or creates it (`weekly_review.started`).
  - **Every write except delete** locks the review row and refuses a closed period (today in the current zone ≥ `period_end + 7`) with a `ConflictError` ("This review is closed for editing").
  - **Save text** writes any of the four fields (`weekly_review.updated` with the changed field names only).
  - **Set priorities** replaces the list in order (dense `sort_order` from 0) with active or paused goals and open tasks of the same user (`weekly_review.priorities_changed`, ordered IDs from/to).
  - **Finish** sets `completed_at` once (`weekly_review.finished`). Finishing again is a no-op with no event.
  - **Delete** is a confirmed hard delete, allowed when closed, removing the priorities (cascade) and the review's events.
  - A no-op write records no event. No review text ever goes into an event or a log.
- **No UI.**
- **Tests:** every CHECK and unique index (including a duplicate period and a second link to the same goal), the exactly-one CHECK, the goal and task delete cascades, start for this/last week only (future, older, misaligned refused), every write refused once closed (the boundary day in a zone ahead of UTC), delete allowed when closed, nothing required to finish, cross-user (review, goal and task IDs), "no text in audit".

### 7.3 Review flow UI
- **A Review destination** in the navigation (`/review`, `NAV_ITEMS`, `APP_ROUTE_SEGMENTS`, `shell.spec.ts`). It opens the default period's review (last week if it has no finished review, otherwise this week), names the period's dates, and offers the other open week.
- **Four steps:**
  1. **Look back:** the summary from 7.1, each metric with its definition.
  2. **Reflect:** wins, blockers, lessons, all optional.
  3. **Adjust:** inline actions through the existing goal and task actions: pause or drop a goal, reschedule or cancel a stalled task, plan a task on a day of next week (the period after the reviewed one).
  4. **Choose priorities:** pick up to 10 goals and tasks for next week, order them, and add an optional note.
- **Saving:** the review is started on opening the flow, and each step saves as the user leaves it, so the flow can be resumed while the period is open. "Finish review" needs nothing filled.
- A closed period opens read-only (7.4's view), with no adjust actions.
- **Done when:** an end-to-end test completes a review that pauses one goal and plans two tasks for next week, and a review with every field empty can be finished. Keyboard-operable, axe passes.

### 7.4 Review history
- A list of past reviews, newest first: the period's dates, "Not finished" (neutral) for an unfinished one, and nothing that counts or flags skipped weeks.
- A read-only view of each review: its text, its priorities with their current titles and statuses, and the look-back summary as computed now (labelled "as of").
- **Edit** is offered only while the period is open (it reopens the flow). A closed review shows the date it closed, with no edit.
- **Delete** on every review, behind a confirmation.
- **Done when:** the e2e covers a closed review being read-only (the server refuses the write, not only the UI), editing an open one, and delete; axe passes.

### 7.5 Review reminder
- **An optional weekly reminder** at a chosen local weekday and time, off by default, on the Phase 5 machinery (ADR 0015, no new delivery path):
  - `user_preferences.weekly_review_day` (0–6) and `weekly_review_time` ("HH:MM"), both set or both null (a CHECK)
  - reminder kind `weekly_review` (the kind and link CHECKs extended): at most one `scheduled` row per user, rolled to the next week when sent or skipped, and recomputed in the same transaction as a zone or setting change, as the daily nudge is
  - quiet hours, the global switch, the device rules and staleness (its local day has ended) apply unchanged
  - the notification is always "Time for your weekly review", with no titles in either mode, and opens `/review`
  - not suppressed when the week's review is already finished
- **Settings → Reminders:** a "Weekly review" day and time, with the quiet-hours warning the nudge has.
- **Done when:** tests cover a DST week, a zone change, quiet hours, the roll to the next week, and the setting turned off; the e2e sets and clears it.

**Phase 7 checkpoint:** do three real weekly reviews, and cut any step that feels like ceremony.

---

## Phase 8: Notes

**Goal:** Keep information connected to the goals it supports.

### 8.0 Decision gate
Decided 2026-10-29 in [ADR 0016](decisions/0016-notes-rich-text-links-search-tags.md). Later chunks follow it rather than this summary. The user chose a rich-text editor against the gate's recommendation of Markdown, and added tags, which the gate had deferred. Two questions were added beyond the gate's: how a rich-text body is stored, and what tags apply to. Phase 8 gains chunk 8.5 for tags.
- **Format:** a TipTap (ProseMirror) WYSIWYG editor. The body is stored as the editor's JSON document (`jsonb`), validated server-side against one shared allowlist of nodes and marks (no images, tables, task lists or raw HTML; links `http:`/`https:`/`mailto:` only). The server derives a plain-text `body_text` for search, previews and limits. Rendered as React elements, never an HTML string.
- **Links:** typed join tables `note_goals` and `note_tasks` with composite FKs cascading on both sides; many links per note (at most 50); goals and tasks only.
- **Search:** Postgres full-text search with the `english` configuration: a generated `search_vector` on notes (title weighted above body) with a GIN index, expression GIN indexes on goal and task titles, `websearch_to_tsquery`, `ts_headline` highlights.
- **Tags:** on notes only. User-owned tags, unique ignoring case, created inline, renamed and deleted from Notes (deleting only untags); filter the list and search by one tag.
- **Deferred:** backlinks between notes and attachments.
- **Derived in the ADR, not asked:** title optional (up to 200), body limits (512 KB of JSON, 100,000 characters of text, 20 levels deep); a row only on the first save with content; autosave with a stale-`updated_at` conflict; `updated_at` moves on content only; archive hides a note from the list, search and linked lists, read-only until restored; deleting a goal or task keeps the note; search as a Server Action so terms stay out of URLs and logs; `note.*` and `tag.*` events with `note.updated` at most once per 10 minutes, no content.

### 8.1 Notes: schema and service
- **Tables** (ADR 0016), each with `user_id`:
  - `notes`:
    - `title?`, `body` (`jsonb`, not null), `body_text` (text, not null, server-derived), `archived_at?`, timestamps
    - `search_vector`: a generated, stored `tsvector`, `setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', body_text), 'B')`, with a GIN index. Drizzle needs a custom `tsvector` type; hand-edit the migration if the generated expression isn't expressible, and cover it with a test.
    - `unique (id, user_id)`, an index on `(user_id, updated_at)`
    - CHECKs: title 1–200 characters when set, `body_text` up to 100,000 characters
  - `note_goals` and `note_tasks`:
    - `note_id`, `goal_id` or `task_id`, `created_at`
    - composite FKs `(note_id, user_id)` and `(goal_id, user_id)` / `(task_id, user_id)`, all `ON DELETE CASCADE`
    - unique `(note_id, goal_id)` / `(note_id, task_id)`, and an index on the target column for the goal and task pages
- **The document allowlist** in `src/lib/notes/` (no server-only imports, so 8.2's editor uses the same list):
  - nodes `doc`, `paragraph`, `heading` (1–3), `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `text`; marks `bold`, `italic`, `strike`, `code`, `link`
  - a recursive Zod schema refusing any other type or attribute, a link `href` that isn't `http:`/`https:`/`mailto:` or is over 2,048 characters, nesting deeper than 20, or more than 512 KB of JSON
  - `toBodyText(doc)`: block nodes on separate lines, control characters removed
- **Validation (Zod):** title trimmed, empty → null, up to 200; the body through the allowlist schema; `expectedUpdatedAt` on every save.
- **Service:**
  - **Save** creates a note on the first save with a title or a non-empty body (`note.created`), otherwise updates it. It derives `body_text`, refuses a stale `expectedUpdatedAt` with a `ConflictError` ("This note changed somewhere else") under a row lock, and moves `updated_at` only when the title or body changed.
  - `note.updated` (changed field names only) is skipped when the note's latest `note.updated` event is under 10 minutes old.
  - **Archive** / **restore** (`note.archived`, `note.restored`). An archived note refuses saves, links and tags until restored.
  - **Link** / **unlink** a goal or task of the same user (`note.linked`, `note.unlinked`, `targetType` + `targetId`), at most 50 links per note. Linking an already linked target is a no-op with no event.
  - **Delete** is a confirmed hard delete: links by cascade, the note's events in the same transaction.
  - A no-op write records no event. No title, body or `body_text` ever goes into an event or a log.
- **No UI.**
- **Tests:** every CHECK and unique index, the generated `search_vector` (title outranks body), allowlist rejections (unknown node, `javascript:` link, an `on*` or `style` attribute, too deep, too large), `body_text` derivation, no row from an empty first save, the stale-save conflict, the 10-minute `note.updated` window, writes refused while archived, goal and task delete keeping the note, note delete removing links and events, cross-user (note, goal and task IDs), "no content in audit".

### 8.2 Notes UI
- **A Notes destination** in the navigation (`/notes`, `NAV_ITEMS`, `APP_ROUTE_SEGMENTS`, `shell.spec.ts`), with `/notes/[noteId]`, `/notes/new` and `/notes/archived`.
- **List:** most recently updated first, each with its title (or "Untitled"), the first line of `body_text` and the updated date. A calm empty state with "New note".
- **Editor:** TipTap, pinned at the current stable version, client-only (`immediatelyRender: false`), configured to exactly the 8.1 allowlist, so pasted content is reduced to it. A toolbar for the allowed marks and blocks, each reachable by keyboard with a label, plus the editor's keyboard shortcuts. A title field above the body.
- **Autosave:** about a second after typing stops, and flushed on blur, route change and `pagehide`. An indicator shows "Saving…", "Saved" or "Not saved" with Retry. Leaving with an unsaved change asks first. A conflict keeps the unsaved text on screen and offers to load the saved version.
- **Read-only renderer** (archived notes, and 8.3's lists if they preview): the stored JSON to React elements through the allowlist, never `dangerouslySetInnerHTML`; links with `rel="noopener noreferrer"`.
- **Archive** (moves it to Archived, read-only, with Restore) and **delete** behind a confirmation.
- **Done when:** the e2e shows a draft is not lost on navigation (autosave), and a test shows script never executes: a `javascript:` link and an `<img onerror>` / `<script>` paste are refused or stripped, and stored text containing markup renders as text. Keyboard-operable, axe passes.

### 8.3 Linking
- **From a note:** a "Linked to" section in the editor to link goals and tasks (a picker searching all of the user's goals and tasks, showing their status) and unlink them.
- **On goal detail and in the task dialog:** a "Notes" section listing linked, non-archived notes (title and updated date, linking to the note), "Link a note", "New note" (created already linked, on its first save), and unlink.
- The goal and task delete confirmations say linked notes are kept and only unlinked, when there are any.
- **Task delete** (added with the user's approval on 2026-10-30, since tasks had no delete in the UI and so no confirmation to change): a `deleteTask` action and a confirmed "Delete task" in the task dialog, naming its time blocks, reminders and linked notes, and pointing a task that isn't cancelled at cancelling instead.
- **Done when:** the e2e links a note from a goal and from a task, sees it on both, unlinks one, and deletes the goal with the note kept. Axe passes.

### 8.4 Search
- **A search page** (`/notes/search`, reached from Notes and a search field in the shell) that searches notes, plus goal and task titles (ADR 0016).
- **The query** runs through a Server Action, so terms never go into the URL or a log. Trimmed, 1–200 characters, `websearch_to_tsquery('english', …)`. A query of only stop words says there was nothing to search for.
- **Indexes:** expression GIN indexes on `to_tsvector('english', title)` for `goals` and `tasks` (a migration).
- **Results** in three groups: notes (not archived), goals and tasks (every status, shown). Each is ranked by `ts_rank_cd`, then most recently updated, up to 20 per group, and links to its item.
- **Highlights:** `ts_headline` on the title and `body_text` with private delimiter characters, split into `<mark>` elements, never inserted as HTML.
- **Done when:** search returns only the current user's data (a cross-user test for each group), stemming finds "running" for "run", archived notes don't appear, highlights render as text, and the e2e searches for a note and a task. Keyboard-operable, axe passes.

### 8.5 Tags
- **Tables** (ADR 0016), each with `user_id`:
  - `tags`: `name`, timestamps; `unique (user_id, lower(name))`, `unique (id, user_id)`; CHECK name 1–40 characters
  - `note_tags`: `note_id`, `tag_id`, `created_at`; composite FKs `(note_id, user_id)` and `(tag_id, user_id)`, both `ON DELETE CASCADE`; unique `(note_id, tag_id)`, an index on `tag_id`
- **Service:** set a note's tags by name (an existing tag matched ignoring case, otherwise created: `tag.created`), at most 20 per note (`note.tags_changed`, tag IDs from and to); rename (`tag.renamed`, a taken name is a `ConflictError`); delete (a hard delete that untags its notes and removes its events). Tags on an archived note can't change. No tag name in an event or a log.
- **UI:** a tag field in the editor (type to pick or create), tag chips in the Notes list, a tag filter on the list (`?tag=<id>`, an ID only) and on search's notes group, and a "Tags" manager on Notes to rename and delete, the delete confirmation naming the number of notes.
- **Done when:** tests cover the case-insensitive unique name (create and rename), the 20-tag limit, delete untagging only, cross-user (tag and note IDs), "no tag names in audit"; the e2e tags a note, filters by the tag, renames it and deletes it. Axe passes.

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
| Minute-accurate reminders (a paid always-on host calling the sweep every minute, or a worker), time-block reminders, several reminders per item | The Phase 5 checkpoint shows 15-minute-early delivery or Neon's compute allowance is a real problem (ADR 0013) |
| Calendar sync, a Month view, dragging events on the grid (time blocks and recurrence are in v1, ADR 0012) | A clear repeated need from real use, judged at the Phase 4 checkpoint |
| Backlinks between notes, note attachments (images, files), more link targets for notes (ADR 0016) | Real use shows the need; attachments also need file storage the free hosts don't provide |
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

### 2.2: Tasks: service (2026-10-22)
- **Built:**
  - `src/lib/tasks.ts`: `TASK_EDITABLE_FIELDS`, `TASK_STATUS_EVENTS` (status entered → event type), `timestampsAfterTaskStatusChange(to, now)`, the `Task` type.
  - `src/server/modules/tasks/`: `validation.ts` (create, update, change status, plan, reschedule due, move, id), `service.ts` (`createTask`, `updateTask`, `changeTaskStatus`, `planTask`, `rescheduleTaskDue`, `moveTask`, `deleteTask`), `queries.ts` (`goalOf(userId, taskId)`, `listInboxTasks(userId)`).
  - Audit events `task.created|updated|completed|reopened|cancelled|planned|due_changed|moved` in `AUDIT_EVENTS`, with an ISO-instant and a canonical-zone schema for timed deadlines.
  - Tests: unit `src/lib/tasks.test.ts` (every status pair's timestamps, event names) and `tasks/validation.test.ts` (16); integration `tasks.integration.test.ts` (29: all nine status pairs incl. no-ops with `completed_at`/`cancelled_at` and parent unchanged, reopen clears `completed_at`, timed-deadline round trip New York → UTC → back and seen from London/Tokyo, DST offset, all-day ↔ timed ↔ none with old/new in `task.due_changed`, past-date planning and unplanning, planning a completed task, moves with events, another user's goal/milestone rejected on create and move with nothing changed, `goalOf` direct/via milestone/none/foreign, inbox includes due-only and excludes planned/parented/closed/other users', delete removes only that task's events, every operation on another user's task is `NotFound`, no title or notes in events).
- **Deviations:** no `actions.ts` ("no UI"; 2.3 adds them), as in 1.1 and 1.4.
- **Decisions:**
  1. **Deadline input is three flat form fields** (`dueDate`, `dueTime` "HH:MM", `dueTz`): date alone → `due_date`; all three → `due_at` = `instantFromLocal(date, time, zone)` ("compatible" DST rule) plus `due_tz`. A time without a date or zone, or a zone without a time, is a field error. Zones are stored canonical (`canonicalTimeZone`).
  2. **`updateTask` edits title, notes, priority and estimate only.** Plan, deadline, parent and status each have their own operation, so each change gets its own event (`task.updated` never carries dates or parents).
  3. **Status events are named by the status entered**: `open` → `task.reopened`, etc.; each records `status` from/to. `completed_at`/`cancelled_at` use SQL `now()`, equal to the event's `occurred_at`.
  4. **`task.due_changed` always carries all three deadline columns** (from/to), so a switch between all-day and timed is one event. Same deadline again (instant compared by value) is a no-op.
  5. **A foreign or missing parent is a field error** (`goalId` / `milestoneId`), caught from the composite FK like goals' life area, on create and move.
  6. **`sort_order` on create is max + 1 across the user's tasks** (no lock; ties fall back to creation time). Inbox order: `sort_order`, `created_at`, `id`.
  7. **`goalOf` throws `NotFoundError`** for a missing or foreign task, so `null` only ever means "no goal".
  8. Planning is allowed for any status and any date (backfill).
- **Next chunk should know:**
  - 2.3: wire `createTask` (quick add sends `{ title }`), `listInboxTasks`, and the other operations through `authedAction`; services expect validated input. Form errors come back on `goalId`, `milestoneId`, `dueDate`, `dueTime`, `dueTz`, `estimatedMinutes`.
  - To show a timed deadline, use `localDateTimeOf(task.dueAt, task.dueTz)` for its own zone, or the user's zone for "your time".
  - `goalOf` is a single-task query; list views (2.7) will want a batched join instead.
- **Unverified:** none. `pnpm verify` passes (format, lint, typecheck, 267 unit, 223 integration). No schema change, so no migration. `pnpm build` and `pnpm test:e2e` not run (no route or UI changes).
- **Follow-ups:**
  - Goal and milestone deletes still clear tasks' parents with no `task.moved` event (2.0/2.1 follow-up; decide in 2.7).

### 2.3: Quick add and Inbox (2026-10-23)
- **Built:**
  - `src/components/tasks/quick-add.tsx`: "Add task" button in the shell header (sidebar on desktop, top bar on phones) and the **Q** key anywhere outside a field or open dialog (`aria-keyshortcuts="Q"`). Dialog with Title focused; Enter adds. "More options" reveals Goal or milestone, Plan for and Due (all-day). Toast says "Task added to your inbox" or "Task added".
  - Route `src/app/(app)/plan/inbox/` (`page.tsx`, `error.tsx`) and `src/components/tasks/inbox-view.tsx`: inbox tasks (title, due), per-task checkboxes, Select all (indeterminate), "Plan for today", and a goal/milestone picker with "Assign to goal". Empty state "Your inbox is clear".
  - `src/components/tasks/task-parent-select.tsx` (goals as optgroups with their open milestones) and `plan-subnav.tsx` (Overview | Inbox row on the Plan pages).
  - Navigation: `PLAN_SUB_ITEMS` / `NAV_SUB_ITEMS` in `nav-items.ts`; the sidebar lists Inbox under Plan (`md` up). On Inbox, Plan has `aria-current="true"` and Inbox `"page"`.
  - Server: `tasks/actions.ts` (`createTask`, `getTaskParentOptions`, `planTasksToday`, `moveTasks`); service `planTasks` and `moveTasks` (all or none, one event per changed task) built on shared `planInTx` / `moveInTx`, which `planTask` / `moveTask` now use too; `listTaskParentOptions` query; `taskIdsSchema`, `planTasksSchema`, `moveTasksSchema` (1–200 IDs, duplicates dropped).
  - `src/lib/tasks.ts`: `taskParentChoice` / `parentFromChoice` ("goal:<id>" / "milestone:<id>" picker values) and `isInboxTask`.
  - Tests: unit (parent choices, `isInboxTask`, bulk schemas, nav sub-items); integration `tasks-ui.integration.test.ts` (16: quick add title-only lands in inbox, blank form strings, milestone + plan + due, blank title, foreign goal, anonymous; parent options order/filtering/other users; plan today in Pacific/Kiritimati with dedupe and events, all-or-none on a foreign task, empty selection; assign to goal/milestone, foreign goal refused, all-or-none; no-op event); e2e `tests/e2e/inbox.spec.ts` (Q → title → Enter lands in the inbox and survives reload; Q inside a field is a letter; quick add from Goals with a goal and dates stays out of the inbox; bulk plan today then assign to goal; mobile reaches Inbox from Plan; axe). `shell.spec.ts` updated for the Add task button and the Inbox link.
- **Deviations:**
  1. **Due in quick add is all-day only.** Timed deadlines (time + zone) need more fields than a quick capture should have; the service supports them and 2.4's inline edit can set them.
  2. **Inbox lives at `/plan/inbox`, not in the bottom bar.** The phone bar keeps its four top-level items; a Plan sub-nav reaches Inbox there. The `/plan` placeholder now shows that sub-nav.
- **Decisions:**
  1. **Shortcut is Q** (no modifier), ignored while typing in a field, with a modifier held, or with any dialog open.
  2. **Plan today uses the user's saved zone on the server** (`todayFor(preferences.timezone)`), never the device clock. No confirmed zone is a form error.
  3. **Bulk actions are all or none**: one missing or foreign task (or a foreign goal) changes nothing, in one transaction. Each changed task still gets its own `task.planned` / `task.moved` event; unchanged ones get none.
  4. **Pickers offer active goals, then paused, with open milestones only.** Completed, dropped and archived goals and closed milestones aren't offered. Quick add loads them via an action when "More options" first opens; the Inbox page loads them server-side.
- **Next chunk should know:**
  - Reuse `TaskParentSelect` + `parentFromChoice` for 2.4's inline parent edit, and `planTasks` / `moveTasks` for any other bulk action.
  - The quick-add dialog's submit button is also named "Add task"; scope e2e locators to the dialog. Toasts also render in an `aria-live` region, so match toast text with `{ exact: true }`.
  - In e2e, the Q shortcut works only after hydration; `captureWithKeyboard` in `inbox.spec.ts` retries until the dialog opens.
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 289 unit, 239 integration), `pnpm build` and `pnpm test:e2e` (30 tests) pass; `inbox.spec.ts` passed 12 of 12 with `--repeat-each=3`. No schema change, so no migration. A manual pass with a screen reader is not done.
- **Follow-ups:**
  - Undo for bulk actions (a toast action that unplans or moves back) if dogfooding shows mistakes.
  - Earlier follow-ups still open: goal/milestone deletes move tasks with no `task.moved` event (2.7); the `/home` instant-navigation dev warning; noisy `Provider not found` auth logs in integration output.

### 2.4: Plan page: task list and filters (2026-10-23)
- **Built:**
  - `src/lib/task-list.ts` (pure): `TaskListFilters`, `parseTaskListFilters(searchParams)` (unknown or malformed values fall back to defaults) and `taskListSearch(filters)` (omits defaults; round-trips), date windows `past | today | next7 | later | none` with `dateWindowBounds` / `dateWindowInstants`, `compareTasksBy(sort, timeZone)`, `formatEstimate` ("45 min", "1 h", "1 h 30 min"), labels.
  - `tasks/queries.ts`: `listPlanTasks(userId, filters, { today, timeZone })` (filters in SQL, joined through the milestone to the goal and its area; sorted with `compareTasksBy`), `PlanTaskItem` (task + goal + milestone), `listTaskFilterOptions` (every goal, live first; every area, active first).
  - Service `scheduleTask` (plan, deadline and parent in one transaction, each changed part with its own `task.planned` / `task.due_changed` / `task.moved` event) on a new `dueInTx`, which `rescheduleTaskDue` now uses too; `scheduleTaskSchema`. Actions `updateTask`, `changeTaskStatus`, `scheduleTask`.
  - UI: `src/app/(app)/plan/page.tsx` (replaces the placeholder) and `error.tsx`; `src/components/tasks/plan-filters.tsx` (Goal, Life area, Priority, Planned, Due, Sort by, "Show completed and cancelled", Status while shown, Clear filters; each change `router.replace`s to the URL, shown optimistically), `plan-task-list.tsx` (complete checkbox, goal › milestone link, priority label, planned/due/estimate line, status label for closed tasks), `task-schedule-editor.tsx` (inline Plan for / Due date / Due time / Goal or milestone, Escape cancels, focus returns), `task-form.tsx` (edit dialog: title, notes, priority, estimate; Cancel task / Reopen task). `TaskParentSelect` takes `current` so a task's completed goal or closed milestone stays selectable.
  - The Plan sub-nav's first item is now "All tasks" (was "Overview").
  - Tests: unit `src/lib/task-list.test.ts` (24) and `scheduleTaskSchema` in `validation.test.ts`; integration `plan-list.integration.test.ts` (21: default list with goal/milestone, goal incl. via milestone and "no goal", area via goal and milestone, priority incl. none, priority order, planned windows, timed deadlines at 23:59/00:01 in Tokyo vs UTC, closed toggle and status, cross-user incl. filtering by another user's goal/area, filter options, schedule action events/no-op/clear/foreign parent all-or-none/foreign task/anonymous/field errors, edit and status actions incl. cross-user); e2e `tests/e2e/plan.spec.ts` (3: priority/estimate labels, sort and goal filter in the URL surviving a reload, no-match empty state, Clear filters, axe; inline edit incl. Escape + focus return, timed due, goal, date windows, reload; complete, cancel, toggle + status filter surviving a reload, reopen, axe on the editor and dialog).
- **Deviations:**
  1. **Status changes on the Plan page** (not in the chunk text): a checkbox completes or reopens a task, and the edit dialog has Cancel task / Reopen task. Without them the "completed and cancelled" toggle would have nothing to show from this page.
  2. **Inline edit is one small form per row** ("Dates and goal") saving plan, deadline and parent together, not separate auto-saving fields; date inputs fire change events mid-typing, which would write an event per keystroke.
  3. **Fixed the 2.2 estimate schema's error message**: out-of-range or non-integer estimates came back as Zod's generic "Invalid input" (a union error) instead of "Enter whole minutes from 1 to 1440." The union now carries that message; the unit test checks the text, not only the key.
- **Decisions:**
  1. **URL params:** `goal` (UUID or `none`), `area`, `priority` (`high|medium|low|none`), `planned`, `due` (`past|today|next7|later|none`), `sort` (`due` default, `planned`, `priority`), `closed=1`, `status` (only with `closed=1`). Filter changes use `router.replace`, so they don't pile up in history; the URL is still bookmarkable.
  2. **Windows don't overlap:** "Next 7 days" is tomorrow through today + 7, "Later" after that. Computed from the user's saved zone on the server. A timed deadline matches by the local day of its instant in the user's zone (instant range in SQL); an all-day one by its date.
  3. **Due sort** puts an all-day deadline at the start of its day in the user's zone, so it sorts before that day's timed deadlines. Ties fall back to the deadline, then position. Sorting is in JS (`compareTasksBy`), filtering in SQL.
  4. **Goal filter offers every goal** (completed, dropped and archived labelled), so tasks under finished goals can still be found; the area filter matches the goal's area, including through a milestone.
  5. A new timed deadline from the inline editor uses the task's existing `due_tz` if it has one, else the user's zone (shown as the field hint).
- **Next chunk should know:**
  - Reuse `listPlanTasks`'s goal/milestone join for 2.5/2.7 lists; `PlanTaskItem` already carries both. `compareTasksBy` and `formatEstimate` are pure and shared.
  - Row controls are named `"Complete: <title>"`, `"Dates and goal: <title>"`, `"Edit: <title>"`; the inline editor is a form named `"Dates and goal for <title>"`. Filter selects live in the region "Filter and sort tasks".
  - In e2e, interacting right after `goto`/`reload` can happen before hydration and be lost. `plan.spec.ts` retries `addTask` (until the dialog opens) and `chooseFilter` (until the URL changes); copy those rather than adding waits. One unexplained failure in 64 runs before these retries; 45 of 45 after.
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 317 unit, 260 integration), `pnpm build` and `pnpm test:e2e` (33 tests) pass. In one of three full e2e runs, `preferences.spec.ts` "first sign-in proposes the device's time zone…" failed (reload still showed the proposed zone), the flake the 1.6 note records; the next full run passed. No schema change, so no migration. A manual pass with a screen reader is not done.
- **Follow-ups:**
  - `preferences.spec.ts`'s first-sign-in flake (1.6 note) looks like the pre-hydration pattern above: it picks a zone right after `goto("/settings")`. A retry like `chooseFilter`'s, or waiting for the save's POST before the reload, should fix it.
  - The list is unpaginated; fine for one person's tasks, revisit if it grows past a few hundred.
  - Drag to reorder (`sort_order`) and a "manual" sort are not built.
  - Earlier follow-ups still open: goal/milestone deletes move tasks with no `task.moved` event (2.7); the `/home` instant-navigation dev warning; noisy `Provider not found` auth logs in integration output.

### 2.5: Today view (2026-10-23)
- **Built:**
  - `src/lib/today.ts` (pure): `TODAY_SECTIONS` (display order), labels and hints, `todayClock(timeZone, now?)` (today plus its `[dayStart, dayEnd)` instants), `relativeDay`, `todaySection(task, clock)`, `groupTodayTasks` (sorted per section), `plannedSummary` ("3 tasks · 1 h 30 min estimated, 1 without an estimate"). `formatLocalDate` takes an optional `dateStyle` ("full" for the page's date line).
  - `tasks/queries.ts`: the goal/milestone join is now `selectPlanTaskItems(where)`, shared by `listPlanTasks`, `listTodayTasks(userId, clock, timeZone)` and `listTodaySuggestions(userId, clock, timeZone)`. `SortableTask` exported from `task-list.ts`.
  - Actions `planTaskForDay` (`{ id, day: "today" | "tomorrow" }`, from the saved zone on the server), `planTask` (pick a date, or null to unplan) and `rescheduleTaskDue`; `planTasksToday` now shares the `userDay` helper. `planTaskForDaySchema` in `validation.ts`.
  - Route `src/app/(app)/plan/today/` (`page.tsx`, `error.tsx`); `src/components/tasks/today-view.tsx` (sections, rows, inline date editor, refresh when the user's day changes) and `add-to-today.tsx` (the picker dialog). "Today" added to `PLAN_SUB_ITEMS` (sub-nav and sidebar, between All tasks and Inbox).
  - Tests: unit `src/lib/today.test.ts` (10: clock at 23:59/00:01 in Tokyo and a 25-hour Berlin day, every section and precedence pair, closed tasks, sorting, summary, no judgement words), nav test; integration `today.integration.test.ts` (13: sections at 23:59 and 00:01 Tokyo incl. a plan from yesterday under "Earlier, not done" with its date and events unchanged, one section per task, open only/goal join/cross-user, suggestions windows/active goals/limits/dedupe/cross-user, actions at 00:01 Tokyo with a faked clock, unplan, timed reschedule keeps time and zone, foreign task/anonymous/bad day/no zone); e2e `tests/e2e/today.spec.ts` (2, browser in Tokyo: empty state, empty and filled picker, complete and tomorrow in one tap, axe on page and dialog; yesterday's plan survives a reload, Needs a decision not coloured differently, plan for today, pick a date with Escape/focus return, unplan back to the inbox, new due date). `shell.spec.ts` updated for the Today link.
  - DATA_MODEL Task rules: Today's sections and their precedence.
- **Deviations:**
  1. **Today is `/plan/today`**, a Plan sub-page (PRODUCT_SPEC §7: Plan holds inbox, Today, Upcoming), not a fifth bottom-bar item.
  2. **"Reschedule" depends on the section.** Planned for today and Earlier, not done change the planned date ("Tomorrow", "Pick a date"); Due today and Needs a decision change the deadline ("New due date"), since a new plan date alone would leave a passed deadline where it is. A timed deadline keeps its time of day and zone.
  3. **Extras not in the chunk text:** a summary of today's estimates under "Planned for today" (Journey B: a realistic set), and a client refresh when the user's next day begins (timer plus `visibilitychange`), so a page left open overnight shows the new day. It only re-reads; nothing is written.
- **Decisions:**
  1. **Section precedence** (the chunk asked for one): Planned for today → Needs a decision → Due today → Earlier, not done. Planning a task today is a decision already made, even with a passed deadline; a passed deadline (a timed one earlier today included, per the chunk's "`due_at` before now") outranks a deadline still to come today; a deadline today outranks an old plan. A task planned for a later day with a passed deadline still shows under Needs a decision. Recorded in `todaySection`'s comment and DATA_MODEL.
  2. **Ordering:** planned by priority (high first), due today and needs a decision by deadline (all-day before timed), earlier by planned date, oldest first; ties by position.
  3. **Suggestions** are open tasks with no planned date that aren't on Today: up to 10 due in the next 7 days (the Plan page's window), then up to 3 per active goal (direct or under an open milestone), soonest deadline first. Paused/finished goals and closed milestones aren't suggested; a task is listed once. Inbox tasks with no deadline aren't suggested.
  4. **Only "Planned for today" always shows**; other sections appear only when they have tasks. Its empty state is "Nothing planned for today" with a "leave the day open" message, and "Add to today" sits in its header.
  5. Relative days ("today", "tomorrow") are worked out on the server from the saved zone; the client never sends its own today.
- **Next chunk should know:**
  - 2.6: reuse `selectPlanTaskItems` (private in `queries.ts`; export it if needed) and `todayClock`/`localDayRange` for local days; a timed deadline's local day is `localDateOf(dueAt, userZone)`.
  - Row controls are named `"Complete: <title>"`, `"Plan for today: <title>"`, `"Move to tomorrow: <title>"`, `"Pick a date: <title>"`, `"New due date: <title>"`, `"Unplan: <title>"`; the date editor is a form named `"Plan for: <title>"` or `"New due date: <title>"`. Sections are regions named by their heading. Picker groups are fieldsets ("Due soon", then each goal's title).
  - Integration tests can fake only the clock with `vi.useFakeTimers({ toFake: ["Date"] })` so pg keeps working; restore with `vi.useRealTimers()`.
  - Python edits on this Windows checkout write CRLF; `.gitattributes` normalises on commit, but run Prettier or strip `\r` before `format:check`.
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 327 unit, 273 integration), `pnpm build` and `pnpm test:e2e` (35 tests) pass; `today.spec.ts` passed 8 of 8 with `--repeat-each=4`. No schema change, so no migration. The midnight refresh was not exercised by a test (it only calls `router.refresh()`). A manual pass with a screen reader and on a phone is not done.
- **Follow-ups:**
  - Undo in the "Task completed" toast, if completing by mistake on Today turns out common.
  - A bulk "plan all for today" in Earlier, not done, if it piles up while dogfooding (the 2.0 note).
  - Earlier follow-ups still open: goal/milestone deletes move tasks with no `task.moved` event (2.7); the `/home` instant-navigation dev warning; noisy `Provider not found` auth logs; the `preferences.spec.ts` first-sign-in flake (did not fail in this chunk's runs).

### 2.6: Upcoming view (2026-10-23)
- **Built:**
  - `src/lib/upcoming.ts` (pure): `UPCOMING_RANGES` (14, 30), `parseUpcomingRange` (anything else → 14), `upcomingHref`, `upcomingWindow(today, days, zone)` (local dates plus the `[start, end)` instants), `dueDayOf`, `groupUpcomingTasks` (days with entries `{ task, planned, due }`), `upcomingDayLabel` ("Tomorrow · …"), `upcomingEntryDetails`. `formatTimeOfDay` in `src/lib/dates.ts`.
  - `listUpcomingTasks(userId, window, timeZone)` in `tasks/queries.ts` (open tasks, planned or all-day due dates in the window, timed deadlines in its instant range; reuses `selectPlanTaskItems`).
  - Route `src/app/(app)/plan/upcoming/` (`page.tsx`, `error.tsx`); `src/components/tasks/upcoming-view.tsx` (a "Days to show" nav with Next 14 days / Next 30 days links, one region per day headed by its `<time>`, calm empty state with "Show the next 30 days"). "Upcoming" added to `PLAN_SUB_ITEMS` between Today and Inbox. `useRefreshOnNewDay` moved out of `today-view.tsx` into `use-refresh-on-new-day.ts` and shared by both views.
  - Tests: unit `src/lib/upcoming.test.ts` (15: range parsing, window in Tokyo and across Berlin's DST change, timed deadlines on the Tokyo day incl. one set in New York and both window edges, merging, closed tasks, order within a day, labels) and `formatTimeOfDay`; integration `upcoming.integration.test.ts` (5, Tokyo at 23:59 and 00:01: window moves at local midnight, 30 days, timed deadlines at 00:30/23:59/00:00 and from New York, merged entries with goal/milestone, open only and cross-user); e2e `tests/e2e/upcoming.spec.ts` (2, browser in Tokyo: empty state, toggle in the URL, sub-nav order, axe; a deadline at 00:30 set inline on the Plan page shows on its Tokyo day and not the UTC day before, plan + deadline on two days and on one, today's plan and day 20 left out, 30 days survives a reload). `shell.spec.ts` updated for the Upcoming link.
  - DATA_MODEL Task rules: how Upcoming is derived.
- **Deviations:**
  1. **Upcoming starts tomorrow**, not today: Today already covers today (passed deadlines included), and "next 7 days" on the Plan page also starts tomorrow. Day 14 is today + 14.
  2. **Rows are read-only** (title, priority, goal › milestone link, what it is that day, its other date, estimate). The chunk lists no actions; complete/plan from here is a follow-up.
- **Decisions:**
  1. **Merging:** a task planned for one day and due on another shows on both days ("Planned · Due 29 Oct" and "Due · Planned 27 Oct"); planned and due the same day is one entry ("Planned, due"). Only the parts inside the window show.
  2. **Days with nothing are left out**, rather than listing 14 or 30 empty headings.
  3. **Order within a day:** all-day deadlines, then plans by priority (high first), then timed deadlines by time; ties by position.
  4. **The 30-day toggle is a URL param** (`/plan/upcoming?days=30`, links with `aria-current`), like the Goals status filter, so it is bookmarkable and server-filtered.
  5. A timed deadline's day and time are shown in the user's saved zone, not the task's `due_tz`.
- **Next chunk should know:**
  - Day regions are named by their heading ("Tomorrow · Saturday, …" or the full date in the user's locale); in e2e find a day by `h2 time[datetime="YYYY-MM-DD"]` instead of the localized name (see `day()` in `upcoming.spec.ts`).
  - `upcomingWindow` + `listUpcomingTasks` are reusable for Home's "upcoming commitments" (3.2) and the review's "deadlines next week" (7.1).
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 344 unit, 278 integration), `pnpm build` and `pnpm test:e2e` (37 tests) pass; `upcoming.spec.ts` passed 8 of 8 with `--repeat-each=4`. The full e2e suite failed twice in a row on `preferences.spec.ts` "first sign-in proposes the device's time zone…" (the known flake: the reload still showed the proposed zone) and passed on the third run; that spec passed 10 of 10 alone with `--repeat-each=5`. No schema change, so no migration. A manual pass with a screen reader and on a phone is not done.
- **Follow-ups:**
  - One-tap actions on Upcoming (complete, plan for today, pick a date), if dogfooding wants them.
  - The `preferences.spec.ts` first-sign-in flake now fails more often under full-suite load (two of three runs here). Fix it with the retry the 2.4 note describes (re-select until the value sticks, or wait for the save's POST before reloading).
  - Earlier follow-ups still open: goal/milestone deletes move tasks with no `task.moved` event (2.7); the `/home` instant-navigation dev warning; noisy `Provider not found` auth logs.
- **Addendum, "Within a Week" tab (2026-10-23, user-requested plan change):** the user asked for a third tab, the default, called "Within a Week". The 2.6 chunk text is updated to match.
  - `UPCOMING_RANGES` is now `[7, 14, 30]` with `DEFAULT_UPCOMING_RANGE = 7`: `/plan/upcoming` shows tomorrow through today + 7, `?days=14` and `?days=30` the longer windows, and anything else falls back to 7. New helpers are `UPCOMING_RANGE_LABELS` ("Within a Week", "Next 14 days", "Next 30 days"), `upcomingEmptyTitle` ("Nothing within a week" / "Nothing in the next N days") and `longerUpcomingRange`. The empty state offers the next longer range (a week → 14, 14 → 30, nothing past 30).
  - Tests: unit 17 (7-day window, the week stops at day 7 with a timed deadline at day-8 midnight left out, labels, helpers); integration 6 (new: the week in Tokyo at 00:01 keeps day 7 incl. 23:59 and drops day 8 incl. 00:00, which 14 days shows); e2e `upcoming.spec.ts` now checks the three tabs, the week default, the empty state stepping 7 → 14 → 30, and that a deadline on day 10 shows only from the 14-day tab.
  - The old 14-day default's URL `/plan/upcoming` now shows a week; bookmarks with `?days=30` are unchanged.
  - Checks: `pnpm verify` (356 unit, 290 integration), `pnpm build` and `pnpm test:e2e` (39) pass. The first full e2e run failed once on the known `preferences.spec.ts` first-sign-in flake, which then passed alone and in the next full run. No schema change.

### 2.7: Tasks in goals and milestones (2026-10-23)
- **Built:**
  - `src/lib/goal-tasks.ts` (pure): `actionDayOf` (earlier of planned date and the deadline's local day), `compareByActionDay`, `nextActionOf(tasks, zone)` (earliest dated open task, passed dates included; null with none), `groupGoalTasks` (direct vs by milestone, open first then by action day).
  - `src/lib/goals.ts`: `GoalTaskCounts` (`toInbox`, `planned`, `closed`), `NO_GOAL_TASKS`; `goalDeleteConsequences(milestoneCount, taskCounts)` ("3 milestones will be deleted. 7 tasks will move to your inbox.", plus sentences for planned and closed tasks, "It has no milestones or tasks.").
  - `tasks/queries.ts`: `listGoalTasks(userId, goalId)` (any status, direct or under its milestones, on `selectPlanTaskItems`) and `countGoalTasks(userId, goalIds)` (one grouped query with `count(*) filter`). `getGoalDetail` returns `tasks`, `nextAction`, `taskCounts`, `taskParentOptions`, `locale`, `timeZone`; `getArchivedGoals` returns `taskCounts`.
  - Service: `detachTasksInTx(tx, userId, { goalId } | { milestoneId })` in `tasks/service.ts` clears the parent of every affected task with a `task.moved` event each. `deleteGoal` now locks the goal and calls it before deleting; `deleteMilestone` calls it too.
  - UI: `src/components/goals/goal-tasks.tsx` replaces the Tasks placeholder on goal detail: a "Next action" panel (task, its milestone, planned/due/estimate; or a prompt), a "Show completed and cancelled (n)" toggle, a "Directly under this goal" group with an always-visible "New task" field, and a group per open milestone (or any milestone with tasks) with a "+ Add task" button opening a one-field form (Escape closes, focus returns). Rows reuse `PlanTaskList` (new `label` and `showGoal` props; `taskDetails` exported), so complete, "Dates and goal" and Edit work here too. `DeleteGoalDialog` takes `taskCounts` on the detail page and the archive view.
  - Tests: unit `src/lib/goal-tasks.test.ts` (6) and `goalDeleteConsequences` (4); integration `goals/goal-tasks.integration.test.ts` (11: detail lists direct and milestone tasks only, next action incl. a timed Tokyo deadline and the no-date case, task status leaves milestones/goal/progress alone, add to a milestone through the action, counts on detail and archive incl. a dropped milestone and cross-user, delete keeps tasks with `user_id` and puts open unplanned ones in the inbox, `task.moved` events, cross-user delete changes nothing, milestone delete detaches with an event); e2e `tests/e2e/goal-tasks.spec.ts` (2: add direct and milestone tasks in context, Escape/focus return, next action prompt then a due date makes it the next action, completing a task leaves the milestone and goal alone, toggle + reload, axe; delete states "1 milestone will be deleted. 2 tasks will move to your inbox." and both tasks then show in the inbox). `goal-archive.spec.ts` expects the new "It has no milestones or tasks." text.
  - DATA_MODEL: next action rule; goal and milestone delete wording.
- **Deviations:**
  1. **Goal and milestone deletes record `task.moved`** (the 2.0–2.6 follow-up said to decide in 2.7): the service clears the parents itself before the delete instead of leaving it to the FK `SET NULL`, so each task's history shows the move. The FKs stay as the backstop. Milestone delete has no UI yet; the service change is tested.
  2. **The delete confirmation splits the count** instead of one "7 tasks will move to your inbox": ADR 0011's inbox excludes planned and closed tasks, so only open unplanned ones are said to move there; planned ones "keep their dates, without a goal" and closed ones "are kept, without a goal".
  3. **Next action is shown on goal detail only**, not on the Goals list.
- **Decisions:**
  1. **Next action:** open tasks only, direct or under any milestone (closed milestones included, since the task is still open and listed), earliest of planned date and deadline day in the user's zone; passed dates count (they need attention first). Ties: deadline (all-day before timed), then position. Undated tasks never qualify; the prompt then says to plan one or give it a due date, or to add a task when there are none. Computed on the server in `getGoalDetail`.
  2. **Groups:** open milestones always get a group (so a task can be added); completed or dropped milestones only when they have tasks, labelled "Milestone completed" / "Milestone dropped", with no add button. Closed tasks are hidden behind one toggle for the whole section, as on the Plan page.
  3. **Lock order on goal delete:** goal row first, then its tasks, matching milestones' goal-first rule.
  4. The counts come from SQL at page load, like the milestone count, so tasks added in another tab after loading aren't counted.
- **Next chunk should know:**
  - Goal page locators: the section is the region "Tasks" (use `exact: true`; "Tasks directly under this goal" is a list name); the panel is the region "Next action"; lists are named "Tasks directly under this goal" and "Tasks under <milestone>"; the direct field is the textbox "New task", a milestone's button is "Add a task to <milestone>" and its field "New task under <milestone>". Row controls keep the Plan page names (`"Complete: <title>"`, `"Dates and goal: <title>"`, `"Edit: <title>"`).
  - 2.8 can check "goal progress unchanged by the task" against the milestone line; task status is already tested not to change it.
  - 3.2 "goals without a next action" can reuse `nextActionOf` with `listGoalTasks` (or a batched variant).
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 354 unit, 289 integration), `pnpm build` and `pnpm test:e2e` (39 tests, first run clean, including the known-flaky `preferences.spec.ts`) pass; `goal-tasks.spec.ts` passed 8 of 8 with `--repeat-each=4`. No schema change, so no migration. A manual pass with a screen reader and on a phone is not done.
- **Follow-ups:**
  - Show each goal's next action on the Goals list (needs a batched next-action query).
  - Milestone delete UI (the service already keeps and detaches its tasks), with a confirmation that states the task count.
  - Earlier follow-ups still open: life-area delete writes no `goal.updated` event; milestone events aren't in the goal timeline; milestone edit UI; the `preferences.spec.ts` first-sign-in flake; the `/home` instant-navigation dev warning; noisy `Provider not found` auth logs.

### 2.8: End-to-end journey test (2026-10-23)
- **Built:** `tests/e2e/journey.spec.ts`, one Playwright test through the whole Phase 2 loop as a new user: decline the starter areas and create "Health" inline → create a goal in that area with "Why does this matter?" filled (listed under the area; the reason shows under "Why it matters") → add a milestone ("0 of 1 milestone") → add one task under the milestone and one directly under the goal, in context on goal detail → on Today, plan the milestone's task with the "Add to today" picker (both tasks are suggested under the goal) → complete it there in one tap → Today is back to "Nothing planned for today" after a reload, with only its first section and the unplanned task absent → goal detail still shows "0 of 1 milestone", the milestone unchecked and the goal Active, the completed task behind the "Show completed and cancelled (1)" toggle as "Completed", the direct task still open → the Goals list row still says "0 of 1 milestone" under its area.
- **Deviations:** none. The journey exposed no app bugs, so no app code changed.
- **Decisions:**
  1. **One test, not split**, because the chunk describes a single journey. It is marked `test.slow()` (90 s limit): it takes about 14 s alone and about 21 s with four copies in parallel on the dev server, too close to the default 30 s (see the 1.2 note).
  2. **The milestone's task is the one planned and completed**, so "progress unchanged" checks the case most likely to go wrong: a task under the milestone being completed must not complete the milestone.
  3. **Today is reached by URL and planned through the picker** (Journey B), not the goal page's "Dates and goal" editor, which 2.4/2.7 specs already cover.
- **Next chunk should know:** the spec reuses the locators listed in the 2.5 and 2.7 notes and the picker's hydration retry from `today.spec.ts`; the browser's own time zone is used (no `timezoneId`), since "today" is computed on the server from the confirmed zone either way.
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 354 unit, 289 integration) passes; `pnpm test:e2e` (40 tests) passed three consecutive full runs; `journey.spec.ts` passed 4 of 4 with `--repeat-each=4`. `pnpm build` not run (no app code changed). No schema change, so no migration.
- **Follow-ups:** none new. Still open from earlier notes: life-area delete writes no `goal.updated` event; milestone events aren't in the goal timeline; milestone edit and delete UI; next action on the Goals list; the `preferences.spec.ts` first-sign-in flake (did not fail in this chunk's runs); the `/home` instant-navigation dev warning; noisy `Provider not found` auth logs.

### 3.1: Metrics module foundation (2026-10-23)
- **Built:**
  - `src/server/modules/metrics/metric.ts`: the contract `Metric<Value> = { value, definition, range, hasData }`, with `MetricRange = { from, to, timeZone, asOf }` (inclusive local dates in the user's zone; `null` bounds are open; `asOf` is the instant it was computed at).
  - `src/server/modules/metrics/home.ts` (server-only), each `(userId, clock, timeZone)` with `clock` from `todayClock`:
    - `todayTaskCounts` → `{ planned, due, decide }`: reuses `listTodayTasks`, so each task counts once in its Today section, with the same precedence as `/plan/today`. Range: today.
    - `goalsWithoutNextAction` → number: active goals with no open task (direct or under any milestone, closed milestones included) that has a planned date or a deadline. One SQL query (`count(*) filter (where not exists …)`), equivalent to `nextActionOf` from 2.7. Range: open (`null`/`null`), as of now.
    - `deadlinesNextSevenDays` → number: open tasks with a deadline from tomorrow through today + 7 (`dateWindowBounds("next7")`, so it is the same as `/plan?due=next7` and Upcoming's "Within a Week"). Timed deadlines count on their local day, using an instant range.
  - Tests: `home.integration.test.ts` (9, Tokyo at 00:01 on the 24th, while UTC is still on the 23rd). For each metric: empty data (`hasData: false`, with the exact `range`), data in range, and data out of range (`hasData: true`, value 0). Cases include planned-today winning over a passed deadline, midnight today counting as passed, New York deadlines that fall on a different Tokyo day at both window edges, paused/dropped goals, a dated inbox task, closed tasks, and cross-user isolation.
  - `ARCHITECTURE.md` §9 names the module and its contract.
- **Deviations:** none. There is no unit test file: the metrics are queries, and the pure rules they reuse (`todaySection`, `dateWindowBounds`, `nextActionOf`) already have unit tests.
- **Decisions:**
  1. **`hasData` means "there is anything for the metric to look at"**, not `value > 0`: today counts → the user has any open task; goals without a next action → any active goal; deadlines → any open task with a deadline. A zero with `hasData: true` is a real result (for example, deadlines exist but none fall in the next 7 days). It is documented on the type.
  2. **`range` carries `asOf`**, so a snapshot metric with no date bounds (goals without a next action) still says when it was true.
  3. **Values are counts, not lists.** 3.2 links each number to the list it counts: `/plan/today`, `/plan?due=next7` (or `/plan/upcoming`), and the goals list.
  4. Definitions are plain-language strings returned in each metric, ready for the card text 3.2 needs.
- **Next chunk should know:**
  - 3.2: call the three metrics with `todayClock(zone)` and the user's saved zone (from preferences). When `hasData` is false, show "nothing yet". `range.from`/`to` are local dates to format, and `null` means open.
  - Paused goals are deliberately left out of "goals without a next action". If Home should name the goals, add a list variant rather than widening `value`.
  - 7.1/9.1 should add metrics as new named functions returning `Metric<…>` in this module (one file per surface, as `home.ts` is).
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 356 unit, 299 integration) passes. No UI, so `pnpm build` and `pnpm test:e2e` were not run. No schema change, so no migration.
- **Follow-ups:** none new. Still open from earlier notes: life-area delete writes no `goal.updated` event; milestone events aren't in the goal timeline; milestone edit and delete UI; next action on the Goals list; the `preferences.spec.ts` first-sign-in flake; the `/home` instant-navigation dev warning; noisy `Provider not found` auth logs.

### 3.2: Home summaries (2026-10-23)
- **Built:**
  - `src/app/(app)/home/page.tsx` (replaces the placeholder greeting) and `error.tsx`. It reads the user's saved zone, makes one `todayClock`, and calls the three 3.1 metrics plus the new list variant in parallel.
  - `src/components/home/home-view.tsx`: one card (a region named by its heading) per metric. Cards: "Today", "Goals without a next action" and "Deadlines in the next 7 days". Each shows the metric's `definition`, its range ("Range: Today, 23 Oct 2026" / "Range: 24 Oct 2026 to 31 Oct 2026" / "Range: Any date") and the time it was worked out ("As of: 14:05", a `<time>`). With `hasData: false` a card says "Nothing yet" with one calm line (the goals card adds an "Add a goal" link). `metric-range.ts` (pure, unit-tested) words the range and time. `refresh-on-new-day.tsx` reuses `useRefreshOnNewDay`, so Home left open overnight shows the new day.
  - Links: Today's counts go to `/plan/today#today-planned`, `#today-due` and `#today-decide`. Today's sections now have those ids (`todaySectionAnchor` in `src/lib/today.ts`). Deadlines go to `/plan?due=next7`. The goals count goes to the list of goal names on the card (`#goals-without-next-action`), and each name goes to its goal page.
  - `listGoalsWithoutNextAction(userId)` in `metrics/home.ts`: `{ id, title }[]`, oldest first (the Goals list's order). It shares the `goalHasNextAction()` SQL with `goalsWithoutNextAction`, now pulled out of that function.
  - Tests: unit `src/components/home/metric-range.test.ts` (6). Integration: `home.integration.test.ts` checks that the list matches the count in all three goals cases (empty and paused/dropped, the counted three in order, cross-user). E2E: `tests/e2e/home.spec.ts` (2, browser in Tokyo). The first test covers a new user: three cards with "Nothing yet", definitions, ranges, no `%`, "score" or bare 0, axe, and the Add a goal link. The second covers data: each number's link `href`, clicking through to Today's section, the Plan due filter (showing day 3 but not today or day 10) and a goal page, and a dated task taking the goal off the card ("0 goals", "Every active goal has a next action.").
  - `auth.spec.ts` checked the placeholder "You're signed in as <email>" line, which is gone. It now checks the email through `GET /api/auth/get-session` instead, which is a stronger check of the same thing.
  - Docs: `ARCHITECTURE.md` §9 (list variants), `PRODUCT_SPEC.md` §8 (Home v1 cards).
- **Deviations:**
  1. **Goals without a next action are named on the card.** No existing list matches what this number counts (the Goals page filters only by status), and the user chose this over a new Goals-page filter or linking to all active goals. The number links to that in-card list.
  2. **Extras:** "As of" time on every card, and the midnight refresh, as on Today.
- **Decisions:**
  1. **Count labels sit under the number** and form the link's name ("1 Planned for today", "2 deadlines", "1 goal"). Today's labels reuse `TODAY_SECTION_LABELS`, so Home and Today use the same words.
  2. **Empty-state links don't reuse nav words** ("Today", "Plan", "Goals"). Playwright's non-exact `getByRole("link", { name: "Goals" })` in `journey.spec.ts` also matched "Go to Goals". Only the goals card has a link ("Add a goal"). The other two point to Add task in their text.
  3. **Zero with data is shown as a linked 0**, because it's a real result (3.1 decision 1). Only `hasData: false` shows "Nothing yet".
- **Next chunk should know:**
  - Home locators: cards are `getByRole("region", { name, exact: true })`. Count links are named "<n> <label>". The goal names are in the list "Goals without a next action".
  - 4.5 and 6.6 add Home cards. Add a metric in `metrics/home.ts`, then one `<MetricCard>` in `home-view.tsx`, and keep each number a `CountLink` to the list it counts.
  - The `home.spec.ts` link test is marked `test.slow()` (about 15 s alone).
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 362 unit, 299 integration), `pnpm build` and `pnpm test:e2e` (42 tests, first full run clean) pass. `home.spec.ts`, `journey.spec.ts` and `auth.spec.ts` passed 2 of 2 with `--repeat-each=2`. No schema change, so no migration. No one has looked at the cards in a browser by hand (the axe checks pass), and there's been no screen reader or phone pass.
- **Follow-ups:**
  - A Goals-page "without a next action" filter, if the in-card list gets long while dogfooding.
  - Earlier follow-ups still open: life-area delete writes no `goal.updated` event; milestone events aren't in the goal timeline; milestone edit and delete UI; next action on the Goals list; the `preferences.spec.ts` first-sign-in flake (did not fail in this chunk's runs); the `/home` instant-navigation dev warning (still printed for `/home`); noisy `Provider not found` auth logs.

### 4.0: Decision gate: calendar (2026-10-23)
- **Built:** ADR 0012 (calendar event shapes, recurrence, time blocks and views) and its index row. ADR 0007's status line points to it. Phase 4 is rewritten as 4.1–4.11 (the progress log, chunk text and `AGENT_PROMPTS.md` prompts). The "Later" row is updated. `DATA_MODEL.md` has CalendarEvent, the new CalendarEventException, TimeBlock and the new TimeBlockException, plus §4, §5, §6 and §7. `PRODUCT_SPEC.md` and `ROADMAP.md` are synced. No code.
- **Deviations:**
  1. **The user chose recurrence and time blocks in v1**, against the gate's recommendation, so Phase 4 grows from five feature chunks to nine before the checkpoint. The chunks are: engine (4.2), recurring events (4.3), FullCalendar + Agenda (4.5), Week/Day (4.6), and time blocks schema/service (4.7) and UI (4.8). Two more follow the checkpoint: resource columns (4.10) and resource timeline (4.11). The old 4.2–4.5 are now 4.4, 4.5, 4.6 and 4.9.
  2. **FullCalendar** came from the user's answer (use the free tier if compatible, and build the premium resource views ourselves). It is compatible: v7.1.3 is MIT, and its peers are React ^19 and `temporal-polyfill` ^1.0.1.
- **Decisions:**
  - **Asked and answered:**
    - full RRULE recurrence
    - all three edit scopes
    - `rrule-temporal` as the engine
    - life areas as resources, after the checkpoint
    - the builder subset only
    - full time blocks with a required task
    - user-set status plus auto-mark
    - repeating blocks
    - only today's occurrences auto-marked, with "End series here"
    - action + slot select + task-panel drag
    - Week + Agenda (+Day), no Month
    - all-day as local dates, end exclusive
  - **Derived and recorded in ADR 0012, not asked separately:**
    - events get their own `life_area_id` (pre-filled from the goal)
    - occurrences are expanded at query time, never stored, with a 366-day cap per query
    - timed occurrences keep local wall-clock time and the series' elapsed duration
    - "this and following" splits the series and carries over exceptions the new rule still generates
    - blocks last at most 24 hours, are timed only and have no title of their own
    - reopening or cancelling a task never changes blocks
    - `@fullcalendar/rrule` is not used
    - premium FullCalendar code must not be copied
- **Next chunk should know:**
  - 4.1 builds one-off events only; `rrule` arrives in 4.3.
  - The goal and life-area FKs need the hand-edited `SET NULL (column)` (see the 1.1 note).
  - 4.2 must confirm that `rrule-temporal` works with the `temporal-polyfill` module import (ADR 0008 forbids a global). If not, stop and ask.
  - FullCalendar v7 ships its plugins as subpaths of `@fullcalendar/react`, so don't install the v6 `@fullcalendar/core`/`timegrid` packages.
  - 4.7 changes the task service's `changeStatus` and task delete, so re-run the 2.2 tests.
- **Unverified:** none (docs only). `pnpm format:check` was run on the changed docs.
- **Follow-ups:**
  - The 5.0 gate should ask whether event and block occurrences can remind. Occurrences are expanded, not stored (ADR 0012 consequences).
  - Phase 10 export (10.1) must include events, blocks and both exceptions tables.
  - Events aren't draggable on the grid (only blocks are). This is listed for the checkpoint.

### 4.1: Calendar events: schema and service (2026-10-23)
- **Built:**
  - `src/lib/calendar-events.ts` (pure): length limits, `CALENDAR_EVENT_SOURCES`, `CALENDAR_RANGE_MAX_DAYS` (366), `CALENDAR_EVENT_EDITABLE_FIELDS`, the `CalendarEvent` type (a union discriminated by `allDay`, with the other shape's columns `null`), `calendarEventTiming(when)` (form times → stored columns).
  - Schema `src/server/db/schema/calendar-events.ts` + migration `0008_calendar_events.sql`: columns per the chunk, `unique (id, user_id)`, composite FKs `(goal_id, user_id)` and `(life_area_id, user_id)` hand-edited to `ON DELETE SET NULL ("goal_id")` / `("life_area_id")`, indexes `(user_id, start_at)`, `(user_id, start_date)`, `(user_id, goal_id)`, `(user_id, life_area_id)`, and CHECKs `calendar_events_shape_check`, `_end_check`, `_source_check`, `_title_length_check`, `_description_length_check`, `_location_length_check`.
  - `src/server/modules/calendar-events/`: `validation.ts` (`createCalendarEventSchema`, `updateCalendarEventSchema`, `calendarEventIdSchema`, `eventsBetweenSchema`), `service.ts` (`createCalendarEvent`, `getCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`, `eventsBetween`).
  - Audit events `calendar_event.created|updated` in `AUDIT_EVENTS`.
  - Tests: unit `src/lib/calendar-events.test.ts` (inclusive → exclusive all-day end, midnight crossing, New York DST gap/overlap) and `calendar-events/validation.test.ts` (19); integration `calendar-events.integration.test.ts` (20: each CHECK, goal and life-area deletes keep the event and `user_id`, user cascade, audit privacy, no-op edit, timed ↔ all-day switch in one event, delete removes only that event's audit rows, cross-user `NotFound` on get/update/delete/range, foreign goal/area field errors, range edges, midnight crossing seen from New York and Tokyo, the 23- and 25-hour New York days, all-day exclusivity in four zones, ordering).
- **Deviations:**
  1. **Two extra indexes**, `(user_id, goal_id)` and `(user_id, life_area_id)`, so the `SET NULL` on a goal or area delete doesn't scan the table (tasks has the same).
  2. **No `actions.ts`** ("no UI"; 4.4 adds them), as in 1.1 and 2.2.
- **Decisions:**
  1. **Form input is flat fields** (`allDay`, `startDate`, `startTime`, `endDate`, `endTime`, `tz`), like the task deadline. All-day `endDate` is **inclusive** in the input and stored + 1 day (ADR 0012); times and zone are ignored on all-day events. The parsed output groups them as `when`, which `calendarEventTiming` turns into columns. Timed times use `instantFromLocal` ("compatible"), and the end-after-start check compares instants, so a spring-gap start that lands on the end is refused (`endTime` error).
  2. **`eventsBetween(userId, { localStart, localEnd, tz })` takes whole local days with an exclusive `localEnd`** (what FullCalendar sends), at most 366 days. Timed: `start_at < end-of-range and end_at > start-of-range`, with both bounds from `startOfLocalDay` (so 23/25-hour days are right). All-day: `start_date < localEnd and end_date > localStart`. Touching an edge is not overlap. Sorted by start (an all-day event at its first day's local midnight in `tz`), all-day first on a tie, then ID.
  3. **`calendar_event.updated` lists changed field names** (title/description/location by name only) plus from/to for the shape, times, dates, zone and links that changed. A timed ↔ all-day switch therefore records all six timing columns in one event. `created` records every structured field, including `source`.
  4. A foreign or missing goal/area is caught from the composite FK and returned as a `goalId` / `lifeAreaId` field error, as in goals and tasks.
  5. `allDay` must be a real boolean; 4.4 converts its checkbox.
- **Next chunk should know:**
  - 4.2/4.3: recurrence adds `rrule` to this table; keep the hand-edited `SET NULL (column)` FKs if drizzle-kit regenerates them (comment in the schema and the SQL). `CalendarEvent` and `toCalendarEvent` will need the series fields.
  - 4.4: the inverse of `calendarEventTiming` (stored exclusive end → the form's inclusive end, instants → local date/time in the event's `tz`) is not written yet; `localDateTimeOf` and `addDays(endDate, -1)` cover it.
  - 4.5: `eventsBetween` is the range query; pass FullCalendar's visible range as local dates in the user's zone.
  - Deleting a goal or life area clears the event's link through the FK with no `calendar_event.updated` event (same as goals' area).
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 386 unit, 319 integration) passes. `pnpm db:generate` reports no schema changes after the hand edit. Dev DB migrated. No UI, so `pnpm build` and `pnpm test:e2e` were not run.
- **Follow-ups:**
  - Goal and life-area deletes write no event history for the events whose link they clear (consider when 4.4 shows event history, if it does).
  - Phase 10 export must include `calendar_events` (already noted in 4.0).

### 4.2: Recurrence engine (2026-10-23)
- **Built:**
  - Dependency `rrule-temporal` 2.2.8 (MIT, published 2026-10-01), imported only in `src/lib/recurrence.ts`.
  - `src/lib/recurrence.ts` (pure, client-safe):
    - Builder types and constants: `Recurrence` (a union by `frequency`), `MonthlyOn`, `RecurrenceEnd`, `RECURRENCE_FREQUENCIES`/`_WEEKDAYS`/`_ORDINALS`, `RECURRENCE_INTERVAL_MAX` (99), `RECURRENCE_COUNT_MAX` (999).
    - `recurrenceSchema` (builder values as the form sends them; strict objects, weekdays sorted Monday first) and `rruleSchema` (a stored rule string → builder values, with a specific message for each rejection).
    - `fromRrule(rule)` (throws `RangeError`) and `toRrule(values)` (canonical: FREQ, INTERVAL if not 1, BYDAY/BYMONTHDAY, COUNT/UNTIL).
    - `expandOccurrences(series, { localStart, localEnd, tz }, exceptions)`, overloaded for `TimedSeries` and `AllDaySeries`, with typed `TimedException<P>`/`AllDayException<P>` (`cancelled`, or `modified` with optional new times and a caller-defined `patch`).
    - `describeRecurrence(ruleOrValues, { start, locale })`.
  - `daysBetween(start, end)` in `src/lib/dates.ts`.
  - Tests: `src/lib/recurrence.test.ts` (79): weekly 09:00 across both New York DST changes, a spring-gap time, duration across DST, monthly on the 31st and the last Friday, yearly 29 Feb (leap years only, COUNT counts only those), COUNT and UNTIL boundaries (UNTIL's local date when it is already the next day in UTC), cancel/move/patch exceptions (moved in from outside the range, moved out, stale keys ignored), exact range edges for timed and all-day, a range in another zone, the 366-day cap, round trips both ways, 34 rejected rules, and the summaries. `dates.test.ts` covers `daysBetween`.
  - Docs: DATA_MODEL (`UNTIL` form, gap and COUNT rules), README "Dates and time zones".
- **Deviations:**
  1. **The range is one object, `{ localStart, localEnd, tz }`** (whole local days, end exclusive), rather than separate `rangeStart`/`rangeEnd`, so it means exactly what `eventsBetween` takes and the 366-day cap counts days. A timed range in instants would need slack for 23- and 25-hour days.
- **Decisions:**
  1. **No global Temporal needed.** The library bundles its own polyfill and reads `globalThis.Temporal ?? bundled`; it never writes the global (checked in its dist and at runtime). `recurrence.ts` passes it plain `{ timeZoneId, toString }` inputs and reads results with `toPlainDateTime()`, so it never imports `temporal-polyfill` itself.
  2. **Expansion is in floating time.** The library generates local dates and times as if in UTC, and each becomes an instant in the series' zone through `instantFromLocal`. A time skipped by spring-forward moves forward ("compatible", ADR 0008). The library's own zone mode follows RFC 5545 and would drop that occurrence.
  3. **`UNTIL` is stored as a local date** (`UNTIL=20261220`): the last day, inclusive, an occurrence may start on, in the series' zone. Every builder frequency has at most one occurrence a day, so this is exact. `UNTIL` with a time (`…T000000Z`) is rejected. This is RFC 5545-valid for floating rules only; an iCalendar export (10.1) must convert it.
  4. **The series start is always the first occurrence** (`includeDtstart`), and it counts toward `COUNT`, even when it doesn't match the rule's days. The first occurrence keeps the stored `startAt`, so a start in the second 01:30 of a fall-back night still matches its exception key.
  5. **Builder subset:** monthly needs exactly one of `BYMONTHDAY=1..31` or `BYDAY` with an ordinal of 1–4 or -1; weekly needs plain `BYDAY`; daily and yearly take no day parts; no `WKST`, so weeks start on Monday for `INTERVAL` > 1. Month days 29–31 skip shorter months and yearly 29 Feb repeats in leap years only (RFC behaviour); the summary says so.
  6. **Exceptions:** a modified exception without an end keeps the series' duration from its new start. Exceptions whose original start the rule doesn't generate are ignored, including ones moved into the range.
  7. Summaries are English, with dates in the user's locale ("Every 2 weeks on Mon and Thu, until 20 Dec 2026").
- **Next chunk should know:**
  - 4.3: pass the series row and its exception rows to `expandOccurrences`; put title/description/location/links in `patch`. For "this and following", `UNTIL` is the local date before the split occurrence. To check that an exception still matches a new rule, expand a one-day range around its original start. Validate a submitted rule with `rruleSchema` (or the builder values with `recurrenceSchema` and store `toRrule(...)`).
  - Expansion throws `RangeError` for a stored rule outside the subset, an empty or reversed range, more than 366 days, or a series whose end isn't after its start.
  - A timed series start is assumed to be minute precision (the form's `HH:MM`); later occurrences take the start's wall-clock minutes.
- **Unverified:** none. `pnpm verify` (format, lint, typecheck, 466 unit, 319 integration) passes. No UI, so `pnpm build` and `pnpm test:e2e` were not run.
- **Follow-ups:**
  - `rrule-temporal` bundles a full Temporal polyfill. When 4.4 imports `describeRecurrence` or the schemas in a client component, check the bundle; if it matters, move the builder, schemas and summary into a module that doesn't import the library.
  - Weekly repeats with `INTERVAL` > 1 count weeks from Monday, not the user's week start. Revisit at the checkpoint if it ever surprises.

### 4.3: Recurring events: series, exceptions and scopes (2026-10-23)
- **Built:**
  - Migration 0009: `calendar_events.rrule` (length CHECK) and the table `calendar_event_exceptions`:
    - `(event_id, user_id)` composite FK with cascade;
    - goal and life-area composite FKs, hand-edited to `SET NULL (column)` like 0008;
    - unique `(event_id, original_start_at)` and `(event_id, original_start_date)`;
    - CHECKs: kind, exactly one original start, override shape, end after start, text lengths;
    - `(user_id, goal_id)` and `(user_id, life_area_id)` indexes.
  - `src/lib/recurrence.ts`: `seriesStartDate`, `occurrenceStartOn` (the rule's start on a local date, or null), `countOccurrencesBefore`, `endRuleBefore`, `ruleWithCount`.
  - `src/lib/calendar-events.ts`: `CALENDAR_EVENT_SCOPES`, `CALENDAR_EVENT_EXCEPTION_KINDS`, `CALENDAR_EVENT_EXCEPTION_FIELDS`, `rrule` on `CalendarEvent` and in the editable fields, and `CalendarEventOccurrence` (`seriesId`, `originalStart`, `modified`).
  - Validation: `rrule` on create/update (blank means one-off; stored canonical; `UNTIL` on or after the start date), `editCalendarEventOccurrenceSchema` (scope "this" takes no rule) and `deleteCalendarEventOccurrenceSchema`. `originalStart` is an ISO instant for a timed series or a date for an all-day one.
  - `calendar-events/series.ts` (pure): occurrence keys, displayed values, `seriesAfterEdit` and `reconcileExceptions`.
  - Service:
    - `editCalendarEventOccurrence` and `deleteCalendarEventOccurrence` with the three scopes. Edits return `{ event, dropped }`; deletes return `{ dropped }`.
    - `eventsBetween` expands series.
    - `updateCalendarEvent` refuses a series (`ConflictError`) but lets a one-off gain a rule.
    - `deleteCalendarEvent` also removes the exceptions' audit events.
  - Audit:
    - `calendar_event.created`/`.updated` gain `rrule`, `scope`, `splitFromId`/`splitIntoId` and `droppedExceptions`.
    - New `calendar_event_exception.created`/`.updated`, recording structured fields only.
  - Tests:
    - integration `recurring-events.integration.test.ts` (24):
      - schema: a cross-user exception refused by the FK; override CHECKs;
      - expansion: DST, an occurrence moved before the series and the range, one-offs beside series;
      - "this": timed edit with audit privacy and a no-op; all-day edit and cancel; modified → cancelled; shape, zone and foreign goal refused;
      - "all": a timed change carrying moved, linked and cancelled exceptions; an all-day move by a day with a new rule; stopping the repeat; delete;
      - "following": a timed split; a split on the 1 November fall-back day re-keying exceptions; the remaining COUNT; an all-day split dropping one exception and keeping a moved one; from the first occurrence (edit and delete); delete from a later one;
      - lookups: an occurrence the rule doesn't generate, a cancelled one, and a one-off;
      - cross-user: every scope on a plain occurrence and on one with an exception.
    - unit: recurrence helpers (4) and the new schemas (7).
  - Docs: DATA_MODEL (snapshot exceptions, scopes, carry-over rules).
- **Deviations:**
  1. **Exceptions are full snapshots, not overrides.** A modified exception stores every value its occurrence shows, so a null description or goal means "none" and can't be confused with "as the series". The plan said "override fields".
  2. **No `actions.ts`** ("no UI"; 4.4 adds them), as in 4.1.
- **Decisions:**
  1. **An occurrence is addressed by `(series id, originalStart)`**, checked with `occurrenceStartOn`. One the rule doesn't generate, or one that is cancelled, is `NotFound`. A scoped call on a one-off is a `ConflictError`.
  2. **"This event"** keeps the series' shape and zone. Switching to all-day or to another zone is a field error that points at the wider scopes. Same values again are a no-op with no event.
  3. **"All events" applies only the fields that differ from what the occurrence showed**, so editing a renamed occurrence's time doesn't rename the series. Changed times move the series' first occurrence by the same number of days as the edited occurrence moved, at the new time of day, zone and length. The rule is the one sent: the UI must send the series' rule when it isn't changing it, since a missing rule means stop repeating.
  4. **"This and following"** ends the old rule with `UNTIL` the day before (dropping `COUNT`). It creates the new series as "all" would from a series starting at the split occurrence. If the rule is unchanged and ends after a count, the new series keeps the count left. From the first occurrence it is "all"; a delete from there deletes the series.
  5. **Carry-over:** exceptions move by the same number of days and are dropped when the new rule generates none that day. A modified exception's fields that equalled the old series take the new values, and generated times follow the new ones. Times it moved are kept, unless the shape changed (then dropped). Stopping the repeat folds the first occurrence's changes into the event and drops the rest. Exceptions the old rule had already stopped generating are removed without being reported.
  6. **Rewriting carried exceptions deletes and re-inserts them with the same ID** (and `created_at`), so shifting several by a day never collides on the unique original start. Their audit history survives because it is keyed by ID.
  7. **No `.deleted` exception event**, as for life areas: a dropped exception's events go with it, and the series' `updated` event counts the drops. The split events link the two series by ID.
  8. `eventsBetween` loads one-offs by overlap and series that start before the range end or have an exception starting before it. Occurrences carry the series ID as `id` too. They sort as before, then by original start.
- **Next chunk should know:**
  - 4.4: the scope dialog needs a **preview** of what would be dropped. The services return `dropped` only after writing. `reconcileExceptions` in `series.ts` is pure and does the same computation, so a read-only preview service can call it with the loaded series and exceptions.
  - 4.4: always send the current `rrule` with "following"/"all" (an absent one stops the repeat). A timed occurrence's `originalStart` is `toISOString()` of what `eventsBetween` returned.
  - 4.4: `updateCalendarEvent` is for one-offs only.
  - 4.5: `eventsBetween` returns `CalendarEventOccurrence[]`. Use `seriesId` + `originalStart` to address an occurrence, and `modified` to mark changed ones.
  - 4.7 (time blocks): `series.ts` and the scope functions are event-specific; reuse the approach, not the module.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint, typecheck, 477 unit tests and 343 integration tests. `pnpm db:generate` reports no schema changes after the hand edit, and the dev DB is migrated. No UI, so `pnpm build` and `pnpm test:e2e` were not run.
- **Follow-ups:**
  - Moving an occurrence with "all" doesn't adjust a weekly rule's days. If the moved day isn't in the rule, that occurrence disappears; 4.4's builder should update `BYDAY` when the user moves a weekly series.
  - Deleting a goal or life area clears exception links through the FK with no exception event (as for events).
  - Phase 10 export must include `calendar_event_exceptions`.

### 4.4: Event create/edit UI (2026-10-23)
- **Built:**
  - Route `src/app/(app)/plan/calendar/` (`page.tsx`, `error.tsx`): the next 30 days (`CALENDAR_LIST_DAYS`, today included) of events and occurrences, one region per local day in the user's zone, with "New event". Calendar is in `PLAN_SUB_ITEMS` between Upcoming and Inbox (sidebar, Plan sub-nav, and so phones).
  - `src/components/calendar/`: `event-dialog.tsx` (`EventFormDialog`: title, All day, start/end date and time, time zone, repeat builder, location, goal, life area, description; a scope step for occurrences), `repeat-builder.tsx`, `scope-chooser.tsx`, `choices.tsx` (`ChoiceGroup` fieldset, `Radio` with a described-by description), `delete-event-dialog.tsx` (confirm for a one-off; scope choice for an occurrence), `calendar-view.tsx`.
  - `src/lib/event-form.ts` (pure): `newEventValues` (next whole hour in the user's zone, 60 minutes), `eventFormValuesOf` (stored → form: own zone, inclusive all-day end), `withStart` (keeps the length; moves a weekly day and a monthly day/weekday with the start), `withAllDay`, `defaultRepeat` / `repeatFromRule` / `readRepeat` (builder strings → canonical rule or an error per field) / `repeatSummary`, `monthlyOptions`, `eventPayload`, `thisEventBlocker`, `timesInZone`, `timeRangeLabel`. `src/lib/calendar-list.ts`: `groupEventsByDay`, `calendarDayLabel`, `occurrenceKey`, `originalStartParam`.
  - `src/lib/recurrence-rules.ts`: the builder types, schemas, `fromRrule`/`toRrule` and `describeRecurrence`, moved out of `recurrence.ts` (which re-exports them), so the client never imports `rrule-temporal` (closes the 4.2 bundle follow-up; checked: no `RRuleTemporal` in `.next/static`).
  - Server: `calendar-events/actions.ts` (create, update, delete, edit/delete occurrence, and the two previews) and `queries.ts` (`listUpcomingEvents`, `listEventLinkOptions`). Service: `previewCalendarEventOccurrenceEdit` / `...Delete`, which run the real scoped change in a transaction and roll it back (`dryRun`); the scoped functions now have `...InTx` bodies.
  - Tests: unit `event-form.test.ts` (26) and `calendar-list.test.ts` (3); integration `calendar-ui.integration.test.ts` (10: create with field errors incl. the rule's, anonymous, a series refused as a one-off, inclusive all-day end, previews name the dropped exception and leave events/exceptions/audit rows unchanged and match the real save, validation passes through previews, delete previews, cross-user previews and delete `NOT_FOUND` with nothing changed, the list by Tokyo day incl. an ongoing all-day event and another user's events excluded, link options); e2e `tests/e2e/calendar.spec.ts` (3, browser in Tokyo: keyboard-only create with Enter/Space/arrows, the 60-minute default and kept length, builder field errors with focus on the first, summary, Escape returning focus; all-day inclusive end through a reload, goal → area, switch to timed in New York with the zone note; "this" edit, a new repeat blocking "this" and "all events" naming the dropped edited occurrence, delete "this and following"; axe on the page, dialog and both scope prompts). `shell.spec.ts`, `upcoming.spec.ts` and the nav unit test include Calendar.
- **Deviations:**
  1. **The scope prompt's preview is a dry run** (the real change in a rolled-back transaction) rather than a separate pure computation with `reconcileExceptions`, so it can't disagree with saving (split counts, folding, validation). It takes the same row lock briefly and writes nothing.
  2. **The time-zone picker is behind "Change time zone"** unless the event's zone differs from the user's; then it shows, with the times in the user's zone as its hint. List rows show times in the user's zone and the event's own times and zone in brackets.
  3. **Plan sub-nav tabs are narrower on phones** (no gap, `px-2`): with five tabs the row was 30 px wider than a 375 px screen and scrolled the page sideways.
- **Decisions:**
  1. **Scope step:** saving an occurrence first previews "following" and "all" (which also validates; errors go back to the form fields), then asks in the same dialog. "This event" is disabled, with the reason, when the change switches all-day/timed, the zone, or the repeat (any edit in the builder); the default is then "This and following". Each wider option lists the separately changed occurrences it drops, with date and "(edited)" or "(deleted)". Delete asks the same way, with previews loaded when the dialog opens.
  2. **The builder validates on the client** with `recurrenceSchema` (errors on Repeat every, On these days, Day of the month, Number of times, Last date, including "on or after the start date"), because the server only sees the finished `rrule` string; server `rrule` errors show under the builder. After a failed save focus moves to the first invalid field.
  3. **Moving the start keeps the length** (60 minutes when the end isn't after the start) and carries a weekly day or monthly day/weekday along (answers the 4.3 follow-up about "all" moves). Toggling all-day keeps the timed values for switching back; 23:00–00:00 becomes one day.
  4. **Goal pre-fills the area** only while the area is empty or still the previous goal's. Goals offered: active and paused, plus the event's own; areas: active plus the event's own.
  5. A one-off edit can make it repeat (`updateCalendarEvent` with a rule); a series edit can stop it repeating ("Does not repeat" with "following"/"all").
- **Next chunk should know:**
  - 4.5: replace `CalendarView`'s list with the FullCalendar wrapper; reuse `EventFormDialog` (takes `event`, `options`, `timeZones`, `userTimeZone`, `locale`, `trigger`) and `DeleteEventDialog`. A dialog for a clicked item needs a controlled `open` variant (today each has its own trigger). `listUpcomingEvents` / `CALENDAR_LIST_DAYS` can go once Agenda exists.
  - Locators: dialogs "New event" / "Edit event"; row buttons `Edit: <title>` / `Delete: <title>`; the builder's "Repeat" select (use `exact: true`), "Repeat every (weeks)", group "On these days" with checkboxes named by full weekday, radios "Never" / "After a number of times" / "On a date", spinbutton "Number of times" (`getByLabel` also matches the radio), "Last date"; scope radios "This event" (`exact: true`), "This and following events", "All events"; delete is an alertdialog "Delete “<title>”?".
  - The "this" action payload must omit `rrule` entirely (the schema is strict; `rrule: undefined` is refused).
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 506 unit, 353 integration), `pnpm build` and `pnpm test:e2e` (45 tests, first full run clean) pass. Phone width checked at 375 px by measuring the page (no sideways scroll). A manual pass with a screen reader is not done. No schema change, so no migration.
- **Follow-ups:**
  - A field's error stays until the next save, even after it is fixed; clearing it on change would be calmer.
  - Event history (goal/area deletes clearing links without an event, from 4.1/4.3) is still not shown anywhere.

### 4.5: FullCalendar foundation and Agenda view (2026-10-23)
- **Built:**
  - Dependency `@fullcalendar/react` 7.1.1 (MIT; peers React ^19 and `temporal-polyfill` ^1.0.1, both met). Only its `/list` and `/themes/classic` subpaths are imported; no v6 packages.
  - `src/components/calendar/full-calendar.tsx`: `Calendar`, the one wrapper. It takes an expanded feed (`CalendarFeedItem<Data>`: `id`, `title`, `allDay`, `start`/`end` as ISO instants or local dates with an exclusive end, `order`, optional `color`, `data`), the visible local-day range, the user's zone, `renderItem(data, { isStart, isEnd })`, `renderDayHeader(date)` and `empty`. `calendar-theme.css` sets every classic-theme palette variable from the app's tokens (replacing the theme's `palette.css`).
  - `src/lib/agenda.ts` (pure): `AGENDA_DAY_COUNTS` (7, 14, 30; default 30), `parseAgendaRange`, `agendaHref`, `agendaEnd`, `shiftAgendaRange`, `agendaRangeLabel`, `inAgendaRange`, `agendaEntries(events, tasks, range, zone)` → `AgendaEntry` rows, `agendaEntryKind`.
  - Queries: `listAgendaTasks(userId, { from, to, timeZone })` in `tasks/queries.ts` (open tasks planned in the range or with a timed deadline on its local days); `listAgenda(userId, range, timeZone)` in `calendar-events/queries.ts` (replaces 4.4's `listUpcomingEvents` and `CALENDAR_LIST_DAYS`).
  - `/plan/calendar` is now the Agenda: `src/components/calendar/agenda-view.tsx` (Previous/From today/Next links, "Days to show" 7/14/30, New event, the list, one controlled dialog for the clicked item). `calendar-view.tsx` (4.4's plain list) is removed, and `groupEventsByDay`/`listDayOf` with it.
  - `EventFormDialog` and `TaskFormDialog` have a controlled variant (`open`, `onOpenChange`, `onCloseAutoFocus`, no trigger); `DialogContent` passes `onCloseAutoFocus` through. The event dialog has a Delete button (`Delete: <title>`, the 4.4 `DeleteEventDialog`, with a new `onDeleted`).
  - Tests: unit `src/lib/agenda.test.ts` (10); integration `calendar-events/agenda.integration.test.ts` (5, Tokyo: merging incl. a New York deadline landing on the next Tokyo day, range edges at 00:00/23:59, closed/undated/all-day-deadline tasks left out, goal join, cross-user) and the 4.4 list tests ported to `listAgenda`; e2e `tests/e2e/agenda.spec.ts` (3, browser in Tokyo: empty state, day counts and Previous/Next in the URL through a reload, axe; a plan, a 00:30 deadline (the day before in UTC) and an event on their Tokyo days in time order, Tab/Enter/Escape with focus back on the item for a task and an event, axe with a dialog open; dark theme on the app's tokens with axe, and no sideways scroll at 375 px). `calendar.spec.ts` now opens events from their item and deletes from the dialog.
  - README "UI shell and components": the calendar wrapper.
- **Deviations:**
  1. **Delete moved into the event dialog.** Clicking an item opens its dialog (the chunk text); the 4.4 rows' separate Edit and Delete buttons are gone, so Delete sits in the dialog's button row.
  2. **Multi-day events show on each of their days** (FullCalendar's list behaviour, "From 22:00" / "Until 01:00" / "All day" on the days in between). 4.4's list showed them once.
- **Decisions:**
  1. **Range in the URL:** `?start=YYYY-MM-DD&days=7|14|30`, both optional; the plain path is 30 days from today (what the 4.4 page showed). Malformed values fall back. Previous/Next move by the range's own length.
  2. **Rows:** a plan is an all-day row on its date; a timed deadline is a row at its time on its local day in the user's zone; planned and due on the same day is one row at the deadline's time ("Planned task, due"). All-day deadlines are not on the Agenda (ADR 0012 and the chunk name timed deadlines only; Upcoming has them). Open tasks only. Events sort before tasks at the same start (`order`).
  3. **FullCalendar renders, our components own the content:** `eventInteractive` is off (with it, each row becomes `role="button"` inside a `role="list"`), and each row holds our own `<h3><button>` that opens the dialog, so one Tab stop per row and native Enter/Space. Day headings are our `<h2><time>`; FullCalendar's side label (level 1) is suppressed, since `listDayAltFormat: false` falls back to the default.
  4. **Client-only rendering** (`useSyncExternalStore`, a `LoadingState` on the server): FullCalendar's Intl range label differed between Node and Chromium and caused a hydration mismatch.
  5. **Focus return:** FullCalendar re-renders rows while a dialog is open, so the controlled dialogs return focus to the opening button by its position among `[data-agenda-item]` buttons (`onCloseAutoFocus`), not to the original node.
  6. **Version 7.1.1, not 7.1.3** (ADR 0012 named 7.1.3): the newest release at least two weeks old, as for earlier dependencies.
  7. Times and dates in rows use our own formatting (`formatTimeOfDay`, `timeRangeLabel`, `calendarDayLabel`) in the user's locale; FullCalendar's own strings (the outer list's and each day's `aria-label`) stay in its default English.
- **Next chunk should know:**
  - 4.6: add `/timegrid` to the same wrapper (a `view` prop already exists, with "agenda" only), reuse `CalendarFeedItem` and the theme file; the classic theme's grid classes pick up the token palette. The Agenda's toolbar and URL handling are in `agenda-view.tsx`; Week/Day navigation can follow `agendaHref`'s pattern. Check `eventInteractive` and roles again on the grid: rows there are not list items.
  - Locators: a day is `getByRole("listitem").filter({ has: locator('h2 time[datetime="YYYY-MM-DD"]') })`; an item is the button named by its title (`exact: true`) inside a day; the row is the inner `listitem` holding that button. Nav regions are "Move through the agenda" and "Days to show"; the empty heading is "Nothing in these days".
  - FullCalendar brings `temporal-polyfill` into the client bundle (its own import); `rrule-temporal` is still absent from `.next/static` (checked).
  - 4.8 adds time blocks to `agendaEntries` (a new `kind`) and to `listAgenda`.
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 515 unit, 358 integration), `pnpm build` and `pnpm test:e2e` (48 tests, first full run clean) pass; `agenda.spec.ts` and `calendar.spec.ts` passed 18 of 18 with `--repeat-each=3`. No schema change, so no migration. A manual pass with a screen reader is not done.
- **Follow-ups:**
  - FullCalendar's English `aria-label`s on the list and days: pass the user's locale (with its locale data) or a `buttonHint`-style option if a non-English locale ever matters.
  - Completed tasks are not on the Agenda, so a past range shows only events; consider showing closed tasks for past days if reviewing history wants it.
  - Earlier follow-ups still open: field errors that stay until the next save in the event dialog; event history for link clears.

### 4.6: Week and Day views (2026-10-24)
- **Built:**
  - `src/lib/calendar-views.ts` (pure): `CALENDAR_VIEWS` and labels, `parseCalendarView`, `GridRange` (`view`, anchor `date`, `start`/`end`), `gridRange` (week from the user's week start, or one day), `parseGridRange`, `gridHref`, `shiftGridDate`, `inGridRange`, `gridDays`, `gridRangeLabel`, `gridDayShortLabel`, `gridEntries` (events plus timed deadlines as `DEADLINE_MARKER_MINUTES` = 15-minute markers; no plans, no all-day deadlines), and the arrow-key rule `gridItemTarget` / `isGridKey`. `eventEntry` in `agenda.ts` is now exported for it.
  - `listCalendarGrid(userId, range, timeZone)` in `calendar-events/queries.ts` (`eventsBetween` + `listAgendaTasks`, filtered by `gridEntries`).
  - The `Calendar` wrapper takes `view: "agenda" | "week" | "day"` (`/timegrid` added; time grids get exactly the range's days via `visibleRange`), per-item `contrastColor` and `className`, `slotEventOverlap={false}`, a now indicator, "All day" row text, and a `dayLink` prop (FullCalendar's own nav links on Week's day headings).
  - `src/components/calendar/time-grid-view.tsx` (`TimeGridView`): Agenda | Week | Day switch, Previous/Today/Next in the URL, New event, the range label, a calm "Nothing this week/day" line or the keyboard hint, the grid, and one dialog per clicked item. Items are our own buttons (`data-calendar-item`, name = title) with a description (kind, day, time); arrow keys move between them. Below `md` Week `router.replace`s to Day for the same date.
  - Shared: `item-dialog.tsx` (`useItemDialog`, `ItemDialog`: the 4.5 focus-return-by-position logic) and `view-nav.tsx` (`ViewNav`, `pillClass`), now used by the Agenda too. `calendar-theme.css`: the dashed deadline marker and a focus ring for FullCalendar's nav links.
  - `/plan/calendar` page: `?view=week|day&date=`; the Agenda stays the plain path. The page is `max-w-5xl` for Week and Day.
  - Tests: unit `calendar-views.test.ts` (17: views, week starts 0/1/6, day, URLs round trip, moves across a month end, labels, Tokyo markers, plans/all-day/out-of-range deadlines left out, arrow-key targets incl. skipping an empty day and nearest-in-time); integration `calendar-grid.integration.test.ts` (4, Tokyo: a week's series occurrences, all-day event and deadlines incl. a New York deadline landing on the next Tokyo day, no plans; range edges at 00:00/23:59 and an event crossing in from the night before; Day holds one day; closed tasks; cross-user); e2e `tests/e2e/week-day.spec.ts` (3, browser in Tokyo: Monday default then Sunday after Settings, Previous/Next/Today in the URL through a reload, a day heading opens Day, axe on Week and Day; a 00:30 deadline marker, an all-day event in the all-day row, Dentist 09:00 and Standup 09:30 side by side in Week and Day, ArrowUp/Down/Left/Right, Enter/Escape with focus back for a task and an event, Tab order, axe with a dialog open; a phone gets Day (Week link hidden) in the dark theme with no sideways scroll and axe).
  - README "UI shell and components": the views, `dayLink` and the URLs.
- **Deviations:**
  1. **Day headings in Week use FullCalendar's nav links** (`navLinks` + `navLinkDayClick` → `router.push`), not our own `<Link>`: FullCalendar wraps a time grid's heading content in `aria-hidden` unless it is its nav link, and a link of ours inside failed axe (`aria-hidden-focus`). They are `role="link"` elements named by the full date ("Today · Saturday, October 24, 2026"), not `<a href>`.
  2. **The Agenda's toolbar changed:** the view switch is its first row (with New event), then its range moves and day counts as before.
  3. **Fixed an ambiguous locator in `milestones.spec.ts`** (not this chunk's area) after it failed CI three times in a row: after "← Goals", Next keeps the goal page mounted but hidden, so `getByText("0 of 1 milestone")` matched it as well as the Goals list. It now looks inside the list's "No area" region. Passed 3 of 3 locally with `CI=true`.
- **Decisions:**
  1. **URL:** `?view=week|day&date=YYYY-MM-DD`; `date` is the anchor (any day of the week), left out when it is today. Previous/Next move it by 7 or 1. Switching views carries the day: the Agenda starts on the grid's first day, Week holds it, Day shows it.
  2. **Range from `visibleRange`**, not `timeGridWeek` + `firstDay`, so the grid shows exactly the days the server loaded.
  3. **Deadline markers last 15 minutes** on the grid so they take part in the overlap layout; their label is "Due <time>". Planned tasks and all-day deadlines are not on the grids (chunk text).
  4. **Keyboard:** every item is a Tab stop (DOM order: day headings, the all-day row, then each day's timed items); Up/Down move through a day (all-day first, then by time), Left/Right go to the nearest-in-time item of the previous/next day that has items, Home/End to the first/last item.
  5. **Full 24-hour grid with `height="auto"`**, no inner scroller: no scroll trap, and no empty scrollable region for axe's `scrollable-region-focusable`. The page is long; the morning is below the fold.
  6. **Phone fallback by redirect**, so the URL always says what is shown; the Week link is hidden below `md`.
- **Next chunk should know:**
  - 4.7/4.8: blocks join `gridEntries` (a new `kind`) and `listCalendarGrid`; slot selection needs `/interaction` and `selectable` on the wrapper. Our item buttons sit inside FullCalendar's event elements, which are absolutely positioned.
  - Locators: a column date is `.soleup-calendar [role="columnheader"] time[datetime]`; an item is the button named by its title inside `[role="gridcell"][data-date="YYYY-MM-DD"]`; its wrapper (`xpath=..`) holds the time line. Nav regions: "Calendar view", "Move through the calendar". Day links are `getByRole("link", { name: /^Today · / })` etc.
  - FullCalendar's own strings (column `aria-label`s, slot hours) stay in its default English, as in 4.5.
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 532 unit, 362 integration), `pnpm build` and `pnpm test:e2e` (51 tests, first full run clean) pass; `week-day.spec.ts` passed 9 of 9 with `--repeat-each=3`. No schema change, so no migration. A manual pass with a screen reader is not done.
- **Follow-ups:**
  - Scroll the grid to the morning (or the first item) on load, if the long 24-hour page bothers while dogfooding.
  - The FullCalendar grid has `role="grid"` but its cells aren't arrow-navigable themselves (our handler moves between items only); revisit in 10.5's accessibility pass.
  - Earlier follow-ups still open: FullCalendar's English labels; closed tasks on past Agenda days; event dialog field errors that stay until the next save; event history for link clears.

### 4.7: Time blocks: schema and service (2026-10-26)
- **Built:**
  - `src/lib/time-blocks.ts` (pure): statuses, scopes, exception kinds, 1–1440 minute bounds, editable/exception field lists, the `TimeBlock` and `TimeBlockOccurrence` types, `timeBlockTiming(when)` (local start + duration → instants).
  - Schema `src/server/db/schema/time-blocks.ts` + migration `0010_time_blocks.sql` (generated, no hand edit: the cascades need no column list):
    - `time_blocks`: `(task_id, user_id)` composite FK with cascade, `unique (id, user_id)`, indexes `(user_id, start_at)` and `(user_id, task_id)`, CHECKs end, duration ≤ 1440 minutes, status, `series_status` (a series row stays `scheduled`), rrule length;
    - `time_block_exceptions`: `(block_id, user_id)` composite FK with cascade, unique `(block_id, original_start_at)`, CHECKs kind, override, end, duration, status.
  - `src/server/modules/time-blocks/`:
    - `validation.ts`: create, update, id, edit/delete occurrence, set status; `blocksBetweenSchema` is the events' range schema;
    - `series.ts` (pure): occurrence keys and values, `seriesAfterEdit`, `reconcileExceptions`, `autoMarkTargets`;
    - `service.ts`: `createTimeBlock`, `getTimeBlock`, `updateTimeBlock`, `deleteTimeBlock`, `editTimeBlockOccurrence`, `deleteTimeBlockOccurrence`, `setTimeBlockStatus`, `blocksBetween`, `autoMarkTimeBlocksInTx`, `deleteTimeBlocksForTaskInTx`.
  - Task service: `changeTaskStatus` to `completed` calls `autoMarkTimeBlocksInTx` in its transaction with the stored `completed_at`; `deleteTask` calls `deleteTimeBlocksForTaskInTx` first.
  - Audit events `time_block.created|updated|status_changed` and `time_block_exception.created|updated`. Status changes made by auto-mark carry `automatic: true`.
  - `rruleFieldSchema` is now exported from `calendar-events/validation.ts` for reuse.
  - Tests:
    - unit `time-blocks/validation.test.ts` (7, including a duration across the fall-back);
    - integration `time-blocks.integration.test.ts` (23): the 24-hour and other CHECKs; cross-user composite FKs; create, edit, status and delete with audit privacy; a one-off turning into a series keeping its status; marking never completes the task; DST; each scope, including carry-over with statuses, a weekly rule dropping an exception, the remaining COUNT, stopping a repeat folding the status, and delete following/all; lanes direct and via a milestone; range edges in Tokyo; an occurrence moved before the series; every operation cross-user;
    - integration `auto-mark.integration.test.ts` (11): started one-offs marked with an automatic event in the completion's transaction; future, skipped and done blocks untouched; a series begun weeks ago marks only today's occurrence; 00:05 in Tokyo (still the previous UTC day), with an occurrence running past midnight left alone; an exact-start edge; cancelled and moved occurrences; the zone fallback; cancel and reopen change nothing; another user's completion; task delete removing blocks, exceptions and all their events; cross-user delete; account cascade.
  - DATA_MODEL TimeBlockException: snapshot exceptions and the status rules.
- **Deviations:**
  1. **Exceptions are full snapshots** (start, end and status all set on `modified`), as 4.3 did for events, rather than optional overrides. The override CHECK enforces it.
  2. **`time_blocks_series_status_check`** (not in the chunk text): a series row's status stays `scheduled`, since occurrences keep theirs in exceptions. Making a one-off repeat moves its status to the first occurrence; stopping a repeat folds the first occurrence's status back.
  3. **The lane comes from one batched join** (`coalesce(task.goal_id, milestone.goal_id)` → `goals.life_area_id`), the same rule as `goalOf`, instead of calling `goalOf` per block.
  4. **No previews and no `actions.ts`** ("no UI"). Scoped changes return `dropped` after writing, as 4.3 did; 4.8 can add dry-run previews the way 4.4 did for events.
- **Decisions:**
  1. **Form input is a start and a length:** `startDate`, `startTime`, `durationMinutes` (1–1440, a real number) and `tz`. The end is that many elapsed minutes later, so the 24-hour CHECK can't surface from valid input. A block's task can't be changed.
  2. **"The user's local day"** uses `user_preferences.timezone`, or each series' own zone while none is confirmed. An occurrence counts when it started at or after that day's local midnight and at or before `completed_at`, by its actual (possibly moved) start. A one-off counts when it started at any time before.
  3. **An occurrence's status** lives in a modified exception written at its current times; setting it back to `scheduled` keeps the exception. `setTimeBlockStatus` without `originalStart` on a series, or with it on a one-off, is a `ConflictError`.
  4. **"End series here"** is `deleteTimeBlockOccurrence` with scope `following` (from the first occurrence it deletes the series).
  5. **Audit:** blocks have no text, so events record every structured field. Status changes have no scope. Auto-mark writes `time_block.status_changed` or `time_block_exception.created|updated` with `automatic: true`. No `.deleted` events (ADR 0005).
- **Next chunk should know:**
  - 4.8: `blocksBetween(userId, { localStart, localEnd, tz })` returns `TimeBlockOccurrence[]`: task title and status, `goalId`, `lifeAreaId`, `status`, and `seriesId` + `originalStart` to address an occurrence. Add a block `kind` to `agendaEntries`/`gridEntries`. For the scope prompt, a `dryRun` like `previewCalendarEventOccurrenceEdit` can wrap `editOccurrenceInTx`/`deleteOccurrenceInTx` (not exported yet).
  - Always send the current `rrule` with "following"/"all" (an absent one stops the repeat). The "this" payload must omit `rrule` (strict schema).
  - "Not marked" is UI-only: a past occurrence or one-off whose `status` is `scheduled`.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint, typecheck, 538 unit tests and 396 integration tests. `pnpm db:generate` reports no schema changes, and the dev DB is migrated. Two auto-mark rules were mutation-checked (forcing UTC, and dropping the "started today" bound), and each made a test fail. No UI, so `pnpm build` and `pnpm test:e2e` were not run.
- **Follow-ups:**
  - Phase 10 export must include `time_blocks` and `time_block_exceptions` (already noted in 4.0).
  - A one-off block is auto-marked whenever it started before `completed_at`, so a task completed long after its blocks marks all of them. This matches ADR 0012, but is worth watching at the checkpoint.

### 4.8: Time blocks UI (2026-10-27)
- **Built:**
  - Server: `time-blocks/actions.ts` (create, update, delete, edit/delete occurrence, set status, both previews, `getTaskBlocks`), `time-blocks/queries.ts` (`listTaskBlocks`: the task's blocks that haven't ended, today through 30 days, with the user's zone and locale), `previewTimeBlockOccurrenceEdit`/`...Delete` in the service, and an optional `taskId` filter on `blocksBetween`. The dry-run helper moved from the event service to `src/server/db/dry-run.ts`, shared by both. `listAgenda` and `listCalendarGrid` include blocks.
  - `src/lib/block-form.ts` (pure): form values (`newBlockValues`, `blockValuesAt`, `blockFormValuesOf`, `withBlockStartDate`), payloads (`blockTimesPayload`, `movedBlockTimes`, `movedSeriesRule`, `blockKey`), status (`blockStatusLabel` with "Not marked", `blockStatusActions`, `offersCompleteTask`, `offersEndSeries`, `thisBlockBlocker`). `AgendaEntry` has a `block` kind (`blockEntry`, order between events and tasks, "Time block"); `agendaEntries`/`gridEntries` take blocks.
  - UI in `src/components/calendar/`: `block-form.tsx` (`BlockTimeDialog` with a task picker when there is no task, `BlockTimesFields`, `BlockScopeStep`), `block-dialog.tsx` (when, status, repeat; Mark done/skipped, Back to scheduled; "Also complete the task"; "Task completed" + "End series here" with a confirmation; times form with the scope step; delete with scope and previews), `move-block-dialog.tsx` (scope prompt after a drag or resize of an occurrence; Cancel or close reverts), `task-panel.tsx` (desktop Week only, sticky, FullCalendar `Draggable`, a "Block time" button per row). The `Calendar` wrapper gained `onSelect`, `onItemChange`, `onDrop` and per-item `editable` (interaction subpath). `ScopeChooser` takes `noun="block"`. Blocks are tinted with a strong edge (`soleup-block`, done/skipped variants in `calendar-theme.css`).
  - "Block time" buttons on Plan rows, Today rows and the grid toolbar; the task dialog lists upcoming blocks (`src/components/tasks/task-blocks.tsx`) with its own "Block time".
  - Tests: unit `src/lib/block-form.test.ts` (16) plus block cases in `agenda.test.ts` and `calendar-views.test.ts`; integration `time-blocks/time-blocks-ui.integration.test.ts` (8: create with field errors, foreign task and anonymous; drag update of a one-off, series refused, cross-user; status on one-off and occurrence never completing the task; edit/delete previews naming the dropped exception, changing nothing and matching the save; cross-user previews; `listTaskBlocks` window, ended blocks and other tasks/users; the action; blocks on their Tokyo day in Agenda, Day and Week); e2e `tests/e2e/time-blocks.spec.ts` (4, Tokyo: form from the Plan row with the estimate as length → Week → complete the task → block Done, Agenda row; toolbar picker by keyboard, status actions, "Also complete the task", times changed in the dialog, task dialog list, delete; a daily series dragged with the scope prompt, completion marking today's occurrence only, "End series here"; slot select, drag to move, resize, drag from the panel; axe on the forms, dialogs and grid).
  - README (wrapper interactions), DATA_MODEL TimeBlock rules (defaults, zones on moves).
- **Deviations:**
  1. **A drop from the task panel creates the block at once** (a one-off at the drop time for the estimate, else 60 minutes) rather than opening the form; the row's "Block time" button is the form path.
  2. **The block form keeps the zone fixed:** new blocks are in the user's zone, existing ones keep theirs (shown under the times); there is no zone picker as on events.
  3. **Fixed a load-sensitive retry in `today.spec.ts`** (not this chunk's area): its loop re-clicked "Plan for today" after a click that had worked but whose refresh took over 1 s, and timed out on the moved button. It failed in two full runs once this chunk's tests ran beside it; it now clicks only while the button is there, with the same assertion.
- **Decisions:**
  1. **Keyboard paths:** select a slot → "Block time" on the toolbar (with the picker); drag from the panel → each row's "Block time"; move and resize → the block dialog's date, start and length.
  2. **Dragging a weekly or monthly occurrence** with "following"/"all" moves the rule's day (`movedSeriesRule`), so the moved occurrence stays in the series (the 4.3 follow-up, for blocks).
  3. **Status changes in the block dialog show at once** (local state) and keep the dialog open, so "Also complete the task" can follow "Mark done". "End series here" is `deleteTimeBlockOccurrence` with "following" and asks first.
  4. **The selection placeholder and drag mirrors render as plain text** in the wrapper; without that, `selectMirror` crashed the item renderer.
  5. The panel lists the Plan page's default list (open tasks, due order) and shows on Week from `lg` (1024 px); the page widens to `max-w-7xl` there.
- **Next chunk should know:**
  - 4.9: `blocksBetween` and `blockEntry` give today's blocks; `blockStatusLabel` gives "Not marked". `listTaskBlocks` is per task.
  - Locators: dialogs "Block time" (row buttons `Block time: <title>`, toolbar `Block time` exact), "Time block" (status in the `dd` after "Status"; group "Status"; "Delete block"), "Move block"/"Change block length"; the panel is the complementary region "Open tasks"; a block on the grid is `.soleup-block` holding the item button. Pointer tests must scroll the slot into view before `boundingBox` (mouse positions are viewport coordinates); see `slotPoint` and `drag` in `time-blocks.spec.ts`.
  - A Radix dialog with a form must not sit inside another form in the React tree: submit events bubble through portals (the task dialog renders its blocks section outside its form for this reason).
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 556 unit, 404 integration), `pnpm build` and `pnpm test:e2e` (55 tests) pass; `time-blocks.spec.ts` and `today.spec.ts` passed 18 of 18 with `--repeat-each=3`. No schema change, so no migration. Touch dragging on a phone and a screen-reader pass are not done.
- **Follow-ups:**
  - Pointer drag isn't offered for events (checkpoint question from 4.0).
  - Undo in the "Block moved" toast, if accidental drags turn out common.
  - Earlier follow-ups still open: FullCalendar's English labels; closed tasks on past Agenda days; event dialog field errors that stay until the next save; event history for link clears.

### 4.9: Integrations with Today and Home (2026-10-27)
- **Built:**
  - `src/lib/schedule.ts` (pure): `timelineEntries(events, blocks, tz)` (all-day first, then by start; ties events before blocks, then title), `nextCommitmentOf(events, blocks, now, tz)`, `NEXT_COMMITMENT_DAYS` (30), `timelineTimeLabel` ("All day", "09:00 – 10:00", both dates when it began on an earlier day) and `commitmentWhenLabel` ("Now, until 10:00", "Today · …", "Tomorrow · All day", the full date). Rows reuse `eventEntry`/`blockEntry` (`ScheduleEntry = AgendaEntry<never>`).
  - `src/lib/calendar-views.ts`: `calendarItemHref(entry, today, tz)` (Day view of the item's local start day, or today for one that began earlier, with `item=<entry id>`) and `parseCalendarItem`.
  - Queries: `listTodayTimeline(userId, clock, tz)` in `calendar-events/queries.ts` (`eventsBetween` + `blocksBetween` for today). Metric `nextCommitment(userId, clock, tz)` in `metrics/home.ts` → `Metric<ScheduleEntry | null>` (range today through today + 29; `hasData` = the user has any event or block).
  - UI: `src/components/tasks/today-timeline.tsx` (`TodayTimeline`, region "Schedule", an ordered list of rows with time, title link, and "Event" or "Time block · <status>") as the first section of `TodayView`; the server's `clock.now` is passed for "Not marked", so both renders agree. Home's first card, "Next commitment" (kind, title link, when), with "Nothing yet" for no data and "Nothing coming up in the next 30 days." for none in range.
  - `/plan/calendar?view=day&item=…`: `TimeGridView` takes `openItemId`, waits (up to 300 frames) for the item's button (`data-item-id`), scrolls it into view, opens its dialog through `useItemDialog` (so Escape returns focus to it), and removes `item` from the URL with `history.replaceState`, so a refresh doesn't reopen it.
  - Tests: unit `src/lib/schedule.test.ts` (6) and `calendarItemHref`/`parseCalendarItem` in `calendar-views.test.ts` (3); integration `calendar-events/today-timeline.integration.test.ts` (4, Tokyo at 00:01 while UTC is on the day before: order incl. a multi-day all-day event, a call from last night, a daily series and two blocks; edges at both midnights and all-day yesterday/tomorrow left out; a done block kept with its status; cross-user) and `nextCommitment` in `metrics/home.integration.test.ts` (6: no data with the exact range; ended and day-30 items → null with data, the last day counts; earliest start, under way first, all-day at local midnight, a multi-day trip; a New York event by its instant; done/skipped blocks and blocks of completed/cancelled tasks skipped; cross-user); e2e `tests/e2e/schedule.spec.ts` (1, Tokyo: empty card and timeline, a block by form and an event from 00:00 today, the timeline first with both rows in order and their times, axe on Today and Home, the block's link opens its dialog on Day, Home's card says "Now, until 11:59 PM" and its link opens "Edit event" on Day with `item` dropped from the URL, focus back on the item, and no dialog after a reload).
  - `home.spec.ts`, `today.spec.ts` and `journey.spec.ts` expect the new first headings ("Next commitment", "Schedule").
  - Docs: PRODUCT_SPEC §8 (the new card and the timeline), DATA_MODEL TimeBlock rules (Today and Home).
- **Deviations:**
  1. **"Links to the item in the calendar" opens its dialog** on the Day view of its day (a new `item` URL param), rather than only showing the day; the timeline's titles use the same link.
  2. **Fixed a load-sensitive wait in `time-blocks.spec.ts`** (4.8's spec, not this chunk's area): it opened "Block time" right after saving a 45-minute estimate and sometimes read the task before the refresh (60). It failed 1 of 3 alone and once in a full run; it now waits for the row to show "45 min" first, with the same assertion. Passed 16 of 16 with `--repeat-each=4`.
- **Decisions:**
  1. **Next commitment:** events and blocks from today through 30 days (the Agenda's default range); the first by start among those that haven't ended at the moment of reading, so one under way counts and wins. All-day events run from their first day's local midnight to their end date's, in the user's zone. Blocks marked done or skipped, or whose task is completed or cancelled, are not commitments (a future block of a completed task stays scheduled by ADR 0012, but nothing is left to do). Ties: all-day first, then events before blocks.
  2. **Timeline:** every event and block overlapping today, whatever the block's status (it's the day's record), all-day first; the section always shows, with "No events or time blocks today." when empty and no link there (nav words in link names collide with non-exact locators, see the 3.2 note). It sits above "Planned for today". Planned tasks and deadlines stay in their sections, not on the timeline.
  3. **Home order:** "Next commitment" is the first card ("what matters now").
- **Next chunk should know:**
  - Locators: Today's region "Schedule" (`exact: true`) with one `listitem` per row, title links named by the title; Home's region "Next commitment" with the title link. Day item buttons carry `data-item-id` (the `AgendaEntry` id).
  - 4.10/4.11 can reuse `calendarItemHref` for lane items, and `timelineEntries`' order for a lane.
  - The dev server still prints the `/home` instant-navigation warning (known).
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 565 unit, 414 integration), `pnpm build` and `pnpm test:e2e` (56 tests) pass; `schedule.spec.ts` and `home.spec.ts` passed 9 of 9 with `--repeat-each=3`. One full e2e run failed on the known `preferences.spec.ts` first-sign-in flake and the next full run passed 56 of 56. No schema change, so no migration. No screen-reader or phone pass.
- **Follow-ups:**
  - Checkpoint question: a multi-day all-day event (a trip) that is under way stays Home's next commitment for its whole span, ahead of the day's timed items. If that hides what's next while dogfooding, rank timed items first or show both.
  - The `preferences.spec.ts` first-sign-in flake is still open.
  - Earlier follow-ups still open: pointer drag for events; undo in the "Block moved" toast; FullCalendar's English labels; closed tasks on past Agenda days; event dialog field errors that stay until the next save; event history for link clears.

### 4.10: Resource columns by life area (2026-10-27)
- **Built:**
  - `src/lib/area-columns.ts` (pure): `entryAreaId` (an event's own area, a block's task's goal's area), `areaColumns(entries, areas, date, tz)` (active areas in the user's order, then an archived area holding an item, then "No area"; all-day and timed items per column), `layoutDay` (elapsed-time placement on the local day, clipped at both midnights, `MIN_LAYOUT_MINUTES` = 30, greedy lanes per run of overlaps with an even width split), `dayHourMarks` and `dayLengthHours` (23/24/25 hours).
  - `listDaySchedule(userId, date, tz)` in `calendar-events/queries.ts` (events + blocks for one local day, timeline order); `listTodayTimeline` now calls it.
  - `src/components/calendar/area-columns-view.tsx` (`AreaColumnsView`): our own component, no FullCalendar and none of its premium code. A focusable region ("By area, <date>") that scrolls sideways, a CSS grid with `subgrid` rows (heading, all-day, timed) so each column is one `role="group"` named by its `h2`, a hidden hour axis labelled in local time, items as our own buttons (`data-calendar-item`, `data-item-id`) with a description (kind, time, area, block status), events filled and blocks tinted with the 4.8 edge styles. Browser-only render, like the FullCalendar wrapper.
  - `calendar-views.ts`: an `areas` view ("By area") and `TimeGridType`; `GridRange` and `gridRange`/`parseGridRange` are generic over the view; `GridItemPosition.day` is any key that sorts in column order. `GridMoveNav` (Previous/Today/Next) moved into `view-nav.tsx` and is used by Week/Day too.
  - Page: `?view=areas&date=` loads `listDaySchedule` + `listEventLinkOptions` (its areas are the columns), `max-w-7xl` from `lg`.
  - Tests: unit `area-columns.test.ts` (14: area rules incl. archived and unknown areas, Tokyo placement, side by side and lane reuse, touching items, midnight clipping, the 30-minute minimum at the day's end, a 25-hour New York day, hour marks on both DST days) and `areas` cases in `calendar-views.test.ts`; integration `area-columns.integration.test.ts` (4, Tokyo: events by area and blocks by their goal's area with overlaps, Tokyo time not UTC, an archived area kept and marked and an empty one hidden, cross-user); e2e `tests/e2e/area-columns.spec.ts` (2, Tokyo: columns in order, Dentist/Physio side by side in Health and Standup level in Work, Tab into the items, ArrowUp/Down/Left/Right/Home/End, Enter/Escape with focus back, Next day/Today in the URL through a reload, switching to Day keeps the day, axe with and without a dialog; a phone in the dark theme with only "No area" and the hint, then four columns scrolling inside the view and not the page, arrow keys scrolling it, axe). `week-day.spec.ts` expects the new "By area" link.
  - Docs: README (By area), PRODUCT_SPEC §5 item 13.
- **Deviations:**
  1. **Archived areas:** an item whose area is archived gets that area's column, marked "(archived area)", only while it holds an item that day, rather than going under "No area" (which would say it has no area). Unknown areas fall back to "No area".
  2. **Events and time blocks only**, as the chunk text names; timed task deadlines stay on Week and Day.
  3. **No create or drag on this view:** "New event" and "Block time" stay on Week and Day; clicking an item opens its usual dialog.
- **Decisions:**
  1. **URL:** `?view=areas&date=YYYY-MM-DD` (date left out for today), one day at a time; the view tab is "By area" and shows at every width (columns scroll sideways inside the region on a phone).
  2. **Layout:** 48 px an hour; an item takes at least 30 minutes of room (24 px, the WCAG 2.2 target size axe checks), so two short items closer than that sit side by side. Items are sorted by start, longer first; each takes the first free lane, and a run of overlapping items shares its lane count (no widening into free space, unlike FullCalendar).
  3. **Keyboard:** the region is a Tab stop (sideways scrolling), then each item; `gridItemTarget` is reused with zero-padded column indexes as keys, so Up/Down stay in a column (all-day first), Left/Right go to the nearest-in-time item of the next column with items, Home/End to the first/last.
  4. **Full-height columns, page scroll** (as 4.6): no inner vertical scroller, so the column headings scroll away on a long day.
- **Next chunk should know:**
  - 4.11 can reuse `areaColumns`'s grouping (`entryAreaId`, archived/unknown rules) and `layoutDay`'s lanes with a horizontal axis, `listDaySchedule` (or `eventsBetween` + `blocksBetween` for a week), and `GridMoveNav` (it says "week" for a week range).
  - Locators: the region `getByRole("region", { name: /^By area, / })`, a column `getByRole("group", { name, exact: true })` inside it, item buttons by title; `data-column` (zero-padded) and `data-area-id` on columns.
  - On `/goals/areas`, wait for each new area to be listed before typing the next: Enter is ignored while the previous save is pending.
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 580 unit, 418 integration), `pnpm build` and `pnpm test:e2e` (58 tests) pass; `area-columns.spec.ts` passed 6 of 6 with `--repeat-each=3`. One full e2e run failed on the known `preferences.spec.ts` first-sign-in flake, and one on a race in this chunk's own `addAreas` helper (fixed above); the final full run passed 58 of 58. No schema change, so no migration. No screen-reader or real-phone pass.
- **Follow-ups:**
  - Sticky column headings and a time axis that stays in view on a long day would need an inner vertical scroller (rejected in 4.6); revisit if the headings scrolling away bothers.
  - Life area colours (`life_areas.color`) aren't shown anywhere yet; the column headings would be a natural place.
  - The `preferences.spec.ts` first-sign-in flake is still open.
  - Earlier follow-ups still open: pointer drag for events; undo in the "Block moved" toast; FullCalendar's English labels; closed tasks on past Agenda days; event dialog field errors that stay until the next save; event history for link clears.

### 4.11: Resource timeline by life area (2026-10-27)
- **Built:**
  - `src/lib/area-timeline.ts` (pure): `TIMELINE_SPANS` (`day`, `week`; default week) and labels, `TimelineRange` (`span`, anchor `date`, `start`/`end`, from `gridRange` so a week starts on the user's week start), `parseTimelineRange`, `timelineHref`, `shiftTimelineDate`, `timelineRangeLabel`, `timelineBounds`/`timelineLengthHours` (167/168/169 hours), `TIMELINE_SCALE` (4 rem an hour and 30 minutes' room on a day; 1 rem and 120 minutes on a week, so an item is at least 32 px wide), `timelineRows` (rows with placed items and a lane count), `timelineTicks` (each hour of a day; each day's midnight plus 06/12/18 local on a week), `timelineItemTimeLabel`, and `timelineItemTarget` (`gridItemTarget` with the axes swapped).
  - `src/lib/area-columns.ts`: the grouping is now `groupByArea` (shared by both views) and the placement `layoutSpan(entries, bounds, minimumMinutes, tz)` over any stretch of time, all-day items from local midnight to local midnight; `areaColumns` and `layoutDay` are thin wrappers with the same results. `startInstant`/`endInstant` in `schedule.ts` are exported for it.
  - `listSchedule(userId, { start, end }, tz)` in `calendar-events/queries.ts` (events + blocks for a range of local days, timeline order); `listDaySchedule` calls it.
  - `src/components/calendar/area-timeline-view.tsx` (`AreaTimelineView`): our own component, no FullCalendar and none of its premium code. View switch, a "Timeline span" Day | Week switch, Previous/Today/Next, the range label and hints, then a focusable region ("Timeline by area, <range>") that scrolls sideways: an `aria-hidden` time axis, then one `role="group"` row per area named by its `h2`, which is sticky on the left (the region's scroll padding matches it). Items are our own buttons (`data-calendar-item`, `data-item-id`, `title` for truncated names) with a description (kind, time with the day on a week, area, block status), drawn with `areaItemBoxClass` (exported from the By area view). Browser-only render, like By area.
  - `calendar-views.ts`: a `timeline` view ("Timeline"); `GridView` leaves it out (its span comes from the URL). `view-nav.tsx`: `MoveNav` (Previous/Today/Next from hrefs), with `GridMoveNav` built on it; `ViewNav` links the Timeline with a day span from Day and By area, a week otherwise.
  - Page: `?view=timeline&span=day&date=` loads `listSchedule` + `listEventLinkOptions`, `max-w-7xl` from `lg`.
  - Tests: unit `area-timeline.test.ts` (21: ranges, URLs round trip, moves and labels, 168/169 hours; rows by area incl. archived; Tokyo placement across the week; all-day midnight to midnight and clipped at the week start; a night shift crossing in; lanes and row growth; the week's larger minimum stacking items a day keeps apart; New York's fall-back week; ticks on a day, a week and the fall-back day; time labels; arrow-key targets) and a `timeline` case in `calendar-views.test.ts`; integration `area-timeline.integration.test.ts` (5, Tokyo week: events by area and blocks by their goal's area at their Tokyo hours with stacked overlaps and an all-day event; range edges (ending at the start excluded, crossing in clipped, starting at the end excluded); a day span; an archived area kept and marked and an empty one hidden; cross-user); e2e `tests/e2e/area-timeline.spec.ts` (2, Tokyo, next week's Tuesday so the weekday never matters: rows in order, Dentist at 32 hours and Errands at 85 at 16 px an hour, the all-day Conference over Tuesday, Dentist/Physio stacked and Standup level with Dentist in Work, the description, ArrowLeft/Right/Up/Down/Home/End, Enter/Escape with focus back, axe with and without a dialog, the Day span at 64 px an hour, Next/Previous day and a reload, By area ⇄ Timeline keeping the day, Today's plain URL; a phone in the dark theme with only "No area", sideways scrolling inside the region and not the page, the heading staying at the region's left edge, Tab scrolling the item beside it, axe). `week-day.spec.ts` expects the "Timeline" link.
  - Docs: README (Timeline), PRODUCT_SPEC §5 item 13.
- **Deviations:** none from the chunk text. As in 4.10, events and time blocks only (no deadlines), and no create or drag on this view (clicking opens the usual dialog).
- **Decisions:**
  1. **URL:** `?view=timeline&span=day|week&date=YYYY-MM-DD`; `span` is left out for a week (the default: the overview By area lacks), `date` for today. Previous/Next move by the span.
  2. **One axis for everything:** all-day events are bars from local midnight to local midnight rather than a separate row, so a multi-day trip reads as one bar; elapsed-time placement keeps DST weeks right.
  3. **Overlaps stack in lanes** (greedy first free lane, `layoutSpan`'s rule); a row is as tall as its most lanes (44 px each), an empty row one lane.
  4. **Keyboard:** the region is a Tab stop (sideways scrolling), then each item; Left/Right move along a row by time, Up/Down to the nearest-in-time item of the previous/next row with items, Home/End to the first/last.
  5. **Sticky row headings, no inner vertical scroller:** the page scrolls vertically as in 4.6/4.10; the time axis scrolls inside the region and the headings stay in view. Flex rows rather than a CSS grid, so the sticky headings' containing block is the whole row.
- **Next chunk should know:**
  - Locators: the region `getByRole("region", { name: /^Timeline by area, / })`, a row `getByRole("group", { name, exact: true })` inside it, item buttons by title; `[data-track]` is a row's time axis (for geometry), `data-row` (zero-padded) and `data-area-id` on rows; navs "Timeline span" and "Move through the calendar".
  - Phase 4 is complete. 5.0 is the reminders decision gate.
- **Unverified:** none for the automated checks. `pnpm verify` (format, lint, typecheck, 601 unit, 423 integration), `pnpm build` and `pnpm test:e2e` (60 tests, first full run clean) pass; `area-timeline.spec.ts` passed 6 of 6 with `--repeat-each=3`. The checks ran on the 4.10 branch tip, whose tree is identical to the merged `main` this branch starts from. No schema change, so no migration. No screen-reader or real-phone pass.
- **Follow-ups:**
  - The week opens at its first day's midnight; scrolling the axis to now (or the first item) on load would help on a narrow screen.
  - On a day, an hour is 64 px, so the visible "8:00 AM – 9:00 AM" line truncates on hour-long items (the description and the `title` hold it in full).
  - Earlier follow-ups still open: life area colours; the `preferences.spec.ts` first-sign-in flake; pointer drag for events; undo in the "Block moved" toast; FullCalendar's English labels; closed tasks on past Agenda days; event dialog field errors that stay until the next save; event history for link clears.

### 5.0: Decision gate: reminders (2026-10-27)
- **Built:** ADR 0013 (reminders: free-hosting sweep, what reminds, quiet hours and content) and its index row. Status lines on ADR 0003 (worker and pg-boss superseded for v1), 0007 and 0009 point to it. Phase 5 is rewritten as 5.0–5.7 (chunk text, progress log titles for 5.1 and 5.5, and the `AGENT_PROMPTS.md` prompts). Also updated: Standard commands (`pnpm reminders:sweep` replaces `pnpm worker`), the code layout (no `worker/` or `src/server/jobs/`), the Settled decisions hosting row, and the "Later" table. `ARCHITECTURE.md` §8 (with §2 and §3 pointers), `ROADMAP.md` 1F, `PRODUCT_SPEC.md` §12 and `DEPLOY.md` "Free-plan limits" are synced. No code.
- **Deviations:**
  1. **Two questions beyond the chunk's four:** hosting (ADR 0009 required this gate to revisit it) and whether repeating-event occurrences remind (the 4.0 follow-up).
  2. **The user chose to stay on free hosting**, against the recommendation (Render Starter running web and worker plus Render Postgres, about $13–14 a month). So 5.1 is now "Sweep route and external trigger" and 5.5 "Delivery in the sweep". There is no worker or pg-boss: pg-boss's polling would keep Neon Free awake and run out its roughly 100 CU-hour allowance, which suspends the whole database.
- **Decisions:**
  - **Asked and answered:**
    - stay free, with coarse reminders
    - a 15-minute sweep that is never late (sends what is due before the next sweep)
    - timed deadlines, timed events and a daily nudge (not blocks)
    - a rolling next-occurrence row for repeating events
    - defaults as recommended (tasks none, new events 10 min, one per item from a fixed list, nudge off)
    - quiet hours hold, bundle and skip stale
    - title and time by default, with a private mode that leaves the title out of the payload
  - **Derived and recorded in ADR 0013, not asked separately:**
    - cron-job.org as the trigger (GitHub Actions' schedule would exceed the private repo's free minutes and is often delayed)
    - a Bearer secret `REMINDER_SWEEP_SECRET`
    - claiming to `sending` under `SKIP LOCKED`, accepting one possible resend after a cut-off request
    - the offset list 0/10/30/60/1440 stored on the item
    - no `cancelled` status (removing a reminder deletes its scheduled row)
    - skip reasons `stale`/`disabled`/`no_device`
    - 3 attempts
    - push TTL until the target
    - snooze as a separate snoozed row
    - a last-sweep warning
    - `pnpm reminders:failed` instead of an admin query (there is no admin role)
- **Next chunk should know:**
  - 5.1 needs the user to create the secret on Render and the cron-job.org job, so give exact steps.
  - `/api/health` touches the database, so don't use it as a keep-awake ping (it would keep Neon awake).
  - The `render.yaml` comment about the Phase 5 worker is now wrong, and 5.1 updates it (left alone here: docs only, no code).
  - The prices and limits behind the hosting answer came from 2026 third-party summaries: Render Starter about $7, Render Postgres Basic about $6, Neon Free about 100 CU-hours with a 5-minute suspend. Check the Neon numbers on neon.com/pricing before relying on the about-62 CU-hour sweep budget.
  - `DATA_MODEL.md` has no Reminder or PushSubscription sections yet. 5.3 and 5.4 add them with their tables.
- **Unverified:** docs only, so no build or tests. Prettier passes on the changed files, but `docs/` is in `.prettierignore`, so that check covers nothing here. Line endings were checked (LF, no BOM). cron-job.org's free limits (interval, request timeout) and Render cold-start behaviour under a 15-minute call are unverified; 5.1 checks them in production.
- **Follow-ups:**
  - At the Phase 5 checkpoint, watch Neon's monthly compute. Above about 80 CU-hours, widen the interval or move to paid hosting (a new ADR).
  - Phase 10's export (10.1) must include reminder settings and delivery records, and account deletion (10.2) must remove reminders as well as subscriptions.

### 5.1: Sweep route and external trigger (2026-10-27)
- **Built:**
  - Env: `REMINDER_SWEEP_SECRET` is **required** in `src/server/env.ts` (at least 43 characters, which is 32 random bytes in unpadded base64), with a build-phase placeholder. Added to `.env.example` (empty, with the generate command), `vitest.config.mts` and `playwright.config.ts` (fixed test-only values), and `render.yaml` (`sync: false`).
  - `src/server/modules/reminders/sweep.ts`: `runSweep(now, log = logger)` → `{ counts: { claimed, sent, skipped, failed }, durationMs }`. It does nothing yet but log one line: `"Reminder sweep finished"` with `source: "reminders"`, `sweepStartedAt`, `counts` (all zero) and `durationMs`.
  - `src/server/modules/reminders/sweep-auth.ts`: `hasSweepSecret(headers, secret)`. Parses `Authorization: Bearer <token>` (scheme in any case), then compares SHA-256 digests with `timingSafeEqual`, so neither the content nor the length leaks through timing.
  - `src/app/api/reminders/sweep/route.ts`: `POST` only (GET gets Next's 405). A missing or wrong secret gets the same `401 {"error":"unauthorized"}` with `www-authenticate: Bearer` and a fixed warn line. The right secret gets `200` with the counts. A throw in `runSweep` gets `500 {"error":"internal"}` and an error line (serialized error, no message). Responses are `no-store`, the body is never read, and log lines carry the request ID. Not an (app) path, so the proxy only sets the request ID.
  - `scripts/reminders-sweep.mts` (`pnpm reminders:sweep`): plays cron-job.org locally. It POSTs to `BETTER_AUTH_URL` + the route with the secret from the shell or `.env.local`, prints the origin and counts, and never prints the secret. It exits 1 with a hint when the app isn't running, the secret is refused, or the sweep fails.
  - Tests: unit `sweep-auth.test.ts` (scheme case, missing or empty, prefix and longer values, other schemes, extra parts), `sweep.test.ts` (zero counts, one log line), and `env.test.ts` cases (missing or short secret not echoed, build placeholder). Integration `route.integration.test.ts`: `401` without the secret, the same `401` body for a wrong one with neither value logged, and `200` with counts plus one sweep line, a body ignored.
  - Docs: DEPLOY.md "Reminder sweep" (generating and setting the secret, rotating it, the cron-job.org job, the production check and cold starts, the free-plan budget for Render hours and Neon CU-hours), the env table and "Free-plan limits". README "Reminders" and local setup. `render.yaml` comments.
- **Deviations:**
  1. **`pnpm reminders:sweep` calls the running app's route over HTTP** rather than importing `runSweep` directly. Scripts run with Node's type stripping and can't resolve `@/` imports or `server-only`, and `runSweep` will import the db client, env and `web-push`. Importing directly would need a new dev dependency (for example `tsx` with `--conditions=react-server`). Over HTTP, the sweep still runs against the configured database, the local secret is exercised, and it matches what cron-job.org does. The cost: `pnpm dev` must be running, and the sweep's log line appears in the app's output, not the script's.
  2. **The secret is required, not optional:** a missing secret fails the boot check, like `BETTER_AUTH_SECRET`, instead of silently answering 401 forever.
- **Decisions:**
  - Counts are named after delivery outcomes: `claimed` (moved to `sending`), `sent`, `skipped`, `failed`. 5.5 fills them.
  - `runSweep` takes the logger so the route's line carries the request ID; outside a request it defaults to the app logger.
  - Refused calls log a fixed warn line with no header details, so a misconfigured cron job shows up in Render's logs.
  - cron-job.org's FAQ gives a fixed **30-second** timeout for every job. DEPLOY.md says to pick the longest allowed, and explains that a Render cold start (about a minute) then counts as a failed run.
- **Next chunk should know:**
  - 5.4/5.5: put the claiming and sending in `runSweep(now, log)` and keep the one-line log shape (start, counts, duration, never content). The route and its tests stay as they are; extend the counts type rather than renaming it.
  - The sweep secret must be set wherever the app boots: new test configs, CI env (the e2e server gets it from `playwright.config.ts`), Render. This machine's `.env.local` has a generated local-only value.
  - To see the sweep's log line locally without disturbing a running `pnpm dev`: `SOLEUP_NEXT_DIST_DIR=.next-e2e BETTER_AUTH_URL=http://localhost:3101 pnpm dev --port 3101`, then `BETTER_AUTH_URL=http://localhost:3101 pnpm reminders:sweep`. `.next-e2e` is already in `tsconfig.json`, so the tree stays clean.
- **Unverified:**
  - **Production check (user):** for an hour, a `Reminder sweep finished` line in Render's logs every 15 minutes. Not done at close-out: it needs the user to set `REMINDER_SWEEP_SECRET` on Render, this PR deployed, and the cron-job.org job created. Whether cold starts make calls fail (and so whether the keep-awake route from ADR 0013 is needed) is unknown until then.
  - `pnpm test:e2e` was not run locally (the only e2e-side change is one env value in `playwright.config.ts`); CI runs it.
  - Checks: `pnpm verify` (format, lint, typecheck, 607 unit, 426 integration) and `pnpm build` (route `ƒ /api/reminders/sweep`) pass. Locally against `pnpm dev`: `pnpm reminders:sweep` printed zero counts and the app logged one `Reminder sweep finished` line with a request ID; no secret → 401, wrong secret → 401 with the refusal line, GET → 405; the secret appears nowhere in the log.
- **Follow-ups:**
  - If the production check shows timeouts on cold starts, add the database-free keep-awake route and a second cron-job.org job every 10 minutes (ADR 0013), and update DEPLOY.md.
  - Confirm Render's and Neon's free usage after the first month (DEPLOY.md > Free-plan budget).

### 5.2: Service worker and PWA install (2026-10-27)
- **Built:**
  - `public/sw.js`: plain browser JavaScript (no imports, no logging) with `install` (`skipWaiting`), `activate` (`clients.claim`), `push` and `notificationclick` handlers only. No fetch handler and no cache.
    - Push payload contract (JSON): `{ title, body?, url?, tag? }`. `title`/`body` are shown exactly as sent, with the app icon. The worker never fetches anything. A push with no payload, unreadable JSON or a blank title shows "SoleUp" / "You have a reminder" (browsers require a notification for every push).
    - Click: closes the notification, then focuses a tab already on `url`, or focuses any open SoleUp tab and `navigate()`s it, or `openWindow(url)` when there is none (also when the tab can't be navigated). `url` must resolve to this origin; anything else (another origin, `//host`, `javascript:`, missing) opens `/home`.
  - `src/components/pwa/service-worker-registration.tsx`: `ServiceWorkerRegistration` in the root layout registers `/sw.js` (scope `/`, `updateViaCache: "none"`) on every page, signed out too. Failures are ignored.
  - `next.config.ts` `headers()`: `/sw.js` gets `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate` and `Content-Security-Policy: default-src 'self'; script-src 'self'`. The proxy already skips paths with a dot.
  - Install help: `src/components/pwa/install-help.tsx` (`InstallHelp`) in a new Settings section, "Install the app". It always shows steps for iPhone and iPad (Safari → Share → Add to Home Screen → open from the icon; notifications only from the Home Screen app, iOS/iPadOS 16.4+), Android and computers (Chrome/Edge install icon or menu, Safari File › Add to Dock). This device's heading gets "(this device)". An iPhone/iPad not running standalone gets a note that notifications need the Home Screen app, and the standalone app (`display-mode: standalone` or `navigator.standalone`) says "You're using the installed app on this device." Platform detection is `src/lib/install-platform.ts` (`installPlatform(ua, maxTouchPoints)`, iPadOS's Mac user agent with touch counts as iOS).
  - Tests: unit `src/components/pwa/service-worker.test.ts` (runs `sw.js` in a `node:vm` fake worker scope: only the four listeners, payload as given, fallbacks, wrong-type fields, no fetch, every click path and rejected URLs), `src/lib/install-platform.test.ts`. e2e `tests/e2e/pwa.spec.ts` (`/sw.js` headers, registration with scope `/` and the right script signed out, install help on desktop and with an iPhone user agent, the standalone note, axe) and `tests/e2e/push.spec.ts` (a real push delivered with CDP `ServiceWorker.deliverPushMessage` shows its title, body and `data.url`). `activeServiceWorker(page)` added to `tests/e2e/helpers.ts`.
  - Docs: README "UI shell and components" (service worker, install help), ARCHITECTURE §8 "On the device", the manifest comment.
- **Deviations:** none from the chunk text. "An install prompt or help text": help text only, with no custom install button. `beforeinstallprompt` is Chromium-only, could fire before hydration and be missed, and browsers already offer their own install UI. This matches Next's PWA guide.
- **Decisions:**
  - The worker lives in `public/` as a classic script (module service workers aren't safe across all target browsers yet), so its logic is tested by evaluating the file rather than importing it.
  - `skipWaiting` + `clients.claim`: safe with no cache, and it lets the click handler `navigate()` tabs opened before the worker installed.
  - Registered everywhere, including `pnpm dev` and the e2e dev server. With no fetch handler it can't change how pages load.
  Recorded in `sw.js` comments, the README and ARCHITECTURE §8.
- **Next chunk should know:**
  - 5.3: subscribe with `(await navigator.serviceWorker.ready).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. The registration already exists on every page. Notification permission must be requested from a user gesture (the subscribe button).
  - 5.5: build payloads to the contract above. Put the item's deep link in `url` as a path (for example the `?item=` Day link from 4.9), and use `tag` per reminder so a resend replaces rather than duplicates. Private mode and bundles: put "You have a reminder · <time>" in `title` and no item text anywhere.
  - e2e push tests need `test.use({ channel: "chromium" })` at the top level of their own file. The default headless shell denies notification permission, and a channel can't be set per describe group. CI's `playwright install --with-deps chromium` already installs the full build.
  - The Claude desktop app's browser pane can't register service workers ("unknown error occurred when fetching the script"). Use Chrome or Playwright for anything involving the worker.
- **Unverified:**
  - **Phone install (user):** needs HTTPS, so it can only be checked on Render after this PR deploys: on iPhone, Safari → Share → Add to Home Screen, then open from the icon (Settings should say it's the installed app); on Android, Chrome ⋮ → Install app. Not done at close-out.
  - Notification clicks are covered only by the unit tests' fake scope. CDP can't click a notification, so focus/navigate on a real browser is first exercised by 5.3's test notification.
  - Checks: `pnpm verify` (format, lint, typecheck, 629 unit, 426 integration), `pnpm build` and `pnpm test:e2e` (66) pass on the tree merged with 5.1. Production build (`pnpm start`): the worker registered with scope `/`, activated and controlled the page after a reload in Playwright's Chromium, with no console errors. **Desktop install confirmed by the user** (Chrome/Edge from localhost, opened in its own window).
- **Follow-ups:**
  - A monochrome `badge` icon for Android's status bar (Android shows a generic one without it). Worth adding with 5.5's real notifications.
  - Safe-area rendering on a real phone in standalone mode (0.10's open item) can be checked during the phone install.

### 5.3: Push subscriptions (2026-10-28)
- **Built:**
  - Dependency `web-push` 3.6.7 (MPL-2.0, Jan 2024, the newest; no build scripts) and dev `@types/web-push` 3.6.4, pinned.
  - Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` **required** in `src/server/env.ts`: unpadded base64url of 65/32 bytes, the public key must be derived from the private one (checked with `createECDH`), subject `mailto:` or `https://`. Messages never echo values. `next build` gets a freshly generated throwaway pair (no committed key). Empty placeholders in `.env.example` and `render.yaml`; `vitest.config.mts` and `playwright.config.ts` generate a new pair per run with `web-push`'s `generateVAPIDKeys()`.
  - Schema `src/server/db/schema/push-subscriptions.ts` + migration `0011_push_subscriptions.sql`: the chunk's columns plus `id`, `endpoint` unique, index on `user_id`, CHECKs (https endpoint ≤ 2048, key lengths 87/22, label 1–64, `failed_count >= 0`), cascade from users.
  - `src/lib/push.ts` (limits, `PUSH_SERVICE_HOSTS` + `isKnownPushService`, `PushPayload`, `PushDevice`, `TestNotificationResult`), `src/lib/device-label.ts` (`deviceLabel(ua, maxTouchPoints)` → "Chrome on Android"; iPadOS via `installPlatform`).
  - `src/server/modules/push/`: `validation.ts`, `send.ts` (`sendPush(target, payload, { ttlSeconds, urgency })`, VAPID per call, 10 s timeout, never throws or logs; outcome `ok` / `gone` (404/410) / `http_<status>|timeout|network|invalid`), `service.ts` (`subscribePush` upsert, `unsubscribePush`, `revokePushDevice`, `pushTargetsFor`, `recordPushOutcome`, `sendTestNotification`), `queries.ts` (`listPushDevices` with `endpointHash`), `actions.ts`.
  - UI: Settings "Notifications" section (`src/components/push/push-notifications.tsx`): this device's state (checking / unsupported / iPhone needs the Home Screen app / worker failed / blocked / on / off), Turn on (permission asked from the click) and Turn off, "Send test notification" (all devices, partial results explained), "Your devices" list with added/last-success dates formatted on the server, failure count, "(this device)", and Revoke with a confirmation.
  - Redaction: `auth`, `endpoint` and `subscription` added to `REDACTED_KEYS`.
  - Tests: unit `env.test.ts` (VAPID cases, placeholder pair), `device-label.test.ts`; integration `push.integration.test.ts` (16: label, refresh, move to another user, cap, endpoint and key validation, anonymous, cascade, list without secrets, unsubscribe/revoke cross-user, test send outcomes and row updates, payload and VAPID options, network/timeout codes, no secrets or text in logs); e2e `push-devices.spec.ts` (two tabs as two browsers, revoke, turn off, axe, blocked permission).
  - Docs: DATA_MODEL PushSubscription, ARCHITECTURE §8, README (Reminders, local setup), DEPLOY.md "Web Push keys" and the env table.
- **Deviations:**
  1. **Endpoints must be on a known push service** (FCM, Mozilla, `*.notify.windows.com`, `*.push.apple.com`), https on the default port. Not in the chunk text: the server POSTs to the endpoint, so any URL would be a server-side request forgery hole. A browser on another push service gets "This browser's push service isn't supported yet."
  2. **A 20-device cap per user** (soft: racing subscribes can pass it), to bound a test send's fan-out.
  3. **The test notification goes to every device**, not just one, which is what the done-when needed. `last_success_at`/`failed_count` are recorded and 404/410 deletes, the same rules 5.5 uses.
- **Decisions:**
  - VAPID variables are required, like the sweep secret, so a missing key fails boot rather than silently breaking push. The public key reaches the page as a prop from the server env, not `NEXT_PUBLIC_*`, so builds need no key.
  - A browser's endpoint is unique across users; subscribing one another user holds moves the row and resets its stats (whoever subscribed last gets the notifications).
  - Only a label derived from the user agent is stored, never the raw string. The client hashes its own endpoint to find "this device"; no endpoint or key is ever sent to the browser.
  - No audit events (a device registration, like a session; revoke hard-deletes). Recorded in `service.ts` and DATA_MODEL.
  - Turn on replaces a browser subscription made with a different server key (after a key rotation).
- **Next chunk should know:**
  - 5.5: send with `sendPush(target, payload, { ttlSeconds })` from `pushTargetsFor(userId)`, then `recordPushOutcome(userId, id, outcome, now)`. TTL is clamped to at least 60. Log `outcome.code` only. Integration tests mock `web-push`'s default export (see `push.integration.test.ts`).
  - e2e can't subscribe for real (Playwright's Chromium has no push service); reuse `fakePushManager` from `push-devices.spec.ts`.
  - A unit test that imports a route or the env must stub the three VAPID variables (see `test-sign-in.test.ts`).
  - This machine's `.env.local` has a local-only VAPID pair and subject `mailto:dev@soleup.invalid`.
- **Unverified:**
  - **Two-browser check confirmed by the user** on localhost (two desktop browsers): the test notification arrived in both, and after revoking one it no longer arrived there. A phone needs HTTPS, so it waits for the Render deploy, which needs the production VAPID variables set first (DEPLOY.md > Web Push keys).
  - Checks: `pnpm verify` (format, lint, typecheck, 647 unit, 442 integration), `pnpm build` and `pnpm test:e2e` (68) pass.
- **Follow-ups:**
  - Signing out doesn't unsubscribe the browser, so on a shared computer the next person could see the previous user's reminder titles until someone else subscribes it. Consider unsubscribing on sign-out before 5.5 sends real reminders.
  - `sw.js` has no `pushsubscriptionchange` handler, so a browser-rotated subscription is lost until the user turns notifications on again (the 410 cleanup removes the old row).

### 5.4: Reminders: schema and scheduling (2026-10-28)
- **Built:**
  - `src/lib/reminders.ts` (pure): `REMINDER_OFFSETS` (0/10/30/60/1440), kinds, statuses, skip reasons, `SWEEP_INTERVAL_MINUTES`, `NUDGE_TIME_PATTERN`, `fireAtFor`.
  - Migration `0012_reminders.sql` (generated, no hand edit; additive only):
    - `reminders` per the chunk, with composite task/event FKs (cascade);
    - CHECKs: kind ↔ link (and `occurrence_start` only on events), status, `skip_reason` set exactly while `skipped`, `sent_at` exactly while `sent`, `fire_at <= target_at`, attempts, error-code length;
    - the partial unique index `reminders_one_scheduled_key` on `coalesce(task_id, event_id, user_id)` where `status = 'scheduled' and not snoozed`; `(status, fire_at)`; `task_id`, `event_id`, `user_id`;
    - `tasks.reminder_offset_minutes` and `calendar_events.reminder_offset_minutes` (offset CHECKs); `user_preferences.daily_nudge_time` (`HH:MM` CHECK).
  - `src/server/modules/reminders/`:
    - `schedule.ts`: `syncTaskReminderInTx`, `syncEventReminderInTx`, `syncNudgeReminderInTx`. Each recomputes the item's one scheduled row and inserts, moves (resetting `attempts`) or deletes it, in the caller's transaction;
    - `next-occurrence.ts` (pure): `nextTimedOccurrence(series, exceptions, now, isDone)`, searching up to eight 366-day windows;
    - `claim.ts`: `claimDueReminders(now, horizonMinutes = 15, limit = 200)`;
    - `validation.ts`: `reminderOffsetSchema` (absent/blank → null), `reminderOffsetChangeSchema` (absent → unchanged), `nudgeTimeSchema`.
  - `runSweep` claims and reports `claimed`; sent/skipped/failed stay 0.
  - Tasks: `reminderOffsetMinutes` on create; new `setTaskReminder` (`setTaskReminderSchema`, event `task.reminder_changed`); status changes, `dueInTx` (reschedule and the Plan page's `scheduleTask`) and create sync the row.
  - Events: `reminderOffsetMinutes` in `CALENDAR_EVENT_EDITABLE_FIELDS`/`SeriesColumns` and `seriesAfterEdit`; create, one-off update, "following"/"all" edits (a split's new series inherits it) and `isNoOp`; every edit and delete scope syncs the series and a split's new series.
  - Preferences: `setDailyNudgeTime` (`setDailyNudgeTimeSchema`, audited in `user_preferences.updated`); `savePreferences` recomputes the nudge when the zone changes.
  - Audit: `task.reminder_changed`; `reminderOffsetMinutes` on `task.created`/`calendar_event.created` (only when set) and `calendar_event.updated`; `dailyNudgeTime` on `user_preferences.updated`.
  - Tests: integration `reminders.integration.test.ts` (28):
    - tasks: schedule, reschedule and offset moves, complete/cancel/reopen, date-only/no/passed deadlines, not repeating a delivered target, delete with the record;
    - one-off events: edits, offset audit, all-day/past/none, delete;
    - series: the rolling row, a cancelled and a moved next occurrence, a later occurrence moved in front, "all" times and offset, "this" refusing an offset, both sides of a split, delete scopes, rolling past a sent occurrence, a yearly 29 February;
    - nudge: next local time, off, waits for a zone, malformed time, a zone change moving only the nudge;
    - schema: offset CHECKs and field errors, link/skip CHECKs, the partial unique index beside snoozed and sent rows, cross-user FKs;
    - cross-user service calls;
    - claim: the 14/15/16-minute edges and order, four concurrent claims with no duplicates, a held row skipped rather than waited on, `runSweep`'s count.
    - Unit: `next-occurrence.test.ts` (DST, cancelled/done, ended) and `sweep.test.ts` (claim mocked).
  - Docs: DATA_MODEL (Reminder section; Task, CalendarEvent and UserPreference fields), README "Reminders".
- **Deviations:**
  1. **No UI or Server Actions** (5.6 builds the forms and Settings), and the `Task`/`CalendarEvent` read types don't carry the offset yet. Services and schemas accept it, so 5.6 adds it to the types, forms and actions.
  2. **A separate `setTaskReminder` operation and `task.reminder_changed` event** rather than widening `updateTask` (which replaces every editable field, so its callers would all have to send the offset).
  3. **An absent offset on an event edit keeps the current one**, while on create it means none. This differs from the "replace every field" convention, so the existing event dialog keeps working unchanged until 5.6.
  4. **A target already reminded about isn't scheduled again** (not in the chunk text): a sent, skipped, failed or claimed row for the same `target_at` and `occurrence_start` blocks a new one. Without it, any edit between a reminder firing and its target would resend it.
  5. **The claim has a batch limit** (200, oldest first); the rest waits for the next sweep.
  6. Two existing unit tests that assert the full parsed create input now include `reminderOffsetMinutes: null`.
- **Decisions:**
  - "Now" for scheduling is the app's clock (`new Date()`, overridable per call); the claim takes the sweep's `now`.
  - A target that hasn't passed gets a row even when its fire time has (for example, an event in 5 minutes with a 10-minute reminder); the next sweep claims it at once.
  - A one-off event's or task's row has no `occurrence_start`; a series row always has one.
  - The claim stamps `claimed_at` and doesn't touch `attempts`, so 5.5 decides what counts as an attempt.
  - No audit events for reminder rows (a delivery log); offset and nudge changes are audited on the item.
  Recorded in code comments and DATA_MODEL > Reminder.
- **Next chunk should know:**
  - 5.5: after a row is sent or skipped, call `syncEventReminderInTx(tx, userId, eventId, now)` or `syncNudgeReminderInTx(tx, userId, prefs, now)` in the same transaction. The delivered-target rule makes them roll to the next occurrence or day.
  - Reclaiming a stale `sending` row (10 minutes after `claimed_at`) means widening `claimDueReminders`'s where clause; the held-lock test shows the pattern for testing it.
  - Claimed rows carry `snoozed`, so a snoozed row can be told apart. The partial unique index ignores snoozed rows.
  - Integration tests pin the clock with `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime`, so the pool's timers keep working.
  - Migration 0012 was regenerated once during this chunk (a CHECK fix). A machine that applied the earlier draft would need it rolled back; only this machine's dev and test DBs did, and both were fixed.
- **Unverified:** nothing manual (no UI). `pnpm verify` passes: format, lint, typecheck, 651 unit and 470 integration tests. `pnpm db:generate` reports no drift, and the dev DB is migrated. The concurrency tests were mutation-checked: removing `FOR UPDATE SKIP LOCKED` fails both. `pnpm build` and `pnpm test:e2e` weren't run (no route or UI change; CI runs them).
- **Follow-ups:**
  - After a "following" split at an occurrence that was already reminded about, the new series reminds about it again: the delivered check is per event ID. Rare (an edit between a reminder and its start); consider carrying delivered rows across the split.
  - Phase 10 export (10.1) must include `reminders` and the offset/nudge settings (already noted in 5.0).

### 5.5: Delivery in the sweep (2026-10-28)
- **Built:**
  - Migration `0013_reminder_delivery.sql` (generated, additive): `user_preferences.reminders_enabled` (default true), `reminders_private` (default false), `quiet_hours_start`/`quiet_hours_end` (`HH:MM`, both or neither, different; CHECK); `reminders.held_until`.
  - `src/lib/quiet-hours.ts` (pure): `quietHoursOf`, `quietHoursEndAt(now, zone, hours)` (crosses midnight, DST via `instantFromLocal`). `REMINDER_MAX_ATTEMPTS = 3` in `src/lib/reminders.ts`.
  - `src/server/modules/reminders/`:
    - `claim.ts`: leaves rows with `held_until > now`; claims again rows left `sending` for `RECLAIM_AFTER_MINUTES` (10); returns `attempts` and `heldUntil`.
    - `payload.ts` (pure): `reminderPayload`, `bundlePayload`, `whenLabel` ("14:00", "tomorrow 14:00", "Wed 14:00"); links via `calendarItemHref` (`task:<id>:due`, `event:<occurrenceKey>`), Today for the nudge and bundles; tag `reminder-<rowId>`.
    - `record.ts`: `recordDelivery(row, outcome, prefs, now)`, one transaction per row guarded by `status = 'sending' and claimed_at = now`; rolls a series (`syncEventReminderInTx`) or the nudge (`syncNudgeReminderInTx`) after sent, skipped or failed.
    - `sweep.ts`: `runSweep` per user: stale → disabled → no_device → held; sends with `sendPush` to every device and `recordPushOutcome` per device; counts gained `held` and `retrying`.
  - `schedule.ts`'s move clears `held_until`.
  - Tests: integration `delivery.integration.test.ts` (22): send to every device with TTL, the 14/16-minute window, overlapping and repeated sweeps send once, reclaim after 10 minutes, 410 removes one device, 404 on the only device gives `no_device`, retries then `failed` with the code, logs without title/endpoint/key, stale task/event/nudge, disabled after stale, no device per user, quiet-hours hold/release/bundle/stale, a single held reminder, across midnight, outside quiet hours, event content and link, private mode, nudge with TTL and tomorrow's row, a series' next occurrence after send/skip/fail. Unit `quiet-hours.test.ts`, `payload.test.ts`, `sweep.test.ts` (log line). The 5.4 "runSweep counts" test and the route test take the new counts. Mutation-checked: dropping the `held_until` claim filter or the private-mode rule fails the matching tests.
  - Docs: DATA_MODEL (UserPreference fields; Reminder `held_until`, delivery and payload rules), README "Reminders".
- **Deviations:**
  1. **The delivery preferences are added here, not in 5.6.** The sweep can't skip `disabled`, hold for quiet hours or send private payloads without them. Only the columns: no service setters, actions or UI (5.6 adds those). ADR 0013 already lists them under "5.4 and 5.6".
  2. **`reminders.held_until`** (not in the chunk text) marks a held row, so the claim leaves it until quiet hours end ("isn't claimed until the end") and the releasing sweep knows which rows to bundle.
  3. **The push TTL runs until the row would go stale:** the target for tasks and events, but the end of the local day for the nudge (its target is its own fire time, so a TTL to it would be about a minute).
  4. **A failed row also rolls a series to its next occurrence** (the chunk says sent or skipped). Otherwise three failures would stop a repeating event reminding for good.
- **Decisions** (code comments and DATA_MODEL > Reminder):
  - "Inside quiet hours" means the sweep's time is inside them, in the user's current zone. A reminder firing in quiet hours that a sweep before them reaches is sent then (never late); one that an in-quiet sweep reaches is held to the end.
  - One device receiving it makes it `sent`. Otherwise the first non-404/410 error code counts an attempt; every device gone gives `no_device`. A hold isn't an attempt.
  - A held or retried row that can't go back to `scheduled` because an edit wrote a newer row during the sweep is skipped as `stale`.
  - A task row is stale if the task isn't open or its `due_at` no longer equals `target_at` (a claimed row doesn't move with an edit).
  - Users are processed one at a time. An unexpected error logs only the error's name, and that user's rows stay `sending` for the 10-minute reclaim. Payloads, titles, endpoints and keys are never logged.
  - No confirmed zone: times are formatted in UTC, quiet hours are off, and a nudge (which needs a zone) is stale.
- **Next chunk should know:**
  - 5.6: add setters for `remindersEnabled`, `remindersPrivate` and the quiet hours to the preferences service and actions (audited on `user_preferences.updated`). When quiet hours change or turn off, consider clearing `held_until` on the user's scheduled rows, or held rows wait for the old end.
  - 5.6 snooze: a snoozed row goes through the same path. Snoozed rows are outside the one-scheduled index, so a held or retried one always goes back to `scheduled`.
  - 5.7: `SweepCounts` has `held` and `retrying`; skipped isn't split by reason yet. Rows are sent one at a time per user (devices in parallel), so a large backlog makes a long request.
  - Tests mock `web-push`'s default `sendNotification` (see `delivery.integration.test.ts`); its `sweepAt` sets the faked clock to the sweep's time.
- **Unverified:** a real push to a device from the sweep (needs a subscribed browser and a due reminder; in production also the 5.1 cron-job.org job and the VAPID variables on Render). `pnpm verify` passes: format, lint, typecheck, 664 unit and 492 integration tests. `pnpm db:generate` reports no drift, and the dev DB is migrated. `pnpm build` and `pnpm test:e2e` weren't run locally (no route or UI change; CI runs them).
- **Follow-ups:**
  - The 5.3 follow-up matters more now: signing out doesn't unsubscribe the browser, so a shared computer keeps receiving the previous user's reminder titles.
  - Several reminders for one user in one sweep (outside quiet hours) go as separate notifications; bundling those isn't in the ADR.

### 5.6: Reminder UI and preferences (2026-10-29)
- **Built:**
  - Forms: `src/components/reminders/reminder-select.tsx` (`ReminderSelect`: none, at the time, 10/30 min, 1 hour, 1 day before, with the hint "Reminders may arrive up to 15 minutes early."). In the task edit dialog (`task-form.tsx`, with a note when the task has no timed deadline) and the event dialog (`event-dialog.tsx`: hidden while all-day; "Applies to every event in the series." on a series). `EventFormValues.reminder` (new events `"10"`, `NEW_EVENT_REMINDER`), `eventPayload` sends it (null for all-day), and `thisEventBlocker` refuses a changed reminder for "this event", whose save leaves the field out.
  - Read types: `Task.reminderOffsetMinutes` and `CalendarEvent.reminderOffsetMinutes` (occurrences carry the series'). `updateTaskSchema` takes `reminderOffsetMinutes` (absent keeps); `updateTask` applies it first through the shared `reminderInTx` (the `setTaskReminder` rules and its `task.reminder_changed` event) in the same transaction.
  - Status and snooze: `src/server/modules/reminders/status.ts` (`reminderStatusFor(userId, { kind, id }, now)` → next reminder, or how the last went: "Sent …", `skippedLabel` ("Skipped: quiet hours" for a held row that went stale, "reminders were off", "no device was set up", "too late"), "Couldn't be delivered"; plus `snoozeId` for a sent row whose target is ahead and not already snoozed), `snooze.ts` (`snoozeReminder`), `actions.ts` (`getReminderStatus`, `snoozeReminder`), and `src/components/reminders/reminder-status.tsx` (the dialogs' "Reminder" section with "Snooze 15 min" / "Snooze 1 hour").
  - Notification snooze: `PushPayload.reminderId` on task and event reminders (not the nudge or bundles); `public/sw.js` shows two actions, and choosing one POSTs `{ minutes }` to `POST /api/reminders/[id]/snooze` (`src/app/api/reminders/[id]/snooze/route.ts`: session, same `Origin` as `BETTER_AUTH_URL`, `400/401/403/404/409` with fixed codes, nothing logged but unexpected errors), opening the item's link if that fails.
  - Settings → Reminders (`reminder-settings-form.tsx`): send reminders, private mode, quiet hours (off, suggesting 22:00–07:00; `SUGGESTED_QUIET_HOURS`), the daily nudge time (with "Turn off the nudge" and a warning when it falls in quiet hours, `isInQuietHours`), and a note when no device is subscribed. One save: `saveReminderSettingsSchema` → `saveReminderSettings` (one `user_preferences.updated` event with the changed settings; nudge synced; changed quiet hours clear `held_until` on scheduled rows). The audit allowlist gained `remindersEnabled`, `remindersPrivate`, `quietHoursStart`, `quietHoursEnd`.
  - Tests: integration `reminder-ui.integration.test.ts` (18: settings defaults, save + audit + no-op, nudge, held rows released per user, **the off switch skipping task, event, nudge and snoozed reminders with nothing sent, then sending again once back on** (mutation-checked), snooze rows beside a series' rolling row and their delivery, 15/60 and replacement, going stale, refusals and cross-user, the dialog status, the task form's reminder, occurrences' offset) and `route.integration.test.ts` for the snooze route (9); unit `reminders.test.ts`, `preferences/validation.test.ts`, `quiet-hours`, `event-form`, `payload`, `service-worker` (snooze actions, request, fallbacks); e2e `reminders.spec.ts` (the task form from the keyboard, then turning reminders off in Settings and a real sweep → "Skipped: reminders were off"; new events pre-fill 10 and the series scope; quiet hours field errors with focus, the nudge warning, persistence, axe).
  - Docs: DATA_MODEL (UserPreference, Reminder snooze rules), README "Reminders", ARCHITECTURE §8 (the worker's snooze action).
- **Deviations:**
  1. **Snooze only for task and event reminders that went out** (`sent`, or `sending` while going out). The nudge's target is its own fire time, so `fire_at <= target_at` leaves no room to snooze it, and a reminder not yet sent has nothing to snooze.
  2. **A snooze fires at the target at the latest** (an hour's snooze 30 minutes before an event fires at its start), and an earlier snooze of the same target is replaced, so snoozing from two devices schedules it once.
  3. **The snooze route checks `Origin`** against the app's origin (not in the chunk text), so another site can't snooze with the user's cookie.
  4. **The dialog shows the last reminder however it ended** ("Sent …", "Couldn't be delivered" as well as skipped ones), since in-app snooze needs the sent one.
  5. **Two existing e2e tests** (`preferences.spec.ts`, `week-day.spec.ts`) now scope their "Save" and status locators to the "Time and region" section: Settings has a second form with its own Save and status.
- **Decisions:** the task form saves the reminder inside `updateTask`'s transaction rather than a second action (one save, one transaction, still its own `task.reminder_changed` event). Reminder settings are one form with one Save, like "Time and region". Turning reminders off leaves the schedule alone; the sweep skips what comes due as `disabled`. Recorded in code comments and DATA_MODEL.
- **Next chunk should know:**
  - A 15-minute snooze arrives at the next sweep, 0–15 minutes later, because the claim sends everything due before the following sweep (never late); an hour's snooze arrives 45–60 minutes later. This follows ADR 0013 but makes the short snooze coarse.
  - A snoozed task row goes stale when the deadline moves (the sweep compares `due_at`), but a snoozed event row only goes stale when its old target passes: moving the event doesn't move or drop it.
  - e2e can run a real sweep with `page.request.post("/api/reminders/sweep")` and the test secret from `playwright.config.ts` (see `reminders.spec.ts`). The `ReminderStatus` section is a region named "Reminder", so locate the form's select with `getByRole("combobox", { name: "Reminder" })`.
- **Unverified:** snoozing from a real notification on a device (needs a subscribed browser, a due reminder and a sweep; the worker's handler is covered by the unit tests' fake scope and the route by integration tests). Checks: `pnpm verify` (format, lint, typecheck, 683 unit, 519 integration), `pnpm build` and `pnpm test:e2e` (71) pass. No migration (the `snoozed` column came with 5.4).
- **Follow-ups:**
  - Drop or move snoozed event rows when the event is edited or deleted in scope (deleted events cascade already).
  - Consider a finer snooze (for example claiming snoozed rows only when `fire_at <= now + 5 min`), which would need an ADR 0013 change.
  - The 5.3/5.5 sign-out follow-up still stands: signing out doesn't unsubscribe the browser.

### 5.7: Reliability pass (2026-10-29)
- **Built:**
  - Tests: integration `src/server/modules/reminders/reliability.integration.test.ts` (31), driving sweeps every 15 minutes across the hours that matter:
    - New York DST days in 2027: deadlines on both transition days, a day-before reminder, a daily event and the nudge across each transition, an occurrence and a nudge at a skipped (02:30) and a repeated (01:30) time, once each
    - quiet hours on DST nights: 22:00–07:00 both ways, an end the gap skips, an end in the repeated hour
    - a time-zone change (New York → Tokyo): instants kept, times formatted in the new zone, a hold from the old zone released, quiet hours and the nudge in the new zone
    - `process.env.TZ = "UTC"` with users in `Pacific/Kiritimati` and `Pacific/Pago_Pago`: the nudge by local day, a missed nudge stale at local midnight, quiet hours, "tomorrow" labels
    - missed sweeps: a day and a half without sweeps (send what is still useful, skip the rest, a series and the nudge roll once), no in-sweep retry of a failed send
    - a sweep cut off between sending and recording (simulated by making `recordDelivery` throw): resent once the claim is 10 minutes old under the same tag, nothing recorded resent, stale if the target passed
    - the log line's counts with skips by reason, and the last-sweep record
    - Unit: `instantAtOrAfterLocal`, the quiet-hours gap/overlap cases, `isSweepOverdue`.
  - **Bugs the tests found, fixed:**
    1. **A quiet-hours end inside a spring-forward gap** resolved to the gap's length later (02:30 → 03:30 EDT), so held reminders waited 30 minutes past the end and could go stale. New `instantAtOrAfterLocal` in `src/lib/dates.ts` (the gap's end, via `getTimeZoneTransition`), used by `quietHoursEndAt`.
    2. **A time-zone change kept holds worked out in the old zone**: reminders held until 07:00 New York stayed held after moving to Tokyo, where it was the afternoon. `savePreferences` now clears `held_until` on a zone change, through `releaseHeldRemindersInTx`, shared with 5.6's quiet-hours change.
    3. **After missed sweeps, a row rolled to an imminent occurrence or nudge was left for a sweep that came too late** (stale, or late for the nudge). `runSweep` claims a second time with `exceptIds` (new `claimDueReminders` parameter), skipping rows the first pass handled so a failed send still waits for the next sweep, and not when the first claim filled its batch.
  - Visibility: `SweepCounts.skippedByReason` (`stale`/`disabled`/`no_device`) in the result, the route's response and the log line. Migration `0014_reminder_sweep_status.sql` (generated, additive): `reminder_sweep_status` (single row, `last_sweep_at`). `sweep-status.ts`: `recordSweepFinished` (at the end of `runSweep`, `greatest` so an overlapping earlier sweep doesn't move it back), `lastSweepAt`, `sweepHealth`. Settings → Reminders shows a note when reminders are on and no sweep has finished for over an hour (`SWEEP_OVERDUE_MINUTES`, `isSweepOverdue` in `src/lib/reminders.ts`), with the last time formatted on the server.
  - `scripts/reminders-failed.mts` (`pnpm reminders:failed`): reads `DATABASE_URL` with `pg`, prints failed reminders grouped by error code with counts in the last day / last week / older and the newest and oldest age. No titles, users, IDs or the URL; read-only. Checked against seeded rows in the test database.
  - Docs: DEPLOY.md (sweep counts, the Settings warning, "Failed reminders", "Watching Neon's compute (Phase 5 checkpoint)" with the console path and the 80 CU-hour threshold, checked against Neon's plans and usage docs), DATA_MODEL (catching up, DST rules, ReminderSweepStatus, zone change clears holds), README "Reminders", the Standard commands table.
- **Deviations:**
  1. **Three behaviour fixes** beyond tests, as listed above (the chunk text asks to fix what the tests expose).
  2. **The Settings warning shows only while reminders are on**; with them off nothing is expected to arrive.
- **Decisions:**
  - "1 day before" stays exactly 24 hours (ADR 0013 stores minutes), so across a DST change it fires an hour off the wall clock. Pinned by a test; see follow-ups.
  - In a fall-back overlap, quiet hours end at the first time the clock reads the end; the repeated hour after it isn't quiet. Pinned by tests and a comment in `quiet-hours.ts`.
  - The last-sweep record is app-wide, written after a sweep finishes (not when it starts), so a sweep that throws before the end doesn't count.
  - Recorded in code comments, DATA_MODEL > Reminder and DEPLOY.md.
- **Next chunk should know:**
  - Reuse `sweepEvery15(from, to)` and the `cutOff` mock of `./record` from `reliability.integration.test.ts` for time-driven sweep tests. A test can set `process.env.TZ` at runtime (Node applies it at once); restore it in `afterAll`.
  - `instantAtOrAfterLocal` is for the end of a local span; keep `instantFromLocal` for targets.
  - Locally, Settings shows the "reminders haven't been checked" note until a sweep runs (`pnpm reminders:sweep`). e2e tests that assert the Reminders section's text may see it.
  - Phase 5 checkpoint (user): rely on reminders for a week; note missed, late or duplicated notifications, `pnpm reminders:failed` with the production `DATABASE_URL`, and Neon's Compute figure on the first and last day (DEPLOY.md > Watching Neon's compute).
- **Unverified:** the warning and the per-reason counts in production (need the deploy and the cron job); Neon's console labels may differ slightly from its docs. Checks: `pnpm verify` (format, lint, typecheck, 688 unit, 550 integration) and `pnpm build` pass; `pnpm db:generate` reports no drift and the dev DB is migrated. The new tests failed before each fix (4 failures) and pass after; dropping the second claim's `exceptIds` fails the in-sweep retry test. `pnpm test:e2e` wasn't run locally (CI runs it).
- **Follow-ups:**
  - Consider making "1 day before" the same wall-clock time the day before (needs the item's zone in `fireAtFor` and an ADR 0013 change).
  - The stopped-sweeps note is app-wide; before inviting others (Phase 11), decide whether ordinary users should see it or only an operator alert.
  - A backlog over the 200-row claim batch skips the catch-up pass, so rows rolled in that sweep wait for the next one (may arrive stale). Only after long outages with many users.
  - The 5.3/5.5/5.6 sign-out follow-up still stands: signing out doesn't unsubscribe the browser.

### 6.0: Decision gate: habits (2026-10-29)
- **Built:**
  - ADR 0014 (habits: cadences, logs, quantities and consistency, with the exact denominator definitions) and its index row.
  - Chunks 6.0–6.6 rewritten to match. The 6.1 title is now "Habits: schema and service" (Progress log and `AGENT_PROMPTS.md`).
  - `DATA_MODEL.md`: Habit and HabitLog rewritten, HabitSchedule and HabitPause added, plus §4, §5 and §7.
  - `PRODUCT_SPEC.md` §12 (habits settled), `ROADMAP.md` 1D, and the `AGENT_PROMPTS.md` prompts for 6.1–6.5.
  - No code.
- **Deviations:**
  1. **Two questions beyond the gate's five:**
     - how quantity habits count (asked once the user chose them)
     - what a cadence or target edit does to past numbers (it decides 6.1's schema)
  2. **Full quantity habits, against the recommendation to defer:** `measure`, `unit`, per-day `target` and log `value`, with partial credit.
  3. **The "Missed" label, against the recommendation of "Not logged":** shown in neutral styling, and still never stored.
  4. **A new `habit_schedules` table** holds the cadence and target, so `habits` has no `cadence_type`/`cadence_config` (the old 6.1 text had them on `habits`).
  5. **Log writes moved from 6.1 to 6.4,** so 6.1 stays one chunk and 6.4 owns the log events. The Track destination moved from 6.5 to 6.3, matching its existing agent prompt.
- **Decisions:**
  - **Asked and answered:**
    - three cadences (`daily`, `weekly_days`, `times_per_week` N 1–6)
    - `completed | skipped` with a derived "Missed"
    - full quantity habits with partial credit `min(value ÷ target, 1)`
    - the denominators as recommended
    - skips excluded
    - versioned schedules effective from the current week start
  - **The denominators the user accepted:**
    - whole user-week ranges
    - today counts only once logged
    - `times_per_week` partial weeks pro-rated (round, halves up) and completions capped per week
    - the current week can't lower the figure
    - `weekly_days` off-day completions are "extra", not counted
  - **Derived and recorded in ADR 0014, not asked separately:**
    - weekdays numbered 0 = Sunday … 6, like `week_start`; all seven weekdays (or N = 7) is `daily`
    - measure and unit fixed at creation
    - the "schedule for a week" rule (it survives a week-start change and earlier start dates)
    - exclusive pause ends; pausing starts tomorrow if today is logged; archive opens a pause; restore → `active`
    - no backdated pauses (skip past days instead)
    - logs only on active days up to today; logs on days that later become inactive are kept but not counted
    - each skip lowers a `times_per_week` week's target by one
    - this week shown as progress ("1 of 3 so far"), not a figure
    - quantity totals cut to one decimal
    - "Nothing expected in this range" at 0
    - no percentages, totals or streaks
    - log audit events on the habit entity, so undo keeps the history; no title, unit, note, value or target numbers in events
    - goal delete → `SET NULL (goal_id)` with `habit.updated`
    - habits don't remind
- **Next chunk should know:**
  - 6.1 needs the hand-edited `SET NULL (goal_id)` (see the 1.1 note), the partial unique index for one open pause, and numeric columns for `target` and `value` (Drizzle returns `numeric` as a string, so convert at the boundary).
  - The `times_per_week` rounding is `floor((2·N·a + 7) / 14)` in integers, so there is no floating point.
  - `weekly_days` uses `dayOfWeek` from `src/lib/dates.ts` (0 = Sunday).
  - Today, Track, Home and 7.1 must call the 6.2 engine, never recount.
- **Unverified:** none (docs only). Line endings checked (LF). `docs/` is in `.prettierignore`, so `format:check` covers nothing here.
- **Follow-ups:**
  - Backdated pauses ("I was ill last week") if marking skips day by day proves tedious while dogfooding.
  - A weekly-total quantity target ("150 min a week") if wanted. It would be a new way to count (ADR 0014 alternatives).
  - Showing a goal's linked habits on the goal page isn't planned in any chunk.
  - Phase 10: export (10.1) must include habits, schedules, pauses and logs.

### 6.1: Habits: schema and service (2026-10-29)
- **Built:**
  - `src/lib/habits/habit.ts` (pure): statuses, measures, cadence types, log statuses, length limits (title 200, description 2000, unit 30, note 2000), amount bounds (`numeric(7, 2)`, above 0), `HABIT_EDITABLE_FIELDS`, `HABIT_STATUS_ACTIONS` + `habitStatusActionOutcome`, `pauseStartDate`, `closePause`, the `Habit` type.
  - `src/lib/habits/cadence.ts` (pure, Zod): `CADENCE_CONFIG_SCHEMAS` per type (`{}`, `{ days }` 1–6 distinct weekdays 0–6 stored ascending, `{ timesPerWeek }` 1–6), `cadenceSchema`, `anyCadenceConfigSchema` (audit), `parseCadence(row)` for jsonb read back, the `HabitCadence`/`HabitSchedule` types, and `scheduleForWeek(schedules, weekLastDay)`.
  - Schema `src/server/db/schema/habits.ts` + migration `0015_habits.sql`: `habits`, `habit_schedules`, `habit_pauses`, `habit_logs` per the chunk. Composite FKs `(habit_id, user_id) → habits(id, user_id)` with cascade; `habits_goal_id_user_id_fk` **hand-edited** to `ON DELETE SET NULL ("goal_id")`. `unique (habit_id, effective_from)`, `unique (habit_id, local_date)`, `habit_pauses_one_open_key` (partial unique on `habit_id` where `end_date is null`), indexes `habits (user_id, status)`, `(goal_id, user_id)`, `habit_pauses (habit_id, start_date)`, `habit_logs (user_id, local_date)`. CHECKs: status, measure, unit exactly for quantity, end ≥ start, lengths; cadence type; cadence config keys per type; target > 0; pause end > start; log status, skip has no value, value > 0, note length.
  - `src/server/modules/habits/`: `validation.ts` (`createHabitSchema`, `updateHabitSchema`, `changeHabitScheduleSchema`, `habitIdSchema`), `service.ts` (`createHabit`, `updateHabit`, `changeHabitSchedule`, `pauseHabit`, `resumeHabit`, `archiveHabit`, `restoreHabit`, `deleteHabit`, `detachHabitsFromGoalInTx`, `toHabit`, `toHabitSchedule`).
  - Audit events `habit.created|updated|status_changed|schedule_changed`. `deleteGoal` now calls `detachHabitsFromGoalInTx` (goal → tasks → habits lock order).
  - Tests: unit `src/lib/habits/habit.test.ts` (every action × status, pause start/close, `scheduleForWeek`, `parseCadence`), `habits/validation.test.ts` (invalid configs per type, quantity/check fields, amounts incl. `0.1 + 0.2`, date pair, unknown keys); integration `habits/habits.integration.test.ts` (31: every CHECK and unique index incl. a duplicate log, a second open pause and a duplicate schedule week, numeric overflow, cross-user composite FKs, goal `SET NULL` keeping `user_id`, account cascade, create/edit/schedule/status rules, same-day pause and resume, pause from tomorrow when logged, the user's zone, archive/restore pauses, a second schedule edit in one week replacing the first, delete removing children and events, goal delete events, cross-user NotFound, audit privacy).
- **Deviations:**
  1. **`scheduleForWeek` is in 6.1**, not 6.2: the schedule change needs "the schedule in effect this week" to compare and to record `from`. It takes the week's last day, not a week object. 6.2 should reuse it rather than write another.
  2. **A schedule change also replaces rows after the current week.** Otherwise a habit whose `start_date` is in a later week (its first row is there), or weeks regrouped by a week-start change, would keep outranking the edit. The ADR's rules still hold: past weeks keep theirs, and a habit always has a row.
  3. **No `actions.ts` or `queries.ts`** ("no UI"), as in 1.1 and 2.2. 6.3 adds them.
- **Decisions:**
  1. **Validation output** is `{ ...fields, cadence: { cadenceType, cadenceConfig }, target }`; the form sends flat `cadenceType`, `cadenceConfig` (optional for `daily`) and `target`. Config issues come back under `cadenceConfig.days` / `cadenceConfig.timesPerWeek`. Seven days or seven times is refused with "Every day is the daily cadence." (the picker should turn it into `daily`).
  2. **Amounts** are validated as text (`^\d{1,5}(\.\d{1,2})?$`, above 0), stored as `numeric(7, 2)` strings (`toFixed(2)`), and returned as numbers. A target that doesn't fit the measure on a schedule change is a `target` field error from the service.
  3. **Status actions:** pause from active; resume from paused; archive from active or paused; restore from archived. The status already reached is a no-op with no event; anything else (pause/resume an archived habit, restore a paused one) is a `ConflictError`. "Today" is the user's zone (UTC until confirmed), with `now` injectable.
  4. **A new pause never starts before the latest closed pause's end** (`pauseStartDate`'s `notBefore`), so a zone moved back a day can't make pauses overlap.
  5. **`habit.schedule_changed`** records `effectiveFrom`, `fields` (`cadenceType`/`cadenceConfig`/`target` by name), and cadence type and config from/to. `habit.created` records status, measure, dates, goal, the first `effectiveFrom` and the cadence. No title, description, unit or amount anywhere (tested).
  6. **The config CHECK** holds only keys to type (`coalesce(..., false)`, so a missing key can't pass as NULL); Zod checks the values.
- **Next chunk should know:**
  - 6.2: read rows with `toHabitSchedule` (parses jsonb, converts `target`), and reuse `scheduleForWeek`. Pauses are `[start_date, end_date)`.
  - 6.3: wire the service through `authedAction`; field errors come back on `title`, `startDate`, `endDate`, `goalId`, `unit`, `target`, `cadenceType`, `cadenceConfig.*`.
  - 6.4: `habit_logs` is in place; the log events still need adding to `AUDIT_EVENTS`. Value-vs-measure is the service's rule (the CHECKs only cover skip/value and value > 0). `pauseHabit` already reads today's log.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint, typecheck, 727 unit tests and 581 integration tests. `pnpm db:generate` reports no schema changes; dev DB migrated. No UI, so `pnpm build` and `pnpm test:e2e` were not run.
- **Follow-ups:**
  - Phase 10 export (10.1) must include habits, schedules, pauses and logs (already noted in 6.0).
  - The goal delete confirmation doesn't say linked habits lose their goal (6.3 or later, when habits have UI).

### 6.2: Cadence engine (2026-10-29)
- **Built:**
  - `src/lib/habits/consistency.ts` (pure, client-safe), per ADR 0014 "Consistency":
    - `isActiveDay(habit, pauses, date)`, `weekTarget(N, activeDays)` (`floor((2·N·a + 7) / 14)`, refuses a > 7 or non-integers)
    - `habitDays(input)` → `{ date, state, credit, log }` per day; `HABIT_DAY_STATES`
    - `consistency(input)` → `{ completed, expected, skipped, atTarget? (quantity), definition }`
    - `weekProgress(input)` → `{ from, to, done, target, skipped, atTarget?, definition }` for the week holding today
    - `formatConsistency(result, cadenceType, measure)` and `cutToOneDecimal`
    - input types `EngineHabit`, `EngineSchedule` (`HabitSchedule` fits), `EnginePause`, `EngineLog`, `HabitWeekInput`, `HabitRangeInput`
  - Tests: `src/lib/habits/consistency.test.ts` (161): all seven week starts (first/last day, neighbours excluded, misaligned ranges refused), start/end/pause mid-week for `daily` and `times_per_week`, the full N = 1–6 × 0–7 table (direct and end to end), skips to 0 and never below, the current week (never lowers, caps, skips, later pauses), today unlogged/completed/skipped, extras, quantity below/at/above target and the weekly cap, exact sums (0.7 + 0.1 = 0.8, across targets), schedule changes (cadence, weekdays, earliest-row fallback), a week-start change regrouping, inactive-day logs, empty/reversed/before-start/future ranges, formatting and definition text.
- **Deviations:**
  1. **The current week for quantity habits (ADR 0014 amended, user's choice):** the ADR said `expected = completed = min(done, target)` but also that `expected` is whole. Now `expected` = `min(completed-log days, target)`, `completed` = `min(done, target)`. Check habits are unchanged.
  2. **An `unlogged` day state** for a past `times_per_week` day with no log, since the ADR gives that cadence no per-day Missed.
  3. **`scheduleForWeek` reused from 6.1** (`cadence.ts`, takes the week's last day), not rewritten.
- **Decisions:**
  1. **Ranges are whole weeks** (`from` a week start, a multiple of 7 days); anything else throws `RangeError`. `to` = the day before `from` is an empty range. Weeks after the one holding today are skipped for every cadence.
  2. **Credit is summed exactly** (BigInt fractions over each week's target in cents), so 0.7 + 0.1 shows 0.8, not 0.7. `cutToOneDecimal` is `floor(x·10)/10`, exact for any reduced total.
  3. **`atTarget` for `times_per_week`** is `min(days at target, the week's target)`, the full days among the completions counted.
  4. **`weekProgress` covers every cadence:** `daily`/`weekly_days` take the week's active, scheduled, unskipped days (later days included) as the target. `done` is capped at the target.
  5. **The skip count is shown only when above 0** (the ADR's examples omit it at 0), and with nothing expected only "Nothing expected in this range" is shown.
  6. A completed quantity log without a value earns no credit; a skip on a `weekly_days` off day is shown (`not_scheduled` with its log) but not counted; a quantity schedule without a target, or no schedule at all, throws.
  7. The definition text uses the schedule of the range's last counted week, and adds a sentence when weeks in the range had different schedules.
- **Next chunk should know:**
  - 6.3/6.4: map rows with `toHabit`/`toHabitSchedule`, plus pauses and logs (`value` as a number), and pass the user's today and `week_start`. `range` must be whole weeks: `from = startOfWeek(...)`, `to = addDays(from, 7·n − 1)`.
  - 6.4 Today rows: a `times_per_week` habit shows while `weekProgress(...).done < target`. "1 of 3 so far this week" is `cutToOneDecimal(done)` of `target`.
  - `formatConsistency` takes the cadence type of the latest schedule (the definition's). With mixed schedules, the noun ("days"/"times") follows it.
  - `habitDays` gives `log` on every state, including `inactive` and `not_scheduled`, so the strip can show kept logs.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (1 pre-existing warning, below), typecheck, 888 unit and 581 integration tests. Pure code only: no schema, UI, build or e2e.
- **Follow-ups:**
  - Lint warns about an unused `_omitted` in `src/server/modules/habits/validation.test.ts:108` (from 6.1).

### 6.3: Habit CRUD UI (2026-10-29)
- **Built:**
  - Navigation: Track after Plan in `NAV_ITEMS` (a bar-chart icon; the phone bar is now 5 columns) and `APP_ROUTE_SEGMENTS`.
  - Routes: `/track` (active, then paused, each its own section; "Archived (n)" link; empty state) and `/track/archived` (newest first, "Archived on …", Restore behind a confirmation, Delete), each with `error.tsx`.
  - `src/components/habits/`: `habit-form.tsx` (`HabitFormDialog` + the cadence picker), `track-view.tsx` (`TrackView`, `HabitSummary`), `archived-habits-view.tsx`, `delete-habit-dialog.tsx`.
  - `src/lib/habits/habit-form.ts` (pure): `weekdaysFrom`, `WEEKDAY_NAMES`, `pickerValueOf`, `cadenceInput` (all seven weekdays → daily), `isEveryDay`, `describeCadence` ("Every day", "Mon, Wed, Fri" in week order, "3 times a week"), `describeTarget` ("8 glasses a day", locale digits), `habitDeleteConsequences`.
  - `src/server/modules/habits/`: `queries.ts` (`getTrackView`, `getArchivedHabits`: this week's schedule via `scheduleForWeek`, labels, goal title, log count, goal options), `actions.ts` (create, edit, pause, resume, archive, restore, delete), and in `service.ts` a new `editHabit` with `updateHabit`/`changeHabitSchedule` split into in-transaction helpers.
  - Tests: unit `habit-form.test.ts`, `editHabitSchema` and all-errors-at-once cases in `validation.test.ts`, nav test; integration `track.integration.test.ts` (17: edit atomicity and events, read models, cross-user, actions incl. signed out and NotFound, delete removing logs); e2e `habits.spec.ts` (create check + quantity with field errors, schedule edit with the this-week note and seven days → daily, target edit, pause/resume, archive/restore, confirmed delete, keyboard-only create, axe) and `shell.spec.ts` updated for Track.
- **Deviations:**
  1. **`editHabit` (service + action + `editHabitSchema`)**, not in the chunk text: the dialog edits fields and schedule together, so one transaction saves both, and a target refused by the measure leaves the other fields unsaved. Each part still writes its own event (`habit.updated`, `habit.schedule_changed`) only when it changed something; both share the transaction's instant.
  2. **6.1's habit schemas now report every error in one submit.** Zod skipped the cross-field rules (unit/target vs measure, date order, cadence config) whenever any field failed, so a blank title hid the rest. Each rule is now a `superRefine` with `when` (`acrossFields` in `validation.ts`) that runs once its own fields parse; the transform only builds the cadence pair. Messages and paths are unchanged.
- **Decisions:**
  - Delete is offered on every row (Track and archive), behind a confirmation naming the log count, with "archive it" suggested for live habits. Pause, resume and archive act at once with a toast; restore asks first, like goals.
  - The goal select offers active and paused goals, plus the habit's own goal whatever its status (as the event form does).
  - The start date defaults to the user's today. Times a week is a 1–6 select, so 7 can't be entered.
- **Next chunk should know:**
  - `HabitListItem` already carries `schedule` (this week's), `cadenceLabel`, `targetLabel` and `logCount`; 6.4/6.5 can extend `getTrackView` rather than add a second list query. `HabitSummary` renders a row's text.
  - Same-transaction audit events share `occurred_at`; order by type in tests, not by time.
  - The primary button's hover state (`hover:opacity-90`) is 4.25:1, below AA; axe flags it while the pointer rests on one (the habits e2e moves the pointer away first).
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (the 6.1 warning, below), typecheck, 911 unit and 598 integration tests. `pnpm build` passes. `pnpm test:e2e`: 74 passed; one earlier full run had `reminders.spec.ts` "turning reminders off…" fail once under load, and it passed alone and on the full rerun.
- **Follow-ups:**
  - Primary button hover contrast below 4.5:1 (design tokens, all primary buttons).
  - The goal delete confirmation still doesn't say linked habits lose their goal (from 6.1).
  - Lint warns about the unused `_omitted` in `src/server/modules/habits/validation.test.ts` (from 6.1).

### 6.4: Logging (2026-10-29)
- **Built:**
  - `src/lib/habits/logging.ts` (pure): `logValueProblem` (value by measure and status), `changedLogFields`, `showsOnToday` (Today's row rule), `weekProgressLabel`, `formatAmount`, `describeLog` ("Done", "Skipped", "5 of 8 glasses"), `habitDayLabel`, `isLoggableDay`, `stripRange` (last week and this week), and the fixed messages.
  - Audit events `habit.logged|log_changed|log_removed` (`localDate`, `fields` by name: `status`/`value`, `status` from/to), sharing one strict schema in `audit/types.ts`.
  - `habits/validation.ts`: `setHabitLogSchema` (`habitId`, `localDate` as a date or `"today"`, `status`, optional amount; a skip with a value refused) and `clearHabitLogSchema`. `habits/service.ts`: `setHabitLog`, `clearHabitLog` (return `{ habitId, localDate, log, previous }` for undo), `toHabitLogValue`. `habits/actions.ts`: `setHabitLog`, `clearHabitLog`.
  - `habits/queries.ts`: `engineData` / `engineInput` (schedules, pauses and a range of logs per habit for the 6.2 engine), `getTodayHabits(userId, now)`, and `getTrackView` items now carry `history` (`habitDays` for the strip, `consistency` + `formatConsistency` for "Last 2 weeks", `weekProgress` for `times_per_week`) plus the view's `locale`.
  - UI: `src/components/habits/today-habits.tsx` (the "Habits" section at the bottom of `TodayView`), `habit-strip.tsx` (`HabitStrip`, `HabitStripLegend`, the day dialog), `use-habit-log.ts` (write + toast with Undo). `Toast` takes an optional `action` (Radix `Toast.Action` with `altText`), shown 8 s instead of 5.
  - Tests: unit `logging.test.ts` (18) and the log schemas in `validation.test.ts`; integration `logs.integration.test.ts` (11: log/correct/clear with exact events and no-ops, value vs measure, future days in Auckland vs UTC, before start/after end/paused, clearing a kept log on an inactive day, cross-user NotFound, a past correction moving the strip and figure at once with its audit trail, quantity credit and this-week progress, Today's row rule, actions signed out and from form input); e2e `habit-logging.spec.ts` (2, Tokyo: one tap done/skip with Undo, quantity full target, Change amount with focus return and Escape, a reload; backfill on Track, correction to a skip, Undo, Escape, "No log", today from Today, axe on both pages and the dialog). The 6.3 `getTrackView` shape test now expects `locale`.
  - Docs: DATA_MODEL HabitLog rules (writes, events, undo), PRODUCT_SPEC §8 (Today's Habits and the Track strip).
- **Deviations:**
  1. **The strip lives on Track with a "Last 2 weeks" figure**, its definition behind "How this is counted", and "This week: n of N so far" for `times_per_week`. The chunk didn't say where the strip goes, and its "done when" needs a figure to update. 6.5 replaces the fixed two weeks with its range selector and can reuse `habitHistory`/`HabitStrip`.
  2. **Undo restores the day as it was**, not only deleting: a new log is deleted, a correction puts back the previous status and value (ADR 0014 says "Undo deletes the log", written for a new log). Recorded in DATA_MODEL.
  3. **The toast primitive gained an action** (Undo), the first toast with a button.
- **Decisions:**
  - Today's day is `"today"` worked out on the server (as 2.5's rule), so a stale page can't log a wrong day; the result carries the real date, which undo uses.
  - Today shows a habit when it is logged today (any status but archived, so a habit paused after logging today can still be undone), or when it is active on an active day and: daily; today scheduled (`weekly_days`); or `weekProgress.done < target` (`times_per_week`). The section shows once the user has an active habit ("No habits are due today." when none is due), at the bottom of Today, so existing heading lists are unchanged with no habits.
  - Unlogged rows offer Done and Skip (and Change amount for quantity); logged rows offer the other status, Change amount and Clear. Rows update optimistically.
  - The NotFound check comes first, so a foreign habit is NotFound whatever the date. Value, future and inactive-day errors are field errors whose message is also the action's message.
  - No note in the API or UI yet (the column exists); a correction keeps whatever note a row has.
  - Strip cells: shape and mark first, colour second (✓ done, ◐ partly, – skipped, + extra, dashed outline for Missed, struck-through grey for not active); every day's accessible name is "<full date>: <state>", with the amount where it matters.
- **Next chunk should know:**
  - Locators: Today's region "Habits" with one listitem per habit; buttons "Done: <title>", "Skip: <title>", "Change amount: <title>", "Clear: <title>"; the form "Amount today: <title>". On Track, each week is a list named "<title>: Week of <date>", day buttons are named "<full date>: <state label>" (e.g. `/: Missed$/`), and the day dialog is titled with the full date.
  - Toasts are listitems in the region "Notifications (F8)"; `role="status"` is only Radix's announcer and holds no buttons. Rows change optimistically, so wait for the toast before navigating away (the first full e2e run failed on exactly that).
  - 6.5/6.6: get engine input with `engineData(userId, ids, logRange)` and `engineInput(habit, data, context)` rather than new queries.
- **Unverified:** `pnpm verify` passes: format, lint (the 6.1 warning, below), typecheck, 933 unit and 609 integration tests. `pnpm build` passes. `pnpm test:e2e`: 76 passed on the final full run. Of four full runs, three failed only on `reminders.spec.ts` "new events remind 10 minutes before…" (5.6's spec; the first also had my own wait bug, since fixed); it passed alone 3 of 3, and the same stress (`today.spec` + `reminders.spec`, `--repeat-each=6`) failed it 1 of 18 on `main` without this chunk, so it predates 6.4. `habit-logging`, `habits` and `today` specs passed 21 of 21 with `--repeat-each=3`. No schema change, so no migration. No screen-reader, phone or manual dark-mode pass.
- **Follow-ups:**
  - `reminders.spec.ts:138` reopens the event dialog as soon as "Event saved" shows, before the refresh brings the new reminder, so it reads the old value under load. Wait for the refreshed value (or retry the reopen) there.
  - Notes on habit logs (column exists, no UI).
  - Logging further back than two weeks waits for 6.5's ranges.
  - Earlier follow-ups still open: primary button hover contrast; the goal delete confirmation not mentioning linked habits; the unused `_omitted` in `habits/validation.test.ts`.

### 6.5: Track page and history (2026-10-29)
- **Built:**
  - `src/lib/habits/track-range.ts` (pure): `TRACK_RANGES` (`4w` default, `12w`, `week`), `TRACK_RANGE_LABELS`, `parseTrackRange` (anything else → `4w`), `trackHref` (default stays `/track`), `trackRangeDates(today, weekStart, range)` (whole weeks, the week holding today last), `weekStartsOf`, `formatDateSpan` (`Intl` `formatRange`), `shortDateLabel`, `weekProgressFigure` ("1 of 3 times so far this week", days/times, "n at target" for quantity, skips; "Nothing expected this week" at 0).
  - `habits/queries.ts`: `getTrackView(userId, now, range = "4w")` reads logs for the range only, and returns `range`, `rangeLabel`, `rangeDatesLabel`. `HabitHistory.weeks` has one entry per week of the range (with `shortLabel`), `figure` is null for "This week" (whose `definition` and `progressLabel` come from `weekProgress`), and the longer ranges keep the `times_per_week` progress line.
  - `/track` reads `?range=`; `TrackView` has a "Range to show" nav (links with `aria-current`, like Upcoming) and the range's dates; `HabitStrip` shows the figure labelled by range, the definition always visible ("How this is counted: …", no longer behind `<details>`), and a date label on each week row (a subgrid, so the day cells line up).
  - Removed `stripRange` from `logging.ts` (replaced by `trackRangeDates`).
  - Tests: unit `track-range.test.ts` (parse/href round trip, all seven week starts × three ranges, year boundary, formatting, progress wording); integration `history.integration.test.ts` (7: default 4 weeks, 12 weeks reaching a backfill 10 weeks back, "This week" as progress for daily and N a week, the longer ranges' progress line, days before the start, Auckland + Sunday week start, cross-user in every range); 6.3/6.4 integration and `habit-logging.spec.ts` updated for the new shape and "Last 4 weeks"; e2e `track-history.spec.ts` (switch ranges in the URL, backfill in the oldest of 12 weeks, the 4 weeks unaffected, "This week" progress without a figure, fallback for an unknown range, definition visible, no "%" or "streak", axe).
  - Docs: PRODUCT_SPEC §8 (Track's ranges).
- **Deviations:**
  1. **The progress line now says "times"/"days"** ("1 of 3 times so far this week") on Track, with "n at target" for quantity and the skips, so it stands alone without 6.4's "This week:" prefix. Today keeps 6.4's `weekProgressLabel` ("1 of 3 so far this week") unchanged.
- **Decisions:**
  - Range param values `4w`, `12w`, `week`, with labels "Last 4 weeks", "Last 12 weeks", "This week"; the default is the plain `/track`.
  - Weeks oldest first, so the strip reads like a calendar and today's week is at the bottom.
  - The definition is shown in full under each figure; for "This week" it is `weekProgress`'s week-scope definition.
- **Next chunk should know:**
  - 6.6: the last-4-weeks range is `trackRangeDates(today, weekStart, "4w")`; reuse it and `weekProgressFigure` with `engineData`/`engineInput` rather than computing dates again.
  - Locators: the nav "Range to show" with links by label; week lists are still "<title>: Week of <date>"; the figure is a `<p>` starting "Last 4 weeks:" / "Last 12 weeks:".
  - `formatDateSpan` output contains thin spaces around the dash; compare with `formatDateSpan` itself or normalise whitespace in tests.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (the 6.1 warning, below), typecheck, 943 unit and 616 integration tests. `pnpm build` passes. `pnpm test:e2e`: 77 passed on the first full run. No schema change, so no migration. Desktop and 375 px screenshots checked; no screen-reader or manual dark-mode pass.
- **Follow-ups:**
  - The strip legend's "Partly done" and "Extra" marks render as wide pills rather than squares (`HabitStripLegend` combines `dayClass`'s `w-full` with `size-6`; from 6.4).
  - With many habits on "Last 12 weeks", each strip is 84 day buttons; fine for now, revisit in 10.7 if Track gets slow.
  - Earlier follow-ups still open: `reminders.spec.ts:138` reading the old reminder under load; notes on habit logs; primary button hover contrast; the goal delete confirmation not mentioning linked habits; the unused `_omitted` in `habits/validation.test.ts`.

### 6.6: Home integration (2026-10-29)
- **Built:**
  - `habitsSummary(userId, clock, timeZone, weekStart)` in `metrics/home.ts` → `Metric<HabitSummaryItem[]>`: active habits oldest first, each with `cadenceType` (this week's schedule), `measure`, `consistency` over `trackRangeDates(today, weekStart, "4w")` and `thisWeek` (`weekProgress`). Range = those 4 whole weeks; `hasData` = any active habit. It calls the 6.2 engine through `engineData`/`engineInput`, now exported from `habits/queries.ts` (`engineInput` takes only `today` and `weekStart`).
  - Home: a "Habits" `<MetricCard>` (last, after Deadlines) with the list "Active habits": each title links to `/track#habit-<id>`, then "Last 4 weeks: <formatConsistency>" and the `weekProgressFigure` line. Empty: "Nothing yet" with an "Add a habit" link to `/track`. The page intro mentions habits.
  - `trackHabitAnchor(id)` in `src/lib/habits/track-range.ts`; Track's habit rows carry that id (`scroll-mt-4`).
  - Tests: unit `trackHabitAnchor`; integration `habitsSummary` in `home.integration.test.ts` (4, Tokyo while UTC is a day behind: no data with the exact range and with paused/archived habits only; daily/times-a-week/quantity figures and this-week progress incl. a skip, a log before the range and today logged; equal to Track's default figure and definition with a Sunday week start; cross-user); e2e `home-habits.spec.ts` (empty card and link, two habits in order with their figures, no `%`/score/streak/combined figure, axe, the link landing on the Track row in view, pausing both returns "Nothing yet"); `home.spec.ts` expects the fifth heading.
  - Docs: PRODUCT_SPEC §8 (the Habits card).
- **Deviations:** none. The metric takes `weekStart` as a fourth argument (the other Home metrics need only the zone); the page already has the preferences.
- **Decisions:**
  1. **The value holds the engine's results, not strings.** The card words them with `formatConsistency` and `weekProgressFigure`, the same functions Track uses, so 7.1 can reuse the numbers.
  2. **Every cadence shows this week's progress** on Home (Track's longer ranges show it only for times a week), as the chunk asks for "this week's progress" per habit.
  3. **The card's definition is general** and points to Track for each habit's own definition, rather than repeating one per habit.
  4. **No "See all on Track" link:** link names containing "Track" would match non-exact nav locators (see the 3.2 note); the titles link to Track instead.
- **Next chunk should know:**
  - Locators: Home's region "Habits" (`exact: true`; Today also has a "Habits" region), the list "Active habits" with one title link per habit. Track rows have `id="habit-<id>"`.
  - 7.1 can call `habitsSummary`, or `engineData`/`engineInput` with its own range, rather than recount.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (the 6.1 warning, below), typecheck, 944 unit and 620 integration tests. `pnpm build` passes. `pnpm test:e2e`: 78 passed on the final full run. Two earlier full runs each failed one known `reminders.spec.ts` flake (`:138` reading the old reminder, then `:79` reading an empty reminder select after save), each passing alone (3 of 3); one more run never started because Docker Desktop had stopped. `home-habits.spec.ts` and `home.spec.ts` passed together. No schema change, so no migration. No screen-reader, phone or manual dark-mode pass.
- **Follow-ups:**
  - `reminders.spec.ts` flakes under full-suite load: `:138` (old reminder value, noted in 6.4) and `:79` (empty reminder select right after save, noted in 6.3) each failed once here. Both reopen the dialog before the refresh lands; wait for the refreshed value.
  - Earlier follow-ups still open: the strip legend's wide pills; notes on habit logs; primary button hover contrast; the goal delete confirmation not mentioning linked habits; the unused `_omitted` in `habits/validation.test.ts`.

### 7.0: Decision gate: weekly review (2026-10-29)
- **Built:**
  - ADR 0015 (weekly review: period, structure, editing window and reminder) and its index row.
  - Chunks 7.0–7.5 rewritten to match, with the 7.1 metric definitions spelled out.
  - `DATA_MODEL.md`: WeeklyReview rewritten, WeeklyReviewPriority added, plus §4, the §6 deletion rules and §7.
  - `PRODUCT_SPEC.md` §12 (weekly review settled), `ROADMAP.md` 1G, and the `AGENT_PROMPTS.md` prompts for 7.2, 7.4 and 7.5.
  - Progress log: 6.✓ marked done at the user's request.
  - No code.
- **Deviations:**
  1. **Two questions beyond the gate's three,** both following from the lock: the exact open window, and what finishing requires.
  2. **A lock, against the recommendation of "editable afterward":** a review is open during its week and the week after, then read-only with no correction path.
  3. **Delete added to 7.4** (confirmed, allowed when closed). The old 7.4 text had only list, view and edit.
- **Decisions:**
  - **Asked and answered:**
    - the period is the user's week, `period_end = period_start + 7` exclusive (as recommended)
    - wins, blockers, lessons and linked priorities with a note (as recommended)
    - one review per period, locked a week after the period ends (against the recommendation)
    - open = before `period_end + 7`; start/edit only while open; drafts kept as "Not finished"; the flow defaults to last week unless it is finished (as recommended)
    - nothing is required to finish (as recommended)
  - **Derived and recorded in ADR 0015, not asked separately:**
    - saved periods never move with a zone or week-start change, and overlaps after a week-start change are allowed
    - text up to 5,000 characters each, empty → null; at most 10 priorities, active/paused goals and open tasks only, unique per review
    - "next week" = the period after the reviewed one
    - the summary is computed live, never stored; the habits part says "not available" for a period misaligned with the current week start
    - adjustments are ordinary goal/task changes, not locked; a closed review offers none
    - goal/task delete cascades the priority (the exactly-one CHECK rules out `SET NULL`)
    - events `weekly_review.started|updated|priorities_changed|finished`, no text
    - reminder: `weekly_review_day` + `weekly_review_time` (both or neither), kind `weekly_review`, rolling row like the nudge, fixed text, opens `/review`, not suppressed after a finished review
  - **7.1 definitions** (in the chunk text, not the ADR): planned = had a plan date in the period at any time (from events); rescheduled = per task, a plan date or deadline moved later; goals with no activity include milestone, task and linked-habit activity.
- **Next chunk should know:**
  - 7.1: reuse `engineData`/`engineInput` (6.6 exported them) with the period as a one-week range; the engine throws on a misaligned range, so check alignment first. Task events: `task.created` (`plannedDate`), `task.planned`, `task.due_changed` (all three deadline columns), `task.completed`.
  - 7.2: the open check is on every write except delete, under a row lock; the boundary is today in the current zone, so test a zone ahead of UTC on the closing day.
  - 7.5: the `reminders` kind and link CHECKs need extending (`weekly_review` links to neither a task nor an event, like `daily_nudge`).
- **Unverified:** none (docs only). `docs/` is in `.prettierignore`, so `format:check` covers nothing here.
- **Follow-ups:**
  - The goal and task delete confirmations don't mention that review priorities linking to them go (7.2 or 7.3).
  - Phase 10 export (10.1) must include reviews, their priorities and the reminder setting.
  - If the reminder proves redundant after reviewing early, consider skipping it when the week's review is finished (ADR 0015 alternatives).
  - A correction path for closed reviews, if the lock turns out too strict at the Phase 7 checkpoint.

### 7.1: Weekly summary queries (2026-10-29)
- **Built:**
  - `src/server/modules/metrics/review.ts`: `weeklySummary(userId, { periodStart, clock, timeZone, weekStart })` returns six metrics, each a `Metric` with definition, range and `hasData`; `reviewPeriod(start)` gives `{ start, end }` with `end = start + 7`.
  - `src/server/modules/metrics/review.integration.test.ts` (16 tests): sparse data, week boundaries in Tokyo and for week starts 0/1/6, plan moved out of the week, deadline moved earlier, activity via milestone/task/habit, misaligned habits, cross-user.
  - Progress log row and this note. No UI, no schema, no new events.
- **Deviations:** None against the chunk text. Two choices the text left open:
  1. `hasData` per metric means "the user has records this metric reads, at any time" (for tasks, any task; for habits, any active or paused habit; for goals, any active goal created before the week ended). A quiet week then reads 0 with data, and a user with nothing reads "nothing yet".
  2. A habit that began on or after the period's end is left out of the habits metric (not shown as "Nothing expected"). A habit that began inside the period is included.
- **Decisions:**
  - Rescheduled compares deadlines as instants. A day deadline counts as due at the end of that day in the user's zone, so moving it to a timed deadline on the same day is not "later". Recorded in code comments; the chunk text didn't say.
  - Planned uses `task.created` and `task.planned` `to` values with no time filter (a plan set any time that names a day in the week counts), per 7.1.
- **Next chunk should know:**
  - `reviewPeriod`, `weeklySummary` and the individual metric functions are the reuse points for 7.3 (the Adjust/summary step) and 7.4 (the "as of" view).
  - The habits metric returns `value: null` (not an empty list) for a period that doesn't start on the week start. The UI must show that as "not available", not zero.
  - `habits` figures are already worded (`formatConsistency` / `weekProgressFigure`); the UI should show them as they are.
  - Audit `changes` are re-parsed with `AUDIT_EVENTS[...].changes.parse` in the metric, so a malformed event throws rather than being silently skipped.
- **Unverified:** None. `pnpm verify` passed on this branch (format:check, lint, typecheck, unit and integration: 45 test files, 636 tests, including this chunk's 16). Not run: `pnpm build` and `pnpm test:e2e`, which the chunk doesn't need (no UI or routes).
- **Follow-ups:**
  - The "Deadline window" in the metric is the next 7 days after the period, not `dateWindowBounds("next7")`; if the Plan page's window ever changes, both should move together.
  - If a habit with no schedule for the period ever shows up, the metric throws. Home (3.2 / 6.6) has the same guard; check the schedule-backfill path if it fires.

### 7.2: Reviews: schema and service (2026-10-29)
- **Built:**
  - `src/lib/weekly-reviews.ts` (pure): `REVIEW_TEXT_MAX` (5,000), `REVIEW_PRIORITIES_MAX` (10), `REVIEW_TEXT_FIELDS`, `REVIEW_CLOSED` ("This review is closed for editing."), `REVIEW_PERIOD_NOT_OPEN`, `reviewClosesOn`, `isReviewOpen(periodEnd, today)`, `openPeriodStarts(today, weekStart)`, `priorityKey`, the `WeeklyReview` and `ReviewPriority` types.
  - Schema `src/server/db/schema/weekly-reviews.ts` + migration `0016_weekly_reviews.sql` (generated, no hand edits): `weekly_reviews` (`unique (id, user_id)`, `unique (user_id, period_start)`, `period_end = period_start + 7` CHECK, four 1–5,000-character CHECKs) and `weekly_review_priorities` (composite FKs to the review, goal and task, all cascading; `num_nonnulls(goal_id, task_id) = 1`; `sort_order >= 0`; unique `(review_id, goal_id)`, `(review_id, task_id)`, `(review_id, sort_order)`; indexes `(goal_id, user_id)` and `(task_id, user_id)` for the delete cascades).
  - Audit events `weekly_review.started` (period dates), `.updated` (field names), `.priorities_changed` (ordered `{ goalId } | { taskId }` from/to), `.finished` (`completedAt`).
  - `src/server/modules/weekly-reviews/`: `validation.ts` (`startWeeklyReviewSchema`, `saveWeeklyReviewTextSchema`, `setWeeklyReviewPrioritiesSchema`, `weeklyReviewIdSchema`), `service.ts` (`startWeeklyReview`, `saveWeeklyReviewText`, `setWeeklyReviewPriorities`, `finishWeeklyReview`, `deleteWeeklyReview`, `toWeeklyReview`).
  - Tests: unit `src/lib/weekly-reviews.test.ts` and `weekly-reviews/validation.test.ts`; integration `weekly-reviews.integration.test.ts` (37: every CHECK and unique incl. a duplicate period and a second link to the same goal, the exactly-one CHECK, cross-user composite FKs, goal/task delete cascades, account cascade, start for this/last week only (future, older, misaligned refused, racing starts, a week-start change, the user's zone), text save/no-op, priorities replace/no-op/refusals/kept completed goal, finish once with nothing filled, every write refused from the closing day in Auckland while UTC is still open, delete when closed, cross-user NotFound for every write and foreign goal/task IDs, no text or titles in audit).
  - Docs: one DATA_MODEL rule (WeeklyReviewPriority) on keeping already-linked items.
- **Deviations:** none against the chunk text.
- **Decisions:**
  1. **Start** returns the existing review with no event; a racing start inserts with `ON CONFLICT DO NOTHING` and reads the other's row, so it never surfaces a unique violation. A refused period is a `ValidationError` on `periodStart` (not a conflict), since it's a bad choice of week rather than a locked record.
  2. **Save text** takes each field as optional: absent keeps it, blank or null clears it. Only fields that differ after trimming are written and named in the event.
  3. **Set priorities** checks status only for newly added targets: an already-linked goal or task stays allowed whatever its status, so a reordered list can keep a since-completed goal (ADR 0015 "stays linked"). Another user's or a not-addable ID is a `ValidationError` on `priorities`, with one fixed message for both so it can't probe IDs. The list is replaced by delete + insert, so `sort_order` is always dense.
  4. **The closed check runs before any no-op test**, so a closed review refuses even a write that would change nothing, and finishing an already-finished closed review is a conflict too.
  5. `completed_at` is the injected `now` (as other services' `now`); the event stores it as ISO.
- **Next chunk should know:**
  - 7.3: wire the five functions through `authedAction` with the exported schemas. Default period: `openPeriodStarts(today, weekStart)` gives `thisWeek`/`lastWeek`; pick last week unless its review has `completedAt`. Field errors come back on `periodStart`, `wins`, `blockers`, `lessons`, `prioritiesNote` and `priorities`.
  - 7.3/7.4: there is no read query yet (no UI in this chunk); add `queries.ts` with the review, its priorities joined to current goal/task titles and statuses, and the closing date (`reviewClosesOn`).
  - Every write takes `now` (default `new Date()`), so tests can pin the closing day; `isReviewOpen` is the same rule the UI should use to hide Edit.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (the 6.1 warning, below), typecheck, 973 unit and 673 integration tests. `pnpm db:generate` reports no schema changes after the migration; dev DB migrated. No UI or routes, so `pnpm build` and `pnpm test:e2e` were not run.
- **Follow-ups:**
  - The goal and task delete confirmations don't mention that review priorities linking to them go (from 7.0; 7.3).
  - Phase 10 export (10.1) must include reviews and their priorities (from 7.0).
  - Lint warns about the unused `_omitted` in `src/server/modules/habits/validation.test.ts` (from 6.1).

### 7.3: Review flow UI (2026-10-29)
- **Built:**
  - Navigation: Review after Track in `NAV_ITEMS` (a clock-arrow icon; the phone bar is now 6 columns) and `APP_ROUTE_SEGMENTS`; `shell.spec.ts` and the nav unit test updated.
  - Route `/review?week=<first day>&step=look-back|reflect|adjust|priorities` with `error.tsx`. No `week` opens the default (last week unless its review is finished); a `week` is honoured when it is this week, last week, or a week the user has a review of; anything else falls back.
  - `src/lib/review-flow.ts` (pure): `REVIEW_STEPS`, `REVIEW_STEP_LABELS`, `parseReviewStep`, `parseReviewWeek`, `adjacentReviewStep`, `reviewHref`, `defaultReviewWeek`, `nextReviewWeek` (the week after the reviewed one, with the days from today on).
  - `src/server/modules/weekly-reviews/queries.ts`: `getReviewForWeek` (review + priorities with current titles/statuses + `closesOn`), `getReviewPage`, `getAdjustStep` (active/paused goals, stalled = Today's "decide" + "earlier", next week's planned tasks, the other open tasks), `getPriorityOptions`. `actions.ts`: `startWeeklyReview`, `saveWeeklyReviewText`, `setWeeklyReviewPriorities`, `finishWeeklyReview` (no delete action yet; 7.4).
  - `src/components/reviews/`: `review-header.tsx` (week dates, Not finished / Finished on, until when it can change, the other open week), `start-review.tsx`, `review-flow.tsx` (`ReviewFlow` stepper + Back/Next/Finish, `useStepSave`), `look-back.tsx`, `reflect-step.tsx`, `adjust-step.tsx`, `priorities-step.tsx`, `read-only-review.tsx`. `TodayDateEditor` is now exported from `today-view.tsx` and reused for Reschedule.
  - Tests: unit `review-flow.test.ts`; integration `review-flow.integration.test.ts` (12: default week before/after finishing, a closed review read-only, fallbacks, the closing day in Tokyo, cross-user, priorities with renamed/paused/completed targets, the Adjust read model for this week and last week, priority options, actions signed out / full flow / field errors / NotFound); e2e `review.spec.ts` (pause a goal and plan two tasks for next week, then priorities reordered with a note, Finish, reload to check every step saved, default moves to this week; an empty review finished with the keyboard alone; axe on every step).
  - Docs: PRODUCT_SPEC Journey D and §7.
- **Deviations:**
  1. **The review is started by the client on opening**, not while the server renders: the page renders `StartReview`, which calls the action once and the refresh shows the first step. A render never writes.
  2. **The closed read-only view is minimal** (summary as of now, text, priorities with current statuses). 7.4 owns history, edit and delete, and can build on `ReadOnlyReview`.
- **Decisions:**
  - "Stalled" = open tasks whose deadline has passed or that were planned for an earlier day (Today's "Needs a decision" and "Earlier, not done"). Reschedule changes the deadline for the first, the plan date for the second.
  - Adjust offers Pause and Drop for active goals and Resume and Drop for paused ones, with the goal page's toasts. No confirmation (all reversible, as on the goal page).
  - "Plan next week" offers the days of the week after the reviewed one from today on, so reviewing last week offers only the rest of this week.
  - Steps save when left through the step links, Back, Next or Finish; only changed fields are sent. Leaving through the main navigation doesn't save the step being edited.
  - "Finish review" sits on the last step; a finished review shows "Save review" there instead.
  - Dates that Node and Chrome word differently (`formatDateSpan`) are formatted on the server and passed to client components; the first version had a hydration mismatch.
- **Next chunk should know:**
  - Locators: nav "Review steps" (links with `aria-current="step"`), h2 = step label, region "Reviewed week", list "Summary of the week", list "Active and paused goals" with "Pause: <title>"/"Resume: …"/"Drop: …", list "Stalled tasks" with "Reschedule: …"/"Cancel task: …", form "Plan a task for next week" (Task, Day, Plan), list "Planned for next week", form "Add a priority" ("Goal or task", Add), ordered list "Priorities for next week" with "Move up/Move down/Remove: <title>", "Note (optional)".
  - 7.4: `getReviewForWeek` and `ReadOnlyReview` are the reuse points; `reviewHref(week, step)` reopens the flow on a week for Edit.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (the 6.1 warning, below), typecheck, 997 unit and 685 integration tests. `pnpm build` passes. `pnpm test:e2e`: 80 passed on the first full run. No schema change, so no migration. Desktop and 375 px screenshots checked; no screen-reader or manual dark-mode pass.
- **Follow-ups:**
  - Leaving a step through the main navigation (or closing the tab) loses that step's unsaved text; consider saving on blur or warning before leaving.
  - The goal and task delete confirmations still don't mention that review priorities linking to them go (from 7.0).
  - Earlier follow-ups still open: Phase 10 export must include reviews; the unused `_omitted` in `habits/validation.test.ts`; primary button hover contrast.

### 7.4: Review history (2026-10-29)
- **Built:**
  - Routes `/review/history` (list) and `/review/history/[reviewId]` (read-only view, with `not-found.tsx`); a "Past reviews" link under the review page's intro. Both sit under the existing `/review/error.tsx` and the Review nav item (prefix match).
  - `queries.ts`: `getReviewHistory` (every review newest first, with `closesOn` and `open`, plus this/last week for naming) and `getReviewView` (a `ReviewPage`-shaped read of one review by ID, `otherWeek` null, so `ReviewHeader` names it). `actions.ts`: `deleteWeeklyReview` (no `refresh()`; the dialog leaves the page).
  - `src/components/reviews/`: `review-history.tsx` (`ReviewHistoryList`, empty state "No reviews yet" → Review a week) and `delete-review-dialog.tsx` (`ConfirmDialog`, toast "Review deleted", replaces to `/review/history`). The view reuses `ReviewHeader`, `ReadOnlyReview` and `LookBack`.
  - Tests: integration `review-history.integration.test.ts` (9: empty, newest first with open/closed/finished, closing on the user's day in Tokyo, cross-user list and view, unknown ID, the action signed out / refusing a closed write with the conflict message / deleting a closed review and its events / NotFound for another user's / a non-UUID). e2e `review-history.spec.ts` (empty list, edit an open review through Edit, a stale Reflect tab refused by the server once the week closes, the closed view with no Edit and the text as saved, Cancel then confirmed delete, axe on list, view and dialog; unknown and non-UUID IDs not found).
  - `tests/e2e/helpers.ts`: `signInAndConfirm` now returns the user ID. `tests/e2e/test-database.ts`: `moveReviewsTwoWeeksBack(userId)` on the e2e test database (same `_test` URL guard as global setup).
  - Docs: PRODUCT_SPEC Journey D.
- **Deviations:**
  1. **Closing a review in e2e goes through the test database**, moving the user's review periods back 14 days, because the app server's clock can't be moved from a test. It is the first e2e that writes to the database directly.
  2. **Delete and Edit are on the review's view only**, not on each list row.
- **Decisions:**
  - The list shows every review, this week's included, under the title "Past reviews"; "This week:"/"Last week:" prefix the open ones. Each row reads "Finished on … · Closed on …" or "Not finished · Open until …" (the last open day). Nothing counts reviews or gaps.
  - The view's page title is fixed ("Weekly review · SoleUp"), as the goal page's is, so no review text reaches tab titles or history.
  - The delete confirmation names the week and says the goals and tasks stay.
- **Next chunk should know:**
  - Locators: list "Past reviews" (a link per review named by its week), link "Edit review", button "Delete review" → alertdialog "Delete the review of <week>?".
  - Opening `/review` starts a review of the default week. An e2e that wants an empty history or a closed last week must go to `/review/history` directly.
  - Next.js keeps the previous page's tree hidden after client navigation, so a page-wide `getByText` can match twice; scope to a region.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (the 6.1 warning, below), typecheck, 997 unit and 694 integration tests. `pnpm build` passes. `pnpm test:e2e`: 82 passed. No schema change, so no migration. No manual screenshot, screen-reader or dark-mode pass of the new pages.
- **Follow-ups:**
  - The goal and task delete confirmations still don't mention that review priorities linking to them go (from 7.0).
  - Earlier follow-ups still open: saving a step left through the main navigation (7.3); Phase 10 export must include reviews; the unused `_omitted` in `habits/validation.test.ts`; primary button hover contrast.

### 7.5: Review reminder (2026-10-29)
- **Built:**
  - Migration `0017_weekly_review_reminder.sql` (generated, no hand edits; additive): `user_preferences.weekly_review_day` (smallint) and `weekly_review_time` (text) with `user_preferences_weekly_review_check` (both null, or a day 0–6 and an `HH:MM` time); `reminders_kind_check` gains `weekly_review`; `reminders_one_scheduled_key` is recreated on `(coalesce(task_id, event_id, user_id), kind)`. The link CHECK already gives a kind other than task/event neither link.
  - `src/lib/reminders.ts`: `weekly_review` in `REMINDER_KINDS`, `USER_REMINDER_KINDS` + `isUserReminderKind` (the nudge and the weekly review: no link, stale when their local day ends).
  - `src/server/modules/reminders/`: `schedule.ts` `syncWeeklyReviewReminderInTx` (next local day + time still to come and not yet reminded about, 15 days ahead, fires at the time) and `syncUserRemindersInTx` (nudge + weekly review, for a zone change); `record.ts` rolls it after sent/skipped/failed and checks "another scheduled row" by the row's kind; `sweep.ts` reads the two columns, stale at the end of its local day, subject `weekly_review`; `payload.ts` `WEEKLY_REVIEW_TEXT` ("Time for your weekly review", both modes, no `reminderId`, link `/review`); `snooze.ts` refuses it (`SNOOZE_WEEKLY_REVIEW`).
  - Preferences: `saveReminderSettingsSchema` takes `weeklyReviewDay` (0–6 or null, "Choose a day from the list.") and `weeklyReviewTime` ("Enter a time for the weekly review reminder." when a day is chosen; stored null when no day); `ReminderSettings.weeklyReview` (`{ day, time }` or null); `saveReminderSettings` syncs it when either changes; `savePreferences` syncs both user reminders on a zone change. Audit allowlist: `weeklyReviewDay`, `weeklyReviewTime` on `user_preferences.updated`.
  - Settings → Reminders: "Weekly review reminder" select (Off, Sunday…Saturday) with its hint, "Weekly review time" shown once a day is chosen, and the quiet-hours warning the nudge has.
  - Tests: integration `weekly-review-reminder.integration.test.ts` (22: off by default, next weekday/time with audit and no-op, today vs next week, moved and turned off, beside the nudge, waits for a zone, cross-user, not snoozable, the CHECK incl. one-null cases, the index beside the nudge, the link CHECK; delivery text/link/no snooze and the roll, private mode, a finished review not suppressing it, off switch, no device, quiet hours held to the end and stale when they end the next day, missed sweeps; New York DST: 09:00 across spring-forward and fall-back Sundays, a skipped 02:30, a repeated 01:30 once; a zone change to Tokyo moving it with the nudge, locale/week-start changes leaving it). Mutation-checked: dropping the roll in `record.ts` fails 9, staling it at its target fails 12. Unit: validation (4 new cases), payload. e2e `reminders.spec.ts`: set Sunday, the missing-time error with focus, the quiet-hours warning, persistence, cleared with Off, axe.
  - Docs: DATA_MODEL (UserPreference, Reminder kinds/index/rules), PRODUCT_SPEC Journey D, README "Reminders".
- **Deviations:**
  1. **`kind` added to the one-scheduled unique index.** The nudge and the weekly review both coalesce to `user_id`, so the 5.4 index would have allowed only one of them.
  2. **The weekly review reminder can't be snoozed**, like the nudge (its target is its own fire time). Not in the chunk text.
  3. **Two existing e2e tests in `reminders.spec.ts` reload before reopening a dialog after saving.** Under parallel load the dialog reopened on the list from before the save's refresh, so the "task form" and "series reminder" tests failed, and also failed on `main` with this chunk stashed. Reloading checks the saved value from the server, so nothing was weakened.
  4. Migration 0017 was regenerated once during the chunk (the first CHECK let a day without a time through, because the pattern test on a null is null). Only this machine's dev and test databases had applied the draft; both were reverted by hand and migrated again.
- **Decisions:**
  - The setting is one select with "Off" plus the time, rather than a separate switch: no day means off, and the time is required only with a day. A day set back to Off clears the time.
  - Each week's target is computed from the wall-clock day and time in the current zone with `instantFromLocal` ("compatible": a skipped 02:30 is 03:30, a repeated 01:30 is the first), so it stays at the same local time across DST.
  - Recorded in code comments and DATA_MODEL > Reminder.
- **Next chunk should know:**
  - A further user-level reminder goes in `USER_REMINDER_KINDS` and `syncUserRemindersInTx`; the index already keys on `kind`.
  - Settings locators: "Weekly review reminder" (combobox, value `""` while off, else `"0"`–`"6"`), "Weekly review time".
  - Locally, the full e2e suite on the dev server is flaky under the default worker count today: tests that save and immediately reopen a dialog can see the pre-save list. `pnpm test:e2e --workers=2` passed; see Unverified.
- **Unverified:** a real push of the weekly review reminder to a device (needs a subscribed browser and the production sweep). Checks: `pnpm verify` (format, lint with only the 6.1 warning, typecheck, 1000 unit, 716 integration) and `pnpm build` pass; `pnpm db:generate` reports no drift and the dev DB is migrated. `pnpm test:e2e --workers=2`: 83 passed with no retries. With the default workers it failed on one save-then-reopen test per run (a different one each time, the same as `main` with this chunk stashed); deviation 3 fixes the two in `reminders.spec.ts`. CI runs e2e on a production build.
- **Follow-ups:**
  - The 5.5 quiet-hours CHECK has the same null hole as this chunk's first draft: a `quiet_hours_start` without an end passes it (checked on the dev database). The service never writes that; add `is not null` in a later migration.
  - Other e2e tests that save and reopen a dialog right away may flake under load the same way (`preferences.spec.ts` "first sign-in" failed once with the default workers).
  - Phase 10 export (10.1) must include `weekly_review_day`/`weekly_review_time` (from 7.0).
  - Earlier follow-ups still open: goal and task delete confirmations don't mention review priorities; saving a review step left through the main navigation (7.3); the unused `_omitted` in `habits/validation.test.ts`; primary button hover contrast.

### 8.0: Decision gate: notes (2026-10-29)
- **Built:**
  - ADR 0016 (notes: rich text, links, search and tags) and its index row.
  - Chunks 8.0–8.4 rewritten to match, and a new chunk 8.5 Tags (Progress log row, AGENT_PROMPTS prompt). Prompts for 8.1–8.4 updated.
  - `DATA_MODEL.md`: Note rewritten, NoteLink replaced by NoteGoal and NoteTask, Tag and NoteTag added, plus §4, the §6 deletion rules and §7 (note links settled).
  - `PRODUCT_SPEC.md` (MVP item 9, §12 notes settled, nothing left open), `ROADMAP.md` 1E, a "Later" row for backlinks, attachments and more link targets.
  - Progress log: 7.✓ marked done at the user's request.
  - No code.
- **Deviations:**
  1. **Rich text, against the recommendation of Markdown:** a TipTap editor, so 8.2's Markdown preview toggle is gone.
  2. **Tags added, which the gate had deferred:** on notes only, in a new chunk 8.5.
  3. **Two questions beyond the gate's:** how a rich-text body is stored, and what tags apply to.
  4. Docs beyond the prompt's list (PRODUCT_SPEC, ROADMAP, AGENT_PROMPTS, the Later table), because they described Markdown notes or open note questions.
- **Decisions:**
  - **Asked and answered:**
    - format: a rich-text editor (against the recommendation)
    - storage: the editor's JSON as the source of truth, validated against a shared allowlist, plus a server-derived `body_text` (as recommended)
    - links: typed join tables `note_goals`, `note_tasks` (as recommended)
    - search: Postgres FTS with the `english` configuration (as recommended)
    - deferred: tags added; backlinks and attachments stay deferred
    - tags: notes only, created inline, delete only untags (as recommended)
  - **Derived and recorded in ADR 0016, not asked separately:**
    - the allowlist (headings 1–3, lists, quote, code, rule, break; bold/italic/strike/code/link; `http:`/`https:`/`mailto:`), refused rather than fixed; 512 KB JSON, 20 levels, `body_text` 100,000 characters
    - title optional (up to 200, "Untitled"); a row only on the first save with content
    - autosave with a stale-`updated_at` conflict; `updated_at` moves on content only
    - archive hides from list, search and linked lists and makes the note read-only; delete removes links, tags and events
    - at most 50 links per note, any status; goal/task delete keeps the note
    - search as a Server Action (terms never in a URL or log), three groups of 20, every goal/task status, archived notes excluded, `ts_headline` with private delimiters rendered as `<mark>`
    - tags 1–40 characters, unique ignoring case, at most 20 per note, one-tag filter
    - events `note.created|updated|archived|restored|linked|unlinked|tags_changed`, `tag.created|renamed`, `note.updated` at most once per 10 minutes; no `*.deleted`; no content or tag names
- **Next chunk should know:**
  - 8.1: put the allowlist and `toBodyText` in `src/lib/notes/` with no server-only imports, since 8.2's editor config must match it. `search_vector` needs a Drizzle custom type; check the generated SQL, and hand-edit the migration if the expression comes out wrong. `to_tsvector` with an explicit `'english'` is immutable, so it works in a generated column.
  - 8.1: the 10-minute `note.updated` window reads the note's latest event, so test it with a fixed clock.
  - 8.3: tasks have no detail page; their "detail" is the task dialog.
- **Unverified:** none (docs only). `docs/` is in `.prettierignore`, so `format:check` covers nothing here.
- **Follow-ups:**
  - Phase 10 export (10.1): convert each note's JSON to Markdown on the server, and include the JSON, links and tags. The 10.1 text ("Markdown for notes") still holds but now means a conversion.
  - Privacy notes (10.3): note bodies are stored as JSON in the database and searched there.

### 8.1: Notes: schema and service (2026-10-30)
- **Built:**
  - `src/lib/notes/note.ts` (pure): `NOTE_TITLE_MAX` (200), `NOTE_BODY_TEXT_MAX` (100,000), `NOTE_LINKS_MAX` (50), `NOTE_UPDATED_EVENT_WINDOW_MS`, `NOTE_CONTENT_FIELDS`, `NOTE_LINK_TARGET_TYPES`, the messages `NOTE_CHANGED_ELSEWHERE` ("This note changed somewhere else."), `NOTE_ARCHIVED`, `NOTE_LINKS_FULL`, and the `Note` type.
  - `src/lib/notes/document.ts` (pure, the shared allowlist): `NOTE_NODE_TYPES`, `NOTE_MARK_TYPES`, `NOTE_HEADING_LEVELS`, `NOTE_LINK_PROTOCOLS`, the limits, the `NoteDocument` node types, `EMPTY_NOTE_DOCUMENT`, `isAllowedLinkHref`, `noteDocumentProblem(value)` (one fixed message or null), `noteDocumentSchema`, `toBodyText`, `documentDepth`, `documentBytes`, `codePointLength`, `documentsEqual`.
  - Schema `src/server/db/schema/notes.ts` + migration `0018_notes.sql` (generated, no hand edits): `notes` (a `tsvector` custom type for the generated, stored `search_vector`, GIN index, `(user_id, updated_at)` index, `unique (id, user_id)`, title 1–200 and `body_text` ≤ 100,000 CHECKs), `note_goals` and `note_tasks` (composite FKs to the note and the goal or task, all cascading; unique per pair; `(goal_id, user_id)` and `(task_id, user_id)` indexes).
  - Audit events `note.created|updated` (`fields`: `title`/`body` by name), `note.archived|restored` (`archivedAt`), `note.linked|unlinked` (`targetType`, `targetId`).
  - `src/server/modules/notes/`: `validation.ts` (`saveNoteSchema`, `noteIdSchema`, `noteLinkSchema`), `service.ts` (`saveNote`, `archiveNote`, `restoreNote`, `deleteNote`, `linkNote`, `unlinkNote`, `toNote`).
  - Tests: unit `src/lib/notes/document.test.ts` (the full TipTap shape accepted; 24 refused documents incl. image, taskList and raw HTML nodes, unknown and colour marks, `on*`, `style` and `class` attributes, `javascript:` and `data:` links; 15 refused hrefs incl. one with a tab inside `javascript:` and a leading NUL; the 2,048-character href limit; 20 levels allowed, 21 and 100,000 refused without a stack overflow; 512 KB counted in bytes; body text counted in code points; `toBodyText` lines, blanks, control characters, and markup kept as plain text; `documentsEqual`) and `notes/validation.test.ts`; integration `notes/notes.integration.test.ts` (33: every CHECK, both unique pairs, cross-user composite FKs on both sides, the indexes, account cascade, `search_vector` stemming with the title outranking the body and not writable, empty first saves making nothing, `body_text` derivation, no-ops, a formatting-only change, the stale-save conflict, `updated_at` always moving forward, the 10-minute window with a pinned clock, archive and restore with writes refused while archived, links of any status, the 50-link limit, goal and task delete keeping the note, a goal delete keeping its tasks' links, note delete removing links and events, cross-user NotFound for every write and for foreign goal and task IDs, no content in audit).
  - Docs: DATA_MODEL Note and NoteGoal/NoteTask (built, the `id` column, the `body_text` derivation, the no-op and archive rules).
- **Deviations:** none against the chunk text.
- **Decisions:**
  1. **Allowlisted attributes** are the ones TipTap 3.x writes for these nodes, each limited to safe values: `heading.level` 1–3; `orderedList.start` (0–1,000,000) and `type` (`1`, `a`, `A`, `i`, `I` or null); `codeBlock.language` (`[A-Za-z0-9+#._-]{1,32}` or null); a link's `href` plus `target` (`_blank` or null), `rel` (only `noopener`, `noreferrer` and `nofollow` tokens), and `class` and `title` (null only). The structure follows ProseMirror's content rules: inline nodes only in paragraphs and headings, plain text only in code blocks, list items only in lists, non-empty text, no repeated mark.
  2. **Refusal messages are fixed** (`noteDocumentProblem`): Zod's own issues never reach the client, since they can echo input. A bad link gets its own message.
  3. **Depth and size are checked before the recursive schema**, iteratively, so a hostile document can't overflow the stack. Depth counts `doc` as 1 and follows `content` arrays. The body text limit counts code points, as `char_length` does.
  4. **A save that changes nothing is a no-op, even from a stale `expectedUpdatedAt`**, so a second tab saving the same text never shows a false conflict. The archived check runs first, so an archived note refuses even a no-op save.
  5. **The service sets `updated_at`** (`max(now, previous + 1 ms)`), not `$onUpdate`, so it moves only on content, and a token from before a save can never match after it, even with a clock that repeats.
  6. **The 10-minute window** compares the save's `now` with the latest `note.updated` event's `occurred_at`. The first content update after creation always records one. `note.created` names which content fields were set.
  7. **A full note is a `ConflictError`** (`NOTE_LINKS_FULL`), since it depends on stored state. A missing or foreign goal or task is a `NotFoundError`. The composite FK refuses a cross-user link independently: removing the service's ownership check fails no test, because the FK violation maps to the same error (mutation-checked; removing the stale check fails two).
- **Next chunk should know:**
  - 8.2: build the TipTap schema from `NOTE_NODE_TYPES` and `NOTE_MARK_TYPES` and the attribute rules above. Configure Link's allowed protocols to match `isAllowedLinkHref`, and give its `HTMLAttributes` defaults inside the allowlist (`class: null`; `target` and `rel` within the allowed values). Turn off StarterKit's extensions outside the list (Underline, and whatever else the pinned version adds). Check with `noteDocumentProblem` on the client to show the same message. The empty editor's JSON is `EMPTY_NOTE_DOCUMENT`.
  - 8.2: `saveNote` takes `{ id?, title, body, expectedUpdatedAt }` (null without an `id`) and returns `Note | null` (null for an empty first save, so the editor stays on `/notes/new`). Keep `updatedAt` from each result as the next `expectedUpdatedAt`. A stale save is `CONFLICT` with `NOTE_CHANGED_ELSEWHERE`; an archived note is `CONFLICT` with `NOTE_ARCHIVED`. There is no `actions.ts` or `queries.ts` yet.
  - Select a column list (as the service's `noteColumns`) rather than `select()` from `notes`, so the `search_vector` text isn't read for nothing.
  - 8.4: `body_text` never contains control characters other than tab and newline, so `ts_headline` can use control characters such as U+0002 and U+0003 as delimiters. Titles are not stripped of them (see Follow-ups).
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (only the 6.1 warning), typecheck, 1067 unit and 749 integration tests. `pnpm db:generate` reports no schema changes after the migration; dev DB migrated. No UI or routes, so `pnpm build` and `pnpm test:e2e` were not run.
- **Follow-ups:**
  - 8.4: note titles may contain control characters, which would clash with `ts_headline` delimiters. Strip or refuse them in titles before highlights rely on it.
  - Phase 10 export (10.1) must include notes, their JSON and their links (from 8.0).
  - Earlier follow-ups still open: the unused `_omitted` in `habits/validation.test.ts`; goal and task delete confirmations don't mention review priorities (and, from 8.3, linked notes).

### 8.2: Notes UI (2026-10-30)
- **Built:**
  - Dependencies: `@tiptap/react`, `@tiptap/pm`, `@tiptap/core`, `@tiptap/starter-kit`, all pinned at **3.32.0** (see Decisions).
  - Navigation: Notes after Track in `NAV_ITEMS` (a page icon; the phone bar is now 7 columns) and `APP_ROUTE_SEGMENTS`; `shell.spec.ts` (labels, the Shift+Tab count, axe on `/notes`, `/notes/archived`, `/notes/new`) and the nav unit test updated.
  - Routes under `src/app/(app)/notes/`: the list (`page.tsx`, "New note", "Archived notes"), `new/`, `[noteId]/` (the editor, or the read-only view while archived; non-UUID and foreign IDs not found, with `not-found.tsx`), `archived/`, and `error.tsx`. Every note page has the fixed title "Note · SoleUp".
  - `src/server/modules/notes/queries.ts`: `listNotes(userId, { archived })` (active by `updated_at` desc, archived by `archived_at` desc; `preview` is the first line of `body_text` cut to `NOTE_PREVIEW_MAX` = 200 in SQL, so bodies aren't read) and `getNote` (with dates in the user's zone and locale). `actions.ts`: `saveNote` (returns only `{ id, updatedAt }` or null; no refresh), `loadNote` (the saved version, for a conflict), `archiveNote`, `restoreNote` (refreshes), `deleteNote`.
  - `src/components/notes/`: `note-extensions.ts` (the schema), `note-editor.tsx` (title, toolbar, body, `SaveIndicator`, the conflict alert, Archive, Delete, "Leave without saving?"), `note-toolbar.tsx` (13 labelled buttons with `aria-pressed` and `aria-keyshortcuts`, and the link dialog), `use-note-autosave.ts` (`useNoteAutosave`, `useSaveBeforeLeaving`), `note-content.tsx` (`NoteContent`, the read-only renderer), `archived-note.tsx`, `note-list.tsx`, `delete-note-dialog.tsx`, `note-page-header.tsx`. Shared `.note-content` styles in `globals.css`.
  - `src/lib/notes/document.ts`: `isAllowedCodeLanguage` and `NOTE_ORDERED_LIST_START_MAX` exported (same rules, now shared with the editor).
  - Tests: unit `note-extensions.test.ts` (the schema is exactly the allowlist, every attribute with allowed defaults, h1–h3 only, a pasted link's `target`/`rel`/`class`/`title` fixed, `javascript:`/`data:`/`vbscript:`/relative links dropped, code language and list `start`/`type` limited) and `note-content.test.tsx` (every node and mark to exact markup, stored markup escaped, disallowed hrefs as plain text, unknown nodes, marks and attributes rendering nothing); integration `notes-ui.integration.test.ts` (9: list order, preview, zone labels, archived order, cross-user list and note, actions signed out, the autosave sequence with the stale conflict, a `javascript:` body refused, load/archive/restore/delete of one's own note only); e2e `notes.spec.ts` (8: every kind of formatting saved, reloaded and listed; **a draft kept when leaving straight after typing**, by the nav and by the back link; **script never executes**: a pasted `<img onerror>`, `<script>`, `javascript:` link, `style`/`on*`/`class` attributes and an h4 are stripped, typed markup is stored and shown as text in the editor and the read-only view, with no dialog and no `window.__xss`; the two-tab conflict; an offline save → "Not saved" + Retry, and leaving asks first; archive read-only → restore → delete with Cancel, then confirmed; keyboard-only toolbar, Mod-B, Mod-K and Space; unknown IDs), with axe throughout.
  - Docs: PRODUCT_SPEC §7 (Notes).
- **Deviations:**
  1. **Saving on in-app navigation intercepts link clicks.** The App Router has no route-change event, so while a change is unsaved a capture-phase click listener stops a same-origin link, saves, then follows it with `router.push`; if the save fails it asks "Leave without saving?". Browser back/forward and closing the tab rely on the unmount and `pagehide` flushes (best effort) plus the `beforeunload` prompt.
  2. **Archive has no confirmation.** It's reversible (read-only until Restore), as goal archive is; delete is confirmed.
- **Decisions:**
  - **TipTap 3.32.0, not 3.32.1.** 3.32.1 is npm's `latest`, but it was published on 2026-10-28, inside pnpm 11's default minimum release age, and `pnpm add` would have written `minimumReleaseAgeExclude` entries for all 28 TipTap packages into `pnpm-workspace.yaml`. Weakening that supply-chain guard isn't worth a patch release, so 3.32.0 (2026-10-13), the newest release that passes it, is pinned exactly. v3 is TipTap's maintained line (v2 is legacy); it supports React 19 and `immediatelyRender: false`, and its StarterKit bundles Link, so no other extension package is needed.
  - **The schema** is StarterKit with Underline off and heading levels 1–3. Pasted HTML could still give allowlisted attributes values the server refuses, so StarterKit's extensions are re-extended in place: a link's `target`/`rel`/`class`/`title` are fixed (`_blank`, `noopener noreferrer nofollow`, null, null); a code block's language and an ordered list's `start`/`type` keep only allowed values. Link's `isAllowedUri` is `isAllowedLinkHref`, so a bare domain isn't autolinked (it has no protocol). `openOnClick` is off while editing.
  - **The editor sends a plain JSON copy** (`JSON.parse(JSON.stringify(getJSON()))`). ProseMirror builds attribute objects with `Object.create(null)`, which React's Server Action encoder passes as an opaque reference, so the server saw a link's `attrs` as a function and refused every note with a link. Found by the e2e; explained at `plainDocument`.
  - The client runs `noteDocumentProblem` and the title limit before each save and shows the same fixed message as "Not saved", without a request.
  - Autosave: one save at a time; changes made during a save are saved after it; "Saving…" shows from the first change. A conflict stops saving until "Load the saved version" (confirmed, since it replaces what's on screen); a note archived elsewhere shows `NOTE_ARCHIVED` under "Not saved". The first save replaces `/notes/new` with `/notes/<id>` through `history.replaceState`, so the editor isn't remounted.
  - The renderer moves note headings down a level (h1–h3 → h2–h4) under the page's h1, styled alike through `.note-h1`–`.note-h3`; the editor keeps h1–h3. Links render with `target="_blank" rel="noopener noreferrer"`.
  - Toolbar buttons prevent focus on mouse-down, so a click never takes focus from the body (typed characters were lost otherwise); they stay Tab stops. The link dialog starts in its field and returns focus to the body.
- **Next chunk should know:**
  - Locators: textbox "Title"; textbox "Note" (the body, `role="textbox"` on the contenteditable); group "Formatting" with buttons "Bold", "Italic", "Strikethrough", "Code" (match it `exact`), "Link", "Heading 1"–"Heading 3", "Bulleted list", "Numbered list", "Quote", "Code block", "Divider"; dialog "Add a link"/"Edit link" ("Link address"); the status `<p role="status">` ("Saving…", "Saved", "Not saved", empty for a new note); buttons "Retry", "Archive", "Delete note" → alertdialog "Delete this note?"; alert "This note changed somewhere else." with "Load the saved version"; alertdialog "Leave without saving?" ("Stay on this note", "Leave without saving"); lists "Notes" and "Archived notes"; article "Note" (the read-only view); button "Restore".
  - 8.3: `NoteContent` renders any preview; `listNotes` is the list read model. A "Linked to" section belongs in `NoteEditor`. Links don't move `updated_at`, so they don't disturb the autosave token.
  - 8.5: tags are saved by their own service call, not through `saveNote`.
  - The toaster keeps an empty `role="status"` live region on the page, so a status locator must not match empty text (the first CI run failed on that).
  - An e2e can paste HTML with a synthetic `ClipboardEvent` carrying a `DataTransfer` (see `pasteHtml`), and can fail Server Actions by aborting requests that carry a `next-action` header.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (only the 6.1 warning), typecheck, 1085 unit and 758 integration tests. `pnpm build` passes. `pnpm test:e2e`: 91 passed on the first full run with the default workers. No schema change, so no migration. Desktop and 375 px screenshots of the editor and list checked; no screen-reader, real-clipboard or manual dark-mode pass. The `pagehide`/unmount flush can't be relied on when a tab closes; the `beforeunload` prompt covers that.
- **Follow-ups:**
  - A bare domain (`example.com`) isn't autolinked, because links must carry a protocol; consider prefixing `https://` for autolinks only.
  - The leave guard intercepts link clicks only; a programmatic `router.push` from elsewhere (none today) would bypass it.
  - Earlier follow-ups still open: control characters in titles vs 8.4's `ts_headline` delimiters; Phase 10 export must include notes (JSON, links); the unused `_omitted` in `habits/validation.test.ts`; goal and task delete confirmations don't mention review priorities (and, from 8.3, linked notes); the 5.5 quiet-hours CHECK null hole.

### 8.3: Linking (2026-10-30)
- **Built:**
  - Service: `saveNote` takes `linkTo` (`{ targetType, targetId }`, a first save only; refused on a later save with `LINK_ON_CREATE_ONLY`) and links the new note in the same transaction with its own `note.linked` event; a target that is gone or someone else's is skipped and the note is still created. The insert and event moved into a shared `insertLink`.
  - Validation: `linkTargetSchema`, `noteLinkSchema` built on it, `findLinkTargetsSchema` and `findNotesToLinkSchema` (query trimmed, empty allowed, up to `NOTE_LINK_QUERY_MAX` = 200).
  - `src/server/modules/notes/queries.ts`: `listNoteLinks` (goals then tasks, link order, status labels), `findLinkTargets` (goal and task titles, any status, `ILIKE` with `%`/`_`/`\` escaped, 20 per group by `updated_at`), `getLinkTarget`, `listLinkedNotes` (non-archived notes by `updated_at` + `linkCount` of every link, archived too), `countLinkedNotes`, `findNotesToLink` (non-archived notes not linked to the target, title or `body_text`), `LINK_PICKER_LIMIT`; the preview SQL is shared as `notePreview`.
  - Actions: notes `linkNote`, `unlinkNote`, `getNoteLinks`, `findLinkTargets`, `getLinkedNotes`, `findNotesToLink` (none refresh); tasks `deleteTask` (refreshes).
  - `getGoalDetail` adds `notes` and `noteLinkCount`; `getArchivedGoals` adds `noteLinkCount`. `linkedNotesKept(count)` in `src/lib/notes/note.ts` is the delete sentence.
  - UI: `src/components/notes/note-links.tsx` (the editor's "Linked to" section and "Link a goal or task" picker), `linked-notes.tsx` (`LinkedNotesList` with "Link a note" and "New note", `useLinkedNotes`), `use-picker-search.ts` (debounced Server Action search). Goal detail has a "Notes" section between Tasks and History. The task dialog has "Linked notes" and a confirmed "Delete task" (`src/components/tasks/task-notes.tsx`, `delete-task-dialog.tsx`); its sections now sit in `TaskDialogBody`. `DeleteGoalDialog` takes `noteLinkCount`. `/notes/new?goal=<id>|?task=<id>` passes the user's own target to `NoteEditor` as `linkTo`.
  - Tests: unit `src/lib/notes/note.test.ts`, `notes/validation.test.ts` (`linkTo`, picker queries); integration `notes/note-links.integration.test.ts` (20: first-save linking incl. empty, foreign and deleted targets; link order and statuses; picker matching with literal `%`/`_`/`\`, limits and order; `getLinkTarget` cross-user; linked lists and counts with archived notes; goal detail and archive counts; goal and task delete keeping the note; every action signed out; cross-user link/unlink; the 200-character limit; `deleteTask` own task only); e2e `note-links.spec.ts` (3: link from a goal and a task, both shown on the note with status, unlink, goal delete names and keeps the note; the editor's picker with a paused goal and a task; "New note" from a task linked on its first save, then task delete naming and keeping it), with axe throughout.
  - Docs: PRODUCT_SPEC §7 Notes, DATA_MODEL NoteGoal/NoteTask, this chunk's text.
- **Deviations:**
  1. **Task delete added** (user's choice when asked): tasks had no delete in the UI, so there was no task delete confirmation to change. The chunk text now says so.
  2. The task dialog's section is titled **"Linked notes"**, not "Notes", since the task's own Notes field sits above it. Goal detail uses "Notes".
- **Decisions:**
  - Pickers match substrings with `ILIKE` rather than 8.4's full-text search: partial words match as you type, and personal-scale data keeps it cheap. Queries go through Server Actions, never the URL.
  - Link and unlink actions refresh nothing. A `refresh()` under the editor on `/notes/new` (its URL already replaced by `history.replaceState`) could remount it, so the editor and task dialog read their lists again, and goal detail calls `router.refresh()` itself.
  - A new note's link travels with its first save (atomic), rather than a second call after it.
  - Pickers stay open and mark rows "Linked", moving focus back to the search. They show no success toast: Radix gives Escape to the topmost layer, so a toast would swallow the Escape meant to close the picker.
  - Delete counts include links from archived notes (they are unlinked too); the lists hide archived notes (ADR 0016). Unlinking by delete writes no `note.unlinked` event (cascade).
  - The task delete confirmation mentions time blocks and reminders generically. When the dialog hasn't read the links yet, it says "Any linked notes will be kept, only unlinked."
  - Task links in "Linked to" are plain text: tasks have no page of their own.
- **Next chunk should know:**
  - Locators: region "Linked to" (list "Linked goals and tasks", "Unlink <title>", "Link a goal or task" → dialog "Link a goal or task" with searchbox "Search goals and tasks", regions "Goals"/"Tasks", "Link <title>"); goal region "Notes" and task dialog region "Linked notes" (list "Linked notes", "Unlink <title>", "Link a note" → dialog "Link a note" with searchbox "Search notes", "Link <title>"; link "New note"); task dialog "Delete task" → alertdialog `Delete “<title>”?`.
  - 8.4: the archived note view shows no links; search could reuse `LinkTarget`.
  - Escape closes the topmost Radix layer, which can be a toast; close dialogs by their Close button in e2e after an action that toasts.
- **Unverified:** none for the automated checks. `pnpm verify` passes: format, lint (only the 6.1 warning), typecheck, 1089 unit and 778 integration tests. `pnpm build` passes. `pnpm test:e2e`: 94 passed. The first full run had the 3 new tests' journeys exceed 30 s under load and found a test bug (a confirmation's `aria-hidden` let the next checks pass before the delete ran), fixed with `test.slow()` and waiting for the confirmation to close; the note-links spec then passed 12/12 with `--repeat-each 4`. `review-history.spec.ts` failed once in that run ("Reflect" heading not shown) and passed on its own and in the next full run. No schema change, so no migration. No screen-reader or manual dark-mode pass.
- **Follow-ups:**
  - Review priorities: the goal and task delete confirmations (now including the new task delete) still don't say a linked weekly-review priority goes.
  - The archived (read-only) note view doesn't list its links.
  - Flaky under load: `goals.spec.ts` "create with every field, and edit" (PR 71's CI, the "Edit goal" dialog still open after 5 s) and `review-history.spec.ts` (once locally).
  - Earlier follow-ups still open: control characters in titles vs 8.4's `ts_headline` delimiters; Phase 10 export must include notes (JSON, links); the unused `_omitted` in `habits/validation.test.ts`; the 5.5 quiet-hours CHECK null hole; bare-domain autolinks.
