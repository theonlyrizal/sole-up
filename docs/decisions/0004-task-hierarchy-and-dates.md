# 0004: Task hierarchy and dates

**Date:** 2026-10-20
**Status:** Accepted. The inbox definition is refined by [ADR 0011](0011-task-status-planning-priority-estimates.md) (no parent **and** no planned date).

## Context
The first loop is Goals → Today. The original spec allowed a task to link to a project, a goal and a milestone independently, which creates ambiguous ownership and conflicting parents. Task deadlines can be a whole day ("by Friday") or a precise instant ("before the 15:00 call"), and the user's plan for a task ("I'll do it Tuesday") is different from its deadline.

## Decision
- **No Projects in v1.** Project is a "later" entity, added only if dogfooding shows non-goal work needs grouping.
- **One parent at most:** a task belongs to a milestone, a goal, or nothing (the inbox). Enforced by `CHECK (num_nonnulls(goal_id, milestone_id) <= 1)`. A task under a milestone reaches its goal through the milestone.
- **Deadline:** either `due_date` (local date) **or** `due_at` (UTC instant) + `due_tz` (IANA zone), never both. `due_at` and `due_tz` are both set or both null. Enforced by CHECKs.
- **Plan:** an optional `planned_date` (local date), separate from the deadline.
- **Data defaults adopted with this ADR:** UUID primary keys; a per-user week start (default Monday); changing the user's time zone never rewrites stored local dates.

## Alternatives considered
- **Projects plus goals as parallel parents:** more flexible, but unclear rules and more UI before the core loop is proven.
- **Many-to-many task links:** rejected for the same reason.
- **Only instants for deadlines:** all-day deadlines would shift when the time zone changes.

## Consequences
- Parent foreign keys are composite `(parent_id, user_id)` with `ON DELETE SET NULL (parent_id)`; requires PostgreSQL 15+ and a hand-edited migration.
- "Inbox" is derived (no parent), not a stored status.
- Adding Projects later means a new nullable parent column and widening the CHECK, which is a non-destructive migration.
