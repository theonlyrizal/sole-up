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
A desired outcome.

Suggested fields:
- `id`
- `user_id`
- `life_area_id` (optional)
- `title`
- `description`
- `reason` or `why_it_matters`
- `status` (e.g. active, paused, completed, archived)
- `priority`
- `start_date` (optional)
- `target_date` (optional)
- `measurement_type` (optional)
- `target_value` and `current_value` only when meaningful for the measurement type
- `created_at`
- `updated_at`
- `completed_at` (optional)

Do not force every goal into a numeric metric. Some goals are qualitative.

### Milestone
A checkpoint within a goal.

Suggested fields:
- `id`
- `user_id`
- `goal_id`
- `title`
- `description` (optional)
- `status`
- `due_date` (optional)
- `completed_at` (optional)
- `sort_order`
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

Fields ([ADR 0004](decisions/0004-task-hierarchy-and-dates.md)):
- `id`
- `user_id`
- `title`
- `notes` (optional)
- `status` (proposed: `open | completed | cancelled`, settled at the Phase 2 decision gate). "Inbox" is derived, not a status.
- `priority` (optional)
- **Parent, at most one:** `goal_id` (optional) or `milestone_id` (optional), enforced by `CHECK (num_nonnulls(goal_id, milestone_id) <= 1)`. Neither set means the task is in the inbox. A task under a milestone reaches its goal through the milestone.
- **Deadline, one shape or none:** `due_date` (local date) **or** `due_at` (UTC instant) + `due_tz` (IANA zone). CHECKs enforce that `due_date` excludes `due_at`, and that `due_at` and `due_tz` are both set or both null.
- `planned_date` (optional local date): when the user intends to do it, separate from the deadline.
- `estimated_minutes` (optional, > 0)
- `completed_at` (optional)
- `cancelled_at` (optional)
- `sort_order`
- `created_at`
- `updated_at`

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
- **Deleting a goal** deletes its milestones and moves all its tasks (direct and via milestones) to the inbox. Tasks are never deleted implicitly.
- **Deleting a milestone** moves its tasks to the inbox.
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

Still open (decided at phase gates in the implementation plan):
1. Time blocks and recurring events (Phase 4).
2. Habit cadence and logging semantics (Phase 6).
3. Supported note links (Phase 8).
4. Backup and log retention (Phase 10 privacy notes).
