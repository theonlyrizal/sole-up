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
      "user_preferences_locale_length_check",
      sql`char_length(${table.locale}) between 2 and 35`,
    ),
  ],
);
