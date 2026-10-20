import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Relative, not "@/": drizzle-kit loads this file without the path alias.
import {
  LIFE_AREA_COLORS,
  LIFE_AREA_DESCRIPTION_MAX,
  LIFE_AREA_NAME_MAX,
  type LifeAreaColor,
  type LifeAreaStatus,
} from "../../../lib/life-areas";

import { users } from "./auth";

// The reference user-owned table: later entities copy its shape.
// Written only through src/server/modules/life-areas/service.ts.
//
// - `user_id` cascades from users (ADR 0006).
// - unique (id, user_id) lets child tables use composite foreign keys, so
//   the database can never link records across users.
// - Active names are unique per user, ignoring case. Archived areas don't
//   count, so an old name can be reused; unarchiving checks again.
export const lifeAreas = pgTable(
  "life_areas",
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text(),
    color: text().$type<LifeAreaColor>(),
    sortOrder: integer().notNull(),
    status: text().$type<LifeAreaStatus>().notNull().default("active"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("life_areas_id_user_id_key").on(table.id, table.userId),
    uniqueIndex("life_areas_user_id_active_name_key")
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.status} = 'active'`),
    index("life_areas_user_id_sort_order_idx").on(
      table.userId,
      table.sortOrder,
    ),
    check(
      "life_areas_status_check",
      sql`${table.status} in ('active', 'archived')`,
    ),
    check(
      "life_areas_name_length_check",
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(LIFE_AREA_NAME_MAX))}`,
    ),
    check(
      "life_areas_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(String(LIFE_AREA_DESCRIPTION_MAX))}`,
    ),
    check(
      "life_areas_color_check",
      sql`${table.color} is null or ${table.color} in ${sql.raw(`(${LIFE_AREA_COLORS.map((color) => `'${color}'`).join(", ")})`)}`,
    ),
  ],
);
