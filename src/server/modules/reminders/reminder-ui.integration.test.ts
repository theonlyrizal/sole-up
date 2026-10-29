import { createECDH, randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { instantFromLocal } from "@/lib/dates";
import { db } from "@/server/db/client";
import {
  auditEvents,
  pushSubscriptions,
  reminders,
  userPreferences,
} from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import {
  createCalendarEvent,
  eventsBetween,
} from "@/server/modules/calendar-events/service";
import { createCalendarEventSchema } from "@/server/modules/calendar-events/validation";
import {
  getReminderSettings,
  savePreferences,
  saveReminderSettings,
} from "@/server/modules/preferences/service";
import { saveReminderSettingsSchema } from "@/server/modules/preferences/validation";
import {
  changeTaskStatus,
  createTask,
  updateTask,
} from "@/server/modules/tasks/service";
import {
  createTaskSchema,
  updateTaskSchema,
} from "@/server/modules/tasks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { runSweep } from "./sweep";
import { snoozeReminder, SNOOZE_NOT_SENT, SNOOZE_NUDGE } from "./snooze";
import { reminderStatusFor } from "./status";
import { snoozeReminderSchema } from "./validation";

// Chunk 5.6: the reminder settings, the global switch stopping every
// delivery, snooze, the item dialog's status and the forms' reminder
// fields. Push is mocked at the library boundary, as in 5.5's tests.
const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof webpush }>();
  return { default: { ...actual.default, sendNotification } };
});

const NEW_YORK = "America/New_York";

/** Monday 11 January 2027, 10:00 in New York (15:00 UTC). */
const NOW = new Date("2027-01-11T15:00:00.000Z");

/** The UTC instant of a New York wall-clock time, e.g. "2027-01-12 09:00". */
const at = (local: string) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, NEW_YORK);
};

type Form = Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- Fixtures ------------------------------------------------------------------

/** A user in New York (en-GB times, "14:00"), with one subscribed device. */
async function setUp({ device = true } = {}) {
  const user = await createTestUser();
  await savePreferences(user.id, {
    timezone: NEW_YORK,
    locale: "en-GB",
    weekStart: 1,
  });
  if (device) {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    await db.insert(pushSubscriptions).values({
      userId: user.id,
      endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
      userAgentLabel: "Chrome on Linux",
    });
  }
  return user;
}

const SETTINGS: Form = {
  remindersEnabled: true,
  remindersPrivate: false,
  quietHours: false,
  quietHoursStart: "",
  quietHoursEnd: "",
  dailyNudgeTime: "",
  weeklyReviewDay: null,
  weeklyReviewTime: "",
};

const saveSettings = (userId: string, fields: Form = {}) =>
  saveReminderSettings(
    userId,
    saveReminderSettingsSchema.parse({ ...SETTINGS, ...fields }),
  );

const timedTask = (userId: string, due: string, fields: Form = {}) => {
  const [dueDate, dueTime] = due.split(" ");
  return createTask(
    userId,
    createTaskSchema.parse({
      title: "Submit visa form",
      dueDate,
      dueTime,
      dueTz: NEW_YORK,
      reminderOffsetMinutes: 30,
      ...fields,
    }),
  );
};

const timedEvent = (
  userId: string,
  start: string,
  end: string,
  fields: Form = {},
) => {
  const [startDate, startTime] = start.split(" ");
  const [endDate, endTime] = end.split(" ");
  return createCalendarEvent(
    userId,
    createCalendarEventSchema.parse({
      title: "Dentist",
      allDay: false,
      startDate,
      startTime,
      endDate,
      endTime,
      tz: NEW_YORK,
      reminderOffsetMinutes: 10,
      ...fields,
    }),
  );
};

/** Runs a sweep at a New York time, with the clock there. */
async function sweepAt(when: string) {
  const now = at(when);
  vi.setSystemTime(now);
  return runSweep(now);
}

const rowsOf = (userId: string) =>
  db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .orderBy(asc(reminders.targetAt), asc(reminders.createdAt));

const rowsForItem = async (userId: string, itemId: string) =>
  (await rowsOf(userId)).filter(
    (row) => row.taskId === itemId || row.eventId === itemId,
  );

const snooze = (userId: string, id: string, minutes: number, now: Date) =>
  snoozeReminder(userId, snoozeReminderSchema.parse({ id, minutes }), now);

