import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { addDays, localDateOf, startOfLocalDay } from "@/lib/dates";
import type { PushPayload } from "@/lib/push";
import { quietHoursEndAt, quietHoursOf } from "@/lib/quiet-hours";
import {
  REMINDER_MAX_ATTEMPTS,
  REMINDER_SKIP_REASONS,
  type ReminderSkipReason,
} from "@/lib/reminders";
import { db } from "@/server/db/client";
import { calendarEvents, tasks, userPreferences } from "@/server/db/schema";
import { logger as appLogger, type Logger } from "@/server/logging/logger";
import { sendPush } from "@/server/modules/push/send";
import {
  pushTargetsFor,
  recordPushOutcome,
} from "@/server/modules/push/service";

import {
  CLAIM_BATCH_MAX,
  claimDueReminders,
  type ClaimedReminder,
} from "./claim";
import {
  bundlePayload,
  reminderPayload,
  type MessageContext,
  type ReminderSubject,
} from "./payload";
import { recordDelivery, type DeliveryOutcome } from "./record";
import { recordSweepFinished } from "./sweep-status";

/** What one sweep did, by delivery outcome (ADR 0013). */
export type SweepCounts = {
  /** Due reminders claimed (moved to `sending`) by this sweep. */
  claimed: number;
  sent: number;
  /** All skipped reminders; `skippedByReason` splits them. */
  skipped: number;
  skippedByReason: Record<ReminderSkipReason, number>;
  failed: number;
  /** Held for quiet hours: back to `scheduled` until they end. */
  held: number;
  /** A send failed and a later sweep will try again. */
  retrying: number;
};

export type SweepResult = {
  counts: SweepCounts;
  durationMs: number;
};

/** The preferences a delivery reads, with defaults for a missing row. */
type DeliveryPreferences = Pick<
  typeof userPreferences.$inferSelect,
  | "timezone"
  | "locale"
  | "dailyNudgeTime"
  | "remindersEnabled"
  | "remindersPrivate"
  | "quietHoursStart"
  | "quietHoursEnd"
>;

const DEFAULT_PREFERENCES: DeliveryPreferences = {
  timezone: null,
  locale: "en-US",
  dailyNudgeTime: null,
  remindersEnabled: true,
  remindersPrivate: false,
  quietHoursStart: null,
  quietHoursEnd: null,
};

/**
 * One reminder sweep: claims the reminders due before the next sweep and
 * delivers them (ADR 0013). Called by `POST /api/reminders/sweep` every 15
 * minutes, and locally by `pnpm reminders:sweep`.
 *
 * Users are handled one at a time. If one user's deliveries fail
 * unexpectedly, their claimed rows stay `sending` and a later sweep claims
 * them again (`RECLAIM_AFTER_MINUTES`); the other users are unaffected. The
 * log lines hold counts, durations and error names, never a reminder, a
 * payload or a subscription.
 *
 * After missed sweeps, rolling a series or the nudge past a stale row can
 * schedule a row that is already due (the next occurrence starts within
 * the interval). A second claim picks those up, so they aren't left for a
 * sweep that comes too late. It skips the rows the first pass handled, so a
 * failed send still waits for the next sweep, and it doesn't run when the
 * first pass filled its batch (the rest waits, as ever). One more pass is
 * enough: a series has at most one occurrence a day.
 *
 * A finished sweep is recorded for Settings' "reminders have stopped"
 * warning (`recordSweepFinished`).
 */
export async function runSweep(
  now: Date,
  log: Logger = appLogger,
): Promise<SweepResult> {
  const startedAt = performance.now();
  const counts: SweepCounts = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    skippedByReason: Object.fromEntries(
      REMINDER_SKIP_REASONS.map((reason) => [reason, 0]),
    ) as Record<ReminderSkipReason, number>,
    failed: 0,
    held: 0,
    retrying: 0,
  };

  const first = await claimDueReminders(now);
  await deliverClaimed(first, now, counts, log);
  if (first.length > 0 && first.length < CLAIM_BATCH_MAX) {
    const rolled = await claimDueReminders(
      now,
      undefined,
      undefined,
      first.map(({ id }) => id),
    );
    await deliverClaimed(rolled, now, counts, log);
  }
  await recordSweepFinished(now);

  const durationMs = Math.round(performance.now() - startedAt);
  log.info(
    {
      source: "reminders",
      sweepStartedAt: now.toISOString(),
      counts,
      durationMs,
    },
    "Reminder sweep finished",
  );
  return { counts, durationMs };
}

