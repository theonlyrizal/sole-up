import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { addDays, instantFromLocal, todayFor } from "@/lib/dates";
import type { TimedException } from "@/lib/recurrence";
import { fireAtFor, type ReminderKind } from "@/lib/reminders";
import type { DbTransaction } from "@/server/db/client";
import {
  calendarEventExceptions,
  calendarEvents,
  reminders,
  type tasks,
  type userPreferences,
} from "@/server/db/schema";

import { nextTimedOccurrence } from "./next-occurrence";

// Keeps each item's one `scheduled` reminder row in step with the item, in
// the caller's transaction (ADR 0013). Each sync recomputes the row from
// the item as it now is, then inserts, moves or deletes it, so callers
// call it after any change that could matter without working out how.
//
// - A target that has already passed gets no row.
// - A target already reminded about (a sent, skipped, failed or claimed
//   row for the same target) is not scheduled again, so an edit after a
//   reminder went out doesn't send it twice.
// - Only the non-snoozed scheduled row is touched; snoozed rows (5.6) and
//   the delivery record stay as they are.
// - Task and event reminders follow their instants, so a time-zone change
//   never moves them; the nudge follows the user's zone.

type ItemKey =
  | { kind: "task_deadline"; taskId: string }
  | { kind: "event"; eventId: string }
  | { kind: "daily_nudge" };

/** What one scheduled row reminds about and when it fires. */
export type ReminderTarget = {
  targetAt: Date;
  /** A repeating event occurrence's original start; null otherwise. */
  occurrenceStart: Date | null;
  fireAt: Date;
};

/** The record of earlier deliveries for one item: rows no longer scheduled. */
type Delivered = Pick<ReminderTarget, "targetAt" | "occurrenceStart">;

function keyFilter(userId: string, key: ItemKey) {
  const owner = eq(reminders.userId, userId);
  switch (key.kind) {
    case "task_deadline":
      return and(owner, eq(reminders.taskId, key.taskId));
    case "event":
      return and(owner, eq(reminders.eventId, key.eventId));
    case "daily_nudge":
      return and(owner, eq(reminders.kind, "daily_nudge"));
  }
}

function linkColumns(key: ItemKey) {
  return {
    kind: key.kind satisfies ReminderKind,
    taskId: key.kind === "task_deadline" ? key.taskId : null,
    eventId: key.kind === "event" ? key.eventId : null,
  };
}

const sameInstant = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

function isDelivered(
  delivered: readonly Delivered[],
  target: Pick<ReminderTarget, "targetAt" | "occurrenceStart">,
): boolean {
  return delivered.some(
    (row) =>
      sameInstant(row.targetAt, target.targetAt) &&
      sameInstant(row.occurrenceStart, target.occurrenceStart),
  );
}

async function deliveredFor(
  tx: DbTransaction,
  userId: string,
  key: ItemKey,
): Promise<Delivered[]> {
  return tx
    .select({
      targetAt: reminders.targetAt,
      occurrenceStart: reminders.occurrenceStart,
    })
    .from(reminders)
    .where(
      and(
        keyFilter(userId, key),
        ne(reminders.status, "scheduled"),
        eq(reminders.snoozed, false),
      ),
    );
}

/**
 * Makes the item's one non-snoozed `scheduled` row match `target`: inserts
 * it, moves it (resetting its attempts and any quiet-hours hold), leaves
 * it, or deletes it for null.
 */
async function writeScheduled(
  tx: DbTransaction,
  userId: string,
  key: ItemKey,
  target: ReminderTarget | null,
): Promise<void> {
  const scheduled = and(
    keyFilter(userId, key),
    eq(reminders.status, "scheduled"),
    eq(reminders.snoozed, false),
  );
  const [current] = await tx
    .select()
    .from(reminders)
    .where(scheduled)
    .for("update");

  if (!target) {
    if (current) {
      await tx
        .delete(reminders)
        .where(and(eq(reminders.id, current.id), eq(reminders.userId, userId)));
    }
    return;
  }
  if (!current) {
    await tx
      .insert(reminders)
      .values({ ...linkColumns(key), ...target, userId });
    return;
  }
  if (
    sameInstant(current.targetAt, target.targetAt) &&
    sameInstant(current.occurrenceStart, target.occurrenceStart) &&
    sameInstant(current.fireAt, target.fireAt)
  ) {
    return;
  }
  await tx
    .update(reminders)
    .set({ ...target, attempts: 0, lastErrorCode: null, heldUntil: null })
    .where(and(eq(reminders.id, current.id), eq(reminders.userId, userId)));
}

type TaskReminderFields = Pick<
  typeof tasks.$inferSelect,
  "id" | "status" | "dueAt" | "reminderOffsetMinutes"
>;

/**
 * An open task with a timed deadline still to come and an offset has one
 * reminder an offset before `due_at`. Completing or cancelling it, a
 * date-only or cleared deadline, or no offset removes it; reopening
 * restores it.
 */
