import { sql } from "drizzle-orm";
import {
  check,
  date,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { LocalDate } from "../../../lib/dates";
import type { InsightKey } from "../../../lib/insights";

import { users } from "./auth";

export const insightDismissals = pgTable(
  "insight_dismissals",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    insightKey: text().$type<InsightKey>().notNull(),
    periodStart: date({ mode: "string" }).$type<LocalDate>().notNull(),
    periodEnd: date({ mode: "string" }).$type<LocalDate>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("insight_dismissals_user_id_key_period_start_key").on(
      table.userId,
      table.insightKey,
      table.periodStart,
    ),
    check(
      "insight_dismissals_period_check",
      sql`${table.periodStart} < ${table.periodEnd}`,
    ),
  ],
);
