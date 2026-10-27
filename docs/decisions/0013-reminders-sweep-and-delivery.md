# 0013: Reminders: free-hosting sweep, what reminds, quiet hours and content

**Date:** 2026-10-27
**Status:** Accepted. Supersedes the worker and pg-boss part of [ADR 0003](0003-hosting-and-jobs.md) for v1.

## Context
Phase 5 adds reminders delivered by Web Push ([ADR 0007](0007-platform-and-push.md)). ADR 0003 planned one Node host running the web app and a pg-boss worker. [ADR 0009](0009-production-hosting.md) then put production on Render Free and Neon Free and left this gate to revisit hosting, because:
- **Render Free** sleeps after 15 idle minutes and has no background workers.
- **Neon Free** includes about 100 compute-hours (CU-hours) a month and suspends after 5 idle minutes. When the allowance runs out, the database is suspended until the next month, which takes the whole app down. A worker that polls the database (pg-boss polls every few seconds; a sweeper every minute) keeps the compute awake all month: about 186 CU-hours at the smallest size.

[ADR 0012](0012-calendar-recurrence-time-blocks-views.md) also left open whether occurrences of repeating items can remind, since occurrences are expanded at query time and never stored.

The gate recommended a paid Render instance running web and worker plus Render Postgres (about $13–14 a month). The user chose to stay on the free plans with coarse reminders. This ADR records that answer, the five other answers, and the rules derived from them.

## Decision