export async function syncTaskReminderInTx(
  tx: DbTransaction,
  userId: string,
  task: TaskReminderFields,
  now: Date = new Date(),
): Promise<void> {
  const key: ItemKey = { kind: "task_deadline", taskId: task.id };
  let target: ReminderTarget | null = null;
  if (
    task.status === "open" &&
    task.dueAt !== null &&
    task.reminderOffsetMinutes !== null &&
    task.dueAt > now
  ) {
    const candidate = { targetAt: task.dueAt, occurrenceStart: null };
    if (!isDelivered(await deliveredFor(tx, userId, key), candidate)) {
      target = {
        ...candidate,
        fireAt: fireAtFor(task.dueAt, task.reminderOffsetMinutes),
      };
    }
  }
  await writeScheduled(tx, userId, key, target);
}

/**
 * A timed event with an offset has one reminder an offset before its
 * start. A series has one rolling row, for its next occurrence still to
 * fire (ADR 0013): cancelled occurrences are skipped, a moved one fires
 * from its new start. All-day events never remind. A deleted event's rows
 * went with it (cascade), so a missing event is a no-op.
 */
export async function syncEventReminderInTx(
  tx: DbTransaction,
  userId: string,
  eventId: string,
  now: Date = new Date(),
): Promise<void> {
  const [event] = await tx
    .select()
    .from(calendarEvents)
    .where(
      and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)),
    );
  if (!event) return;

  const key: ItemKey = { kind: "event", eventId };
  const offset = event.reminderOffsetMinutes;
  if (event.allDay || offset === null) {
    await writeScheduled(tx, userId, key, null);
    return;
  }
  // The shape CHECK guarantees a timed event's instants and zone.
  const startAt = event.startAt!;
  const delivered = await deliveredFor(tx, userId, key);

  let target: Omit<ReminderTarget, "fireAt"> | null = null;
  if (event.rrule === null) {
    const candidate = { targetAt: startAt, occurrenceStart: null };
    if (startAt > now && !isDelivered(delivered, candidate)) target = candidate;
  } else {
    const exceptions = await tx
      .select()
      .from(calendarEventExceptions)
      .where(
        and(
          eq(calendarEventExceptions.eventId, eventId),
          eq(calendarEventExceptions.userId, userId),
        ),
      );
    const next = nextTimedOccurrence(
      {
        allDay: false,
        rrule: event.rrule,
        startAt,
        endAt: event.endAt!,
        tz: event.tz!,
      },
      exceptions.map((row): TimedException =>
        row.kind === "cancelled"
          ? { kind: "cancelled", originalStartAt: row.originalStartAt! }
          : {
              kind: "modified",
              originalStartAt: row.originalStartAt!,
              startAt: row.startAt!,
              endAt: row.endAt!,
            },
      ),
      now,
      (occurrence) =>
        isDelivered(delivered, {
          targetAt: occurrence.startAt,
          occurrenceStart: occurrence.originalStartAt,
        }),
    );
    if (next) {
      target = {
        targetAt: next.startAt,
        occurrenceStart: next.originalStartAt,
      };
    }
  }

  await writeScheduled(
    tx,
    userId,
    key,
    target && { ...target, fireAt: fireAtFor(target.targetAt, offset) },
  );
}

type NudgePreferences = Pick<
  typeof userPreferences.$inferSelect,
  "timezone" | "dailyNudgeTime"
>;

/** Days ahead the nudge looks for a local time still to come. */
const NUDGE_SEARCH_DAYS = 3;

/**
 * The daily nudge has one row, for the next local occurrence of
 * `daily_nudge_time` in the user's zone that hasn't been reminded about.
 * It fires at that time (no offset). No time, or no confirmed zone, removes
 * it.
 */
export async function syncNudgeReminderInTx(
  tx: DbTransaction,
  userId: string,
  preferences: NudgePreferences,
  now: Date = new Date(),
): Promise<void> {
  const key: ItemKey = { kind: "daily_nudge" };
  const { timezone, dailyNudgeTime } = preferences;
  if (!timezone || !dailyNudgeTime) {
    await writeScheduled(tx, userId, key, null);
    return;
  }

  const delivered = await deliveredFor(tx, userId, key);
  const today = todayFor(timezone, now);
  let target: ReminderTarget | null = null;
  for (let day = 0; day < NUDGE_SEARCH_DAYS && !target; day++) {
    const targetAt = instantFromLocal(
      addDays(today, day),
      dailyNudgeTime,
      timezone,
    );
    const candidate = { targetAt, occurrenceStart: null };
    if (targetAt > now && !isDelivered(delivered, candidate)) {
      target = { ...candidate, fireAt: targetAt };
    }
  }
  await writeScheduled(tx, userId, key, target);
}
