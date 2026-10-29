import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import type { ReminderSkipReason } from "@/lib/reminders";
import { db, type DbTransaction } from "@/server/db/client";
import { reminders, type userPreferences } from "@/server/db/schema";

import type { ClaimedReminder } from "./claim";
import {
  syncEventReminderInTx,
  syncNudgeReminderInTx,
  syncWeeklyReviewReminderInTx,
} from "./schedule";

/** What the sweep decided for one claimed reminder. */
export type DeliveryOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: ReminderSkipReason }
  /** The last allowed attempt failed. */
  | { status: "failed"; code: string }
  /** An attempt failed; a later sweep tries again. */
  | { status: "retry"; code: string }
  /** Quiet hours: back to `scheduled`, unclaimed until `until`. */
  | { status: "held"; until: Date };

/** What rolling the user's own reminders (nudge, weekly review) reads. */
type UserReminderPreferences = Pick<
  typeof userPreferences.$inferSelect,
  "timezone" | "dailyNudgeTime" | "weeklyReviewDay" | "weeklyReviewTime"
>;

/**
 * True when the item already has another non-snoozed `scheduled` row (an
 * edit during the sweep wrote one), so this row can't go back to
 * `scheduled` under the one-per-item index.
 */
async function hasOtherScheduled(
  tx: DbTransaction,
  row: ClaimedReminder,
): Promise<boolean> {
  if (row.snoozed) return false;
  const item =
    row.kind === "task_deadline"
      ? eq(reminders.taskId, row.taskId!)
      : row.kind === "event"
        ? eq(reminders.eventId, row.eventId!)
        : eq(reminders.kind, row.kind);
  const [other] = await tx
    .select({ id: reminders.id })
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, row.userId),
        item,
        eq(reminders.status, "scheduled"),
        eq(reminders.snoozed, false),
        ne(reminders.id, row.id),
      ),
    )
    .limit(1);
  return other !== undefined;
}

function changesFor(outcome: DeliveryOutcome, now: Date) {
  const attempted = { attempts: sql`${reminders.attempts} + 1` };
  switch (outcome.status) {
    case "sent":
      return { ...attempted, status: "sent" as const, sentAt: now };
    case "skipped":
      return { status: "skipped" as const, skipReason: outcome.reason };
    case "failed":
      return {
        ...attempted,
        status: "failed" as const,
        lastErrorCode: outcome.code,
      };
    case "retry":
      return {
        ...attempted,
        status: "scheduled" as const,
        lastErrorCode: outcome.code,
        claimedAt: null,
      };
    case "held":
      return {
        status: "scheduled" as const,
        claimedAt: null,
        heldUntil: outcome.until,
      };
  }
}

/**
 * Records one claimed reminder's outcome in a transaction. Only the claim
 * this sweep made is updated (`sending`, claimed at `now`), so a row
 * deleted with its item, or claimed again by a later sweep, is left alone.
 *
 * Once a row is done (sent, skipped or failed), the same transaction
 * schedules what comes next: a repeating event's next occurrence,
 * tomorrow's nudge, or next week's weekly review reminder. A row that would
 * go back to `scheduled` while an edit has written a newer one is skipped as
 * stale instead.
 *
 * Returns the outcome recorded, or null when the row was no longer ours.
 */
export async function recordDelivery(
  row: ClaimedReminder,
  outcome: DeliveryOutcome,
  preferences: UserReminderPreferences,
  now: Date,
): Promise<DeliveryOutcome | null> {
  return db.transaction(async (tx) => {
    let recorded = outcome;
    if (
      (outcome.status === "retry" || outcome.status === "held") &&
      (await hasOtherScheduled(tx, row))
    ) {
      recorded = { status: "skipped", reason: "stale" };
    }

    const updated = await tx
      .update(reminders)
      .set(changesFor(recorded, now))
      .where(
        and(
          eq(reminders.id, row.id),
          eq(reminders.userId, row.userId),
          eq(reminders.status, "sending"),
          eq(reminders.claimedAt, now),
        ),
      )
      .returning({ id: reminders.id });
    if (updated.length === 0) return null;

    if (recorded.status === "retry" || recorded.status === "held") {
      return recorded;
    }
    if (row.kind === "event") {
      await syncEventReminderInTx(tx, row.userId, row.eventId!, now);
    } else if (row.kind === "daily_nudge") {
      await syncNudgeReminderInTx(tx, row.userId, preferences, now);
    } else if (row.kind === "weekly_review") {
      await syncWeeklyReviewReminderInTx(tx, row.userId, preferences, now);
    }
    return recorded;
  });
}