/** Delivers one claim's rows, user by user, adding to `counts`. */
async function deliverClaimed(
  claimed: ClaimedReminder[],
  now: Date,
  counts: SweepCounts,
  log: Logger,
): Promise<void> {
  counts.claimed += claimed.length;
  for (const [userId, rows] of groupByUser(claimed)) {
    try {
      await deliverForUser(userId, rows, now, counts);
    } catch (error) {
      // Only the error's name: driver messages can quote row values.
      log.error(
        {
          source: "reminders",
          errorName: error instanceof Error ? error.name : typeof error,
        },
        "Reminder delivery failed for one user",
      );
    }
  }
}

function groupByUser(rows: ClaimedReminder[]): Map<string, ClaimedReminder[]> {
  const byUser = new Map<string, ClaimedReminder[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  return byUser;
}

async function preferencesOf(userId: string): Promise<DeliveryPreferences> {
  const [row] = await db
    .select({
      timezone: userPreferences.timezone,
      locale: userPreferences.locale,
      dailyNudgeTime: userPreferences.dailyNudgeTime,
      remindersEnabled: userPreferences.remindersEnabled,
      remindersPrivate: userPreferences.remindersPrivate,
      quietHoursStart: userPreferences.quietHoursStart,
      quietHoursEnd: userPreferences.quietHoursEnd,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return row ?? DEFAULT_PREFERENCES;
}

type TaskState = Pick<
  typeof tasks.$inferSelect,
  "id" | "status" | "dueAt" | "title"
>;
type EventState = Pick<typeof calendarEvents.$inferSelect, "id" | "title">;

/** The user's items the rows remind about, as they are now. */
async function itemsOf(userId: string, rows: ClaimedReminder[]) {
  const taskIds = rows.flatMap((row) => (row.taskId ? [row.taskId] : []));
  const eventIds = rows.flatMap((row) => (row.eventId ? [row.eventId] : []));
  const taskRows: TaskState[] = taskIds.length
    ? await db
        .select({
          id: tasks.id,
          status: tasks.status,
          dueAt: tasks.dueAt,
          title: tasks.title,
        })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)))
    : [];
  const eventRows: EventState[] = eventIds.length
    ? await db
        .select({ id: calendarEvents.id, title: calendarEvents.title })
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            inArray(calendarEvents.id, eventIds),
          ),
        )
    : [];
  return {
    tasks: new Map(taskRows.map((task) => [task.id, task])),
    events: new Map(eventRows.map((event) => [event.id, event])),
  };
}

/**
 * When a reminder stops being useful: its target (the deadline, the
 * occurrence's start), or for the nudge the end of its local day.
 */
function staleAt(row: ClaimedReminder, timeZone: string): Date {
  if (row.kind !== "daily_nudge") return row.targetAt;
  const day = localDateOf(row.targetAt, timeZone);
  return startOfLocalDay(addDays(day, 1), timeZone);
}

type Items = Awaited<ReturnType<typeof itemsOf>>;

function isStale(
  row: ClaimedReminder,
  items: Items,
  timeZone: string | null,
  now: Date,
): boolean {
  switch (row.kind) {
    case "task_deadline": {
      const task = items.tasks.get(row.taskId!);
      if (!task || task.status !== "open") return true;
      if (task.dueAt?.getTime() !== row.targetAt.getTime()) return true;
      return now >= row.targetAt;
    }
    case "event":
      return !items.events.has(row.eventId!) || now >= row.targetAt;
    case "daily_nudge":
      return timeZone === null || now >= staleAt(row, timeZone);
  }
}

/** The row as the payload needs it; no title in private mode. */
function subjectOf(
  row: ClaimedReminder,
  items: Items,
  isPrivate: boolean,
): ReminderSubject {
  switch (row.kind) {
    case "task_deadline":
      return {
        kind: "task_deadline",
        reminderId: row.id,
        taskId: row.taskId!,
        targetAt: row.targetAt,
        title: isPrivate ? null : items.tasks.get(row.taskId!)!.title,
      };
    case "event":
      return {
        kind: "event",
        reminderId: row.id,
        eventId: row.eventId!,
        occurrenceStart: row.occurrenceStart,
        targetAt: row.targetAt,
        title: isPrivate ? null : items.events.get(row.eventId!)!.title,
      };
    case "daily_nudge":
      return { kind: "daily_nudge", reminderId: row.id };
  }
}

type Target = Awaited<ReturnType<typeof pushTargetsFor>>[number];

/**
 * Sends one payload to each of the user's devices and records each
 * device's outcome; a device the push service says is gone (404/410) is
 * deleted and dropped from `targets` for the rest of the sweep. One device
 * receiving it is a success; otherwise the first error code is returned,
 * or null when every device was gone.
 */
