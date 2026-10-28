# 0014: Habits: cadences, logs, quantities and consistency

**Date:** 2026-10-29
**Status:** Accepted

## Context
Phase 6 adds habits (Journey C: define a habit and its cadence, log a completion or a deliberate skip, see consistency and history accurately, correct mistakes, pause or archive). The 6.0 decision gate had to settle cadences, log statuses, quantity habits, denominators and skips before writing schema. One more question was asked because it changes the schema: what an edit to a habit's cadence or target does to past numbers.

Rules already in force:
- Local dates are stored as dates and never rewritten by a time-zone change ([ADR 0008](0008-dates-and-time-zones.md)).
- Weeks follow the user's saved week start (`user_preferences.week_start`, 0 = Sunday … 6 = Saturday, default Monday).
- Archive is a reversible status and delete is a confirmed hard delete ([ADR 0006](0006-deletion.md)).
- Audit events hold structured fields only and are removed with their entity ([ADR 0005](0005-history-and-audit-log.md)).
- The product rules in `CLAUDE.md` apply: nothing shames a missed day, and there is no single opaque score.

The gate recommended deferring quantity habits. The user chose full quantity habits (a unit, a per-day target and partial credit) and the "Missed" label instead of "Not logged". Every other recommendation was accepted.

## Decision

### Cadences
A habit's cadence is one of:
- `daily`: every day. `cadence_config` is `{}`.
- `weekly_days`: chosen weekdays. `cadence_config` is `{ "days": [...] }`: 1 to 6 distinct weekday numbers, 0 = Sunday … 6 = Saturday (the numbering of `dayOfWeek` and `week_start`). All seven is `daily`, so the picker turns it into `daily`.
- `times_per_week`: N times in each of the user's weeks. `cadence_config` is `{ "timesPerWeek": N }`, with N from 1 to 6 (7 is `daily`).

`cadence_config` is validated per type with Zod at the boundary. Other cadences (every N days, N per month, times of day) are not in v1. They would be new types, not changes to these.

### Measure: check or quantity
- A habit's `measure` is `check` (done or not) or `quantity`.
- A quantity habit has a `unit` (short user text, such as "glasses", "min" or "km") and a `target` per expected day: a number above 0 with at most 2 decimal places, up to 99,999.99. Any cadence can be a quantity habit. "Run 5 km, 3 times a week" is a target of 5 on each of 3 days.
- The measure and the unit are fixed when the habit is created. Changing them would make old logs meaningless. To change either, end the habit and create a new one. The target can change (see "Editing the cadence or target").

### Logs
- At most one log per habit per local date: `unique (habit_id, local_date)`.
- `status` is `completed | skipped`. A skip is the user's deliberate "not this time".
- `value`: required on a completed log of a quantity habit, above 0 with the target's bounds. Null on a skip and on every log of a check habit. Logging zero means deleting the log or skipping.
- `note`: optional user text. It is never logged or put in an audit event.
- **Missed is never stored.** It is derived for display only: a day strictly before today that counts toward the habit (see "Counted day") and has no log. The label is "Missed", in neutral styling with no warning colour. `times_per_week` has no per-day Missed; a past week shows its count, for example "2 of 3".
- Logs are accepted only on active days (see "Active day") on or before today. No future logs.
- Undo deletes the log. A correction changes its status or value, or deletes it.

### Editing the cadence or target: versioned schedules
- Cadence and target live in `habit_schedules` rows `(habit_id, effective_from, cadence_type, cadence_config, target?)`, not on `habits`. A habit always has at least one.
- An edit takes effect from the start of the current user week. A second edit in the same week replaces that week's row, and an edit in the habit's first week replaces the first row. Past weeks keep the schedule they had.
- **Schedule for a week:** the row with the latest `effective_from` on or before the week's last day. If there is none (for example after moving `start_date` earlier), the earliest row. Every day in a week uses that week's schedule.
- Title, description, start and end dates and the goal link are edited in place. Changing the start or end date is retroactive by nature.

