# SoleUp export format

Choose **Settings → Export → Download export** to generate an archive on demand.
SoleUp streams a UTF-8 JSON file named `soleup-export-YYYY-MM-DD.json`, using the
UTC date. The download contains personal data. Store it somewhere private.

## Version 1

The top-level object has three fields.

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | number | Archive format version, currently `1`. |
| `exportedAt` | string | UTC timestamp when the export began. |
| `tables` | object | One array per exported table, keyed by the SQL table name. Empty tables appear as `[]`. |

Rows use camelCase field names, such as `userId` and `createdAt`. UUIDs are
strings. Timestamps are ISO 8601 UTC strings. Date-only fields are `YYYY-MM-DD`
strings and retain their original local date. Nullable fields use JSON `null`.
IDs are kept so readers can join records. Each array is ordered by primary key.
Readers can ignore unrecognized fields and tables.

The archive includes the profile row and all tables directly owned by the user.

- Account and device metadata: `users`, `accounts`, `sessions`, `user_preferences`, `push_subscriptions`
- Planning: `life_areas`, `goals`, `milestones`, `tasks`
- Calendar and delivery: `calendar_events`, `calendar_event_exceptions`, `time_blocks`, `time_block_exceptions`, `reminders`
- Tracking and reviews: `habits`, `habit_schedules`, `habit_pauses`, `habit_logs`, `weekly_reviews`, `weekly_review_priorities`, `insight_dismissals`
- Notes: `notes`, `note_goals`, `note_tasks`, `tags`, `note_tags`
- History: `audit_events`

The archive omits `sessions.token`, `accounts.accessToken`,
`accounts.refreshToken`, `accounts.idToken`, `accounts.password`,
`push_subscriptions.endpoint`, `push_subscriptions.p256dh`, and
`push_subscriptions.auth`. The OAuth verification store (`verifications`) and
the global reminder sweep status (`reminder_sweep_status`) are outside the user
tables. The internal lifecycle markers `account_closures` and `cemetery` are
excluded. An account must be active to download an export.

The server reads rows in bounded batches as the browser downloads them. Edits
made during the download can be reflected in later batches. `exportedAt` records
the start of the download. If the connection drops, download the archive again
to get a complete JSON document.

## Notes and Markdown

Each `tables.notes` row includes its title, original TipTap document in `body`,
plain text in `bodyText`, and a Markdown rendering of the body in `markdown`.
This applies to both active and archived notes. Copy `markdown` to a `.md` file
to use it separately. Goal, task, and tag associations can be read by joining
`note_goals`, `note_tasks`, and `note_tags` on `noteId`. Join `note_tags.tagId`
to `tags.id` for tag names.

The Markdown uses headings, lists, quotes, fenced code, links, and common inline
marks, including GitHub-flavored strikethrough. Ordered lists use decimal
markers. Use the original JSON for editor-specific attributes and exact rich-text
formatting.