async function sendToDevices(
  userId: string,
  targets: Target[],
  payload: PushPayload,
  ttlSeconds: number,
  now: Date,
): Promise<{ ok: true } | { ok: false; code: string | null }> {
  const sending = [...targets];
  const outcomes = await Promise.all(
    sending.map((target) => sendPush(target, payload, { ttlSeconds })),
  );
  let ok = false;
  let code: string | null = null;
  for (const [index, outcome] of outcomes.entries()) {
    const target = sending[index]!;
    const recorded = await recordPushOutcome(userId, target.id, outcome, now);
    if (recorded === "removed") targets.splice(targets.indexOf(target), 1);
    if (outcome.ok) ok = true;
    else if (!outcome.gone) code ??= outcome.code;
  }
  return ok ? { ok: true } : { ok: false, code };
}

/** A send's result as each reminder in it records it. */
function outcomeOfSend(
  row: ClaimedReminder,
  result: Awaited<ReturnType<typeof sendToDevices>>,
): DeliveryOutcome {
  if (result.ok) return { status: "sent" };
  if (result.code === null) return { status: "skipped", reason: "no_device" };
  return row.attempts + 1 >= REMINDER_MAX_ATTEMPTS
    ? { status: "failed", code: result.code }
    : { status: "retry", code: result.code };
}

const COUNTED: Record<
  DeliveryOutcome["status"],
  Exclude<keyof SweepCounts, "skippedByReason">
> = {
  sent: "sent",
  skipped: "skipped",
  failed: "failed",
  retry: "retrying",
  held: "held",
};

/**
 * Delivers one user's claimed reminders. Before sending, in order (ADR
 * 0013): stale → skipped; reminders off → skipped; no device → skipped;
 * inside quiet hours → held until they end. The first sweep after quiet
 * hours sends the held reminders still useful, several as one bundle.
 */
async function deliverForUser(
  userId: string,
  rows: ClaimedReminder[],
  now: Date,
  counts: SweepCounts,
): Promise<void> {
  const preferences = await preferencesOf(userId);
  const items = await itemsOf(userId, rows);
  const targets = preferences.remindersEnabled
    ? await pushTargetsFor(userId)
    : [];
  const timeZone = preferences.timezone ?? "UTC";
  const quietHours = quietHoursOf(
    preferences.quietHoursStart,
    preferences.quietHoursEnd,
  );
  const quietUntil =
    quietHours && preferences.timezone
      ? quietHoursEndAt(now, preferences.timezone, quietHours)
      : null;

  const record = async (row: ClaimedReminder, outcome: DeliveryOutcome) => {
    const recorded = await recordDelivery(row, outcome, preferences, now);
    if (!recorded) return;
    counts[COUNTED[recorded.status]] += 1;
    if (recorded.status === "skipped") {
      counts.skippedByReason[recorded.reason] += 1;
    }
  };

  const deliverable: ClaimedReminder[] = [];
  for (const row of rows) {
    if (isStale(row, items, preferences.timezone, now)) {
      await record(row, { status: "skipped", reason: "stale" });
    } else if (!preferences.remindersEnabled) {
      await record(row, { status: "skipped", reason: "disabled" });
    } else if (targets.length === 0) {
      await record(row, { status: "skipped", reason: "no_device" });
    } else if (quietUntil) {
      await record(row, { status: "held", until: quietUntil });
    } else {
      deliverable.push(row);
    }
  }

  const context: MessageContext = {
    now,
    timeZone,
    locale: preferences.locale,
  };
  const ttlFor = (group: ClaimedReminder[]) =>
    Math.max(
      ...group.map(
        (row) => (staleAt(row, timeZone).getTime() - now.getTime()) / 1000,
      ),
    );
  const sendGroup = async (group: ClaimedReminder[], payload: PushPayload) => {
    if (targets.length === 0) {
      for (const row of group) {
        await record(row, { status: "skipped", reason: "no_device" });
      }
      return;
    }
    const result = await sendToDevices(
      userId,
      targets,
      payload,
      ttlFor(group),
      now,
    );
    for (const row of group) await record(row, outcomeOfSend(row, result));
  };

  const released = deliverable.filter((row) => row.heldUntil !== null);
  const bundled = released.length > 1 ? released : [];
  if (bundled.length > 0)
    await sendGroup(bundled, bundlePayload(bundled.length));
  for (const row of deliverable) {
    if (bundled.includes(row)) continue;
    const subject = subjectOf(row, items, preferences.remindersPrivate);
    await sendGroup([row], reminderPayload(subject, context));
  }
}
