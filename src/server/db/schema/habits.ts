import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Relative, not "@/": drizzle-kit loads this file without the path alias.
import type { LocalDate } from "../../../lib/dates";
import {
  HABIT_AMOUNT_PRECISION,
  HABIT_AMOUNT_SCALE,
  HABIT_CADENCE_TYPES,
  HABIT_DESCRIPTION_MAX,
  HABIT_LOG_NOTE_MAX,
  HABIT_LOG_STATUSES,
  HABIT_MEASURES,
  HABIT_STATUSES,
  HABIT_TITLE_MAX,
  HABIT_UNIT_MAX,
  type HabitCadenceType,
  type HabitLogStatus,
  type HabitMeasure,
  type HabitStatus,
} from "../../../lib/habits/habit";

import { users } from "./auth";
import { goals } from "./goals";

const inList = (values: readonly string[]) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);

const lengthBetween = (column: unknown, max: number) =>
  sql`char_length(${column}) between 1 and ${sql.raw(String(max))}`;

/**
 * A target or logged value. Drizzle returns `numeric` as a string; the
 * service converts at its boundary.
 */
const amount = () =>
  numeric({ precision: HABIT_AMOUNT_PRECISION, scale: HABIT_AMOUNT_SCALE });

// Written only through src/server/modules/habits/service.ts. Rules: ADR 0014.
//
// - `user_id` cascades from users (ADR 0006).
// - unique (id, user_id): schedules, pauses and logs use composite foreign
//   keys, so none can point at another user's habit, and all cascade.
// - (goal_id, user_id) → goals(id, user_id). Deleting the goal must clear
//   `goal_id` only: a plain SET NULL would also null `user_id`. Drizzle
//   can't express `ON DELETE SET NULL (goal_id)`, so migration 0015 is
//   hand-edited to use it; the snapshot still says "set null", which keeps
//   drift checks quiet. Keep the hand edit if this key is ever regenerated.
//   The goal service clears the link itself first, with a `habit.updated`
//   event per habit; the key is the backstop.
// - `measure` and `unit` are fixed at creation; `unit` is set exactly for
//   quantity habits. Cadence and target are in `habit_schedules`.
// - `end_date` is inclusive.
export const habits = pgTable(
  "habits",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text(),
    measure: text().$type<HabitMeasure>().notNull(),
    unit: text(),
    startDate: date({ mode: "string" }).$type<LocalDate>().notNull(),
    endDate: date({ mode: "string" }).$type<LocalDate>(),
    status: text().$type<HabitStatus>().notNull().default("active"),
    statusChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    goalId: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("habits_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "habits_goal_id_user_id_fk",
      columns: [table.goalId, table.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("set null"),
    index("habits_user_id_status_idx").on(table.userId, table.status),
    // Lets deleting a goal find its habits without a scan.
    index("habits_goal_id_user_id_idx").on(table.goalId, table.userId),
    check(
      "habits_status_check",
      sql`${table.status} in ${inList(HABIT_STATUSES)}`,
    ),
    check(
      "habits_measure_check",
      sql`${table.measure} in ${inList(HABIT_MEASURES)}`,
    ),
    check(
      "habits_unit_check",
      sql`(${table.measure} = 'quantity') = (${table.unit} is not null)`,
    ),
    check(
      "habits_date_order_check",
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "habits_title_length_check",
      lengthBetween(table.title, HABIT_TITLE_MAX),
    ),
    check(
      "habits_description_length_check",
      sql`${table.description} is null or ${lengthBetween(table.description, HABIT_DESCRIPTION_MAX)}`,
    ),
    check(
      "habits_unit_length_check",
      sql`${table.unit} is null or ${lengthBetween(table.unit, HABIT_UNIT_MAX)}`,
    ),
  ],
);

// The cadence and target in effect from `effective_from`, the start of the
// user week an edit was made in (ADR 0014 "Editing the cadence or target").
// A habit always has at least one row; past weeks keep theirs.
//
// - unique (habit_id, effective_from): a second edit in a week replaces
//   that week's row. It also serves the composite foreign key.
// - `cadence_config` is checked per type with Zod (src/lib/habits/cadence.ts);
//   the CHECK here only holds its keys to its type.
// - `target` is set exactly for quantity habits, which the service enforces
//   (the row alone can't tell the measure).
export const habitSchedules = pgTable(
  "habit_schedules",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    habitId: uuid().notNull(),
    effectiveFrom: date({ mode: "string" }).$type<LocalDate>().notNull(),
    cadenceType: text().$type<HabitCadenceType>().notNull(),
    cadenceConfig: jsonb().$type<unknown>().notNull(),
    target: amount(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "habit_schedules_habit_id_user_id_fk",
      columns: [table.habitId, table.userId],
      foreignColumns: [habits.id, habits.userId],
    }).onDelete("cascade"),
    unique("habit_schedules_habit_id_effective_from_key").on(
      table.habitId,
      table.effectiveFrom,
    ),
    check(
      "habit_schedules_cadence_type_check",
      sql`${table.cadenceType} in ${inList(HABIT_CADENCE_TYPES)}`,
    ),
    check(
      "habit_schedules_cadence_config_check",
      sql`coalesce(case ${table.cadenceType}
        when 'daily' then ${table.cadenceConfig} = '{}'::jsonb
        when 'weekly_days' then jsonb_typeof(${table.cadenceConfig} -> 'days') = 'array'
          and ${table.cadenceConfig} - 'days' = '{}'::jsonb
        when 'times_per_week' then jsonb_typeof(${table.cadenceConfig} -> 'timesPerWeek') = 'number'
          and ${table.cadenceConfig} - 'timesPerWeek' = '{}'::jsonb
        else true end, false)`,
    ),
    check(
      "habit_schedules_target_check",
      sql`${table.target} is null or ${table.target} > 0`,
    ),
  ],
);

