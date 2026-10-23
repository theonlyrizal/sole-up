# SoleUp Data Model

**Status:** Conceptual domain model, synced with ADRs 0001–0007 on 2026-10-20. Concrete tables, constraints and indexes are specified per chunk in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); this document keeps the concepts and rules.

**Settled decisions:** [docs/decisions/](decisions/README.md). Keys are UUIDs. Every user-owned table follows the ownership pattern in the implementation plan (`user_id` with cascade from `users`, composite child foreign keys).

## 1. Modeling principles

- Every user-owned record must have explicit ownership.
- Keep current state and meaningful history where history supports review and analytics.
- Use foreign keys and constraints to protect data integrity.
- Do not store the same authoritative fact in multiple places without a clear reason.
- Prefer explicit status fields and timestamps over ambiguous booleans.
- No soft deletion. Archive is a reversible status; delete is a confirmed hard delete (see §6 and [ADR 0006](decisions/0006-deletion.md)).
- Record the source and confidence of AI-related claims.
- Keep private content out of analytics events and logs by default.

## 2. Core entities

### User
Represents the account and identity used for access control.

Implemented in chunk 0.6 as the `users` table owned by Better Auth (`id` uuid, `name`, `email` unique, `email_verified`, `image`, timestamps). Provider identities live in `accounts` (one row per provider, unique on provider and provider account ID), and database sessions in `sessions`. Both cascade when the user is deleted. Time zone, locale and week start live in `user_preferences` (below), not on `users`.

Suggested fields:
- `id`
- `email` or auth-provider subject
- `display_name`
- `timezone` (IANA identifier). Changing it never rewrites stored local dates.
- `locale`
- `created_at`
- `updated_at`
- `week_start` (default Monday)

Do not store passwords directly if using an external authentication provider.

### UserPreference
Stores explicit product preferences.

Implemented in chunk 0.9 as `user_preferences`: one row per user (`user_id` is the primary key, cascading from `users`), created with defaults on first sign-in. Typed columns: `timezone` (IANA name, validated against the server runtime's zone list and stored in its canonical spelling; **null until the user confirms one**, since the browser's zone is only proposed), `locale` (BCP 47, default `en-US`), `week_start` (smallint 0–6, 0 = Sunday, default 1 = Monday, CHECK-constrained), `created_at`, `updated_at`. Changes are audited as `user_preferences.updated` with the changed fields' old and new values. Chunk 0.11 added `life_area_starters` (`accepted` | `dismissed`, null until answered): the answer to the one-time starter life areas offer.

Suggested fields:
- `id`
- `user_id`
- `key` or typed preference fields
- `value`
- `updated_at`

For important settings, prefer typed columns or validated structured data over an unrestricted key/value bag.

### LifeArea
A broad domain of life.

Implemented in chunk 0.11 as `life_areas`: `id`, `user_id` (cascades from `users`), `name` (1–60 chars), `description` (optional, up to 500), `color` (optional key from a fixed palette, presentation only), `sort_order`, `status` (`active` | `archived`), `created_at`, `updated_at`. It has `unique (id, user_id)` for composite child keys. Active names are unique per user, ignoring case (`unique (user_id, lower(name)) where status = 'active'`), so an archived area's name can be reused; restoring that area then fails until one of them is renamed. Audited as `life_area.created`, `.updated` (the names of the changed fields, plus color; never the name or description text), `.reordered`, `.archived` and `.unarchived`. Delete is a hard delete that also removes the area's events. Starter areas (Learning, Career, Health, Relationships, Home, Finance) are offered once to a user with no areas; nothing is created unless the user picks some.

Suggested fields:
- `id`
- `user_id`
- `name`
- `description` (optional)
- `color` or icon key (optional presentation data)
- `sort_order`
- `status`
- `created_at`
- `updated_at`

### Goal
A desired outcome. Rules settled in [ADR 0010](decisions/0010-goal-status-priority-progress.md).

