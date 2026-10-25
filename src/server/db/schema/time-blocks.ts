import { sql } from "drizzle-orm";
import {
  check,
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
  TIME_BLOCK_EXCEPTION_KINDS,
  TIME_BLOCK_MAX_MINUTES,
  TIME_BLOCK_RRULE_MAX,
  TIME_BLOCK_STATUSES,
  type TimeBlockExceptionKind,
  type TimeBlockStatus,
} from "../../../lib/time-blocks";

import { users } from "./auth";
import { tasks } from "./tasks";

const inList = (values: readonly string[]) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`);

const MAX_DURATION = sql.raw(`interval '${TIME_BLOCK_MAX_MINUTES} minutes'`);

// Written only through src/server/modules/time-blocks/service.ts.
// Rules: ADR 0012.
//
// - `user_id` cascades from users (ADR 0006).
// - The task is required: a composite foreign key `(task_id, user_id)` that
//   cascades, so a block never points at another user's task and goes with
//   its task. The task service also deletes the blocks' audit events in the
//   same transaction (ADR 0005).
// - Timed only: `start_at`/`end_at` (UTC instants) and `tz`. The end comes
//   after the start, at most 24 hours of elapsed time later.
// - `rrule` makes the row a repeating series, as for calendar events: its
//   times are the first occurrence's, occurrences are expanded at query
//   time, and those that differ are rows in `time_block_exceptions`.
// - `status` is a one-off block's status. Each occurrence of a series has
//   its status in an exception, so a series row stays `scheduled`.
// - `unique (id, user_id)`: exceptions reference blocks.
export const timeBlocks = pgTable(
  "time_blocks",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid().notNull(),
    startAt: timestamp({ withTimezone: true }).notNull(),
    endAt: timestamp({ withTimezone: true }).notNull(),
    tz: text().notNull(),
    rrule: text(),
    status: text().$type<TimeBlockStatus>().notNull().default("scheduled"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("time_blocks_id_user_id_key").on(table.id, table.userId),
    foreignKey({
      name: "time_blocks_task_id_user_id_fk",
      columns: [table.taskId, table.userId],
      foreignColumns: [tasks.id, tasks.userId],
    }).onDelete("cascade"),
    index("time_blocks_user_id_start_at_idx").on(table.userId, table.startAt),
    // For a task's blocks: auto-mark, task delete and the cascade.
    index("time_blocks_user_id_task_id_idx").on(table.userId, table.taskId),
    check("time_blocks_end_check", sql`${table.endAt} > ${table.startAt}`),
    check(
      "time_blocks_duration_check",
      sql`${table.endAt} <= ${table.startAt} + ${MAX_DURATION}`,
    ),
    check(
      "time_blocks_status_check",
      sql`${table.status} in ${inList(TIME_BLOCK_STATUSES)}`,
    ),
    check(
      "time_blocks_series_status_check",
      sql`${table.rrule} is null or ${table.status} = 'scheduled'`,
    ),
    check(
      "time_blocks_rrule_length_check",
      sql`${table.rrule} is null or char_length(${table.rrule}) between 1 and ${sql.raw(String(TIME_BLOCK_RRULE_MAX))}`,
    ),
  ],
);

// One occurrence of a repeating block that differs from its rule: moved,
// cancelled, or marked. Written only through the time-blocks service.
// Rules: ADR 0012.
//
// - The series is a composite foreign key `(block_id, user_id)` that
//   cascades, so an exception never points at another user's block and
//   goes with its series.
// - The occurrence is keyed by its start as the rule generated it
//   (`original_start_at`), unique per series.
// - `cancelled` removes the occurrence and sets no other column. `modified`
//   holds the occurrence's full values (times and status), not just the
//   changed ones, as calendar event exceptions do.
export const timeBlockExceptions = pgTable(
  "time_block_exceptions",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockId: uuid().notNull(),
    originalStartAt: timestamp({ withTimezone: true }).notNull(),
    kind: text().$type<TimeBlockExceptionKind>().notNull(),
    startAt: timestamp({ withTimezone: true }),
    endAt: timestamp({ withTimezone: true }),
    status: text().$type<TimeBlockStatus>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      name: "time_block_exceptions_block_id_user_id_fk",
      columns: [table.blockId, table.userId],
      foreignColumns: [timeBlocks.id, timeBlocks.userId],
    }).onDelete("cascade"),
    unique("time_block_exceptions_block_id_original_start_at_key").on(
      table.blockId,
      table.originalStartAt,
    ),
    check(
      "time_block_exceptions_kind_check",
      sql`${table.kind} in ${inList(TIME_BLOCK_EXCEPTION_KINDS)}`,
    ),
    check(
      "time_block_exceptions_override_check",
      sql`case when ${table.kind} = 'cancelled'
        then ${table.startAt} is null and ${table.endAt} is null and ${table.status} is null
        else ${table.startAt} is not null and ${table.endAt} is not null and ${table.status} is not null
        end`,
    ),
    check(
      "time_block_exceptions_end_check",
      sql`${table.startAt} is null or ${table.endAt} > ${table.startAt}`,
    ),
    check(
      "time_block_exceptions_duration_check",
      sql`${table.startAt} is null or ${table.endAt} <= ${table.startAt} + ${MAX_DURATION}`,
    ),
    check(
      "time_block_exceptions_status_check",
      sql`${table.status} is null or ${table.status} in ${inList(TIME_BLOCK_STATUSES)}`,
    ),
  ],
);
