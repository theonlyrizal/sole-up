# 0015: Weekly review: period, structure, editing window and reminder

**Date:** 2026-10-29
**Status:** Accepted

## Context
Phase 7 adds the weekly review (Journey D: summarize the week from actual records, reflect, decide what should continue, stop or change, and choose next week's priorities). The success condition is a useful adjustment, not a dashboard. The 7.0 decision gate had to settle the period, the structure and the rules before writing schema. Two more questions followed from the user's answer on editing: exactly when a review locks, and what must be filled to finish one.

Rules already in force:
- Local dates are stored as dates and never rewritten by a time-zone change ([ADR 0008](0008-dates-and-time-zones.md)). Weeks follow `user_preferences.week_start` (0 = Sunday … 6, default Monday).
- Delete is a confirmed hard delete ([ADR 0006](0006-deletion.md)).
- Audit events hold structured fields only and are removed with their entity ([ADR 0005](0005-history-and-audit-log.md)). Reflections are user content and never go in an event or a log.
- Habit numbers come from the 6.2 engine over whole user weeks, never a recount ([ADR 0014](0014-habit-cadence-logs-consistency.md)).
- Reminders run on the 15-minute sweep, with quiet hours, a global switch and private mode ([ADR 0013](0013-reminders-sweep-and-delivery.md)), which names a weekly review reminder as a further reminder kind.
- The product rules in `CLAUDE.md` apply: nothing shames a skipped week, and there is no single opaque score.

The gate recommended "editable afterward" with no lock. The user chose to lock a review a week after its period ends. Every other recommendation was accepted.

## Decision

### Period
- A review covers one **user week**: `period_start` is the first day of a week under the week start in force when the review is created, and `period_end` is the next week's first day, **exclusive** (`period_end = period_start + 7`, enforced by a CHECK), like all-day event ends in [ADR 0012](0012-calendar-recurrence-time-blocks-views.md).
- Both are local dates. A time-zone change never moves them. A later week-start change doesn't move a saved period either. New reviews use the new week start, so a saved period may overlap a newer one. That is allowed.
- **One review per period:** `unique (user_id, period_start)`.

### Which periods are open
- A period is **open** while the user's today (in their current saved zone) is before `period_end + 7`: during its own week and the whole week after it. So at most two periods are open at once, **last week** and **this week**.
- A review can be **started, resumed, edited, finished and given priorities only while its period is open.** Future periods can't be started.
- After that the review is **read-only**. There is no correction or reopen path in v1. The service refuses every write to a closed review with a conflict ("This review is closed for editing"), whatever the UI shows.
- A period that was never reviewed and has closed can't be reviewed later. Nothing records or flags that.
- **The flow's default period:** last week if it has no finished review, otherwise this week.

### Structure
A review records, all optional:
- **Wins** (text)
- **Blockers** (text)
- **Lessons** (text)
- **Priorities for next week:** an ordered list of links to goals and tasks, plus an optional free-text **priorities note**.

Text fields are trimmed, an empty field is stored as null, and each holds up to 5,000 characters. A priority links to exactly one goal or one task, never both. The same goal or task appears at most once in a review, and a review holds at most 10 priorities. Only active or paused goals and open tasks can be added. One that is later completed, dropped or cancelled stays linked. Priorities show the linked record's current title and status, and the title is never copied into the review.

"Next week" is always the period after the reviewed one: reviewing last week plans this week, and reviewing this week plans the following one.

### Drafts and finishing
- The review row is created when the user starts the flow, with `completed_at` null. Each step saves as the user leaves it, so the flow can be resumed while the period is open.
- **Nothing is required to finish.** "Finish review" sets `completed_at` to the current instant, whatever is filled. An empty finished review is allowed.
- A finished review stays editable while its period is open. `completed_at` keeps the first finish, and a review can't be unfinished.
- An unfinished review whose period closes is kept as saved and shown in history as "Not finished", in neutral wording. It is never counted, and nothing nags about it.

### The look-back summary
- The summary (chunk 7.1) is **computed from records each time it is shown and never stored**, as habit misses aren't ([ADR 0014](0014-habit-cadence-logs-consistency.md)). It carries "as of" and each metric's definition. A closed review's summary reflects the records as they are now, so deleted items drop out of it. Its text stays as written.
- It covers tasks completed, planned versus completed and rescheduled tasks (from audit events), active goals with no activity in the period, habit consistency (the 6.2 engine over the period's one week) and deadlines in the next period. The exact definitions are in chunk 7.1.
- Instants (completion times, audit events) are placed on local dates in the user's current zone.
- If the week start has changed since the review was created, its period may not be a whole week under the current week start, which the habit engine needs. The habits part then says it isn't available for that week, rather than counting differently.

### Adjustments
The flow's "Adjust" step (pause or drop a goal, reschedule or cancel a task, plan a task for next week) calls the existing goal and task services. Those changes are ordinary changes to goals and tasks, with their own audit events. They are not part of the review record and aren't locked with it. A closed review offers no adjust actions.

### Deletion and links
- A review can be deleted at any time, closed or not, behind a confirmation. The lock stops rewriting, not the user's right to remove their own reflection. Its priorities go by cascade and its audit events are removed in the same transaction.
- Deleting a goal or task removes the priority rows that link to it (cascade). The exactly-one CHECK rules out `SET NULL`. A completed, dropped or archived goal stays linked and shows its status.
- Account deletion removes reviews and priorities by cascade.

### Audit events
Entity type `weekly_review`, with the review's ID:
- `weekly_review.started` (`periodStart`, `periodEnd`)
- `weekly_review.updated` (the changed text fields by name only: `wins`, `blockers`, `lessons`, `prioritiesNote`)
- `weekly_review.priorities_changed` (the ordered goal and task IDs, from and to)
- `weekly_review.finished` (`completedAt`)

Never in an event or a log: any review text.

### Weekly review reminder (chunk 7.5)
- Optional and off by default. The user picks a local weekday and time, stored on `user_preferences` as `weekly_review_day` (0–6) and `weekly_review_time` ("HH:MM"), both set or both null (a CHECK).
- A new reminder kind `weekly_review` on the Phase 5 machinery: at most one `scheduled` row per user, rolled to the following week when sent or skipped, and recomputed in the user's new zone on a zone or setting change, as the daily nudge is.
- Quiet hours, the global switch, the device rules and the sweep's up-to-15-minutes-early timing apply unchanged. It is stale once its local day has ended.
- The notification is always "Time for your weekly review", with no titles in either mode, and opens the review flow.
- It isn't suppressed when the week's review is already finished. The user chooses when it fires.

## Alternatives considered
- **A rolling 7 days ending on the review day:** always a full week of data, but periods drift, overlap, and don't match Track's weeks or the habit engine.
- **Fixed Monday to Sunday:** simple, but disagrees with Plan and Track for anyone whose week starts on another day.
- **One free-text reflection field:** the least ceremony, but nothing structured to look back across. **A fourth "what changed" prompt:** fuller, but one more box. Both rejected for the recommended three.
- **Editable at any time (the recommendation):** keeps reviews correctable, but a past review would show what the user thinks now rather than what they wrote then. The user chose a lock.
- **Late reviews of any past week, each editable for 7 days after it was started:** more forgiving, but a review written weeks later has little context. **Editable for 7 days after finishing, past the window:** a moving lock that is harder to explain. Both rejected for the fixed window.
- **Requiring wins and blockers, or at least one entry, to finish:** more useful data, but a prompt that blocks finishing in a hard or empty week is the kind of ceremony and judgment the product avoids.
- **Several reviews per period** (for example a mid-week check-in): flexible, but history and the open-period rule become unclear.
- **Storing a snapshot of the summary numbers:** a closed review would keep its numbers, but stored derived figures go stale when definitions or records are corrected. Rejected, as stored misses were in ADR 0014.
- **Suppressing the reminder after a finished review:** fewer redundant notifications, but it needs a rule for which week a reminder is about, and the user already picks the time. Not in v1.

## Consequences
- **Two tables for 7.2:**
  - `weekly_reviews` (period CHECK, `unique (user_id, period_start)`, `unique (id, user_id)`, text length CHECKs, nullable `completed_at`)
  - `weekly_review_priorities` (composite FKs to the review, goals and tasks, all cascading; the exactly-one CHECK; unique target per review; dense `sort_order`)
  The open-period, alignment, 10-priority and "next period" rules are the service's, since they depend on today and the user's preferences.
- The service checks "open" on every write, under a row lock on the review, so a write that races the lock date can't slip through.
- The summary needs no new tables. It reuses the metrics module, task audit events and the habit engine.
- 7.3 adds the Review destination. 7.4's edit option exists only while a period is open, and 7.4 adds the confirmed delete.
- 7.5 adds two preference columns, a reminder kind and its CHECKs (a migration on `user_preferences` and `reminders`).
- Phase 10 export (10.1) must include reviews and their priorities, and the reminder setting.
- `DATA_MODEL.md` (WeeklyReview, WeeklyReviewPriority) and chunks 7.1–7.5 of the implementation plan reflect these rules.