Implemented in chunk 1.1 as the `goals` table (`src/server/db/schema/goals.ts`): CHECKs on status, priority, date order and `completed_at` (set only while `completed`, or `archived` after completing), and `ON DELETE SET NULL (life_area_id)` on the composite area key so `user_id` is never cleared. Audit events: `goal.created`, `goal.updated` (changed field names; values only for area, priority and dates), `goal.status_changed`. Deleting a goal removes its events.

Fields:
- `id`
- `user_id`
- `life_area_id` (optional; composite FK, `SET NULL (life_area_id)` when the area is deleted)
- `title`
- `description` (optional)
- `reason` (optional; "why does this matter?")
- `status`: `active | paused | completed | dropped | archived`, default `active`. `dropped` means priorities changed, not failure.
- `priority` (optional): `low | medium | high`
- `start_date` (optional local `date`)
- `target_date` (optional local `date`; CHECK `target_date >= start_date` when both are set)
- `completed_at` (optional instant; set on entering `completed`, kept when a completed goal is archived, cleared otherwise when leaving `completed` and on restore)
- `status_changed_at`
- `created_at`
- `updated_at`

Status transitions: any to any among `active`, `paused`, `completed` and `dropped`; any of those to `archived`; `archived` only to `active` (restore). Restore does not remember the status before archiving; the audit history does.

Progress is derived, not stored: completed milestones out of non-dropped milestones ("2 of 5 milestones"), and nothing when there are none. Completing every milestone never completes the goal automatically.

Do not force every goal into a numeric metric. Some goals are qualitative. Numeric targets (`measurement_type`, `target_value`, `current_value`) are deferred past v1.

### Milestone
A checkpoint within a goal.

