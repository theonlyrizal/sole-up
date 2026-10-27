import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

// One row per user, created on first sign-in (src/server/auth/auth.ts) and
// written only through src/server/modules/preferences/service.ts.
//
// `timezone` is null until the user confirms one: the app proposes the
// browser's zone but never stores it without the user saying yes. The
// value is an IANA name validated against the runtime's zone list
// (src/lib/time-zones.ts), which SQL can't check.
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    timezone: text(),
    /** A BCP 47 tag such as `en-GB`, used for date and number formatting. */
    locale: text().notNull().default("en-US"),
    /** First day of the week: 0 = Sunday … 6 = Saturday. Default Monday. */
    weekStart: smallint().notNull().default(1),
    /**
     * The user's answer to the one-time starter life areas offer, or null
     * while it hasn't been answered (src/server/modules/life-areas).
     */
    lifeAreaStarters: text().$type<"accepted" | "dismissed">(),
    /**
     * The daily planning nudge's local time, "HH:MM" in `timezone`, or null
     * while it is off (ADR 0013).
     */
    dailyNudgeTime: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "user_preferences_week_start_check",
      sql`${table.weekStart} between 0 and 6`,
    ),
    check(
      "user_preferences_timezone_length_check",
      sql`${table.timezone} is null or char_length(${table.timezone}) between 1 and 64`,
    ),
    check(
      "user_preferences_life_area_starters_check",
      sql`${table.lifeAreaStarters} is null or ${table.lifeAreaStarters} in ('accepted', 'dismissed')`,
    ),
    check(
      "user_preferences_locale_length_check",
      sql`char_length(${table.locale}) between 2 and 35`,
    ),
    check(
      "user_preferences_daily_nudge_time_check",
      sql`${table.dailyNudgeTime} is null or ${table.dailyNudgeTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
  ],
);
