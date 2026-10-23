import { sql } from "drizzle-orm";
import {
  boolean,
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
import {
  CALENDAR_EVENT_DESCRIPTION_MAX,
  CALENDAR_EVENT_LOCATION_MAX,
  CALENDAR_EVENT_SOURCES,
  CALENDAR_EVENT_TITLE_MAX,
  type CalendarEventSource,
} from "../../../lib/calendar-events";
import type { LocalDate } from "../../../lib/dates";

import { users } from "./auth";
import { goals } from "./goals";
import { lifeAreas } from "./life-areas";

const inList = (values: readonly string[]) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);

// Written only through src/server/modules/calendar-events/service.ts.
// Rules: ADR 0012. One-off events only; recurrence arrives in 4.3.
//
// - `user_id` cascades from users (ADR 0006).
// - Exactly one shape: timed (`start_at`/`end_at` UTC instants + `tz`) or
//   all-day (`start_date`/`end_date` local dates, end exclusive), chosen by
//   `all_day`. The end always comes after the start.
// - The goal and life area are composite foreign keys with
//   `ON DELETE SET NULL (column)`, so deleting either clears only that link,
//   never `user_id`. Drizzle can't express the column list, so migration 0008
//   is hand-edited; the snapshot still says "set null", which keeps drift
//   checks quiet. Keep the hand edit if these foreign keys are regenerated.
// - `unique (id, user_id)`: exceptions, reminders and note links will
//   reference events.
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid(),
    lifeAreaId: uuid(),
    title: text().notNull(),
    description: text(),
    location: text(),
    allDay: boolean().notNull(),
    startAt: timestamp({ withTimezone: true }),
    endAt: timestamp({ withTimezone: true }),
    tz: text(),
    startDate: date({ mode: "string" }).$type<LocalDate>(),
    endDate: date({ mode: "string" }).$type<LocalDate>(),
    source: text().$type<CalendarEventSource>().notNull().default("internal"),
    externalId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("calendar_events_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "calendar_events_goal_id_user_id_fk",
      columns: [table.goalId, table.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("set null"),
    foreignKey({
      name: "calendar_events_life_area_id_user_id_fk",
      columns: [table.lifeAreaId, table.userId],
      foreignColumns: [lifeAreas.id, lifeAreas.userId],
    }).onDelete("set null"),
    index("calendar_events_user_id_start_at_idx").on(
      table.userId,
      table.startAt,
    ),
    index("calendar_events_user_id_start_date_idx").on(
      table.userId,
      table.startDate,
    ),
    // For the SET NULL scans when a goal or life area is deleted.
    index("calendar_events_user_id_goal_id_idx").on(table.userId, table.goalId),
    index("calendar_events_user_id_life_area_id_idx").on(
      table.userId,
      table.lifeAreaId,
    ),
    check(
      "calendar_events_shape_check",
      sql`case when ${table.allDay}
        then ${table.startDate} is not null and ${table.endDate} is not null
          and ${table.startAt} is null and ${table.endAt} is null and ${table.tz} is null
        else ${table.startAt} is not null and ${table.endAt} is not null and ${table.tz} is not null
          and ${table.startDate} is null and ${table.endDate} is null
        end`,
    ),
    check(
      "calendar_events_end_check",
      sql`case when ${table.allDay}
        then ${table.endDate} > ${table.startDate}
        else ${table.endAt} > ${table.startAt}
        end`,
    ),
    check(
      "calendar_events_source_check",
      sql`${table.source} in ${inList(CALENDAR_EVENT_SOURCES)}`,
    ),
    check(
      "calendar_events_title_length_check",
      sql`char_length(${table.title}) between 1 and ${sql.raw(String(CALENDAR_EVENT_TITLE_MAX))}`,
    ),
    check(
      "calendar_events_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(String(CALENDAR_EVENT_DESCRIPTION_MAX))}`,
    ),
    check(
      "calendar_events_location_length_check",
      sql`${table.location} is null or char_length(${table.location}) between 1 and ${sql.raw(String(CALENDAR_EVENT_LOCATION_MAX))}`,
    ),
  ],
);
