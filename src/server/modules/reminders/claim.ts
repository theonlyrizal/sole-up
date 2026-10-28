import "server-only";

import { and, asc, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";

import { SWEEP_INTERVAL_MINUTES } from "@/lib/reminders";
import { db } from "@/server/db/client";
import { reminders } from "@/server/db/schema";

/** The most rows one sweep claims; the rest wait for the next sweep. */
export const CLAIM_BATCH_MAX = 200;

/**
 * A row still `sending` this long after its claim was left by a sweep that
 * was cut off, so a later sweep claims it again: a duplicate is accepted, a
 * lost reminder is not (ADR 0013).
 */
export const RECLAIM_AFTER_MINUTES = 10;

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
  | "attempts"
  | "heldUntil"
>;

/**
 * Claims the reminders due before the next sweep (`fire_at < now +
 * horizonMinutes`, ADR 0013's "never late" rule): moves them from
 * `scheduled` to `sending` and stamps `claimed_at`, oldest first, in one
 * short transaction. A row held for quiet hours waits until `held_until`,
 * and a row left `sending` for `RECLAIM_AFTER_MINUTES` is claimed again. `FOR UPDATE SKIP LOCKED` lets overlapping sweeps run
 * side by side without ever claiming the same row: a row another sweep is
 * claiming is skipped, and one it has claimed is no longer `scheduled`.
 */
export async function claimDueReminders(
  now: Date,
  horizonMinutes: number = SWEEP_INTERVAL_MINUTES,
  limit: number = CLAIM_BATCH_MAX,
): Promise<ClaimedReminder[]> {
  const horizon = new Date(now.getTime() + horizonMinutes * 60_000);
  const abandoned = new Date(now.getTime() - RECLAIM_AFTER_MINUTES * 60_000);
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: reminders.id })
      .from(reminders)
      .where(
        or(
          and(
            eq(reminders.status, "scheduled"),
            lt(reminders.fireAt, horizon),
            or(isNull(reminders.heldUntil), lte(reminders.heldUntil, now)),
          ),
          and(
            eq(reminders.status, "sending"),
            lte(reminders.claimedAt, abandoned),
          ),
        ),
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
        attempts: reminders.attempts,
        heldUntil: reminders.heldUntil,
      });
    return claimed.sort(
      (a, b) =>
        a.fireAt.getTime() - b.fireAt.getTime() || a.id.localeCompare(b.id),
    );
  });
}
