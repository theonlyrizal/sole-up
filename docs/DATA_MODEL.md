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

Implemented in chunk 0.9 as `user_preferences`: one row per user (`user_id` is the primary key, cascading from `users`), created with defaults on first sign-in. Typed columns: `timezone` (IANA name, validated against the server runtime's zone list and stored in its canonical spelling; **null until the user confirms one**, since the browser's zone is only proposed), `locale` (BCP 47, default `en-US`), `week_start` (smallint 0–6, 0 = Sunday, default 1 = Monday, CHECK-constrained), `created_at`, `updated_at`. Changes are audited as `user_preferences.updated` with the changed fields' old and new values. Chunk 0.11 added `life_area_starters` (`accepted` | `dismissed`, null until answered): the answer to the one-time starter life areas offer. Chunk 5.4 added `daily_nudge_time` (local `HH:MM` in `timezone`, CHECKed; null = off): the daily planning nudge (see Reminder). Changing the zone moves the nudge's scheduled reminder (and, since chunk 7.5, the weekly review's) and nothing else. Chunk 5.5 added the delivery settings the sweep reads (Settings UI in 5.6): `reminders_enabled` (default true; while off, due reminders are skipped as `disabled`), `reminders_private` (default false; notifications carry the time but no title), and `quiet_hours_start`/`quiet_hours_end` (local `HH:MM`, both null while off, CHECKed to be both set and different; the end may be earlier than the start, crossing midnight). Chunk 5.6 added Settings' "Reminders" form, which saves these four and `daily_nudge_time` together (`saveReminderSettings`, one `user_preferences.updated` event naming the changed settings' old and new values). Changing quiet hours clears `held_until` on the user's scheduled reminders, so the next sweep sends them or holds them for the new hours. Since chunk 5.7 changing `timezone` clears it too, since quiet hours are evaluated in the current zone. Chunk 7.5 added `weekly_review_day` (smallint 0–6, 0 = Sunday) and `weekly_review_time` (local `HH:MM`), both null while the weekly review reminder is off and CHECKed to be both set or both null ([ADR 0015](decisions/0015-weekly-review-period-structure-lock.md)). The Reminders form saves them with the others; changing either, or the zone, moves the weekly review's scheduled reminder.

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
- `reminder_offset_minutes` (optional): `0 | 10 | 30 | 60 | 1440` (CHECK), minutes before `due_at` to remind; none by default ([ADR 0013](decisions/0013-reminders-sweep-and-delivery.md)). It reminds only while the task is open with a timed deadline still to come. Set with `setTaskReminder` (`task.reminder_changed`) or on create.
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
A recurring behavior the user wants to track. Rules: [ADR 0014](decisions/0014-habit-cadence-logs-consistency.md).

Fields:
- `id`
- `user_id`
- `title`
- `description` (optional)
- `measure` (`check | quantity`), fixed at creation
- `unit` (set exactly when `measure` is `quantity`, such as "glasses" or "km"), fixed at creation
- `start_date` (local date)
- `end_date` (optional local date, inclusive, not before `start_date`)
- `status` (`active | paused | archived`)
- `status_changed_at`
- `goal_id` (optional; composite FK, `ON DELETE SET NULL (goal_id)`)
- `created_at`
- `updated_at`

Rules:
- Cadence and target are not on the habit. They live in versioned HabitSchedule rows, so editing them never rewrites past weeks.
- Pausing opens a HabitPause from today (from tomorrow if today is already logged), and resuming closes it today. Archiving opens one if none is open, so archived days count like paused ones. Restore always returns to `active`.
- `unique (id, user_id)`. Deleting a habit is a confirmed hard delete: schedules, pauses and logs cascade, and its audit events are removed in the same transaction.
- Audit events are on the habit: `habit.created|updated|status_changed|schedule_changed|logged|log_changed|log_removed`. They never hold the title, description, unit, note, or a target or value number (amounts can be health data).

### HabitSchedule
The cadence and target in effect from a given week.

Fields:
- `id`
- `user_id`
- `habit_id` (composite FK, cascade)
- `effective_from` (local date: the start of the user week the edit was made in)
- `cadence_type` (`daily | weekly_days | times_per_week`)
- `cadence_config` (jsonb, validated per type: `{}`; `{ "days": [...] }` with 1–6 distinct weekdays, 0 = Sunday … 6 = Saturday; `{ "timesPerWeek": N }` with N 1–6)
- `target` (quantity habits only: above 0, at most 2 decimals, up to 99,999.99; the amount per expected day)
- `created_at`
- `updated_at`

Rules:
- `unique (habit_id, effective_from)`. A habit always has at least one row. A second edit in the same week replaces that week's row. An edit also replaces any row that starts after the current week (a habit whose start date is in a later week, or weeks regrouped by a week-start change), so the edit is what the current week uses.
- **The schedule for a week** is the row with the latest `effective_from` on or before the week's last day, or the earliest row if none is. Every day in a week uses its week's schedule.

### HabitPause
A span of days a habit was paused or archived.

Fields:
- `id`
- `user_id`
- `habit_id` (composite FK, cascade)
- `start_date` (the first paused day)
- `end_date` (optional, exclusive: the first active day again; null while ongoing)
- `created_at`

Rules: CHECK `end_date > start_date`, at most one open pause per habit (partial unique index), and no overlaps (service). A pause that would be empty is deleted instead.

### HabitLog
What the user recorded for a habit on one local date.

Fields:
- `id`
- `user_id`
- `habit_id` (composite FK, cascade)
- `local_date`
- `status` (`completed | skipped`)
- `value` (required on a completed log of a quantity habit, above 0 with the target's bounds; null on a skip and for check habits)
- `note` (optional; never logged or put in an audit event)
- `created_at`
- `updated_at`

Rules:
- `unique (habit_id, local_date)`: at most one log per habit per day. Logs are accepted only on active days on or before today.
- **"Missed" is never stored.** It is derived for display only: a past counted day (`daily`/`weekly_days`) with no log, labelled "Missed" in neutral styling. `times_per_week` has no per-day Missed.
- A completed log on a non-scheduled weekday of a `weekly_days` habit is an "extra": shown, never counted.
- Logs on days that later become inactive are kept and shown, never counted.
- Writes (chunk 6.4) are "set" (create or correct) and "clear", with the habit row locked so two writes to one day can't race. Setting the same log again, or clearing a day with no log, changes nothing and records nothing. Clearing works on any day, so a log kept on a day that no longer counts can still be removed.
- Every write records `habit.logged`, `habit.log_changed` or `habit.log_removed` on the habit: the local date, the status from and to, and the fields by name (`value` never as a number, the note never).
- Undo restores the day's log as it was before the write: it deletes a new log, and puts back the previous status and value after a correction.

**Consistency** is computed on read by the pure engine in `src/lib/habits/` (chunk 6.2), never stored. The exact definitions are in ADR 0014. In short:
- **Daily or weekly days:** completed credit out of counted days over whole user weeks.
- **Credit:** 1 for a check, `min(value ÷ target, 1)` for a quantity.
- **Today** counts only once logged, and skips leave the denominator.
- **N times a week:**
  - a partial week expects N × active days ÷ 7, rounded
  - each skip lowers the week's target by one
  - completions are capped at the target
  - the current week counts only what's done
- **Shown as** a count ("12 of 14 days · 2 skipped"), never a percentage or a total across habits.

### CalendarEvent
A time commitment or event managed by SoleUp. Rules: [ADR 0012](decisions/0012-calendar-recurrence-time-blocks-views.md).

Fields:
- `id`
- `user_id`
- `title`
- `description` (optional)
- `location` (optional)
- `all_day`
- **Timed shape:** `start_at`, `end_at` (UTC instants) and `tz` (the IANA zone it was created in). May span midnight or several days.
- **All-day shape:** `start_date`, `end_date` (`date`, end **exclusive**). No instants and no zone, so a time-zone change never moves them. The UI shows an inclusive end.
- `rrule` (optional): the `RRULE` value of a repeating series, limited to the repeat builder's subset (ADR 0012). A series row's times are its first occurrence's. `UNTIL` is a local date (`UNTIL=20261220`): the last day, inclusive, on which an occurrence may start, in the series' zone.
- `goal_id` (optional)
- `life_area_id` (optional; its resource lane. Choosing a goal pre-fills the goal's area.)
- `reminder_offset_minutes` (optional): `0 | 10 | 30 | 60 | 1440` (CHECK), minutes before the start; the form pre-fills 10 for new events, and the service stores what it's given (absent on create = none, absent on an edit = unchanged). A series' setting applies to every occurrence and changes only with "following" or "all"; "this event" refuses it. All-day events never remind (ADR 0013).
- `source` (`internal` by default; reserved for future integrations)
- `external_id` (optional, null in v1)
- `created_at`
- `updated_at`

Constraints: CHECKs enforce exactly one shape and that the end comes after the start. `goal_id` and `life_area_id` are composite FKs with `ON DELETE SET NULL (column)`. `unique (id, user_id)`.

Occurrences of a series are expanded at query time (`src/lib/recurrence.ts`, `rrule-temporal`), never stored. Timed occurrences keep the series' local wall-clock time in `tz` across DST and last the series' elapsed duration. A wall-clock time skipped by a spring-forward gap moves forward by the gap ("compatible", ADR 0008) rather than being dropped. The series start is always the first occurrence and counts toward `COUNT`. `eventsBetween` returns each occurrence with its series' ID, its original start (the key scoped edits and deletes use) and whether an exception changed it.

A series row is changed only through a scope (`editCalendarEventOccurrence`, `deleteCalendarEventOccurrence`); a plain update refuses it. A one-off becomes a series by setting `rrule`.

External calendar synchronization is out of MVP unless explicitly prioritized. If added, model sync status and conflict handling.

### CalendarEventException
One occurrence of a repeating event that differs from its rule ("this event" edits and deletes).

Fields:
- `id`
- `user_id`
- `event_id` (composite FK, cascade)
- `original_start_at` or `original_start_date`: the occurrence's start as the rule generated it, matching the series' shape. Unique per event.
- `kind` (`cancelled | modified`)
- Snapshot fields, for `modified`: start/end in the series' shape, `title`, `description`, `location`, `goal_id` (composite FK, `SET NULL (goal_id)`), `life_area_id` (composite FK, `SET NULL (life_area_id)`). A `cancelled` exception sets none of them.
- `created_at`
- `updated_at`

A modified exception is a **full snapshot** of its occurrence, not a set of overrides: a null description or goal means "none", never "as the series". CHECKs keep a cancelled exception empty and a modified one's times in the original start's shape.

Scopes (in one transaction each):
- **This event:** upserts a modified exception (same shape and zone as the series), or a cancelled one for a delete.
- **All events:** applies only the fields the user changed from what the occurrence showed. Changed times move the whole series by the same number of days, at the new time of day, zone and length. Deleting removes the series, its exceptions and their audit events.
- **This and following:** ends the old series with `UNTIL` the day before and inserts a new series from the occurrence, computed as for "all events". Keeping a rule that ends after a count keeps the count left. From the first occurrence it is "all events". Deleting ends the series and removes the later exceptions.

Exceptions follow the series change: each moves to the occurrence the same number of days later, and is dropped (and reported back to the caller) when the new rule generates none that day. A modified exception's field that equalled the old series takes the new series' value, and times equal to the old generated ones follow the new ones; times it moved are kept, unless the series switched between timed and all-day. When the repeat stops (`rrule` null), the first occurrence's changes fold into the event and every other exception is dropped. Exceptions the old rule no longer generated are removed silently.

### TimeBlock
A planned slot of time for one task. Rules: ADR 0012. It never links to a project in v1.

Fields:
- `id`
- `user_id`
- `task_id` (required, composite FK, `ON DELETE CASCADE`). A block shows its task's title and has none of its own.
- `start_at`, `end_at` (UTC) and `tz`. Timed only, at most 24 hours.
- `rrule` (optional): blocks repeat with the same builder and scopes as events.
- `status` (`scheduled | done | skipped`, default `scheduled`): the status of a one-off block. Each occurrence of a repeating block has its status in an exception.
- `created_at`
- `updated_at`

Rules:
- Only the user sets the status, except for one rule: completing the task marks `done` its started one-off blocks that are still `scheduled`, and only today's started, still-`scheduled` occurrences of a repeating block.
  - Skipped and future blocks are never changed, and reopening or cancelling the task changes nothing.
  - Marking a block `done` never completes the task.
  - A past `scheduled` block reads "Not marked".
- The resource lane is derived: the task's goal's life area (direct goal, or the milestone's goal), otherwise "No area".
- A new block (chunk 4.8) lasts the task's estimate, else 60 minutes, and is in the user's zone. Moving or resizing a block, by dragging or in its dialog, keeps the block's own zone; dragging an occurrence of a repeating weekly or monthly block with "this and following" or "all" moves the rule's day with it, as the form does.
- **Today and Home** (chunk 4.9) read blocks with events, derived on read. Today's timeline lists every block overlapping today, whatever its status. Home's next commitment is the earliest-starting event or block that hasn't ended at the moment of reading; blocks marked `done` or `skipped`, and blocks whose task is completed or cancelled, are not commitments. All-day events run from their first day's local midnight to their end date's in the user's zone. See `nextCommitmentOf` in `src/lib/schedule.ts`.

### TimeBlockException
One occurrence of a repeating block that differs from its rule.

Fields:
- `id`
- `user_id`
- `block_id` (composite FK, cascade)
- `original_start_at` (unique per block)
- `kind` (`cancelled | modified`)
- `start_at`, `end_at`, `status` (`scheduled | done | skipped`): a `modified` exception holds all three, the occurrence's full values (a snapshot, as for event exceptions); a `cancelled` one holds none.
- `created_at`
- `updated_at`

Rules:
- Marking an occurrence writes a modified exception at its current times. Scoped changes carry exceptions over as for events, and they keep their status.
- Stopping a repeat folds the first occurrence's times and status into the block; making a one-off repeat moves its status to its first occurrence. A series row's own `status` stays `scheduled` (CHECK).
- Auto-mark uses the user's confirmed time zone for "the local day of completion", or the series' zone while none is confirmed. Its audit events carry `automatic: true`.

Do not treat a planned block as proof that work actually happened.

### PushSubscription
One browser subscribed to Web Push (chunk 5.3). Written only through `src/server/modules/push/service.ts`.

Fields:
- `id`
- `user_id` (cascade)
- `endpoint` (unique across all users: it identifies one browser; `https://` on a known push service only)
- `p256dh`, `auth` (the browser's key and auth secret, base64url; CHECKed lengths)
- `user_agent_label` ("Chrome on Android", derived from the user agent; the raw string is never stored)
- `created_at`
- `last_success_at?` (the last push the push service accepted)
- `failed_count` (failures since the last success)

Rules:
- The endpoint and both keys are secrets: never logged, never sent to the client. Settings matches "this device" by a SHA-256 hash of the endpoint.
- Subscribing an endpoint another user holds moves the row to the new user and starts it over (a shared computer delivers to whoever subscribed it last).
- A `404`/`410` from the push service deletes the row. Revoking from Settings deletes it too; the browser keeps its subscription but nothing is sent to it.
- At most 20 per user (a soft cap). No audit events: a device registration, like a session, not a change to the user's plans.

### Reminder
One delivery of a reminder (chunk 5.4, [ADR 0013](decisions/0013-reminders-sweep-and-delivery.md)): the schedule and the record. The setting lives on the item (`reminder_offset_minutes`) or the user's preferences (`daily_nudge_time`, `weekly_review_day` + `weekly_review_time`). Written only through `src/server/modules/reminders/`.

Fields:
- `id`
- `user_id` (cascade)
- `kind` (`task_deadline | event | daily_nudge | weekly_review`) with exactly its own link (CHECK): `task_id` (composite FK, cascade) for a deadline, `event_id` (composite FK, cascade) for an event, neither for the nudge or the weekly review (chunk 7.5, ADR 0015)
- `target_at`: the deadline, the occurrence's actual start, or the nudge's or weekly review's local time as an instant
- `occurrence_start` (optional): a repeating event occurrence's original start (ADR 0012's key); only on `event` rows
- `fire_at` (UTC): `target_at` minus the offset (CHECK `fire_at <= target_at`)
- `status` (`scheduled | sending | sent | skipped | failed`), `skip_reason` (`stale | disabled | no_device`, set exactly while `skipped`), `attempts`, `last_error_code` (optional), `claimed_at` (optional), `sent_at` (set exactly while `sent`)
- `snoozed` (default false): a snoozed delivery (chunk 5.6, see Rules)
- `held_until` (optional): set when a sweep held the row for quiet hours (5.5), to the end of those quiet hours; the claim leaves the row until then, and moving the row clears it
- `created_at`, `updated_at`

Indexes: a partial unique index on `(coalesce(task_id, event_id, user_id), kind)` where `status = 'scheduled' and not snoozed` (one scheduled row per task, per event, and per user for each of the nudge and the weekly review; `kind` was added in chunk 7.5), `(status, fire_at)` for the sweep, and `task_id`, `event_id`, `user_id`.

Rules:
- **Scheduling is in the item's transaction.** Each change recomputes the item's one scheduled row and inserts, moves (resetting `attempts`) or deletes it:
  - **Tasks:** create, a status change, a deadline change and `setTaskReminder`. Completing, cancelling, a date-only or cleared deadline, or no offset delete it; reopening restores it.
  - **Events:** create, edit (one-off, and every scope of a series) and delete. A series has one **rolling** row for its next occurrence that starts after now: cancelled occurrences are skipped, a moved one fires from its new start (`target_at`) and keeps its original start (`occurrence_start`). The search expands up to eight 366-day windows.
  - **Nudge:** the next local occurrence of `daily_nudge_time` in the user's zone, firing at that time. Setting the time and changing the zone recompute it; no confirmed zone or no time removes it.
  - **Weekly review** (chunk 7.5): the next local `weekly_review_time` on `weekly_review_day` in the user's zone (searching two weeks ahead), firing at that time, as the nudge does. Changing the day, the time or the zone recomputes it; no confirmed zone or no day removes it. It isn't suppressed when that week's review is finished.
- A target already past gets no row. A target already reminded about (a non-scheduled, non-snoozed row with the same `target_at` and `occurrence_start`) isn't scheduled again, so an edit after a reminder went out doesn't repeat it, and the series' row rolls on past it.
- **Claiming:** `claimDueReminders(now, horizon = 15)` moves `scheduled` rows with `fire_at < now + 15 min` to `sending` and stamps `claimed_at`, at most 200 per sweep, oldest first, under `FOR UPDATE SKIP LOCKED`, so overlapping sweeps never claim the same row. A row held for quiet hours waits until `held_until`, and a row still `sending` 10 minutes after its claim (a cut-off sweep) is claimed again: a duplicate is accepted, a lost reminder is not.
- **Delivery** (chunk 5.5, `sweep.ts` and `record.ts`): per user, in order, a claimed row is skipped as `stale` (the deadline passed, the task isn't open or its deadline moved, the occurrence started, the nudge's or weekly review's local day ended), skipped as `disabled` (reminders off), skipped as `no_device` (no subscription), or **held** inside quiet hours (back to `scheduled` with `held_until`, not counted as an attempt). Otherwise it is sent with `web-push` to every subscription, and one device receiving it makes it `sent`. A 404/410 deletes that subscription (every device gone: `no_device`). Other errors count an attempt and leave the row `scheduled` with `last_error_code` for the next sweep; the third failed attempt is `failed`. The first sweep after quiet hours sends the held rows still useful, two or more as one "N reminders from quiet hours" notification. The push TTL runs until the row would go stale (at least 60 s). Each outcome is recorded in its own transaction, guarded by this sweep's claim; once a row is sent, skipped or failed, the same transaction schedules a series' next occurrence, tomorrow's nudge or next week's weekly review. A held or retried row whose item gained a newer scheduled row during the sweep is skipped as `stale`.
- **Payloads** never carry a description, location or note, and are never logged: "Due 17:00 · Title", "Title · 14:00 (in 10 min)", or in private mode "You have a reminder · 14:00" with no title; the nudge is "Time to plan your day" and the weekly review "Time for your weekly review", in either mode. Links hold IDs only: the item's dialog on the Day view (`?item=`), Today for the nudge and a bundle, or `/review` for the weekly review.
- **Snooze** (chunk 5.6, `snooze.ts`): a task or event reminder that went out (`sent`, or `sending` while it goes out) can be snoozed for 15 minutes or an hour, from the notification's actions (`POST /api/reminders/<id>/snooze`, session and same origin required) or the item's dialog. It inserts a new `scheduled` row with `snoozed = true` for the same `target_at` and `occurrence_start`, firing then or at the target, whichever is first; an earlier snoozed row for that target is replaced. It sits outside the one-scheduled index, so a series' rolling row is untouched, and the sweep treats it like any other row (stale once the target passes or the task isn't open, skipped while reminders are off). The nudge, the weekly review, a reminder not yet sent and a target already past can't be snoozed. Snoozed rows aren't counted as "already reminded about".
- **Catching up** (chunk 5.7): after missed sweeps, rolling a series or the nudge past a stale row can write a row that is already due. The sweep claims a second time, leaving the rows it already handled (so a failed send still waits for the next sweep), and sends those too; not when the first claim filled its batch.
- **DST** (chunk 5.7): targets are instants from local times with the "compatible" rule (a skipped time moves forward by the gap, a repeated one is the first). Offsets are minutes, so "1 day before" is 24 hours, an hour off the wall clock across a transition. A quiet-hours end that a spring-forward gap skips ends when the clock jumps past it; in a fall-back overlap the end is its first occurrence, so the repeated hour after it isn't quiet.
- Deleting the item deletes its rows, the record included (cascade). No audit events: rows are a delivery log, not a change to the user's plans; the offset changes are audited on the item.

### ReminderSweepStatus

Implemented in chunk 5.7 as `reminder_sweep_status`: one row for the whole app (`id` smallint, always 1 by CHECK), `last_sweep_at` (timestamptz, the `now` of the latest finished sweep; an overlapping earlier sweep never moves it back). No user data, so no `user_id`. Settings → Reminders warns when it is null or more than 60 minutes old (`isSweepOverdue`), so a stopped cron-job.org job is noticed.

### Note
A piece of personal information the user wants to keep, written in a rich-text editor ([ADR 0016](decisions/0016-notes-rich-text-links-search-tags.md)). Built in chunk 8.1 as `notes` (migration 0018), with `unique (id, user_id)` and an index on `(user_id, updated_at)`.

Fields:
- `id`
- `user_id`
- `title` (optional; trimmed, empty → null, up to 200 characters; shown as "Untitled" when null)
- `body` (`jsonb`, required): the editor's (TipTap/ProseMirror) JSON document, the source of truth. Never HTML.
- `body_text` (text, required): plain text the server derives from `body` (each paragraph, heading and code block on its own line, hard breaks as line breaks, blank lines left out, control characters other than tab and newline removed), up to 100,000 characters (a CHECK). The client never sends it.
- `search_vector` (generated, stored `tsvector`): title weighted A, `body_text` weighted B, `english` configuration, with a GIN index
- `archived_at` (optional)
- `created_at`
- `updated_at` (moves on title and body changes only, not on links or tags)

Rules:
- **The body is validated server-side** against one allowlist shared with the editor (`src/lib/notes/`): paragraphs, headings 1–3, bullet and ordered lists, blockquotes, code blocks, horizontal rules, hard breaks; bold, italic, strike, inline code and links (`http:`, `https:`, `mailto:` only). No images, tables, task lists or raw HTML. Unknown types or attributes, nesting deeper than 20 levels, or more than 512 KB of JSON are refused, never silently fixed.
- Rendered as React elements through the same allowlist, never as an HTML string.
- A note row is created on the first save with a title or non-empty `body_text`. Saves carry the `updated_at` they started from, and a stale one that changes the title or body is refused as a conflict (a save that changes nothing is a no-op, stale or not). `updated_at` always moves forward on a change, so an older token can't match again.
- An archived note refuses saves and link changes (and, from 8.5, tag changes) until restored.
- **Archive** hides a note from the Notes list, search and the linked-note lists, and makes it read-only until restored. **Delete** is a confirmed hard delete that removes its links and tags.
- Audit events are on the note: `note.created|updated|archived|restored|linked|unlinked|tags_changed`. `note.updated` holds changed field names only and is skipped within 10 minutes of the note's previous one. Never the title, body, `body_text` or a tag name.
- Search covers notes that are not archived, plus goal and task titles through expression GIN indexes on `to_tsvector('english', title)` (chunk 8.4). Search terms are never put in a URL or logged.

### NoteGoal and NoteTask
Link a note to goals and tasks ([ADR 0016](decisions/0016-notes-rich-text-links-search-tags.md)). Typed join tables, not a polymorphic `entity_type`/`entity_id`, so the database enforces existence and ownership. Built in chunk 8.1 as `note_goals` and `note_tasks`.

Fields:
- `id`
- `user_id`
- `note_id`
- `goal_id` (`note_goals`) or `task_id` (`note_tasks`)
- `created_at`

Rules:
- Composite FKs `(note_id, user_id) → notes`, and `(goal_id, user_id) → goals` or `(task_id, user_id) → tasks`, all `ON DELETE CASCADE`.
- Unique `(note_id, goal_id)` / `(note_id, task_id)`, plus an index on the target column.
- A note has at most 50 links in all. Any of the user's goals and tasks can be linked, whatever its status. Linking an already linked target, or unlinking one that isn't linked, is a no-op with no event. Links don't move the note's `updated_at`.
- A new note can be linked by its first save (`linkTo`, chunk 8.3: "New note" from a goal or task), in the same transaction as the insert, with its own `note.linked` event. A target that is gone or someone else's is skipped and the note is still created.
- Deleting a goal or task removes the link (no `note.unlinked` event) and keeps the note. Other targets (habits, life areas, events, reviews) are not linkable in v1. Each would be another join table.

### Tag and NoteTag
Labels for notes only ([ADR 0016](decisions/0016-notes-rich-text-links-search-tags.md)). Planned for chunk 8.5 as `tags` and `note_tags`.

`tags` fields:
- `id`
- `user_id`
- `name` (trimmed, 1–40 characters; `unique (user_id, lower(name))`)
- `created_at`
- `updated_at`

`note_tags` fields:
- `user_id`
- `note_id`
- `tag_id`
- `created_at`

Rules:
- `tags` has `unique (id, user_id)`. `note_tags` has composite FKs to the note and the tag, both `ON DELETE CASCADE`, unique `(note_id, tag_id)` and an index on `tag_id`.
- A note has at most 20 tags. Tags are created inline while tagging (a name matches an existing tag ignoring case), renamed (a taken name is a conflict) and deleted (only untags its notes). An unused tag stays until deleted.
- Audit events: `tag.created`, `tag.renamed` on the tag, `note.tags_changed` (tag IDs from and to) on the note. Never a tag name.

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
A saved reflection for one user week ([ADR 0015](decisions/0015-weekly-review-period-structure-lock.md)).

Fields:
- `id`
- `user_id`
- `period_start` (local date: a week's first day under the week start in force at creation)
- `period_end` (local date, exclusive: always `period_start + 7`)
- `wins` (optional text)
- `blockers` (optional text)
- `lessons` (optional text)
- `priorities_note` (optional text)
- `completed_at` (optional UTC instant: set once, when the review is first finished)
- `created_at`
- `updated_at`

Rules:
- One review per period: `unique (user_id, period_start)`, and `unique (id, user_id)` for its priorities. A CHECK holds `period_end = period_start + 7`.
- Every text field is optional, trimmed, null when empty, and up to 5,000 characters. Nothing is required to finish.
- Saved periods never move: a time-zone or week-start change leaves them as they are, so a newer period may overlap an older one.
- **Open window:** a review can be started, edited, finished and given priorities only while today (in the user's current zone) is before `period_end + 7`, so only last week and this week are open. After that it is read-only, enforced by the service. A closed week with no review can't be reviewed later, and nothing flags it.
- An unfinished review whose period closes is kept as saved and shown as "Not finished". It is never counted.
- The look-back summary is computed from records each time and **never stored**.
- Delete is a confirmed hard delete, allowed when closed. It removes the priorities (cascade) and the review's audit events.
- **Audit events** `weekly_review.started|updated|priorities_changed|finished`: period dates, changed field names, ordered priority IDs and `completed_at` only. Review text is never put in an event or a log.

### WeeklyReviewPriority
One of a review's priorities for the following period: a link to a goal or a task.

Fields:
- `id`
- `user_id`
- `review_id`
- `goal_id` (optional)
- `task_id` (optional)
- `sort_order`
- `created_at`
- `updated_at`

Rules:
- Exactly one of `goal_id` and `task_id` (a CHECK). At most 10 per review, each goal or task at most once (unique per review), `sort_order` dense from 0.
- Composite FKs to `weekly_reviews`, `goals` and `tasks` on `(…, user_id)`, all `ON DELETE CASCADE`: deleting a goal or task removes the priority. A completed, dropped or archived goal stays linked and shows its status.
- The linked record's title is shown live and never copied.
- Only active or paused goals and open tasks can be added. Saving the list again may keep one already linked whatever its status now (reordering a list holding a since-completed goal works), but one removed can be added back only while it is addable.

Generated draft text (a later AI-assisted review) must be distinguishable from user-written content if both are retained.

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
 ├── Tasks (inbox: no parent) ── TimeBlocks ── TimeBlockExceptions
 ├── Habits ── HabitSchedules, HabitPauses, HabitLogs
 ├── CalendarEvents ── CalendarEventExceptions
 ├── Notes ── NoteGoals (→ a Goal), NoteTasks (→ a Task), NoteTags (→ a Tag)
 ├── Tags
 ├── AuditEvents
 ├── WeeklyReviews ── WeeklyReviewPriorities (→ a Goal or a Task)
 └── PersonalMemories (later)
```

The diagram is conceptual. A task has at most one parent: a milestone, a goal, or none (inbox). Every task, whatever its parent, can have time blocks. Calendar events optionally link to a goal and a life area. Projects (later) are not shown.

## 5. Data integrity and indexes

Likely constraints and indexes:
- Foreign keys for all ordinary relationships.
- Index user-owned records by `user_id` and common sort/filter fields.
- Index tasks by `(user_id, status, planned_date)`, `(user_id, status, due_date)` and `(user_id, status, due_at)` where query patterns justify it.
- Habit logs are unique on `(habit_id, local_date)`, which also serves per-habit lookups. Index them by `(user_id, local_date)` for Today and Home across habits.
- Index events by `(user_id, start_at)` and `(user_id, start_date)`, and time blocks by `(user_id, start_at)`. Repeating series are expanded in application code, so a series' end may need its own index once query plans show it.
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
- **Deleting a task** deletes its time blocks and their exceptions ([ADR 0012](decisions/0012-calendar-recurrence-time-blocks-views.md)). Deleting a goal or life area clears the link on calendar events and keeps the events.
- **Deleting a goal or task** also removes any weekly review priority that links to it. **Deleting a weekly review** (allowed even when closed) removes its priorities ([ADR 0015](decisions/0015-weekly-review-period-structure-lock.md)).
- **Deleting a goal or task** removes its note links and keeps the notes. **Deleting a note** removes its links and tags, and **deleting a tag** only untags its notes ([ADR 0016](decisions/0016-notes-rich-text-links-search-tags.md)).
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
9. Calendar event shapes, recurrence with exceptions, and time blocks ([ADR 0012](decisions/0012-calendar-recurrence-time-blocks-views.md)).
10. Habit cadences, check and quantity measures, logs, versioned schedules, pauses and consistency denominators ([ADR 0014](decisions/0014-habit-cadence-logs-consistency.md)).
11. Weekly reviews: user-week periods, optional text, linked priorities, the open window and the review reminder ([ADR 0015](decisions/0015-weekly-review-period-structure-lock.md)).
12. Notes: a rich-text JSON body with a derived plain-text copy, typed links to goals and tasks, English full-text search, and tags on notes ([ADR 0016](decisions/0016-notes-rich-text-links-search-tags.md)).

Still open (decided at phase gates in the implementation plan):
1. Backup and log retention (Phase 10 privacy notes).
