import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Relative, not "@/": drizzle-kit loads this file without the path alias.
import { DEVICE_LABEL_MAX, PUSH_ENDPOINT_MAX } from "../../../lib/push";

import { users } from "./auth";

// One row per browser subscribed to Web Push (chunk 5.3). Written only
// through src/server/modules/push/service.ts.
//
// - `user_id` cascades from users (ADR 0006).
// - `endpoint` is unique across all users: it identifies one browser. When a
//   different user subscribes the same browser, the row moves to them
//   (the service upserts on it).
// - `endpoint`, `p256dh` and `auth` are secrets: together they let anyone
//   with our VAPID key send to the device. Never log them, and never send
//   them to the client (Settings gets a hash of the endpoint instead).
// - No other table references this one, so there is no unique (id, user_id).
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text().notNull().unique(),
    /** The browser's P-256 public key, base64url. */
    p256dh: text().notNull(),
    /** The browser's 16-byte auth secret, base64url. */
    auth: text().notNull(),
    /** "Chrome on Android": derived from the user agent, never the raw string. */
    userAgentLabel: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** The last push the push service accepted for this device. */
    lastSuccessAt: timestamp({ withTimezone: true }),
    /** Failed sends since the last success. */
    failedCount: integer().notNull().default(0),
  },
  (table) => [
    index("push_subscriptions_user_id_idx").on(table.userId),
    check(
      "push_subscriptions_endpoint_check",
      sql`${table.endpoint} like 'https://%' and char_length(${table.endpoint}) <= ${sql.raw(String(PUSH_ENDPOINT_MAX))}`,
    ),
    check(
      "push_subscriptions_keys_check",
      sql`char_length(${table.p256dh}) = 87 and char_length(${table.auth}) = 22`,
    ),
    check(
      "push_subscriptions_label_check",
      sql`char_length(${table.userAgentLabel}) between 1 and ${sql.raw(String(DEVICE_LABEL_MAX))}`,
    ),
    check(
      "push_subscriptions_failed_count_check",
      sql`${table.failedCount} >= 0`,
    ),
  ],
);
