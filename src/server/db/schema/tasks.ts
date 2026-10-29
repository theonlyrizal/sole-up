import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Relative, not "@/": drizzle-kit loads this file without the path alias.
import type { LocalDate } from "../../../lib/dates";
import { type Priority, PRIORITIES } from "../../../lib/priorities";
import { REMINDER_OFFSETS, type ReminderOffset } from "../../../lib/reminders";
import {
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_ESTIMATE_MIN_MINUTES,
  TASK_NOTES_MAX,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  type TaskStatus,
} from "../../../lib/tasks";

import { users } from "./auth";
import { goals } from "./goals";
import { milestones } from "./milestones";

const inList = (values: readonly string[]) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);

// Written only through src/server/modules/tasks/service.ts. Rules: ADR 0004
// (hierarchy and dates) and ADR 0011 (status, priority, estimates).
//
// - `user_id` cascades from users (ADR 0006).
// - At most one parent: a goal, a milestone, or neither (the inbox).
// - Each parent is a composite foreign key with `ON DELETE SET NULL (column)`,
//   so deleting a goal or milestone clears only that column, never `user_id`.
//   Drizzle can't express the column list, so migration 0007 is hand-edited;
//   the snapshot still says "set null", which keeps drift checks quiet.
//   Keep the hand edit if these foreign keys are ever regenerated.
// - A deadline is either `due_date` (local date) or `due_at` + `due_tz`
//   (UTC instant plus IANA zone), never both.
// - `completed_at` and `cancelled_at` are set exactly while their status holds.
export const tasks = pgTable(
  "tasks",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid(),
    milestoneId: uuid(),
    title: text().notNull(),
    notes: text(),
    status: text().$type<TaskStatus>().notNull().default("open"),
    priority: text().$type<Priority>(),
    dueDate: date({ mode: "string" }).$type<LocalDate>(),
    dueAt: timestamp({ withTimezone: true }),
    dueTz: text(),
    plannedDate: date({ mode: "string" }).$type<LocalDate>(),
    estimatedMinutes: integer(),
    /** Minutes before `due_at` to remind (ADR 0013); null for none. */
    reminderOffsetMinutes: integer().$type<ReminderOffset>(),
    completedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("tasks_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "tasks_goal_id_user_id_fk",
      columns: [table.goalId, table.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("set null"),
    foreignKey({
      name: "tasks_milestone_id_user_id_fk",
      columns: [table.milestoneId, table.userId],
      foreignColumns: [milestones.id, milestones.userId],
    }).onDelete("set null"),
    index("tasks_user_id_status_planned_date_idx").on(
      table.userId,
      table.status,
      table.plannedDate,
    ),
    index("tasks_user_id_status_due_date_idx").on(
      table.userId,
      table.status,
      table.dueDate,
    ),
    index("tasks_user_id_status_due_at_idx").on(
      table.userId,
      table.status,
      table.dueAt,
    ),
    index("tasks_user_id_milestone_id_idx").on(table.userId, table.milestoneId),
    index("tasks_user_id_goal_id_idx").on(table.userId, table.goalId),
    // Search (chunk 8.4, ADR 0016): queries must use this exact expression.
    index("tasks_title_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.title})`,
    ),
    check(
      "tasks_parent_check",
      sql`num_nonnulls(${table.goalId}, ${table.milestoneId}) <= 1`,
    ),
    check(
      "tasks_deadline_check",
      sql`${table.dueDate} is null or ${table.dueAt} is null`,
    ),
    check(
      "tasks_due_tz_check",
      sql`(${table.dueAt} is null) = (${table.dueTz} is null)`,
    ),
    check(
      "tasks_status_check",
      sql`${table.status} in ${inList(TASK_STATUSES)}`,
    ),
    check(
      "tasks_priority_check",
      sql`${table.priority} is null or ${table.priority} in ${inList(PRIORITIES)}`,
    ),
    check(
      "tasks_estimated_minutes_check",
      sql`${table.estimatedMinutes} is null or ${table.estimatedMinutes} between ${sql.raw(String(TASK_ESTIMATE_MIN_MINUTES))} and ${sql.raw(String(TASK_ESTIMATE_MAX_MINUTES))}`,
    ),
    check(
      "tasks_reminder_offset_minutes_check",
      sql`${table.reminderOffsetMinutes} is null or ${table.reminderOffsetMinutes} in ${sql.raw(`(${REMINDER_OFFSETS.join(", ")})`)}`,
    ),
    check(
      "tasks_completed_at_check",
      sql`(${table.status} = 'completed') = (${table.completedAt} is not null)`,
    ),
    check(
      "tasks_cancelled_at_check",
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} is not null)`,
    ),
    check("tasks_sort_order_check", sql`${table.sortOrder} >= 0`),
    check(
      "tasks_title_length_check",
      sql`char_length(${table.title}) between 1 and ${sql.raw(String(TASK_TITLE_MAX))}`,
    ),
    check(
      "tasks_notes_length_check",
      sql`${table.notes} is null or char_length(${table.notes}) between 1 and ${sql.raw(String(TASK_NOTES_MAX))}`,
    ),
  ],
);
