import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db/client";
import { reminders } from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";

import type { SnoozeReminderInput } from "./validation";

// Snooze (ADR 0013): a reminder that went out comes back 15 minutes or an
// hour later as a new `scheduled` row marked `snoozed`, for the same target.
// It sits outside the one-scheduled-row-per-item index, so a series' rolling
// next-occurrence row is untouched, and the sweep treats it like any other
// row: it goes stale when its target passes, and is skipped while
// reminders are off.

export const SNOOZE_NUDGE = "The daily nudge can't be snoozed.";
export const SNOOZE_WEEKLY_REVIEW =
  "The weekly review reminder can't be snoozed.";
export const SNOOZE_NOT_SENT = "This reminder hasn't gone out yet.";
export const SNOOZE_TOO_LATE =
  "It's already time, so there's nothing to snooze.";

/**
 * Snoozes one of the user's task or event reminders that has gone out (or
 * is going out now): it fires again `minutes` from `now`, or at its target
 * when that comes first. An earlier snooze of the same target is replaced,
 * so snoozing from two devices schedules it once.
 */
export async function snoozeReminder(
  userId: string,
  { id, minutes }: SnoozeReminderInput,
  now: Date = new Date(),
): Promise<{ fireAt: Date }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
      .for("update");
    if (!row) throw new NotFoundError();
    if (row.kind === "daily_nudge") throw new ConflictError(SNOOZE_NUDGE);
    if (row.kind === "weekly_review") {
      throw new ConflictError(SNOOZE_WEEKLY_REVIEW);
    }
    if (row.status !== "sent" && row.status !== "sending") {
      throw new ConflictError(SNOOZE_NOT_SENT);
    }
    if (row.targetAt <= now) throw new ConflictError(SNOOZE_TOO_LATE);

    const later = new Date(now.getTime() + minutes * 60_000);
    const fireAt = later < row.targetAt ? later : row.targetAt;
    const item =
      row.kind === "task_deadline"
        ? eq(reminders.taskId, row.taskId!)
        : eq(reminders.eventId, row.eventId!);
    const sameOccurrence = row.occurrenceStart
      ? eq(reminders.occurrenceStart, row.occurrenceStart)
      : isNull(reminders.occurrenceStart);

    await tx
      .delete(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          item,
          eq(reminders.snoozed, true),
          eq(reminders.status, "scheduled"),
          eq(reminders.targetAt, row.targetAt),
          sameOccurrence,
        ),
      );
    await tx.insert(reminders).values({
      userId,
      kind: row.kind,
      taskId: row.taskId,
      eventId: row.eventId,
      targetAt: row.targetAt,
      occurrenceStart: row.occurrenceStart,
      fireAt,
      snoozed: true,
    });
    return { fireAt };
  });
}