### Pause and archive
- Pauses are rows `(habit_id, start_date, end_date?)`. `start_date` is the first paused day and `end_date` the first active day again (exclusive, like all-day event ends in [ADR 0012](0012-calendar-recurrence-time-blocks-views.md)). Null means ongoing. At most one open pause per habit, and pauses never overlap.
- **Pausing** sets status `paused` and opens a pause starting today, or tomorrow if today already has a log, so a day just logged keeps counting. **Resuming** sets status `active` and closes the pause with `end_date` = today. A pause that would end on or before its start is deleted instead.
- **Archiving** sets status `archived` and opens a pause if none is open, so archived days count like paused ones. **Restoring** always returns to `active` (as goals do in [ADR 0010](0010-goal-status-priority-progress.md)) and closes the open pause.
- Pauses are only created by pausing or archiving (from today on). A past day the user couldn't do the habit is marked as skipped.

### Consistency: the exact definitions
**Inputs:** the habit (measure, `start_date`, `end_date`), its schedules, pauses and logs, a range, the user's `today` and week start.

**Terms:**
- **Range:** whole user weeks from `from` (a week's first day) to `to` (a week's last day), inclusive. The pages offer the last 4 weeks and the last 12 weeks (both including the current week), and the current week on its own. Weeks after the current week contribute nothing.
- **Active day:** a local date `d` with `start_date ≤ d`, `end_date` null or `d ≤ end_date`, and no pause with `start_date ≤ d` and (`end_date` null or `d < end_date`).
- **Scheduled day:** for `daily`, every day. For `weekly_days`, a day whose weekday is in that week's schedule. For `times_per_week`, every day (the count is per week).
- **Credit of a day:**
  - 0 without a completed log.
  - 1 for a completed check habit.
  - `min(value ÷ target, 1)` for a completed quantity habit, using that week's target.
  - Doing more than the target never carries over to another day or week.
- **Counted day** (`daily` and `weekly_days` only): an active, scheduled day in the range that is not skipped and is either before today, or today with a completed log. Today never counts against the user before it is over.

**`daily` and `weekly_days`:**
- `expected` = the number of counted days.
- `completed` = the sum of the credit of the counted days.
- `skipped` = the number of active, scheduled days in the range with a skipped log.
- A completed log on an active day that is not scheduled (a `weekly_days` habit done on another weekday) is an **extra**. It is shown in history but counted in neither number. The flexible version of such a habit is `times_per_week`.

**`times_per_week`**, for each week `w` in the range with N from that week's schedule:
- `activeDays(w)` = the active days among `w`'s seven days. Days later this week count too, under the pauses and end date known now.
- `base(w)` = N when `activeDays(w)` is 7, otherwise N × `activeDays(w)` ÷ 7 rounded to the nearest whole number, halves up. In integers, that is `floor((2 × N × activeDays(w) + 7) ÷ 14)`, with no floating point. A week the habit started, ended or was paused in partway expects proportionally fewer. For N = 3: 0–1 active days → 0, 2–3 → 1, 4–5 → 2, 6–7 → 3.
- `skips(w)` = active days in `w` with a skipped log.
- `target(w)` = `max(0, base(w) − skips(w))`. Each skip lowers that week's target by one.
- `done(w)` = the sum of credit on active days in `w`.
- **A past week** (its last day before today): `expected(w)` = `target(w)`, `completed(w)` = `min(done(w), target(w))`.
- **The current week** (it contains today): `expected(w)` = `completed(w)` = `min(done(w), target(w))`. It can raise the figure but never lower it until the week ends.
  - *Amended 2026-10-29 (chunk 6.2), so `expected` stays a whole number for quantity habits:* `expected(w)` = `min(days with a completed log, target(w))` and `completed(w)` = `min(done(w), target(w))`. For check habits this is the rule above. A partial quantity day counts with its partial credit, as today does for `daily`.
- `expected`, `completed` and `skipped` are the sums over the range's weeks.
- **Week in progress:** the current week is also reported on its own as progress against its target ("1 of 3 so far this week"), never as a consistency figure. That is what "this week" shows for a `times_per_week` habit.

**Skips:** never a miss and never a completion, as defined above. The skip count is always shown next to the figure.

**Result and display:**
- The engine returns `{ completed, expected, skipped, definition }`. Quantity habits also return `atTarget`: the number of days counted in `completed` whose credit is 1.
- `expected` is always a whole number.
- **Shown as a count, never a percentage:**
  - "12 of 14 days · 2 skipped" for `daily` and `weekly_days`.
  - "7 of 9 times · 1 skipped" for `times_per_week`.
  - "11.6 of 14 days · 10 at target" for quantity habits.
