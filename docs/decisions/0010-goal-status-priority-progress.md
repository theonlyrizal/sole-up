# 0010: Goal status, priority, progress and dates

**Date:** 2026-10-20
**Status:** Accepted

## Context
Phase 1 builds goals and milestones (chunks 1.1–1.6). The 1.0 decision gate had to settle four product rules before writing schema: goal statuses, priority, how progress is defined, and how start and target dates are stored. [ADR 0006](0006-deletion.md) already makes archive a reversible status, and [ADR 0004](0004-task-hierarchy-and-dates.md) / [ADR 0008](0008-dates-and-time-zones.md) keep local dates separate from instants. The product rules in `CLAUDE.md` apply: the user decides, nothing shames a missed goal, and there is no single opaque score.

## Decision

### Statuses
- A goal's `status` is one of `active | paused | completed | dropped | archived` (text column with a CHECK, like `life_areas.status`). New goals are `active`.
- `dropped` means the goal is no longer being pursued because priorities changed. Copy never presents it as failure.
- Allowed transitions, enforced by the service:
  - Between `active`, `paused`, `completed` and `dropped`: any to any.
  - From any of those four to `archived`.
  - From `archived` only to `active` (restore). Restore does not remember the status before archiving.
  - Setting the current status again is a no-op: no write and no audit event.
- `status_changed_at` is set on every real status change.
- `completed_at` is set when the goal becomes `completed`. It is kept when a completed goal is archived, so the archive view can say "completed on …". It is cleared on any other move out of `completed`, and on restore.

### Priority
- `priority` is optional: `low | medium | high`, or null. Not numeric, and no ranking within a level.

### Progress
- Progress is **completed milestones out of non-dropped milestones**, shown as "2 of 5 milestones".
- With no countable milestones (none, or all dropped), no progress figure or percentage is shown.
- It is computed on read from milestones, not stored.
- Completing the last milestone does not complete the goal. The user completes it; the UI may suggest it.
- Numeric targets (`measurement_type`, `target_value`, `current_value`) are deferred.

### Dates
- `start_date` and `target_date` are optional PostgreSQL `date` columns: local calendar dates with no time or zone. A time-zone change never rewrites them.
- A CHECK enforces `target_date >= start_date` when both are set. Validation checks the pair together so the form reports the error before the database does.
- Milestone `due_date` is also an optional local `date`. It is not constrained by the goal's dates.

## Alternatives considered
- **Four statuses plus a separate `archived_at`:** restore would bring back the exact prior status and the archive view could show it, but it differs from the Life Areas pattern and adds a column. Rejected for consistency; revisit if restoring to `active` proves annoying while dogfooding.
- **No priority in v1, or manual sort order instead of levels:** levels are quicker to set and filter; a `sort_order` can be added later without conflict.
- **Numeric targets now:** more schema and UI in Phase 1 for a minority of goals.
- **No progress display:** loses useful, cheap, honest feedback.
- **Target as an instant plus time zone (like task `due_at`):** goal deadlines are days, not moments; tasks already cover timed deadlines.
- **Date ordering checked only in Zod:** the database would accept a reversed range from any other write path.

## Consequences
- `goals` gets CHECKs on `status`, `priority` and the date order. `milestones` gets a CHECK on `status` (`open | completed | dropped`).
- The goal service owns the transition table and the `completed_at` rules, with unit tests for each allowed and rejected move.
- Restoring an archived goal always makes it `active`; earlier statuses remain visible in the history timeline (audit events).
- Progress needs a per-goal milestone count query; there is no stored counter to keep in sync.
- `DATA_MODEL.md` (Goal, Milestone) and chunks 1.1–1.6 of the implementation plan reflect these rules.
