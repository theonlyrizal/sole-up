import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Relative, not "@/": drizzle-kit loads this file without the path alias.
import {
  REMINDER_ERROR_CODE_MAX,
  REMINDER_KINDS,
  REMINDER_SKIP_REASONS,
  REMINDER_STATUSES,
  type ReminderKind,
  type ReminderSkipReason,
  type ReminderStatus,
} from "../../../lib/reminders";

import { users } from "./auth";
import { calendarEvents } from "./calendar-events";
import { tasks } from "./tasks";

const inList = (values: readonly string[]) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);

// The delivery schedule and record (ADR 0013). The item holds the setting
// (`reminder_offset_minutes`, `daily_nudge_time`); a row here is one
// delivery. Written only through src/server/modules/reminders/.
//
// - `user_id` cascades from users (ADR 0006). The task and event are
//   composite foreign keys that cascade, so a reminder never points at
//   another user's item and goes with it, record included.
// - Each kind has exactly its own link: a task for `task_deadline`, an event
//   for `event`, neither for the user's `daily_nudge`. Only an event row has
//   `occurrence_start`, and only for a repeating event (ADR 0012's key).
// - `target_at` is what the reminder is about (the deadline, the
//   occurrence's actual start, the nudge's local time as an instant);
//   `fire_at` is when it is due, an offset before.
// - At most one `scheduled`, non-snoozed row per task, per event and per
//   user's nudge (the partial unique index; IDs are UUIDs, so one key
//   covers all three). A snoozed row (5.6) sits outside it.
export const reminders = pgTable(
  "reminders",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().$type<ReminderKind>().notNull(),
    taskId: uuid(),
    eventId: uuid(),
    targetAt: timestamp({ withTimezone: true }).notNull(),
    occurrenceStart: timestamp({ withTimezone: true }),
    fireAt: timestamp({ withTimezone: true }).notNull(),
    status: text().$type<ReminderStatus>().notNull().default("scheduled"),
    skipReason: text().$type<ReminderSkipReason>(),
    attempts: integer().notNull().default(0),
    lastErrorCode: text(),
    claimedAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    snoozed: boolean().notNull().default(false),
    /**
     * Set when a sweep held the row for quiet hours (5.5): the end of those
     * quiet hours. The claim leaves it until then, and the sweep that
     * releases it bundles it with the user's other held reminders.
     */
    heldUntil: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "reminders_task_id_user_id_fk",
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "reminders_event_id_user_id_fk",
      columns: [table.eventId, table.userId],
      foreignColumns: [calendarEvents.id, calendarEvents.userId],
    }).onDelete("cascade"),
    uniqueIndex("reminders_one_scheduled_key")
      .on(sql`coalesce(${table.taskId}, ${table.eventId}, ${table.userId})`)
      .where(sql`${table.status} = 'scheduled' and not ${table.snoozed}`),
    // The sweep's claim: scheduled rows by fire time.
    index("reminders_status_fire_at_idx").on(table.status, table.fireAt),
    // For the cascades from tasks and events, and per-user lookups.
    index("reminders_task_id_idx").on(table.taskId),
    index("reminders_event_id_idx").on(table.eventId),
    index("reminders_user_id_idx").on(table.userId),
    check(
      "reminders_kind_check",
      sql`${table.kind} in ${inList(REMINDER_KINDS)}`,
    ),
    check(
      "reminders_link_check",
      sql`case ${table.kind}
        when 'task_deadline' then ${table.taskId} is not null and ${table.eventId} is null
          and ${table.occurrenceStart} is null
        when 'event' then ${table.eventId} is not null and ${table.taskId} is null
        else ${table.taskId} is null and ${table.eventId} is null
          and ${table.occurrenceStart} is null
        end`,
    ),
    check(
      "reminders_status_check",
      sql`${table.status} in ${inList(REMINDER_STATUSES)}`,
    ),
    check(
      "reminders_skip_reason_check",
      sql`case when ${table.status} = 'skipped'
        then ${table.skipReason} is not null and ${table.skipReason} in ${inList(REMINDER_SKIP_REASONS)}
        else ${table.skipReason} is null
        end`,
    ),
    check(
      "reminders_sent_at_check",
      sql`(${table.status} = 'sent') = (${table.sentAt} is not null)`,
    ),
    check("reminders_fire_at_check", sql`${table.fireAt} <= ${table.targetAt}`),
    check("reminders_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "reminders_last_error_code_check",
      sql`${table.lastErrorCode} is null or char_length(${table.lastErrorCode}) between 1 and ${sql.raw(String(REMINDER_ERROR_CODE_MAX))}`,
    ),
  ],
);