- A fractional `completed` is cut (not rounded) to one decimal, so the target never looks reached when it wasn't (13.96 shows as 13.9).
- With `expected` = 0, no figure is shown, only "Nothing expected in this range", as goal progress does with no countable milestones (ADR 0010).
- **Definition text** goes with every figure and says, in plain words: what counts as done, which days or weeks were expected, that paused and skipped days are not counted, that today (or this week) counts only what is done so far, the partial-week rule for `times_per_week`, and the target with partial credit for quantity habits.
- There is no total across habits, no score and no streak counter by default. If streaks are ever added, they are optional and never the main number.

### History and audit
- Logs on days that later become inactive (the start date moved later, the end date earlier) are kept and shown, but never counted.
- **Audit events** use entity type `habit`, with the habit's ID, so a log's history survives the log row being deleted by undo:
  - `habit.created`, `habit.updated` (changed field names; from/to for dates and the goal link)
  - `habit.status_changed`
  - `habit.schedule_changed` (cadence type and config from/to, effective week, `target` by name only)
  - `habit.logged`, `habit.log_changed`, `habit.log_removed` (local date, status from/to, `value` by name only)
- Never stored in an event: title, description, unit, note, or a value or target number. Those amounts can be health data.
- Deleting a habit is a confirmed hard delete. Its schedules, pauses and logs go by cascade, and its events are removed in the same transaction.

### Time zones and week start
- Logs, pauses, schedules and the habit's dates are local dates. A time-zone change never rewrites them. "Today" is the user's current local date.
- Weeks are computed from the current week start on every read. Changing the week start regroups past `times_per_week` weeks, and the history then follows the new grouping. `effective_from` dates are kept as they are, and the "schedule for a week" rule above still gives every week exactly one schedule.

## Alternatives considered
- **More cadences (every N days, N per month):** rejected for v1. An interval needs an anchor date and makes weeks uneven in reviews, and a monthly count needs month-based denominators next to weekly ones.
- **Stored misses:** rejected. A daily job would write rows for every habit, and those rows would go wrong whenever a cadence, pause or zone changed. Unknown stays unknown.
- **"Not logged" instead of "Missed":** recommended for calmer copy. The user chose "Missed", in neutral styling.
- **Deferring quantity habits, or storing a value without counting it:** recommended (deferring) for a simpler first version. The user chose full quantity habits.
- **Threshold quantity days** (count only at the target): whole-number counts, but partial effort disappears from the figure. Rejected for partial credit.
- **A weekly-total quantity target** ("150 minutes a week"): not in v1. It would be another way to count.
- **Whole weeks only for `times_per_week`:** simpler to explain, but a one-day pause would drop a week and its completions. Rejected for pro-rating.
- **Off-day completions standing in for a scheduled day** (`weekly_days`): this makes `weekly_days` a `times_per_week` with suggested days, which blurs the two.
- **Skips as misses, or skips excluded only up to a cap:** stricter, but a skip would mean nothing different from not logging, or a fixed allowance would judge for the user.
- **Retroactive cadence edits** (cadence columns on `habits`): less schema, but an edit silently rewrites every past figure.
- **Cadence locked after the first log:** safe, but awkward for honest corrections.

## Consequences
- **Five structures for 6.1:**
  - `habits` (with `measure`, `unit?` and CHECKs for both)
  - `habit_schedules` (`unique (habit_id, effective_from)`)
  - `habit_pauses` (end after start, at most one open per habit)
  - `habit_logs` (`unique (habit_id, local_date)`, value rules by CHECK where the row alone decides them, measure rules in the service)
  - the `habit.*` audit events
  All children have composite FKs to `habits (id, user_id)` with cascade. The goal link is `SET NULL (goal_id)`.
- The 6.2 engine is pure and owns every rule in "Consistency". The UI, the Home card (6.6) and the weekly review (7.1) call it and never recount.
- The partial-week rounding, the current-week rule and the skip rule must be spelled out in the definition text, which makes it longer than one sentence.
- Phase 10 export (10.1) must include habits, schedules, pauses and logs. Account deletion removes them by cascade.
- Habits don't remind in v1 ([ADR 0013](0013-reminders-sweep-and-delivery.md) lists what reminds).
- `DATA_MODEL.md` (Habit, HabitSchedule, HabitPause, HabitLog) and chunks 6.1–6.6 of the implementation plan reflect these rules.
