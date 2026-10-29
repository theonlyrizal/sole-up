import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Relative, not "@/": drizzle-kit loads this file without the path alias.
import type { NoteDocument } from "../../../lib/notes/document";
import { NOTE_BODY_TEXT_MAX, NOTE_TITLE_MAX } from "../../../lib/notes/note";

import { users } from "./auth";
import { goals } from "./goals";
import { tasks } from "./tasks";

/** Postgres's `tsvector`, read back as its text form. Never written. */
const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// Written only through src/server/modules/notes/service.ts. Rules: ADR 0016.
//
// - `user_id` cascades from users (ADR 0006).
// - unique (id, user_id): note_goals and note_tasks (and 8.5's note_tags)
//   use composite foreign keys, so none can link across users.
// - `body` is the editor's JSON document, checked against the allowlist in
//   src/lib/notes/document.ts before every write. `body_text` is derived
//   from it by the server. Both, and the title, are user content: never
//   logged or put in an audit event.
// - `search_vector` is generated: the title weighted A, the body text B,
//   with the `english` configuration (immutable with the config spelled
//   out, as a generated column needs). GIN-indexed for 8.4's search.
// - `updated_at` moves on title and body changes only (the service sets it),
//   so links and archiving don't reorder the list. (user_id, updated_at)
//   serves the list.
export const notes = pgTable(
  "notes",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text(),
    body: jsonb().$type<NoteDocument>().notNull(),
    bodyText: text().notNull(),
    searchVector: tsvector()
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', "body_text"), 'B')`,
      ),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("notes_id_user_id_key").on(table.id, table.userId),
    index("notes_user_id_updated_at_idx").on(table.userId, table.updatedAt),
    index("notes_search_vector_idx").using("gin", table.searchVector),
    check(
      "notes_title_length_check",
      sql`${table.title} is null or char_length(${table.title}) between 1 and ${sql.raw(String(NOTE_TITLE_MAX))}`,
    ),
    check(
      "notes_body_text_length_check",
      sql`char_length(${table.bodyText}) <= ${sql.raw(String(NOTE_BODY_TEXT_MAX))}`,
    ),
  ],
);

// A note's links to goals and to tasks (ADR 0016 "Links"): one typed table
// per target. Composite foreign keys on (…, user_id) to both sides, both
// cascading, so a link never crosses users, and deleting the note, the goal
// or the task removes the link and keeps the other side. Each pair at most
// once. The target index serves 8.3's notes list on a goal or task and the
// delete cascades. At most 50 links per note in all is the service's rule.
export const noteGoals = pgTable(
  "note_goals",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    noteId: uuid().notNull(),
    goalId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "note_goals_note_id_user_id_fk",
      columns: [table.noteId, table.userId],
      foreignColumns: [notes.id, notes.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "note_goals_goal_id_user_id_fk",
      columns: [table.goalId, table.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("cascade"),
    unique("note_goals_note_id_goal_id_key").on(table.noteId, table.goalId),
    index("note_goals_goal_id_user_id_idx").on(table.goalId, table.userId),
  ],
);

export const noteTasks = pgTable(
  "note_tasks",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    noteId: uuid().notNull(),
    taskId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "note_tasks_note_id_user_id_fk",
      columns: [table.noteId, table.userId],
      foreignColumns: [notes.id, notes.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "note_tasks_task_id_user_id_fk",
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }).onDelete("cascade"),
    unique("note_tasks_note_id_task_id_key").on(table.noteId, table.taskId),
    index("note_tasks_task_id_user_id_idx").on(table.taskId, table.userId),
  ],
);
