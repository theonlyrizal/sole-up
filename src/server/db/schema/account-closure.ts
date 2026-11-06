import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

/** Operational state. A pending closure can only be undone before its deadline. */
export const accountClosures = pgTable(
  "account_closures",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    recoverUntil: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    index("account_closures_recover_until_idx").on(table.recoverUntil),
  ],
);

/** An expired closure stays here so the retained account can never sign in. */
export const cemetery = pgTable("cemetery", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "restrict" }),
  closedAt: timestamp({ withTimezone: true }).notNull(),
});
