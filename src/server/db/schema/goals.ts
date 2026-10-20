import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Relative, not "@/": drizzle-kit loads this file without the path alias.
import type { LocalDate } from "../../../lib/dates";
import {
  GOAL_DESCRIPTION_MAX,
  GOAL_PRIORITIES,
  GOAL_REASON_MAX,
  GOAL_STATUSES,
  GOAL_TITLE_MAX,
  type GoalPriority,
  type GoalStatus,
} from "../../../lib/goals";

import { users } from "./auth";
import { lifeAreas } from "./life-areas";

const inList = (values: readonly string[]) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);

// Written only through src/server/modules/goals/service.ts. Rules: ADR 0010.
//
// - `user_id` cascades from users (ADR 0006).
// - unique (id, user_id) lets milestones and tasks use composite foreign keys.
// - (life_area_id, user_id) → life_areas(id, user_id), so a goal can only
//   name its owner's area. Deleting the area must clear `life_area_id` only:
//   a plain SET NULL would also null `user_id`. Drizzle can't express
//   `ON DELETE SET NULL (life_area_id)`, so migration 0005 is hand-edited to
//   use it; the snapshot still says "set null", which keeps drift checks
//   quiet. Keep the hand edit if this foreign key is ever regenerated.
// - `completed_at` is only set while completed, or archived after being
//   completed.
export const goals = pgTable(
  "goals",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lifeAreaId: uuid(),
    title: text().notNull(),
    description: text(),
    reason: text(),
    status: text().$type<GoalStatus>().notNull().default("active"),
    priority: text().$type<GoalPriority>(),
    startDate: date({ mode: "string" }).$type<LocalDate>(),
    targetDate: date({ mode: "string" }).$type<LocalDate>(),
    completedAt: timestamp({ withTimezone: true }),
    statusChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("goals_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "goals_life_area_id_user_id_fk",
      columns: [table.lifeAreaId, table.userId],
      foreignColumns: [lifeAreas.id, lifeAreas.userId],
    }).onDelete("set null"),
    index("goals_user_id_status_idx").on(table.userId, table.status),
    // Lets deleting a life area find its goals without a scan.
    index("goals_life_area_id_user_id_idx").on(table.lifeAreaId, table.userId),
    check(
      "goals_status_check",
      sql`${table.status} in ${inList(GOAL_STATUSES)}`,
    ),
    check(
      "goals_priority_check",
      sql`${table.priority} is null or ${table.priority} in ${inList(GOAL_PRIORITIES)}`,
    ),
    check(
      "goals_date_order_check",
      sql`${table.startDate} is null or ${table.targetDate} is null or ${table.targetDate} >= ${table.startDate}`,
    ),
    check(
      "goals_completed_at_check",
      sql`(${table.status} <> 'completed' or ${table.completedAt} is not null) and (${table.completedAt} is null or ${table.status} in ('completed', 'archived'))`,
    ),
    check(
      "goals_title_length_check",
      sql`char_length(${table.title}) between 1 and ${sql.raw(String(GOAL_TITLE_MAX))}`,
    ),
    check(
      "goals_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(String(GOAL_DESCRIPTION_MAX))}`,
    ),
    check(
      "goals_reason_length_check",
      sql`${table.reason} is null or char_length(${table.reason}) between 1 and ${sql.raw(String(GOAL_REASON_MAX))}`,
    ),
  ],
);
