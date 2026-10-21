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
import {
  MILESTONE_DESCRIPTION_MAX,
  MILESTONE_STATUSES,
  MILESTONE_TITLE_MAX,
  type MilestoneStatus,
} from "../../../lib/milestones";

import { users } from "./auth";
import { goals } from "./goals";

// Written only through src/server/modules/milestones/service.ts. Rules:
// ADR 0010.
//
// - `user_id` cascades from users (ADR 0006).
// - (goal_id, user_id) → goals(id, user_id), so a milestone can only sit
//   under its owner's goal. Deleting the goal deletes its milestones (a
//   plain cascade is safe on a composite key: the whole row goes).
// - unique (id, user_id) lets tasks use composite foreign keys.
// - `sort_order` is dense per goal (0..n-1); the service keeps it so.
// - `completed_at` is set exactly while the milestone is completed.
export const milestones = pgTable(
  "milestones",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid().notNull(),
    title: text().notNull(),
    description: text(),
    status: text().$type<MilestoneStatus>().notNull().default("open"),
    dueDate: date({ mode: "string" }).$type<LocalDate>(),
    completedAt: timestamp({ withTimezone: true }),
    sortOrder: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("milestones_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "milestones_goal_id_user_id_fk",
      columns: [table.goalId, table.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("cascade"),
    // A goal's list in order; also serves the foreign key on delete.
    index("milestones_goal_id_user_id_sort_order_idx").on(
      table.goalId,
      table.userId,
      table.sortOrder,
    ),
    check(
      "milestones_status_check",
      sql`${table.status} in ${sql.raw(`(${MILESTONE_STATUSES.map((status) => `'${status}'`).join(", ")})`)}`,
    ),
    check(
      "milestones_completed_at_check",
      sql`(${table.status} = 'completed') = (${table.completedAt} is not null)`,
    ),
    check("milestones_sort_order_check", sql`${table.sortOrder} >= 0`),
    check(
      "milestones_title_length_check",
      sql`char_length(${table.title}) between 1 and ${sql.raw(String(MILESTONE_TITLE_MAX))}`,
    ),
    check(
      "milestones_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(String(MILESTONE_DESCRIPTION_MAX))}`,
    ),
  ],
);
