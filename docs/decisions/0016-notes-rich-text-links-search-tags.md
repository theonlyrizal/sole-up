# 0016: Notes: rich text, links, search and tags

**Date:** 2026-10-29
**Status:** Accepted

## Context
Phase 8 adds notes: personal information the user wants to keep, connected to the goals it supports. The 8.0 decision gate had to settle the body format, how notes link to other records, and how search works, before writing schema. It deferred backlinks between notes, tags and attachments. Two more questions followed from the user's answers: how a rich-text body is stored, and what tags apply to.

Rules already in force:
- Every user-owned table has `user_id`, referenced tables have `unique (id, user_id)`, and child foreign keys are composite, so the database can't link records across users (Conventions, [ADR 0005](0005-history-and-audit-log.md)).
- Archive is a reversible status. Delete is a confirmed hard delete that also removes the entity's audit events ([ADR 0006](0006-deletion.md)).
- Audit events hold structured fields only. Note bodies and titles are user content and never go in an event or a log.
- Production runs on Render Free and Neon Free ([ADR 0009](0009-production-hosting.md)): no persistent disk and no extra search service.
- `CLAUDE.md`: treat model and client input as untrusted, validate at the boundary, and avoid speculative features.

The gate recommended Markdown rendered without raw HTML. The user chose a rich-text editor instead. The gate's recommendations on links and search were accepted. The gate deferred tags, and the user added them, for notes only.

## Decision

### Format: a rich-text editor storing a JSON document
- Notes are written in a **WYSIWYG editor, TipTap** (on ProseMirror), using only its open-source (MIT) extensions. 8.2 pins the current stable version.
- The **stored body is the editor's JSON document** (`body`, `jsonb`), the source of truth. It is never HTML, and no HTML string is ever stored, accepted or rendered.
- The editor and the server share **one allowlist** of node and mark types, in `src/lib/notes/`:
  - nodes: `doc`, `paragraph`, `heading` (levels 1–3), `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `text`
  - marks: `bold`, `italic`, `strike`, `code`, `link`
  - a link's `href` must be `http:`, `https:` or `mailto:`, up to 2,048 characters
  - no images, tables, embeds, task-list checkboxes (they would be confused with tasks), colours or raw HTML
- **The server validates every saved document** with a Zod schema built from that allowlist: an unknown type or attribute, a disallowed link scheme, nesting deeper than 20 levels, or a document over 512 KB of JSON is a validation error, never silently fixed. Pasted content is reduced to the allowlist by the editor's schema before it is saved.
- **`body_text`** is a plain-text copy the **server derives** from the validated document (block nodes on separate lines, control characters removed), up to 100,000 characters. It feeds search, the list preview and the length limit. The client never sends it.
- **Display:** read-only views render the JSON to React elements through an allowlisted renderer. Nothing uses `dangerouslySetInnerHTML`. Links open with `rel="noopener noreferrer"`.
- **Title:** optional, trimmed, empty stored as null, up to 200 characters, as other titles are. The list shows "Untitled" for a note without one.

### Saving
- A note row is created on the **first save with any content** (a title or a non-empty body), so opening "New note" and leaving makes nothing. A note emptied later is kept until deleted.
- **Autosave:** the editor saves about a second after typing stops and flushes a pending save on blur, navigation and `pagehide`. The indicator shows saving, saved, or not saved with a retry. Leaving with an unsaved change asks first.
- **Concurrent edits:** each save carries the `updated_at` it started from. If the note has changed since (another tab or device), the service refuses with a conflict ("This note changed somewhere else"). The editor keeps the unsaved text on screen and offers to load the saved version.
- `updated_at` moves on title and body changes only. Links and tags don't move it, so the list's "recently updated" order reflects writing.

### Archive and delete
- **Archive** sets `archived_at`. Archived notes leave the Notes list, search and the linked-note lists on goals and tasks, appear under an Archived view, open read-only, and can be restored.
- **Delete** is a confirmed hard delete, archived or not. It removes the note's goal, task and tag links (cascade) and its audit events in the same transaction.

### Links: typed join tables
- A note links to **goals and tasks** through two join tables, `note_goals` and `note_tasks`, never a polymorphic `entity_type`/`entity_id`. Each has `user_id`, composite FKs `(note_id, user_id)` and `(goal_id, user_id)` or `(task_id, user_id)`, both `ON DELETE CASCADE`, and is unique per pair.
- A note can link to many goals and tasks, at most 50 links in all. A goal or task can have any number of notes. Any of the user's goals and tasks can be linked, whatever its status.
- **Deleting a goal or task removes the link and keeps the note.** Deleting a goal moves its tasks to the inbox (ADR 0006), and their links stay.
- Other targets (habits, life areas, events, reviews) are not linkable in v1. Each would be another join table.

### Search: Postgres full-text search, English
- `notes.search_vector` is a **generated, stored `tsvector`**: `setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', body_text), 'B')`, with a **GIN index**. Titles rank above body text.
- **Goal and task titles** are searched with expression GIN indexes on `to_tsvector('english', title)`. Milestones, goal reasons and descriptions, and task notes are not searched in v1.
- Queries use `websearch_to_tsquery('english', …)`, so quotes, `OR` and `-word` work. A query of only stop words says there was nothing to search for.
- **Results** come in three groups (notes, goals, tasks), each ranked by `ts_rank_cd`, then most recently updated, up to 20 per group. Goals and tasks of every status are included and show their status. Archived notes are not.
- **Highlights** come from `ts_headline` on the title and `body_text`, with private delimiter characters (which `body_text` never contains) instead of HTML tags. They are split into React `<mark>` elements, never inserted as HTML.
- **Search terms are user content.** The search runs as a Server Action (a POST), so terms aren't in a URL, browser history or the host's request logs, and they are never logged. Terms are trimmed, up to 200 characters.
- Every search is scoped to the current user in each of the three queries.