Fields:
- `id`
- `user_id`
- `goal_id` (composite FK; deleted with the goal)
- `title`
- `description` (optional)
- `status`: `open | completed | dropped`, default `open`. Dropped milestones don't count toward progress.
- `due_date` (optional local `date`; not constrained by the goal's dates)
- `completed_at` (optional instant; set on completion, cleared on reopen)
- `sort_order` (dense per goal, 0..n-1, across every status)
- `created_at`
- `updated_at`

### Project (later, not in v1)
A finite body of work intended to produce an outcome.

**Not in v1** ([ADR 0004](decisions/0004-task-hierarchy-and-dates.md)). Add only if dogfooding shows non-goal work needs grouping. Adding it later means a new nullable `project_id` parent on tasks and widening the one-parent CHECK. The fields below are a sketch for that time.

Suggested fields:
- `id`
- `user_id`
- `title`
- `description` (optional)
- `status`
- `priority`
- `goal_id` (optional)
- `start_date` (optional)
- `target_date` (optional)
- `created_at`
- `updated_at`
- `completed_at` (optional)

### Task
An actionable unit of work.

Fields ([ADR 0004](decisions/0004-task-hierarchy-and-dates.md), [ADR 0011](decisions/0011-task-status-planning-priority-estimates.md)):
- `id`
- `user_id`
- `title`
- `notes` (optional)
- `status`: `open | completed | cancelled` (CHECK, default `open`). Any to any; setting the same status again is a no-op. `in_progress` is deferred.
- `priority` (optional): `low | medium | high`, the same scale as goals (CHECK). Not numeric.
- **Parent, at most one:** `goal_id` (optional) or `milestone_id` (optional), enforced by `CHECK (num_nonnulls(goal_id, milestone_id) <= 1)`. A task under a milestone reaches its goal through the milestone.
- **Deadline, one shape or none:** `due_date` (local date) **or** `due_at` (UTC instant) + `due_tz` (IANA zone). CHECKs enforce that `due_date` excludes `due_at`, and that `due_at` and `due_tz` are both set or both null.
- `planned_date` (optional local date): when the user intends to do it, separate from the deadline. Never changed automatically; a past planned date on an open task shows under "Earlier, not done" on Today until the user replans or unplans it.
- `estimated_minutes` (optional): whole minutes, `CHECK (estimated_minutes between 1 and 1440)`. Actual time is not tracked.
- `completed_at` (optional): set exactly while `status = completed` (CHECK).
- `cancelled_at` (optional): set exactly while `status = cancelled` (CHECK).
- `sort_order`
- `created_at`
- `updated_at`

Rules:
- **Inbox** is derived, not a status: open tasks with no parent and no `planned_date`. A due date alone doesn't take a task out of the inbox.
- **Today's sections** are derived on read from the user's local today and the current instant, never stored. Each open task shows in one section, the first that applies: Planned for today (`planned_date` is today), Needs a decision (`due_date` before today or `due_at` before now), Due today (`due_date` today or `due_at` later today), Earlier, not done (`planned_date` before today). See `todaySection` in `src/lib/today.ts`.
- **Upcoming** is derived on read too: open tasks planned for, or due on, tomorrow through today + 7 days by default ("Within a Week"; or + 14, or + 30), grouped by the user's local date. A timed deadline falls on the local day of `due_at` in the user's zone, whatever its `due_tz`. A task planned for one day and due on another shows on both; on the same day it shows once. See `groupUpcomingTasks` in `src/lib/upcoming.ts`.
- **A goal's next action** is derived on read: its open task (direct or under any milestone) with the earliest planned date or deadline day in the user's zone, passed ones included; ties by deadline, then position. With no dated open task the goal has none, and its page prompts for one. Task status never changes a milestone, the goal or its progress (ADR 0010). See `nextActionOf` in `src/lib/goal-tasks.ts`.
- Completing or cancelling a task never changes its milestone or goal; goal progress stays milestone-based ([ADR 0010](decisions/0010-goal-status-priority-progress.md)).
- `unique (id, user_id)`, so later tables (reminders, note links) can reference tasks with composite keys.
- Deleting a task is a confirmed hard delete that removes its audit events in the same transaction; there is no `task.deleted` event ([ADR 0005](decisions/0005-history-and-audit-log.md)).

No `project_id` in v1. Avoid duplicating goal metadata onto each task.

### TaskDependency (later if needed)
Represents a task that must precede another task.

Suggested fields:
- `id`
- `user_id`
- `task_id`
- `depends_on_task_id`
- `created_at`

Prevent self-dependencies and cycles at the domain layer if dependency graphs are introduced.

### Habit
A recurring behavior the user wants to track.

Suggested fields:
- `id`
- `user_id`
- `title`
- `description` (optional)
- `cadence_type`
- `cadence_config` (validated structure for days/frequency)
- `start_date`
- `end_date` (optional)
- `status` (active, paused, archived)
- `goal_id` (optional)
- `created_at`
- `updated_at`

Define cadence semantics before implementing analytics. For example, “three times per week” needs a different denominator from “every day.”

### HabitLog
A dated record of a habit occurrence.

Suggested fields:
- `id`
- `user_id`
- `habit_id`
- `local_date`
- `status` (completed, skipped, missed only if the user explicitly records or the system can validly determine it)
- `value` (optional for quantity-based habits)
- `note` (optional)
- `created_at`
- `updated_at`

Use a uniqueness constraint appropriate to the habit's cadence and logging model. Do not automatically treat an unlogged day as a failure without defining that behavior.

### CalendarEvent
A time commitment or event managed by SoleUp.

Suggested fields:
- `id`
- `user_id`
- `title`
- `description` (optional)
- `start_at`
- `end_at`
- `timezone` or enough information to render in the user's selected zone
- `all_day`
- `source` (internal or integration identifier)
- `external_id` (optional)
- `created_at`
- `updated_at`

External calendar synchronization is out of MVP unless explicitly prioritized. If added, model sync status and conflict handling.

### TimeBlock (decided at the Phase 4 gate)
A planned allocation of time to a task or focus area. Whether it is in v1 is decided at the Phase 4 decision gate (recommended: deferred). It never links to a project in v1.

Suggested fields:
- `id`
- `user_id`
- `title`
- `start_at`
- `end_at`
- `task_id` (optional)
- `status`
- `created_at`
- `updated_at`

Do not treat a planned block as proof that work actually happened.

### Note
A piece of personal information the user wants to keep.

Suggested fields:
- `id`
- `user_id`
- `title`
- `body`
- `created_at`
- `updated_at`
- `archived_at` (optional)

If notes can link to multiple entity types, use an explicit linking table rather than arbitrary unvalidated references.

### NoteLink (optional)
Links a note to a goal, task, or other supported entity. Supported targets are decided at the Phase 8 decision gate.

Suggested fields:
- `id`
- `user_id`
- `note_id`
- `entity_type`
- `entity_id`
- `created_at`

Validate that the referenced entity exists and belongs to the same user. Consider a more strongly typed design if cross-entity links become important.

### AuditEvent
A record of a meaningful change, used for history and analytics. Replaces the earlier activity-event concept ([ADR 0005](decisions/0005-history-and-audit-log.md)). State tables remain the source of truth; audit events describe how they changed.

Fields:
- `id`
- `user_id`
- `event_type` (from an allowlist)
- `entity_type`
- `entity_id`
- `occurred_at`
- `changes`: JSON with old and new values of **structured fields only** (status, dates, parent IDs, priority, ordering)

Rules:
- Written in the **same transaction** as the change it records.
- **No user content:** never titles, descriptions, note bodies, reasons, or reflections.
- When an entity is hard-deleted, its events are deleted in the same transaction. There is no foreign key to cascade them, so this is explicit and tested.
- Account deletion removes all of the user's events.

### WeeklyReview
A saved reflection for a period.

Suggested fields:
- `id`
- `user_id`
- `period_start`
- `period_end`
- `wins` (structured or text)
- `blockers` (structured or text)
- `lessons` (optional)
- `next_period_priorities` (structured or linked records)
- `created_at`
- `updated_at`

A review should preserve what the user chose to record. Generated draft text should be distinguishable from user-edited final content if both are retained.

## 3. Later intelligence and memory entities

Do not implement these all in the MVP. Add them only with a clear user benefit and memory policy.

### PersonalMemory
A user-visible memory item that may help personalize future assistance.

Suggested fields:
- `id`
- `user_id`
- `memory_type` (explicit_fact, preference, observation, hypothesis, goal_context, other)
- `content`
- `source_type` (user_stated, activity_derived, user_confirmed, imported)
- `source_reference` (optional reference to a specific record or event)
- `confidence` (optional, defined semantics)
- `valid_from` (optional)
- `valid_until` (optional)
- `status` (proposed, active, superseded, rejected, deleted)
- `last_confirmed_at` (optional)
- `created_at`
- `updated_at`

Sensitive information requires additional safeguards and may be excluded entirely. Keep a distinction between what the user said and what the system inferred.

### MemoryFeedback (later)
Records that a user confirmed, corrected, rejected, or superseded a memory.

Suggested fields:
- `id`
- `user_id`
- `memory_id`
- `feedback_type`
- `correction` (optional)
- `created_at`

### AIReviewRun (later)
Tracks an AI-assisted review without retaining unnecessary prompt or response payloads.

Suggested fields:
- `id`
- `user_id`
- `review_type`
- `period_start`
- `period_end`
- `provider`
- `model`
- `status`
- `context_record_ids` or a safe context manifest
- `created_at`
- `completed_at`
- `error_code` (non-sensitive)

Store generated outputs only when there is a product reason and the user understands the retention behavior.

## 4. Relationships overview

```text
User
 ├── LifeAreas
 ├── Goals ── Milestones ── Tasks
 │    ├── Tasks
 │    └── Habits
 ├── Tasks (inbox: no parent)
 ├── Habits ── HabitLogs
 ├── CalendarEvents
 ├── Notes ── NoteLinks
 ├── AuditEvents
 ├── WeeklyReviews
 └── PersonalMemories (later)
```

The diagram is conceptual. A task has at most one parent: a milestone, a goal, or none (inbox). Projects (later) and TimeBlocks (Phase 4 gate) are not shown.

## 5. Data integrity and indexes

Likely constraints and indexes:
- Foreign keys for all ordinary relationships.
- Index user-owned records by `user_id` and common sort/filter fields.
- Index tasks by `(user_id, status, planned_date)`, `(user_id, status, due_date)` and `(user_id, status, due_at)` where query patterns justify it.
- Index habit logs by `(user_id, habit_id, local_date)`.
- Index events by `(user_id, start_at)`.
- Add unique constraints for external IDs within the correct integration/account scope.
- Ensure a goal's milestone belongs to the same user as the goal.
- Ensure linked records cannot cross user ownership boundaries: child foreign keys are composite, e.g. `(goal_id, user_id) references goals(id, user_id)`.
- Optional parent links use `ON DELETE SET NULL (column)` (PostgreSQL 15+), so `user_id` is never nulled.
- Use transactions when multiple records must change together.

Exact indexes should follow real query patterns and query plans, not be added indiscriminately.

## 6. Deletion, export, and retention

### Deletion rules ([ADR 0006](decisions/0006-deletion.md))
- **Archive** is a reversible status. Archived records are hidden by default and can be restored.
- **Delete** is a hard delete behind a clear confirmation. No soft deletion.
- **Deleting a goal** deletes its milestones and takes all its tasks (direct and via milestones) off it, recording a `task.moved` event for each (chunk 2.7). Open tasks with no planned date land in the inbox; planned ones keep their date and closed ones their status, all without a parent. The confirmation states each count. Tasks are never deleted implicitly.
- **Deleting a milestone** takes its tasks off it the same way, with a `task.moved` event each (to no parent, not to the goal).
- **Deleting the account** cascades every user-owned row from `users` in one transaction, and revokes sessions and push subscriptions.
- Every hard delete also removes the entity's audit events in the same transaction.

### Still to define before inviting other users
- What account deletion removes immediately.
- What must be removed from derived records and AI memories.
- How backups expire and how deletion propagates to backups.
- Whether users can export their records in a portable format.
- How external integrations are disconnected.
- What operational logs are retained and for how long.
- Whether any third-party AI provider retains submitted content and under what terms.

Do not promise complete deletion from backups or third-party providers unless the implementation and provider contract support that promise.

## 7. Schema decisions to resolve before migrations

Settled:
1. Authentication and user ID source: Better Auth; our own UUID user IDs ([ADR 0002](decisions/0002-auth.md)).
2. Task deadlines: date **or** instant + zone, plus an optional planned date ([ADR 0004](decisions/0004-task-hierarchy-and-dates.md)).
3. Calendar events are in the MVP ([ADR 0007](decisions/0007-platform-and-push.md)).
4. History: audit events in the same transaction, content-free, allowlisted types ([ADR 0005](decisions/0005-history-and-audit-log.md)).
5. Account deletion: cascading hard delete ([ADR 0006](decisions/0006-deletion.md)).
6. ORM and migrations: Drizzle and drizzle-kit ([ADR 0001](decisions/0001-stack.md)).
7. Goal statuses, priority, progress and dates; numeric targets deferred ([ADR 0010](decisions/0010-goal-status-priority-progress.md)).
8. Task statuses, derived inbox, overdue planned tasks, priority and estimates ([ADR 0011](decisions/0011-task-status-planning-priority-estimates.md)).

Still open (decided at phase gates in the implementation plan):
1. Time blocks and recurring events (Phase 4).
2. Habit cadence and logging semantics (Phase 6).
3. Supported note links (Phase 8).
4. Backup and log retention (Phase 10 privacy notes).
