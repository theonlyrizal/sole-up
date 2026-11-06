import "server-only";

import { and, eq, sql, type SQLWrapper } from "drizzle-orm";

import { db } from "@/server/db/client";
import { accountClosures, cemetery, users } from "@/server/db/schema";

export function activeAccount(userId: string | SQLWrapper) {
  return sql`not exists (
    select 1 from ${accountClosures} where ${accountClosures.userId} = ${userId}
  ) and not exists (
    select 1 from ${cemetery} where ${cemetery.userId} = ${userId}
  )`;
}

export async function isAccountActive(userId: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), activeAccount(users.id)));
  return row !== undefined;
}

export async function accountStatus(
  userId: string,
): Promise<
  | { status: "active" }
  | { status: "recoverable"; recoverUntil: Date }
  | { status: "closed" }
> {
  const [row] = await db
    .select({
      recoverUntil: accountClosures.recoverUntil,
      closed: sql<boolean>`${cemetery.userId} is not null or coalesce(
        ${accountClosures.recoverUntil} <= statement_timestamp(), false
      )`,
    })
    .from(users)
    .leftJoin(accountClosures, eq(accountClosures.userId, users.id))
    .leftJoin(cemetery, eq(cemetery.userId, users.id))
    .where(eq(users.id, userId));
  if (!row || row.closed) return { status: "closed" };
  if (row.recoverUntil) {
    return { status: "recoverable", recoverUntil: row.recoverUntil };
  }
  return { status: "active" };
}
