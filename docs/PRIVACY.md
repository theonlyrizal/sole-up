# SoleUp privacy notes

Updated 8 November 2026. These notes describe the current implementation and the deployment documented in [DEPLOY.md](DEPLOY.md). They do not certify the live host settings.

The same notes are available at `/privacy`, linked from Settings and sign-in, without needing an account.

## What is stored

- **Your account:** name, email address, email-verification status, profile-image URL and linked Google or GitHub account identifiers. Authentication can store provider access, refresh and ID tokens, their scopes and expiry times, session tokens, session IP addresses and browser user-agent strings, and temporary verification values such as OAuth state. SoleUp uses provider sign-in, with no password sign-in of its own.
- **Your content and history:** life areas, goals and their reasons/descriptions, milestones, tasks and notes, planned dates and deadlines, calendar events and recurrence exceptions, time blocks, habits, schedules, pauses and logs, weekly reviews and priorities, note tags and links, and insight dismissals. Notes are stored as editor JSON plus derived plain text and a database search index. Search runs in PostgreSQL.
- **Your settings and devices:** time zone, locale, week start, onboarding choices, reminder and quiet-hour preferences, push subscription endpoints and keys, device labels, delivery times and failure counts. Reminder records include schedules, delivery state and error codes. Account-closure records include the recovery deadline or closed-at time.
- **Activity history:** audit events hold account/entity IDs, event types, timestamps and allowed structured changes, such as statuses, dates and links. They exclude titles, note bodies, goal reasons and review reflections. This database history is separate from operational logs.

Browser cookies support sign-in and the short-lived account-verification proof used for closure.

## Hosting and other services

The documented deployment uses Render Free for the web application in Singapore and Neon Free for PostgreSQL in AWS Singapore (`ap-southeast-1`). This is not a promise that every provider's logs, backups or support systems stay in that region.

