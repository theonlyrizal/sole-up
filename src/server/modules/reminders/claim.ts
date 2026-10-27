import "server-only";

import { and, asc, eq, inArray, lt } from "drizzle-orm";

import { SWEEP_INTERVAL_MINUTES } from "@/lib/reminders";
import { db } from "@/server/db/client";
import { reminders } from "@/server/db/schema";

/** The most rows one sweep claims; the rest wait for the next sweep. */
export const CLAIM_BATCH_MAX = 200;

export type ClaimedReminder = Pick<
  typeof reminders.$inferSelect,
  | "id"
  | "userId"
  | "kind"
  | "taskId"
  | "eventId"
  | "targetAt"
  | "occurrenceStart"
  | "fireAt"
  | "snoozed"
>;

/**
 * Claims the reminders due before the next sweep (`fire_at < now +
 * horizonMinutes`, ADR 0013's "never late" rule): moves them from
 * `scheduled` to `sending` and stamps `claimed_at`, oldest first, in one
 * short transaction. `FOR UPDATE SKIP LOCKED` lets overlapping sweeps run
 * side by side without ever claiming the same row: a row another sweep is
 * claiming is skipped, and one it has claimed is no longer `scheduled`.
 * Sending is 5.5's.
 */
export async function claimDueReminders(
  now: Date,
  horizonMinutes: number = SWEEP_INTERVAL_MINUTES,
  limit: number = CLAIM_BATCH_MAX,
): Promise<ClaimedReminder[]> {
  const horizon = new Date(now.getTime() + horizonMinutes * 60_000);
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: reminders.id })
      .from(reminders)
      .where(
        and(eq(reminders.status, "scheduled"), lt(reminders.fireAt, horizon)),
      )
      .orderBy(asc(reminders.fireAt), asc(reminders.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];

    const claimed = await tx
      .update(reminders)
      .set({ status: "sending", claimedAt: now })
      .where(
        inArray(
          reminders.id,
          due.map(({ id }) => id),
        ),
      )
      .returning({
        id: reminders.id,
        userId: reminders.userId,
        kind: reminders.kind,
        taskId: reminders.taskId,
        eventId: reminders.eventId,
        targetAt: reminders.targetAt,
        occurrenceStart: reminders.occurrenceStart,
        fireAt: reminders.fireAt,
        snoozed: reminders.snoozed,
      });
    return claimed.sort(
      (a, b) =>
        a.fireAt.getTime() - b.fireAt.getTime() || a.id.localeCompare(b.id),
    );
  });
}