// A span of paused (or archived) days (ADR 0014 "Pause and archive").
// `start_date` is the first paused day; `end_date` the first active day
// again (exclusive), null while ongoing.
//
// - At most one open pause per habit (partial unique index); the service
//   keeps pauses from overlapping and deletes one that would be empty.
export const habitPauses = pgTable(
  "habit_pauses",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    habitId: uuid().notNull(),
    startDate: date({ mode: "string" }).$type<LocalDate>().notNull(),
    endDate: date({ mode: "string" }).$type<LocalDate>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "habit_pauses_habit_id_user_id_fk",
      columns: [table.habitId, table.userId],
      foreignColumns: [habits.id, habits.userId],
    }).onDelete("cascade"),
    // A habit's pauses in order; also serves the foreign key.
    index("habit_pauses_habit_id_start_date_idx").on(
      table.habitId,
      table.startDate,
    ),
    uniqueIndex("habit_pauses_one_open_key")
      .on(table.habitId)
      .where(sql`${table.endDate} is null`),
    check(
      "habit_pauses_date_order_check",
      sql`${table.endDate} is null or ${table.endDate} > ${table.startDate}`,
    ),
  ],
);

// What the user recorded for a habit on one local date (ADR 0014 "Logs").
// Written by chunk 6.4; "Missed" is derived, never stored.
//
// - unique (habit_id, local_date): one log per habit per day. It also
//   serves per-habit lookups and the composite foreign key.
// - (user_id, local_date) serves Today and Home across habits.
// - A skip has no `value`. `value` being set exactly on completed logs of
//   quantity habits is the service's rule (the row can't tell the measure).
// - `note` is user content: never logged or put in an audit event.
export const habitLogs = pgTable(
  "habit_logs",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    habitId: uuid().notNull(),
    localDate: date({ mode: "string" }).$type<LocalDate>().notNull(),
    status: text().$type<HabitLogStatus>().notNull(),
    value: amount(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "habit_logs_habit_id_user_id_fk",
      columns: [table.habitId, table.userId],
      foreignColumns: [habits.id, habits.userId],
    }).onDelete("cascade"),
    unique("habit_logs_habit_id_local_date_key").on(
      table.habitId,
      table.localDate,
    ),
    index("habit_logs_user_id_local_date_idx").on(
      table.userId,
      table.localDate,
    ),
    check(
      "habit_logs_status_check",
      sql`${table.status} in ${inList(HABIT_LOG_STATUSES)}`,
    ),
    check(
      "habit_logs_skip_value_check",
      sql`${table.status} <> 'skipped' or ${table.value} is null`,
    ),
    check(
      "habit_logs_value_check",
      sql`${table.value} is null or ${table.value} > 0`,
    ),
    check(
      "habit_logs_note_length_check",
      sql`${table.note} is null or ${lengthBetween(table.note, HABIT_LOG_NOTE_MAX)}`,
    ),
  ],
);
