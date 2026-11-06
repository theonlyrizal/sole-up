import "server-only";

import { and, eq, gt, lte, sql } from "drizzle-orm";

import { ACCOUNT_RECOVERY_DAYS } from "@/lib/account-deletion";
import { db, type DbTransaction } from "@/server/db/client";
import { accountClosures, cemetery, sessions, users } from "@/server/db/schema";
import { ConflictError } from "@/server/errors";

import { activeAccount } from "./status";

async function lockSession(
  tx: DbTransaction,
  userId: string,
  sessionId: string,
) {
  const [session] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        gt(sessions.expiresAt, sql`clock_timestamp()`),
      ),
    )
    .for("update");
  if (!session) throw new ConflictError("Your session has ended.");
}

export async function scheduleAccountClosure(
  userId: string,
  sessionId: string,
) {
  await db.transaction(async (tx) => {
    // Lock the account before any session rows so two closure requests
    // cannot each lock a session the other needs to revoke.
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), activeAccount(users.id)))
      .for("update");
    if (!user)
      throw new ConflictError(
        "This account is already closed or scheduled to close.",
      );
    await lockSession(tx, userId, sessionId);

    await tx.insert(accountClosures).values({
      userId,
      recoverUntil: sql`clock_timestamp() + make_interval(hours => ${ACCOUNT_RECOVERY_DAYS * 24})`,
    });
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}

export async function reactivateAccount(userId: string, sessionId: string) {
  const [restored] = await db
    .delete(accountClosures)
    .where(
      and(
        eq(accountClosures.userId, userId),
        gt(accountClosures.recoverUntil, sql`clock_timestamp()`),
        sql`not exists (select 1 from ${cemetery} where ${cemetery.userId} = ${userId})`,
        sql`exists (
        select 1 from ${sessions}
        where ${sessions.id} = ${sessionId} and ${sessions.userId} = ${userId}
          and ${sessions.expiresAt} > clock_timestamp()
      )`,
      ),
    )
    .returning({ userId: accountClosures.userId });
  return restored !== undefined;
}

/** Move expired requests atomically. The deadline governs access even if the sweep is late. */
export async function finalizeExpiredAccountClosures() {
  await db.transaction(async (tx) => {
    const expired = tx.$with("expired_closures").as(
      tx
        .delete(accountClosures)
        .where(lte(accountClosures.recoverUntil, sql`statement_timestamp()`))
        .returning(),
    );
    const buried = tx.$with("new_cemetery_entries").as(
      tx
        .insert(cemetery)
        .select(
          tx
            .select({ userId: expired.userId, closedAt: expired.recoverUntil })
            .from(expired),
        )
        .returning({ userId: cemetery.userId }),
    );
    await tx
      .with(expired, buried)
      .delete(sessions)
      .where(
        sql`${sessions.userId} in (select ${buried.userId} from ${buried})`,
      );
  });
}
