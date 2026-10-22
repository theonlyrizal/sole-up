# 0011: Task status, overdue plans, priority and estimates

**Date:** 2026-10-22
**Status:** Accepted

## Context
Phase 2 builds tasks, Today and Upcoming (chunks 2.1–2.8). [ADR 0004](0004-task-hierarchy-and-dates.md) already fixes the task's parent (a milestone, a goal or none) and its date shapes (`due_date` or `due_at` + `due_tz`, plus an optional `planned_date`). The 2.0 decision gate had to settle four product rules before writing schema: task statuses, what happens to a planned date that passes, priority, and time estimates. [ADR 0010](0010-goal-status-priority-progress.md) set the matching rules for goals, and [ADR 0005](0005-history-and-audit-log.md) governs the audit events these rules produce. The product rules in `CLAUDE.md` apply: the user decides, nothing shames a missed task, and there is no single opaque score.

## Decision

### Statuses
- A task's `status` is one of `open | completed | cancelled` (text column with a CHECK, like `goals.status`). New tasks are `open`.
- `cancelled` means the user decided not to do it. Copy never presents it as failure.
- `in_progress` is deferred. Adding it later widens the CHECK, a non-destructive migration.
- Allowed transitions, enforced by the service: any to any among the three. Setting the current status again is a no-op: no write and no audit event.
- `completed_at` is set exactly while the task is `completed`, and `cancelled_at` exactly while it is `cancelled`. Leaving either status clears its timestamp. CHECKs enforce both.
- Completing or cancelling a task never changes its milestone or goal, matching ADR 0010's rule that the user completes goals.

### Inbox
- The inbox is derived, not a status: **open tasks with no parent and no `planned_date`**. This refines ADR 0004, which defined it as "no parent" only. A planned task with no parent shows on Today or Upcoming, not in the inbox. Unplanning it returns it to the inbox.
- A `due_date` or `due_at` alone does not take a task out of the inbox.

### Overdue planned tasks
- When an open task's `planned_date` is before the user's local today, it appears on Today under **"Earlier, not done"**.
- One-tap actions: plan for today, pick a date, or unplan. Each is an ordinary `plan(date | null)` call with its `task.planned` event.
- Nothing ever moves a task's planned date automatically: no roll-over at midnight and no automatic return to the inbox.
- Past deadlines (`due_date` before today, or `due_at` before now) appear as **"Needs a decision"**, never in red or with judgement words.
- "Today" is always the user's local date from their confirmed time zone ([ADR 0008](0008-dates-and-time-zones.md)).

### Priority
- `priority` is optional: `low | medium | high`, or null, with a CHECK. It uses the same scale and labels as goals. Not numeric, and no ranking within a level.
- Manual order within a list uses `sort_order`, not priority.

### Estimates
- `estimated_minutes` is an optional whole number of minutes, with `CHECK (estimated_minutes between 1 and 1440)`. A task over a day should be split.
- It is not in quick add's single field; it is set in the task's edit form.
- It is captured so later metrics (Phase 3, Phase 9) can compare planned and completed work. Actual time spent is not tracked.

### Deletion and history
- Deleting a task is a confirmed hard delete ([ADR 0006](0006-deletion.md)) and removes its audit events in the same transaction (ADR 0005). There is no `task.deleted` event, as for goals and life areas. A deleted task drops out of history and later metrics.

## Alternatives considered
- **`in_progress` now:** lets the user mark a task as started, but it adds a state that Today and the filters must handle, and tasks can sit "in progress" indefinitely.
- **Open and completed only (no cancel):** unwanted tasks would have to be deleted, losing the record that the user chose not to do them.
- **Auto-roll unfinished planned tasks to today:** less triage, but it hides slippage, fills Today without asking, and creates reschedule events the user never chose.
- **Clear past planned dates automatically (back to the inbox):** keeps Today clean, but silently drops the user's plan.
- **No task priority, or a numeric/P1–P4 scale:** no priority removes the filter and sort the Plan page needs. A numeric scale is finer, but it differs from goals and leans toward scoring.
- **Defer estimates, or size buckets (S/M/L):** deferring leaves no history when metrics arrive. Buckets are quick to pick but can't be summed against available time.
- **Keep a content-free `task.deleted` tombstone:** keeps a trace for metrics, but it is an exception to ADR 0005 and keeps data about something the user deleted.

## Consequences
- `tasks` gets CHECKs on `status`, `priority`, `estimated_minutes`, and the `completed_at`/`cancelled_at` rules, in addition to ADR 0004's parent and deadline CHECKs.
- The task service owns the transition rules and timestamps, with unit tests for every pair.
- The inbox and Today queries depend on `status`, `planned_date` and the parent columns. ADR 0004's index list covers them; adjust from real query plans.
- "Earlier, not done" can grow after busy days. That is accepted: the user triages it, and the one-tap actions keep triage cheap.
- Goal and task priority share one scale, so the constants and labels can be shared.
- `DATA_MODEL.md` (Task) and chunks 2.1–2.8 of the implementation plan reflect these rules.