const pushedPayloads = () =>
  sendNotification.mock.calls.map(
    ([, body]) => JSON.parse(body as string) as Record<string, string>,
  );

const preferenceEvents = (userId: string) =>
  db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        eq(auditEvents.eventType, "user_preferences.updated"),
      ),
    )
    .orderBy(asc(auditEvents.occurredAt));

// --- Settings ------------------------------------------------------------------

describe("reminder settings", () => {
  it("start with reminders on, titles shown, no quiet hours, no nudge and no weekly review", async () => {
    const user = await setUp();
    expect(await getReminderSettings(user.id)).toEqual({
      remindersEnabled: true,
      remindersPrivate: false,
      quietHours: null,
      dailyNudgeTime: null,
      weeklyReview: null,
    });
  });

  it("saves every setting and audits only what changed, without content", async () => {
    const user = await setUp();
    const before = (await preferenceEvents(user.id)).length;

    const saved = await saveSettings(user.id, {
      remindersPrivate: true,
      quietHours: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });

    expect(saved).toEqual({
      remindersEnabled: true,
      remindersPrivate: true,
      quietHours: { start: "22:00", end: "07:00" },
      dailyNudgeTime: null,
      weeklyReview: null,
    });
    const events = await preferenceEvents(user.id);
    expect(events).toHaveLength(before + 1);
    expect(events.at(-1)!.changes).toEqual({
      remindersPrivate: { from: false, to: true },
      quietHoursStart: { from: null, to: "22:00" },
      quietHoursEnd: { from: null, to: "07:00" },
    });

    // Saving the same settings again is a no-op with no event.
    await saveSettings(user.id, {
      remindersPrivate: true,
      quietHours: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    expect(await preferenceEvents(user.id)).toHaveLength(before + 1);
  });

  it("schedules the nudge when its time is set, and removes it when cleared", async () => {
    const user = await setUp();

    await saveSettings(user.id, { dailyNudgeTime: "08:30" });
    expect(await rowsOf(user.id)).toEqual([
      expect.objectContaining({
        kind: "daily_nudge",
        status: "scheduled",
        fireAt: at("2027-01-12 08:30"),
      }),
    ]);

    await saveSettings(user.id, { dailyNudgeTime: "" });
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("releases reminders held for quiet hours when the hours change, leaving the record alone", async () => {
    const user = await setUp();
    await saveSettings(user.id, {
      quietHours: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    const task = await timedTask(user.id, "2027-01-12 09:00");
    const end = at("2027-01-12 07:00");
    await db
      .update(reminders)
      .set({ heldUntil: end })
      .where(eq(reminders.taskId, task.id));
    const other = await setUp();
    const otherTask = await timedTask(other.id, "2027-01-12 09:00");
    await db
      .update(reminders)
      .set({ heldUntil: end })
      .where(eq(reminders.taskId, otherTask.id));

    await saveSettings(user.id, { quietHours: false });

    expect((await rowsForItem(user.id, task.id))[0]!.heldUntil).toBeNull();
    // Another user's held row is untouched.
    expect((await rowsForItem(other.id, otherTask.id))[0]!.heldUntil).toEqual(
      end,
    );
  });

  it("changes only the saving user's settings", async () => {
    const user = await setUp();
    const other = await setUp();
    await saveSettings(user.id, { remindersEnabled: false });
    expect((await getReminderSettings(other.id)).remindersEnabled).toBe(true);
  });

  it("keeps the CHECK as the last line: quiet hours with equal times are refused", async () => {
    const user = await setUp();
    await expect(
      db
        .update(userPreferences)
        .set({ quietHoursStart: "22:00", quietHoursEnd: "22:00" })
        .where(eq(userPreferences.userId, user.id)),
    ).rejects.toThrow();
  });
});

// --- The global switch ---------------------------------------------------------

describe("turning reminders off", () => {
  it("stops every delivery: task, event, nudge and snoozed reminders are all skipped, nothing is sent", async () => {
    const user = await setUp();
    const task = await timedTask(user.id, "2027-01-11 10:40");
    const event = await timedEvent(
      user.id,
      "2027-01-11 10:20",
      "2027-01-11 11:00",
    );
    await saveSettings(user.id, { dailyNudgeTime: "10:05" });
    // A snoozed reminder waiting for its time.
    await db.insert(reminders).values({
      userId: user.id,
      kind: "task_deadline",
      taskId: task.id,
      targetAt: at("2027-01-11 10:40"),
      fireAt: at("2027-01-11 10:12"),
      snoozed: true,
    });

    await saveSettings(user.id, {
      remindersEnabled: false,
      dailyNudgeTime: "10:05",
    });
    const sweep = await sweepAt("2027-01-11 10:00");

    expect(sendNotification).not.toHaveBeenCalled();
    expect(sweep.counts).toMatchObject({ claimed: 4, sent: 0, skipped: 4 });
    const due = (await rowsOf(user.id)).filter(
      (row) => row.targetAt <= at("2027-01-11 10:40"),
    );
    expect(due).toHaveLength(4);
    for (const row of due) {
      expect(row).toMatchObject({ status: "skipped", skipReason: "disabled" });
    }
    expect(
      await reminderStatusFor(user.id, { kind: "event", id: event.id }),
    ).toEqual({
      next: null,
      last: "Skipped: reminders were off",
      snoozeId: null,
    });

    // Turned back on, the next ones go out again: tomorrow's nudge.
    await saveSettings(user.id, { dailyNudgeTime: "10:05" });
    const later = await sweepAt("2027-01-12 10:00");
    expect(later.counts).toMatchObject({ sent: 1 });
    expect(pushedPayloads()).toEqual([
      expect.objectContaining({ title: "Time to plan your day" }),
    ]);
  });
});

// --- Snooze --------------------------------------------------------------------

describe("snooze", () => {
  it("schedules a snoozed row for the same target, outside the item's one scheduled row", async () => {
    const user = await setUp();
    const event = await timedEvent(
      user.id,
      "2027-01-11 14:00",
      "2027-01-11 15:00",
      { rrule: "FREQ=DAILY" },
    );
    await sweepAt("2027-01-11 13:45");
    const [sent, rolling] = await rowsForItem(user.id, event.id);
    expect(sent).toMatchObject({ status: "sent" });
    expect(rolling).toMatchObject({
      status: "scheduled",
      snoozed: false,
      targetAt: at("2027-01-12 14:00"),
    });

    const snoozedAt = at("2027-01-11 13:46");
    expect(await snooze(user.id, sent!.id, 60, snoozedAt)).toEqual({
      // An hour would pass the start, so it fires at the start.
      fireAt: at("2027-01-11 14:00"),
    });

    const rows = await rowsForItem(user.id, event.id);
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.id === rolling!.id)).toEqual(rolling);
    const snoozed = rows.find((row) => row.snoozed)!;
    expect(snoozed).toMatchObject({
      kind: "event",
      status: "scheduled",
      targetAt: sent!.targetAt,
      occurrenceStart: sent!.occurrenceStart,
      fireAt: at("2027-01-11 14:00"),
    });

    // The sweep delivers it like any other, with snooze offered again.
    await sweepAt("2027-01-11 13:55");
    expect(pushedPayloads().at(-1)).toEqual({
      title: "Dentist · 14:00 (in 5 min)",
      url: expect.stringContaining("item=event"),
      tag: `reminder-${snoozed.id}`,
      reminderId: snoozed.id,
    });
    expect(
      (await rowsForItem(user.id, event.id)).find((row) => row.snoozed),
    ).toMatchObject({ status: "sent" });
  });

  it("fires 15 minutes or an hour later, and a second snooze replaces the first", async () => {
    const user = await setUp();
    const task = await timedTask(user.id, "2027-01-11 18:00");
    await sweepAt("2027-01-11 17:20");
    const [sent] = await rowsForItem(user.id, task.id);

    const first = await snooze(user.id, sent!.id, 15, at("2027-01-11 17:25"));
    expect(first.fireAt).toEqual(at("2027-01-11 17:40"));
    const second = await snooze(user.id, sent!.id, 60, at("2027-01-11 17:26"));
    expect(second.fireAt).toEqual(at("2027-01-11 18:00"));

    const snoozed = (await rowsForItem(user.id, task.id)).filter(
      (row) => row.snoozed,
    );
    expect(snoozed).toEqual([
      expect.objectContaining({
        status: "scheduled",
        fireAt: at("2027-01-11 18:00"),
      }),
    ]);
  });

  it("goes stale like any other row: a snooze reaching the deadline, or a completed task, is skipped", async () => {
    const user = await setUp();
    const task = await timedTask(user.id, "2027-01-11 12:00");
    await sweepAt("2027-01-11 11:20");
    const [sent] = await rowsForItem(user.id, task.id);
    await snooze(user.id, sent!.id, 60, at("2027-01-11 11:50"));
    sendNotification.mockClear();

    const sweep = await sweepAt("2027-01-11 12:00");

    expect(sweep.counts).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(
      (await rowsForItem(user.id, task.id)).find((row) => row.snoozed),
    ).toMatchObject({ status: "skipped", skipReason: "stale" });

    const other = await timedTask(user.id, "2027-01-11 16:00");
    await sweepAt("2027-01-11 15:20");
    const [otherSent] = await rowsForItem(user.id, other.id);
    await snooze(user.id, otherSent!.id, 15, at("2027-01-11 15:25"));
    await changeTaskStatus(user.id, { id: other.id, status: "completed" });
    sendNotification.mockClear();
    await sweepAt("2027-01-11 15:30");
    expect(sendNotification).not.toHaveBeenCalled();
    expect(
      (await rowsForItem(user.id, other.id)).find((row) => row.snoozed),
    ).toMatchObject({ status: "skipped", skipReason: "stale" });
  });

  it("refuses the nudge, a reminder that hasn't gone out, a target already past and another user's reminder", async () => {
    const user = await setUp();
    await saveSettings(user.id, { dailyNudgeTime: "10:05" });
    const task = await timedTask(user.id, "2027-01-11 18:00");
    const [scheduled] = await rowsForItem(user.id, task.id);
    await sweepAt("2027-01-11 10:00");
    const nudge = (await rowsOf(user.id)).find(
      (row) => row.kind === "daily_nudge" && row.status === "sent",
    )!;

    await expect(snooze(user.id, nudge.id, 15, NOW)).rejects.toThrow(
      new ConflictError(SNOOZE_NUDGE),
    );
    await expect(snooze(user.id, scheduled!.id, 15, NOW)).rejects.toThrow(
      new ConflictError(SNOOZE_NOT_SENT),
    );

    await sweepAt("2027-01-11 17:20");
    const [sent] = await rowsForItem(user.id, task.id);
    await expect(
      snooze(user.id, sent!.id, 15, at("2027-01-11 18:00")),
    ).rejects.toThrow(ConflictError);

    const other = await setUp();
    await expect(
      snooze(other.id, sent!.id, 15, at("2027-01-11 17:25")),
    ).rejects.toThrow(NotFoundError);
    await expect(
      snooze(user.id, randomUUID(), 15, at("2027-01-11 17:25")),
    ).rejects.toThrow(NotFoundError);
    expect(
      (await rowsForItem(user.id, task.id)).filter((row) => row.snoozed),
    ).toEqual([]);
  });

  it("takes only 15 minutes or an hour", () => {
    const id = randomUUID();
    expect(snoozeReminderSchema.safeParse({ id, minutes: 30 }).success).toBe(
      false,
    );
    expect(snoozeReminderSchema.safeParse({ id, minutes: "15" }).success).toBe(
      false,
    );
    expect(
      snoozeReminderSchema.safeParse({ id: "1", minutes: 15 }).success,
    ).toBe(false);
  });
});

// --- The item dialog's status ----------------------------------------------------

describe("an item's reminder status", () => {
  it("shows the next reminder, then that it was sent with snooze, then the snooze", async () => {
    const user = await setUp();
    const task = await timedTask(user.id, "2027-01-11 12:00");
    const item = { kind: "task" as const, id: task.id };

    expect(await reminderStatusFor(user.id, item, NOW)).toEqual({
      next: { when: "11:30", snoozed: false },
      last: null,
      snoozeId: null,
    });

    await sweepAt("2027-01-11 11:20");
    const [sent] = await rowsForItem(user.id, task.id);
    const afterSend = at("2027-01-11 11:21");
    expect(await reminderStatusFor(user.id, item, afterSend)).toEqual({
      next: null,
      last: expect.stringMatching(/^Sent 11 Jan 2027, 11:20$/),
      snoozeId: sent!.id,
    });

    await snooze(user.id, sent!.id, 15, afterSend);
    expect(await reminderStatusFor(user.id, item, afterSend)).toEqual({
      next: { when: "11:36", snoozed: true },
      last: null,
      snoozeId: null,
    });

    // Once the deadline has passed there is nothing left to snooze.
    expect(
      (await reminderStatusFor(user.id, item, at("2027-01-11 12:01"))).snoozeId,
    ).toBeNull();
  });

  it("says a reminder held for quiet hours that had passed by their end was skipped because of them", async () => {
    const user = await setUp();
    await saveSettings(user.id, {
      quietHours: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    const task = await timedTask(user.id, "2027-01-12 06:00");
    await sweepAt("2027-01-12 05:30");
    await sweepAt("2027-01-12 07:00");

    expect(
      await reminderStatusFor(user.id, { kind: "task", id: task.id }),
    ).toEqual({ next: null, last: "Skipped: quiet hours", snoozeId: null });
  });

  it("names a reminder further out by its date, and shows nothing for another user's item", async () => {
    const user = await setUp({ device: false });
    const event = await timedEvent(
      user.id,
      "2027-02-01 09:00",
      "2027-02-01 10:00",
      { reminderOffsetMinutes: 1440 },
    );
    expect(
      await reminderStatusFor(user.id, { kind: "event", id: event.id }),
    ).toEqual({
      next: { when: "31 Jan 2027, 09:00", snoozed: false },
      last: null,
      snoozeId: null,
    });

    const other = await setUp();
    expect(
      await reminderStatusFor(other.id, { kind: "event", id: event.id }),
    ).toEqual({ next: null, last: null, snoozeId: null });
  });
});

// --- The forms' reminder fields --------------------------------------------------

describe("the forms' reminder fields", () => {
  it("lets the task edit form set and remove the reminder in its save, recording its own event", async () => {
    const user = await setUp();
    const task = await timedTask(user.id, "2027-01-11 18:00", {
      reminderOffsetMinutes: null,
    });
    expect(task.reminderOffsetMinutes).toBeNull();
    expect(await rowsForItem(user.id, task.id)).toEqual([]);

    const edited = await updateTask(
      user.id,
      updateTaskSchema.parse({
        id: task.id,
        title: "Submit the visa form",
        reminderOffsetMinutes: "60",
      }),
    );
    expect(edited.reminderOffsetMinutes).toBe(60);
    expect(await rowsForItem(user.id, task.id)).toEqual([
      expect.objectContaining({ fireAt: at("2027-01-11 17:00") }),
    ]);
    const types = (
      await db
        .select({ type: auditEvents.eventType })
        .from(auditEvents)
        .where(eq(auditEvents.entityId, task.id))
    ).map(({ type }) => type);
    expect(types).toEqual(
      expect.arrayContaining(["task.updated", "task.reminder_changed"]),
    );

    // Absent keeps it; blank removes it.
    await updateTask(
      user.id,
      updateTaskSchema.parse({ id: task.id, title: "Visa form" }),
    );
    expect(await rowsForItem(user.id, task.id)).toHaveLength(1);
    await updateTask(
      user.id,
      updateTaskSchema.parse({
        id: task.id,
        title: "Visa form",
        reminderOffsetMinutes: "",
      }),
    );
    expect(await rowsForItem(user.id, task.id)).toEqual([]);
  });

  it("refuses an offset outside the list with a field error", () => {
    const result = updateTaskSchema.safeParse({
      id: randomUUID(),
      title: "Visa form",
      reminderOffsetMinutes: "45",
    });
    expect(result.success).toBe(false);
    expect(result.error!.flatten().fieldErrors).toEqual({
      reminderOffsetMinutes: ["Choose a reminder from the list."],
    });
  });

  it("gives every occurrence of a series its reminder setting", async () => {
    const user = await setUp();
    await timedEvent(user.id, "2027-01-11 14:00", "2027-01-11 15:00", {
      rrule: "FREQ=DAILY",
      reminderOffsetMinutes: 30,
    });
    const occurrences = await eventsBetween(user.id, {
      localStart: "2027-01-11",
      localEnd: "2027-01-14",
      tz: NEW_YORK,
    });
    expect(occurrences.length).toBeGreaterThan(1);
    for (const occurrence of occurrences) {
      expect(occurrence.reminderOffsetMinutes).toBe(30);
    }
  });
});
