import { sql } from "drizzle-orm";
import { check, pgTable, smallint, timestamp } from "drizzle-orm/pg-core";

// When the reminder sweep last ran (chunk 5.7, ADR 0013), so Settings can
// warn when cron-job.org has stopped calling it. One row for the whole app,
// not per user: it holds no user data. Written only by `runSweep`.
export const reminderSweepStatus = pgTable(
  "reminder_sweep_status",
  {
    /** Always 1: the CHECK keeps this a single row. */
    id: smallint().primaryKey().default(1),
    /** The `now` of the latest sweep that finished. */
    lastSweepAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    check("reminder_sweep_status_single_row_check", sql`${table.id} = 1`),
  ],
);