### Tags: on notes only
- **`tags`:** user-owned, `name` trimmed, 1–40 characters, unique per user ignoring case (`unique (user_id, lower(name))`), with `unique (id, user_id)`.
- **`note_tags`:** composite FKs `(note_id, user_id)` and `(tag_id, user_id)`, both cascading, unique per pair. A note has at most 20 tags.
- Tags are **created inline while tagging** a note (a typed name matches an existing tag ignoring case, or makes a new one), **renamed** and **deleted** from the Notes page. Renaming to a name already taken is a conflict. **Deleting a tag** is confirmed with the number of notes it is on, and only untags them. An unused tag stays until deleted.
- The Notes list and search's notes group can be **filtered by one tag**. Goals and tasks are not tagged. They are grouped by life area.

### Audit events
Entity type `note`, with the note's ID:
- `note.created`
- `note.updated` (the changed fields by name: `title`, `body`). A save within 10 minutes of the note's latest `note.updated` event records none, so autosave doesn't write an event every few seconds. The event marks an editing session, not each save.
- `note.archived`, `note.restored`
- `note.linked`, `note.unlinked` (`targetType` `goal` or `task`, `targetId`)
- `note.tags_changed` (tag IDs, from and to)

Entity type `tag`: `tag.created`, `tag.renamed`, with no names.

There is no `note.deleted` or `tag.deleted`: a hard delete removes the entity's events. Never in an event or a log: a note's title or body, `body_text`, a tag name, or search terms.

## Alternatives considered
- **Markdown text rendered without raw HTML (the recommendation):** plain text that exports and searches directly, but the user writes syntax and needs a preview. The user chose rich text.
- **Plain text:** no renderer and no XSS surface, but no headings, lists or links in long notes.
- **Storing sanitized HTML:** simple to render, but the sanitizer becomes the only XSS defence, the output goes through `dangerouslySetInnerHTML`, and search and Markdown export must strip or convert tags.
- **A WYSIWYG editor that serializes to Markdown:** keeps Markdown portable, but round trips lose some formatting and the serializers are less mature.
- **One `note_links` table with typed nullable columns and an exactly-one CHECK** (as `weekly_review_priorities`): the same FK guarantees in one table, but a new target means widening a CHECK. Rejected for one table per target.
- **Polymorphic `entity_type`/`entity_id`:** any target without a migration, but no foreign keys, so ownership and existence are checked only in code and deletes leave orphans.
- **The `simple` text-search configuration:** language-neutral, but no stemming ("run" wouldn't find "running"). **Trigram (`pg_trgm`):** typo-tolerant substring matching, but an extension, larger indexes and poor ranking for long bodies. **`ILIKE`:** full scans and no ranking.
- **Search terms in the URL (`/search?q=`):** shareable and back-button friendly, but terms would land in browser history and the host's request logs.
- **Tags on goals and tasks too:** one vocabulary across the app, but it overlaps life areas and adds tag UI to the goal and task forms and filters. **Tags in place of links:** loses the FK-enforced connection that is Phase 8's goal.
- **Recording `note.updated` on every autosave:** exact, but floods the audit log with events that carry no content anyway.
- **Backlinks between notes and attachments:** still deferred. Attachments need file storage the free hosts don't provide, and backlinks need links inside the document kept in sync with a join table.

## Consequences
- **8.1** adds `notes` (`unique (id, user_id)`, title and `body_text` length CHECKs, the generated `search_vector`, a GIN index, an `(user_id, updated_at)` index), `note_goals` and `note_tasks`, the shared document allowlist and its Zod schema, the `body_text` derivation, and the service (save with the concurrency check, archive, restore, delete, link, unlink). A `tsvector` column needs a Drizzle custom type, and the generated expression may need hand-editing in the migration, with a test.
- **8.2** adds the TipTap dependency (client-only, `immediatelyRender: false` for server rendering) and the allowlisted read-only renderer. The Markdown preview toggle is gone, since the editor is WYSIWYG.
- **8.3** puts linked notes on goal detail and the task dialog. The goal and task delete confirmations say linked notes are kept.
- **8.4** adds the expression GIN indexes on `goals` and `tasks` (a migration) and the search Server Action.
- **A new chunk 8.5** adds `tags` and `note_tags`, tag management and the tag filters.
- **Phase 10:** export (10.1) converts each note's JSON to Markdown on the server and also includes the JSON, the links and the tags. The privacy notes (10.3) say note bodies are stored as JSON in the database and searched there.
- `DATA_MODEL.md` (Note, NoteGoal, NoteTask, Tag, NoteTag) and chunks 8.0–8.5 of the implementation plan reflect these rules.