DEPLOY.md instructs the operator to use HTTPS and a database connection with certificate verification (`sslmode=verify-full`). Database storage relies on [Neon's provider-managed encryption at rest](https://neon.com/docs/security/security-overview#data-at-rest-encryption). SoleUp does not add field-level or end-to-end encryption to stored personal content: the application and people with authorized database access can read it.

Google or GitHub handles sign-in. When notifications are enabled, SoleUp sends encrypted Web Push payloads through the browser's push service. Notifications can show task or event titles; Settings → Reminders → private mode omits those titles, while times, destination links and reminder identifiers still travel with the notification. Signing out does not remove the browser's push subscription. Use Settings → Notifications to turn it off on a shared device.

DEPLOY.md also describes cron-job.org calling the reminder sweep. Its configured job stores the app URL, sweep credential and execution history with aggregate counts and timing, rather than task or note content. These services have their own data handling and retention outside SoleUp's application controls.

## Retention, deletion and account closure

Archiving keeps a record for later restoration. Item deletion removes the selected live database record and its associated audit events through that feature's deletion flow. Related records can remain: deleting a goal keeps its tasks, habits and linked notes, removing their goal relationship where applicable. Deleting a note removes the note and its links.

**Settings → Delete account currently closes access; it does not erase the account's data.** After linked-provider verification and typed confirmation, closure revokes existing sessions and suspends app access, exports and new push sends through account-status checks. Signing in through a linked provider within 30 days lets you explicitly reactivate. Retained device subscriptions can resume after reactivation.

At the deadline, reactivation stops even if the reminder sweep is late. The sweep then moves the request to a closed-account registry (`cemetery`) and revokes recovery sessions. The user row and owned content, history, linked-provider records and device subscriptions remain in the database. There is no implemented automatic purge or fixed retention period for these retained closed accounts. The 30 days are an access-recovery window, not an erasure deadline.

Neither item deletion nor account closure removes existing backups, host logs, downloaded exports or notifications already sent to a push service or displayed on a device. Requests or sends already in progress may finish. The service worker does not maintain an offline page/data cache, but closure cannot remotely erase a page already open in a browser or copies saved elsewhere.

While the account is active, Settings → Export downloads JSON with a Markdown copy of each note. Authentication tokens and push endpoints/keys are excluded, but the file still contains personal content and session metadata. Export before closing your account, and keep the download private.

## Backups

**Host/database backup retention is unconfirmed.** No expiry date for backup copies after deletion or account closure is promised.

DEPLOY.md describes a six-hour Neon Free point-in-time recovery window and recommends weekly manual database dumps and dumps before risky migrations. That documented recovery window is not confirmation of the live setting or the provider's underlying backup retention. Manual dumps contain all users' data; DEPLOY.md instructs encrypted storage and removal of old dumps, but specifies no retention schedule and implements no automated dump cleanup. Restore branches and other copies also need operator handling. Restoring an older copy can bring back previously deleted records or earlier account-access state.

## Logs and their retention

The application writes JSON operational logs to standard output, viewed in Render. They can include request IDs, timestamps, HTTP methods, paths without query strings in request-error logs, error classes/codes, stack frames, error digests, and aggregate reminder-sweep outcomes and durations. Record IDs may appear in paths. The configured logger redacts sensitive field names and serializes errors without their messages; the authentication logger also filters details. These protections do not guarantee that all framework, authentication or hosting output is free of personal data. For example, framework error output can bypass the application logger.

There is no configured external application-log shipper or application-managed log expiry. DEPLOY.md says Render's retention depends on the workspace plan; the live duration is unconfirmed. Provider and cron execution logs follow their own retention. Database audit history has no age-based cleanup in the current application, and account closure retains it.

## No AI processing yet

The current application has no AI/LLM processing or model-training integration. Search uses PostgreSQL full-text search; summaries and insights use deterministic queries and calculations. Personal content is not sent to an AI provider by this implementation. Any future AI feature needs its own implementation and an updated explanation of its data use.

## Implementation references

These references make the scope of the notes reviewable; they describe code and configuration, not an audit of live provider accounts.

| Topic | Checked implementation or configuration |
| --- | --- |
| Stored account, content, device and history fields | [`src/server/db/schema/`](../src/server/db/schema/), especially `auth.ts`, `notes.ts`, `preferences.ts`, `push-subscriptions.ts`, `account-closure.ts`; [`audit/types.ts`](../src/server/audit/types.ts) |
| Authentication, sessions and cookies | [`auth/auth.ts`](../src/server/auth/auth.ts), [`auth/deletion-reauth.ts`](../src/server/auth/deletion-reauth.ts) |
| Hosting, transport, backups, scheduler and log retention | [DEPLOY.md](DEPLOY.md), [`render.yaml`](../render.yaml), [ADR 0003](decisions/0003-hosting-and-jobs.md); Neon encryption reference above |
| Notifications, private mode and subscriptions | [`reminders/payload.ts`](../src/server/modules/reminders/payload.ts), [`reminders/sweep.ts`](../src/server/modules/reminders/sweep.ts), [`push/send.ts`](../src/server/modules/push/send.ts), [`push/service.ts`](../src/server/modules/push/service.ts), [`sign-out-button.tsx`](../src/components/auth/sign-out-button.tsx), [`public/sw.js`](../public/sw.js) |
| Item deletion and retained relationships | [`goals/service.ts`](../src/server/modules/goals/service.ts), [`notes/service.ts`](../src/server/modules/notes/service.ts), `note_goals`/`note_tasks` foreign keys in [`notes.ts`](../src/server/db/schema/notes.ts) |
| Closure, recovery, access and delivery cutoff | [`account-deletion/service.ts`](../src/server/modules/account-deletion/service.ts), [`status.ts`](../src/server/modules/account-deletion/status.ts), [`actions.ts`](../src/server/modules/account-deletion/actions.ts), [`auth/session.ts`](../src/server/auth/session.ts), [`push/service.ts`](../src/server/modules/push/service.ts), [`reminders/claim.ts`](../src/server/modules/reminders/claim.ts), [`reminders/sweep.ts`](../src/server/modules/reminders/sweep.ts) |
| Export contents and exclusions | [`export/archive.ts`](../src/server/modules/export/archive.ts), [EXPORT_FORMAT.md](EXPORT_FORMAT.md) |
| Operational logs and redaction limits | [`logging/`](../src/server/logging/), [`auth/logger.ts`](../src/server/auth/logger.ts), [`instrumentation-node.ts`](../src/instrumentation-node.ts), [0.12 handoff](IMPLEMENTATION_PLAN.md#012-observability-and-error-handling-2026-10-20) |
| Search, deterministic insights and installed integrations | [`search/queries.ts`](../src/server/modules/search/queries.ts), [`metrics/`](../src/server/modules/metrics/), [`package.json`](../package.json); checked application source for AI SDKs/calls |
