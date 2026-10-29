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
  REVIEW_PERIOD_DAYS,
  REVIEW_TEXT_MAX,
} from "../../../lib/weekly-reviews";

import { users } from "./auth";
import { goals } from "./goals";
import { tasks } from "./tasks";

const optionalLength = (column: unknown) =>
  sql`${column} is null or char_length(${column}) between 1 and ${sql.raw(String(REVIEW_TEXT_MAX))}`;

// Written only through src/server/modules/weekly-reviews/service.ts.
// Rules: ADR 0015.
//
// - `user_id` cascades from users (ADR 0006).
// - unique (id, user_id): priorities use a composite foreign key, so none
//   can point at another user's review.
// - unique (user_id, period_start): one review per period. It also serves
//   a user's reviews in order.
// - `period_start` and `period_end` are local dates, `period_end` exclusive.
//   They never move with a zone or week-start change, so an older period may
//   overlap a newer one. That a period starts on a week start, and which
//   periods are open, are the service's rules (they need today and the
//   user's preferences).
// - The four text fields are user content: never logged or put in an audit
//   event. Empty text is stored as null.
export const weeklyReviews = pgTable(
  "weekly_reviews",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodStart: date({ mode: "string" }).$type<LocalDate>().notNull(),
    periodEnd: date({ mode: "string" }).$type<LocalDate>().notNull(),
    wins: text(),
    blockers: text(),
    lessons: text(),
    prioritiesNote: text(),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("weekly_reviews_id_user_id_key").on(table.id, table.userId),
    unique("weekly_reviews_user_id_period_start_key").on(
      table.userId,
      table.periodStart,
    ),
    check(
      "weekly_reviews_period_check",
      sql`${table.periodEnd} = ${table.periodStart} + ${sql.raw(String(REVIEW_PERIOD_DAYS))}`,
    ),
    check("weekly_reviews_wins_length_check", optionalLength(table.wins)),
    check(
      "weekly_reviews_blockers_length_check",
      optionalLength(table.blockers),
    ),
    check("weekly_reviews_lessons_length_check", optionalLength(table.lessons)),
    check(
      "weekly_reviews_priorities_note_length_check",
      optionalLength(table.prioritiesNote),
    ),
  ],
);

// One of a review's priorities for the following period: a link to exactly
// one goal or one task (ADR 0015 "Structure").
//
// - Composite foreign keys to the review, the goal and the task, all on
//   (…, user_id) and all cascading: a priority can never link across users,
//   and deleting its review, goal or task removes it. The exactly-one CHECK
//   rules out SET NULL.
// - Each goal or task at most once per review; `sort_order` is dense from
//   0, which the service keeps by replacing the whole list. Unique
//   (review_id, sort_order) also serves the review's list and its key.
// - The (goal_id, user_id) and (task_id, user_id) indexes let a goal or
//   task delete find its priorities without a scan.
// - At most 10 per review, and only active or paused goals and open tasks
//   when added, are the service's rules.
export const weeklyReviewPriorities = pgTable(
  "weekly_review_priorities",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewId: uuid().notNull(),
    goalId: uuid(),
    taskId: uuid(),
    sortOrder: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "weekly_review_priorities_review_id_user_id_fk",
      columns: [table.reviewId, table.userId],
      foreignColumns: [weeklyReviews.id, weeklyReviews.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "weekly_review_priorities_goal_id_user_id_fk",
      columns: [table.goalId, table.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "weekly_review_priorities_task_id_user_id_fk",
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }).onDelete("cascade"),
    unique("weekly_review_priorities_review_id_goal_id_key").on(
      table.reviewId,
      table.goalId,
    ),
    unique("weekly_review_priorities_review_id_task_id_key").on(
      table.reviewId,
      table.taskId,
    ),
    unique("weekly_review_priorities_review_id_sort_order_key").on(
      table.reviewId,
      table.sortOrder,
    ),
    index("weekly_review_priorities_goal_id_user_id_idx").on(
      table.goalId,
      table.userId,
    ),
    index("weekly_review_priorities_task_id_user_id_idx").on(
      table.taskId,
      table.userId,
    ),
    check(
      "weekly_review_priorities_one_target_check",
      sql`num_nonnulls(${table.goalId}, ${table.taskId}) = 1`,
    ),
    check(
      "weekly_review_priorities_sort_order_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);