### Hosting and scheduling: a sweep every 15 minutes, no worker
- **No worker process and no pg-boss in v1.** The web app does the work when called: a `POST /api/reminders/sweep` route claims due reminders and sends them within the request.
- **Trigger:** [cron-job.org](https://cron-job.org) (free) calls the route **every 15 minutes**, with a secret in the `Authorization: Bearer` header.
  - The secret is `REMINDER_SWEEP_SECRET` (at least 32 random bytes), compared in constant time. A wrong or missing secret gets the same `401`. The route sits outside the session proxy, reads no request body, and logs only counts and duration. The secret is never logged.
  - The secret can only start a sweep. It reads nothing and returns only counts.
  - GitHub Actions' schedule was rejected: the repository is private, so every run costs Actions minutes (about 2,976 runs a month, over the 2,000 free minutes before CI), and scheduled runs are often delayed 5–20 minutes.
- **Never late:** each sweep sends every reminder whose `fire_at` falls **before the next sweep** (`fire_at < now + 15 min`). A reminder arrives up to 15 minutes early, and late only when a sweep is missed. The forms say "Reminders may arrive up to 15 minutes early."
- **Missed sweeps catch up:** the next sweep sends overdue reminders, unless they are stale (see "Stale reminders").
- **Overlapping or repeated sweeps never send a reminder twice.** Rows are claimed with `FOR UPDATE SKIP LOCKED` and moved to a `sending` state in a short transaction, then sent, then recorded. A request cut off between sending and recording may resend that one reminder on a later sweep. That is accepted: a duplicate is better than a lost reminder.
- **Budget:** about 62 of Neon's 100 CU-hours a month go to sweeps (5 awake minutes per 15), leaving about 38 for the developer's own use. A 10-minute interval (about 93) was rejected because it leaves almost no headroom.
- **Keeping Render awake:** a call every 15 minutes is right at Render's idle limit, so a sweep may meet a cold start (about a minute). Chunk 5.1 measures this in production. If sweeps are missed, it adds a second cron-job.org call every 10 minutes to a route that **doesn't touch the database** (`/api/health` does, so it isn't used), so Neon isn't kept awake.
- **Locally:** `pnpm reminders:sweep` runs one sweep against the configured database, since there is no cron locally.

### What can remind
- **Timed task deadlines** (`due_at`): the reminder fires an offset before `due_at`.
- **Timed calendar events:** an offset before the start, including occurrences of repeating events (below).
- **A daily planning nudge** at a chosen local time, which opens Today. It covers date-only deadlines and all-day events.
- **Not in v1:** time blocks, date-only deadlines and all-day events. Blocks show on Today's Schedule timeline. They can be added later on the same machinery.

### Settings per item and defaults
- **One reminder per item**, held on the item as `reminder_offset_minutes` (nullable), chosen from a fixed list: **0** (at the time), **10**, **30**, **60** and **1440** (1 day). A CHECK enforces the list.
- **Tasks:** no reminder by default.
- **Events:** the form pre-fills **10 minutes** for **new** events, and the user can change or remove it. Events that exist when reminders launch get none, so nothing starts notifying unannounced.
- **Daily nudge:** off until the user picks a time. The time is stored on `user_preferences` as a local time.
- **Global switch:** reminders can be turned off in Settings. While they are off, reminders that come due are marked `skipped`, not held for later.
- **Devices:** nothing is delivered until a device is subscribed (5.3). Reminders that come due with no subscription are marked `skipped`.
- Changing an item's reminder is recorded on the item's existing `*.updated` audit event (the offset is a structured field). Deliveries are not audited: the `reminders` table is their record.

### Reminder rows and repeating events
- The `reminders` table is the **delivery schedule and record**. The item holds the setting, and a row holds one delivery: `fire_at` (UTC), the target it reminds about (the deadline, or the occurrence's start), `status`, attempts, the last error code and when it was sent.
- **Statuses:** `scheduled`, `sending`, `sent`, `skipped` (with a reason: `stale`, `disabled`, `no_device`) and `failed`. Changing or removing a reminder deletes its `scheduled` row and writes a new one where needed, so there is no `cancelled` status.
- **At most one `scheduled` row per item** (and per user for the nudge), enforced by a partial unique index. A snoozed delivery (15 minutes or 1 hour, from the notification or the app) is a separate row marked as snoozed, outside that rule, so a series' next-occurrence row is unaffected. Sent, skipped and failed rows stay as the record and are deleted with the item (FK cascade) or the account.
- **Scheduling happens in the same transaction** as the item's change. Creating, rescheduling, completing, cancelling, reopening and deleting a task, or creating, editing and deleting an event (in any of the three scopes), creates, moves or removes its `scheduled` row. A target that has already passed gets no row.
- **Repeating events use a rolling "next occurrence" row:**
  - The series' `reminder_offset_minutes` applies to every occurrence. There is no per-occurrence override in v1: "this event" edits change times, not the reminder.
  - The table holds a row only for the **next** occurrence that still has to fire, with that occurrence's original start (ADR 0012's exception key) and its actual start.
  - When that row is sent or skipped, the same transaction expands the rule (bounded, ADR 0012) and inserts the row for the following occurrence. Cancelled occurrences are skipped, and moved ones fire from their new start.
  - Editing the series in any scope, or a "this event" change to the next occurrence, recalculates the row in the same transaction.
- **Time zones:** task and event reminders follow their instants, so a time-zone change doesn't move them. The daily nudge is recomputed in the user's new zone.

### Quiet hours
- **Optional and off by default.** Turning them on suggests 22:00–07:00. They are a start and end in local time, may cross midnight, and are evaluated in the user's **current** zone, DST included.
- **Held, then delivered:** a reminder that comes due inside quiet hours is held. The first sweep at or after the end delivers the held reminders that aren't stale. When more than one is due, they go as **one bundled notification** ("3 reminders from quiet hours") that opens Today. A sweep never sends a held reminder before quiet hours end, even when the next sweep is after the end.
- A daily nudge time inside quiet hours is allowed, and the form warns that it will be held.
- There is no per-user "deliver or skip" setting.

### Stale reminders
A reminder is **stale**, and is marked `skipped` with reason `stale` instead of being sent, when a sweep reaches it after:
- the task's deadline has passed, or the task is no longer open
- the event occurrence has started
- the nudge's local day has ended

This covers both held quiet-hours reminders and reminders delayed by missed sweeps. A skipped reminder is shown on the item ("Skipped: quiet hours" or similar), so it isn't silently lost.

### Delivery
- Sent with the `web-push` library to each of the user's subscriptions. A `404` or `410` deletes that subscription.
- Other errors are retried by later sweeps (so the backoff is the sweep interval), up to 3 attempts, then marked `failed` with the error code. A reminder that goes stale while retrying is skipped.
- The push message's TTL runs until the target time (at least 60 seconds), so a phone that was offline doesn't show a reminder for something already past.
- Clicking a notification deep-links to the item: a task opens its dialog, and an event opens its dialog on the Day view (the 4.9 `?item=` link). A bundled notification or the nudge opens Today.

### Notification content
- **Default:** the item's **title and when**, for example "Dentist · 14:00 (in 10 min)" or "Due 17:00 · Submit visa form". Never the description, location, goal reason or any notes.
- **Private mode** (a Settings switch, off by default): "You have a reminder · 14:00". The title is **not put in the payload** at all. The payload carries only the time and the deep-link URL, which holds an id and no text.
- **The daily nudge** is always "Time to plan your day", and **a bundled notification** "N reminders from quiet hours", with no titles in either mode.
- Payloads are encrypted to the browser (RFC 8291), so the push service can't read them. They are never logged.

## Alternatives considered
- **Render Starter running web and worker, plus Render Postgres (the gate's recommendation):** minute-accurate reminders and 3 days of point-in-time restore, for about $13–14 a month and a one-time database move. The user chose to stay free.
- **Render Starter plus Neon Launch:** no database move, but about $27 a month at usage pricing, and the bill varies.
- **A separate Render background worker:** cleaner separation, at an extra $7 a month that this scale doesn't need.
- **pg-boss or a per-minute sweep on the free plans:** keeps Neon awake all month and runs out its allowance, suspending the whole app.
- **A 10-minute sweep:** reminders up to 10 minutes early instead of 15, but about 93 of 100 CU-hours from sweeps alone.
- **Delivering at the nearest sweep (up to about 7.5 minutes early or late), or never early (up to 15 minutes late):** an event reminder that arrives after the event starts is useless.
- **GitHub Actions schedule as the trigger:** no new third party, but it uses up the private repository's Actions minutes, and its runs are often delayed.
- **Time-block reminders:** reminders when a block starts, at the cost of hooking the block scopes and auto-mark into scheduling, roughly doubling 5.4.
- **Expanding repeating events at each sweep:** nothing to reschedule on edits, but two delivery paths and more work in each sweep.
- **A per-occurrence reminder override, or several reminders per item:** more flexible, but more rows to keep in sync on every edit and a list editor in both forms.
- **A per-user default offset for new events, or nothing on by default:** the fixed 10-minute default for new events was kept as the simplest option that's useful without setup.
- **A per-user setting to deliver or skip held reminders, always skipping them, or no quiet hours in v1:** the single rule delivers a held reminder only when it can still help.
- **Private content by default, always private, or titles plus locations:** titles are what make a reminder useful at a glance. Private mode covers sensitive titles.

## Consequences
- **Reminders are coarse:** up to 15 minutes early, and late if a sweep is missed. The UI says so.
- **ADR 0003's worker and pg-boss are not built in v1.** The convention's `worker/` and `src/server/jobs/` directories and the `pnpm worker` command are dropped. Reminder code lives in `src/server/modules/reminders/`.
- **Moving to paid hosting later** is a hosting change, not a rewrite. The sweep is idempotent, so an in-process timer or a worker can call the same function every minute and shrink the "early" window. That needs a new ADR.
- **New dependency on a third party:** cron-job.org holds the sweep URL and secret. If it stops, reminders stop and nothing else breaks. 5.7 adds a "last sweep" check so a stopped trigger is visible.
- **Render's 750 free instance-hours** are about one service kept awake all month (744 hours in a 31-day month), so no other free Render service can share the workspace.
- **Neon's allowance must be watched** during the Phase 5 checkpoint. If use heads past about 80 CU-hours a month, widen the interval or move to paid hosting.
- **New env vars:** `REMINDER_SWEEP_SECRET`, and the VAPID keys (5.3). They are added to Render before the deploy that needs them.
- **New tables and columns:** `push_subscriptions` (5.3); `reminders`, `tasks.reminder_offset_minutes`, `calendar_events.reminder_offset_minutes`, and the nudge time, quiet hours, private mode and global switch on `user_preferences` (5.4 and 5.6).
- **The task and event services schedule reminders** in their own transactions. Time-block code is untouched.
- **Phase 7.5's weekly review reminder** is a further reminder kind on this machinery. **Phase 10's export** includes reminder settings and delivery records, and account deletion removes subscriptions and reminders.
- `ARCHITECTURE.md` §8, ADR 0003's and 0009's status lines, `DEPLOY.md`, `ROADMAP.md`, `PRODUCT_SPEC.md` §12, and chunks 5.1–5.7 of the implementation plan reflect these rules.
