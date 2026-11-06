import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { ConflictError } from "@/server/errors";

export async function deleteAccount(userId: string, sessionId: string) {
  await db.transaction(async (tx) => {
    // Serialize concurrent deletions before locking any session rows, which
    // the user delete also locks through the cascade.
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) throw new ConflictError("Your session has ended.");

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

    // This also revokes every session and push subscription and removes all
    // other owned rows, including audit history, through foreign keys.
    await tx.delete(users).where(eq(users.id, userId));
  });
}
