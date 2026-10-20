import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

// The audit log (ADR 0005). Rows are written only through recordAudit()
// (src/server/audit/record.ts), which validates `event_type` against the
// allowlist and `changes` against that type's strict schema, so no user
// content reaches this table.
//
// `entity_id` has no foreign key: one table holds events for every entity
// type. Hard deletes must remove an entity's events explicitly with
// deleteAuditEventsForEntity() in the same transaction. Account deletion
// cascades through `user_id`.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    // Defaults to the transaction's start time, so every event written in one
    // transaction shares a timestamp.
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    changes: jsonb().$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("audit_events_user_id_occurred_at_idx").on(
      table.userId,
      table.occurredAt,
    ),
    index("audit_events_user_id_entity_idx").on(
      table.userId,
      table.entityType,
      table.entityId,
    ),
  ],
);
