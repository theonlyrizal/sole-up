import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { daysBetween, formatInstant, localDateOf, todayFor } from "@/lib/dates";
import { skippedLabel } from "@/lib/reminders";
import { db } from "@/server/db/client";
import { reminders } from "@/server/db/schema";
import { getUserPreferences } from "@/server/modules/preferences/service";

import { whenLabel } from "./payload";
import type { ReminderItem } from "./validation";

/** What an item's dialog says about its reminder (chunk 5.6). */
export type ReminderStatusView = {
  /** The next reminder still to go out, a snoozed one included. */
  next: { when: string; snoozed: boolean } | null;
  /** Shown when nothing is scheduled: what happened to the last one. */
  last: string | null;
  /** A reminder that went out for a target still ahead, to snooze in the app. */
  snoozeId: string | null;
};

/** Days within which "Wed 14:00" is clear enough; later ones get a date. */
const NEAR_DAYS = 6;

/**
 * The item's reminder for its dialog: the next one scheduled, or else how
 * the last one went ("Sent 14:50", "Skipped: quiet hours"), plus the last
 * one sent while its target is still ahead and not already snoozed, which
 * the dialog offers to snooze. Times are formatted in the user's zone.
 * Only the user's own rows are read, so another user's item shows nothing.
 */
export async function reminderStatusFor(
  userId: string,
  item: ReminderItem,
  now: Date = new Date(),
): Promise<ReminderStatusView> {
  const rows = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        item.kind === "task"
          ? eq(reminders.taskId, item.id)
          : eq(reminders.eventId, item.id),
        inArray(reminders.status, ["scheduled", "sent", "skipped", "failed"]),
      ),
    )
    .orderBy(desc(reminders.updatedAt), desc(reminders.fireAt));

  const { locale, timezone } = await getUserPreferences(userId);
  const timeZone = timezone ?? "UTC";
  const when = (instant: Date) =>
    daysBetween(todayFor(timeZone, now), localDateOf(instant, timeZone)) <=
      NEAR_DAYS && instant > now
      ? whenLabel(instant, { now, timeZone, locale })
      : formatInstant(instant, locale, timeZone);

  const scheduled = rows
    .filter((row) => row.status === "scheduled")
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  const next = scheduled[0];

  const sentAhead = rows.find(
    (row) => row.status === "sent" && row.targetAt > now,
  );
  const alreadySnoozed =
    sentAhead &&
    scheduled.some(
      (row) =>
        row.snoozed &&
        row.targetAt.getTime() === sentAhead.targetAt.getTime() &&
        row.occurrenceStart?.getTime() === sentAhead.occurrenceStart?.getTime(),
    );

  let last: string | null = null;
  const done = rows.find((row) => row.status !== "scheduled");
  if (!next && done) {
    if (done.status === "sent") last = `Sent ${when(done.sentAt!)}`;
    else if (done.status === "failed") last = "Couldn't be delivered";
    else last = skippedLabel(done.skipReason!, done.heldUntil !== null);
  }

  return {
    next: next ? { when: when(next.fireAt), snoozed: next.snoozed } : null,
    last,
    snoozeId: sentAhead && !alreadySnoozed ? sentAhead.id : null,
  };
}
