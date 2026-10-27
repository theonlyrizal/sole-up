import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { instantFromLocal } from "@/lib/dates";
import { db } from "@/server/db/client";
import {
  auditEvents,
  calendarEvents,
  reminders,
  tasks,
  userPreferences,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  deleteCalendarEventOccurrence,
  editCalendarEventOccurrence,
  updateCalendarEvent,
} from "@/server/modules/calendar-events/service";
import {
  createCalendarEventSchema,
  deleteCalendarEventOccurrenceSchema,
  editCalendarEventOccurrenceSchema,
  updateCalendarEventSchema,
} from "@/server/modules/calendar-events/validation";
import {
  savePreferences,
  setDailyNudgeTime,
} from "@/server/modules/preferences/service";
import { setDailyNudgeTimeSchema } from "@/server/modules/preferences/validation";
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  rescheduleTaskDue,
  setTaskReminder,
} from "@/server/modules/tasks/service";
import {
  createTaskSchema,
  rescheduleTaskDueSchema,
  setTaskReminderSchema,
} from "@/server/modules/tasks/validation";

import { captureLogs } from "../../../../tests/helpers/logs";
import { createTestUser } from "../../../../tests/integration/helpers/users";
import { claimDueReminders } from "./claim";
import { runSweep } from "./sweep";

const NEW_YORK = "America/New_York";
const TOKYO = "Asia/Tokyo";

/** Monday 11 January 2027, 10:00 in New York (15:00 UTC). */
const NOW = new Date("2027-01-11T15:00:00.000Z");

/** The UTC instant of a New York wall-clock time, e.g. "2027-01-12 09:00". */
const at = (local: string, zone = NEW_YORK) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, zone);
};
const minutesBefore = (instant: Date, minutes: number) =>
  new Date(instant.getTime() - minutes * 60_000);

type Form = Record<string, unknown>;
type DriverError = { cause?: { code?: string; constraint?: string } };

async function errorOf(write: () => Promise<unknown>): Promise<DriverError> {
  try {
    await write();
  } catch (error: unknown) {
    return error as DriverError;
  }
  throw new Error("Expected the write to fail");
}

/** Only `Date` is faked, so the pool's timers keep working. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

/** The user's reminder rows, earliest fire first. */
const rowsOf = (userId: string) =>
  db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .orderBy(asc(reminders.fireAt), asc(reminders.id));

const scheduledOf = async (userId: string) =>
  (await rowsOf(userId)).filter((row) => row.status === "scheduled");

/** Marks a row as delivered, as 5.5's sweep will. */
const markSent = (id: string) =>
  db
    .update(reminders)
    .set({ status: "sent", sentAt: NOW, claimedAt: NOW })
    .where(eq(reminders.id, id));

// --- Tasks ---------------------------------------------------------------------

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

const reschedule = (userId: string, id: string, fields: Form) =>
  rescheduleTaskDue(userId, rescheduleTaskDueSchema.parse({ id, ...fields }));

describe("task reminders", () => {
  it("schedules one row an offset before a timed deadline", async () => {
    const user = await createTestUser();
    const task = await timedTask(user.id, "2027-01-12 17:00");

    const [row, ...rest] = await rowsOf(user.id);
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      kind: "task_deadline",
      taskId: task.id,
      eventId: null,
      targetAt: at("2027-01-12 17:00"),
      occurrenceStart: null,
      fireAt: at("2027-01-12 16:30"),
      status: "scheduled",
      attempts: 0,
      snoozed: false,
    });
  });

  it("moves the row when the deadline or the offset changes, and removes it with the offset", async () => {
    const user = await createTestUser();
    const task = await timedTask(user.id, "2027-01-12 17:00");
    const [original] = await rowsOf(user.id);

    await reschedule(user.id, task.id, {
      dueDate: "2027-01-14",
      dueTime: "09:15",
      dueTz: NEW_YORK,
    });
    let [row] = await rowsOf(user.id);
    expect(row).toMatchObject({
      id: original!.id,
      targetAt: at("2027-01-14 09:15"),
      fireAt: at("2027-01-14 08:45"),
    });

    await setTaskReminder(
      user.id,
      setTaskReminderSchema.parse({ id: task.id, reminderOffsetMinutes: 1440 }),
    );
    [row] = await rowsOf(user.id);
    expect(row).toMatchObject({
      id: original!.id,
      fireAt: at("2027-01-13 09:15"),
    });

    await setTaskReminder(
      user.id,
      setTaskReminderSchema.parse({ id: task.id, reminderOffsetMinutes: null }),
    );
    expect(await rowsOf(user.id)).toEqual([]);

    const events = await db
      .select({ changes: auditEvents.changes })
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "task.reminder_changed"));
    expect(events.map(({ changes }) => changes)).toEqual([
      { reminderOffsetMinutes: { from: 30, to: 1440 } },
      { reminderOffsetMinutes: { from: 1440, to: null } },
    ]);
  });

  it("removes the row on complete and cancel, and restores it on reopen", async () => {
    const user = await createTestUser();
    const task = await timedTask(user.id, "2027-01-12 17:00");

    await changeTaskStatus(user.id, { id: task.id, status: "completed" });
    expect(await rowsOf(user.id)).toEqual([]);

    await changeTaskStatus(user.id, { id: task.id, status: "open" });
    expect(await rowsOf(user.id)).toMatchObject([
      { taskId: task.id, fireAt: at("2027-01-12 16:30"), status: "scheduled" },
    ]);

    await changeTaskStatus(user.id, { id: task.id, status: "cancelled" });
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("gives a date-only deadline, no deadline or a passed one no row", async () => {
    const user = await createTestUser();
    await createTask(
      user.id,
      createTaskSchema.parse({
        title: "All-day",
        dueDate: "2027-01-12",
        reminderOffsetMinutes: 10,
      }),
    );
    await createTask(
      user.id,
      createTaskSchema.parse({ title: "Undated", reminderOffsetMinutes: 10 }),
    );
    await timedTask(user.id, "2027-01-11 09:00");
    // Fires before now but is still to come: claimed by the next sweep.
    const soon = await timedTask(user.id, "2027-01-11 10:20");
    const none = await timedTask(user.id, "2027-01-12 17:00", {
      reminderOffsetMinutes: "",
    });

    expect(await rowsOf(user.id)).toMatchObject([
      { taskId: soon.id, fireAt: at("2027-01-11 09:50") },
    ]);

    // A timed deadline turned date-only, and a cleared one, lose the row.
    await reschedule(user.id, soon.id, { dueDate: "2027-01-12" });
    expect(await rowsOf(user.id)).toEqual([]);
    await setTaskReminder(user.id, { id: none.id, reminderOffsetMinutes: 0 });
    expect(await rowsOf(user.id)).toMatchObject([
      { taskId: none.id, fireAt: at("2027-01-12 17:00") },
    ]);
    await reschedule(user.id, none.id, {});
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("doesn't schedule a target that was already reminded about again", async () => {
    const user = await createTestUser();
    const task = await timedTask(user.id, "2027-01-12 17:00");
    const [row] = await rowsOf(user.id);
    await markSent(row!.id);

    await changeTaskStatus(user.id, { id: task.id, status: "completed" });
    await changeTaskStatus(user.id, { id: task.id, status: "open" });
    expect(await scheduledOf(user.id)).toEqual([]);

    // A new deadline is a new target.
    await reschedule(user.id, task.id, {
      dueDate: "2027-01-13",
      dueTime: "17:00",
      dueTz: NEW_YORK,
    });
    expect(await scheduledOf(user.id)).toMatchObject([
      { targetAt: at("2027-01-13 17:00") },
    ]);
  });

  it("deletes the task's reminders, delivered ones included, with the task", async () => {
    const user = await createTestUser();
    const task = await timedTask(user.id, "2027-01-12 17:00");
    const [row] = await rowsOf(user.id);
    await markSent(row!.id);
    await reschedule(user.id, task.id, {
      dueDate: "2027-01-13",
      dueTime: "17:00",
      dueTz: NEW_YORK,
    });
    expect(await rowsOf(user.id)).toHaveLength(2);

    await deleteTask(user.id, { id: task.id });
    expect(await rowsOf(user.id)).toEqual([]);
  });
});

// --- Events --------------------------------------------------------------------

const timedForm = (start: string, end: string, fields: Form = {}): Form => {
  const [startDate, startTime] = start.split(" ");
  const [endDate, endTime] = end.split(" ");
  return {
    title: "Standup",
    allDay: false,
    startDate,
    startTime,
    endDate,
    endTime,
    tz: NEW_YORK,
    ...fields,
  };
};

const createEvent = (userId: string, form: Form) =>
  createCalendarEvent(userId, createCalendarEventSchema.parse(form));

/** A daily 09:00–09:30 standup since Monday 4 January, reminding 10 minutes before. */
const dailyStandup = (userId: string, fields: Form = {}) =>
  createEvent(
    userId,
    timedForm("2027-01-04 09:00", "2027-01-04 09:30", {
      rrule: "FREQ=DAILY",
      reminderOffsetMinutes: 10,
      ...fields,
    }),
  );

type Scope = "this" | "following" | "all";

const editOccurrence = (
  userId: string,
  id: string,
  originalStart: Date,
  scope: Scope,
  form: Form,
) =>
  editCalendarEventOccurrence(
    userId,
    editCalendarEventOccurrenceSchema.parse({
      id,
      originalStart: originalStart.toISOString(),
      scope,
      ...form,
    }),
  );

const deleteOccurrence = (
  userId: string,
  id: string,
  originalStart: Date,
  scope: Scope,
) =>
  deleteCalendarEventOccurrence(
    userId,
    deleteCalendarEventOccurrenceSchema.parse({
      id,
      originalStart: originalStart.toISOString(),
      scope,
    }),
  );

describe("one-off event reminders", () => {
  it("schedules a timed event's start minus the offset, and follows edits", async () => {
    const user = await createTestUser();
    const event = await createEvent(
      user.id,
      timedForm("2027-01-12 14:00", "2027-01-12 15:00", {
        reminderOffsetMinutes: 10,
      }),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      {
        kind: "event",
        eventId: event.id,
        taskId: null,
        targetAt: at("2027-01-12 14:00"),
        occurrenceStart: null,
        fireAt: at("2027-01-12 13:50"),
      },
    ]);

    // An edit without a reminder keeps it; the times move it.
    await updateCalendarEvent(
      user.id,
      updateCalendarEventSchema.parse({
        id: event.id,
        ...timedForm("2027-01-12 16:00", "2027-01-12 17:00"),
      }),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      { fireAt: at("2027-01-12 15:50") },
    ]);

    await updateCalendarEvent(
      user.id,
      updateCalendarEventSchema.parse({
        id: event.id,
        ...timedForm("2027-01-12 16:00", "2027-01-12 17:00", {
          reminderOffsetMinutes: 60,
        }),
      }),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      { fireAt: at("2027-01-12 15:00") },
    ]);
    const [updated] = await db
      .select({ changes: auditEvents.changes })
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "calendar_event.updated"))
      .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id))
      .offset(1);
    expect(updated?.changes).toEqual({
      fields: ["reminderOffsetMinutes"],
      reminderOffsetMinutes: { from: 10, to: 60 },
    });

    await updateCalendarEvent(
      user.id,
      updateCalendarEventSchema.parse({
        id: event.id,
        ...timedForm("2027-01-12 16:00", "2027-01-12 17:00", {
          reminderOffsetMinutes: null,
        }),
      }),
    );
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("gives all-day, past and reminder-less events no row, and deletes with the event", async () => {
    const user = await createTestUser();
    await createEvent(user.id, {
      title: "Holiday",
      allDay: true,
      startDate: "2027-01-12",
      endDate: "2027-01-12",
      reminderOffsetMinutes: 10,
    });
    await createEvent(
      user.id,
      timedForm("2027-01-11 08:00", "2027-01-11 09:00", {
        reminderOffsetMinutes: 10,
      }),
    );
    await createEvent(
      user.id,
      timedForm("2027-01-12 08:00", "2027-01-12 09:00"),
    );
    expect(await rowsOf(user.id)).toEqual([]);

    const event = await createEvent(
      user.id,
      timedForm("2027-01-12 08:00", "2027-01-12 09:00", {
        reminderOffsetMinutes: 0,
      }),
    );
    expect(await rowsOf(user.id)).toHaveLength(1);
    await deleteCalendarEvent(user.id, { id: event.id });
    expect(await rowsOf(user.id)).toEqual([]);
  });
});

describe("repeating event reminders", () => {
  const next = at("2027-01-12 09:00");
  const dayAfter = at("2027-01-13 09:00");

  it("keeps one rolling row for the next occurrence still to come", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);

    expect(await rowsOf(user.id)).toMatchObject([
      {
        eventId: series.id,
        targetAt: next,
        occurrenceStart: next,
        fireAt: at("2027-01-12 08:50"),
      },
    ]);
  });

  it("skips a cancelled next occurrence and fires a moved one from its new start", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);

    await deleteOccurrence(user.id, series.id, next, "this");
    expect(await rowsOf(user.id)).toMatchObject([
      { targetAt: dayAfter, occurrenceStart: dayAfter },
    ]);

    // Move the day-after's occurrence later the same day.
    await editOccurrence(
      user.id,
      series.id,
      dayAfter,
      "this",
      timedForm("2027-01-13 11:00", "2027-01-13 11:30"),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      {
        targetAt: at("2027-01-13 11:00"),
        occurrenceStart: dayAfter,
        fireAt: at("2027-01-13 10:50"),
      },
    ]);

    // A later occurrence moved before it becomes the next one.
    await editOccurrence(
      user.id,
      series.id,
      at("2027-01-15 09:00"),
      "this",
      timedForm("2027-01-13 07:00", "2027-01-13 07:30"),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      {
        targetAt: at("2027-01-13 07:00"),
        occurrenceStart: at("2027-01-15 09:00"),
      },
    ]);
  });

  it("follows an 'all' edit of the times and the reminder", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);
    const [original] = await rowsOf(user.id);

    await editOccurrence(
      user.id,
      series.id,
      next,
      "all",
      timedForm("2027-01-12 10:00", "2027-01-12 10:30", {
        rrule: "FREQ=DAILY",
      }),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      {
        id: original!.id,
        targetAt: at("2027-01-12 10:00"),
        occurrenceStart: at("2027-01-12 10:00"),
        fireAt: at("2027-01-12 09:50"),
      },
    ]);

    // Only the reminder changes: not a no-op.
    await editOccurrence(
      user.id,
      series.id,
      at("2027-01-12 10:00"),
      "all",
      timedForm("2027-01-12 10:00", "2027-01-12 10:30", {
        rrule: "FREQ=DAILY",
        reminderOffsetMinutes: 30,
      }),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      { fireAt: at("2027-01-12 09:30") },
    ]);
    const [row] = await db
      .select({ offset: calendarEvents.reminderOffsetMinutes })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, series.id));
    expect(row?.offset).toBe(30);

    await editOccurrence(
      user.id,
      series.id,
      at("2027-01-12 10:00"),
      "all",
      timedForm("2027-01-12 10:00", "2027-01-12 10:30", {
        rrule: "FREQ=DAILY",
        reminderOffsetMinutes: null,
      }),
    );
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("refuses a reminder on a 'this' edit", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);

    const parsed = editCalendarEventOccurrenceSchema.safeParse({
      id: series.id,
      originalStart: next.toISOString(),
      scope: "this",
      ...timedForm("2027-01-12 09:00", "2027-01-12 09:30", {
        reminderOffsetMinutes: 30,
      }),
    });
    expect(parsed.success).toBe(false);
  });

  it("gives each side of a split its own row, the new series inheriting the reminder", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);

    // Split after the next occurrence: the old series keeps it.
    const later = at("2027-01-14 09:00");
    const { event: tail } = await editOccurrence(
      user.id,
      series.id,
      later,
      "following",
      timedForm("2027-01-14 09:30", "2027-01-14 10:00", {
        rrule: "FREQ=DAILY",
      }),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      { eventId: series.id, targetAt: next, fireAt: at("2027-01-12 08:50") },
      {
        eventId: tail.id,
        targetAt: at("2027-01-14 09:30"),
        fireAt: at("2027-01-14 09:20"),
      },
    ]);

    // Split at the next occurrence: the old series has none left to fire.
    const { event: rest } = await editOccurrence(
      user.id,
      series.id,
      next,
      "following",
      timedForm("2027-01-12 08:00", "2027-01-12 08:30", {
        rrule: "FREQ=DAILY;UNTIL=20270113",
        reminderOffsetMinutes: 60,
      }),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      {
        eventId: rest.id,
        targetAt: at("2027-01-12 08:00"),
        fireAt: at("2027-01-12 07:00"),
      },
      { eventId: tail.id, targetAt: at("2027-01-14 09:30") },
    ]);
  });

  it("follows deletes in each scope", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);

    await deleteOccurrence(user.id, series.id, dayAfter, "following");
    expect(await rowsOf(user.id)).toMatchObject([{ targetAt: next }]);

    await deleteOccurrence(user.id, series.id, next, "following");
    expect(await rowsOf(user.id)).toEqual([]);
    const [shortened] = await db
      .select({ rrule: calendarEvents.rrule })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, series.id));
    expect(shortened?.rrule).toBe("FREQ=DAILY;UNTIL=20270111");

    const other = await dailyStandup(user.id);
    expect(await rowsOf(user.id)).toHaveLength(1);
    await deleteOccurrence(user.id, other.id, dayAfter, "all");
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("rolls past an occurrence already reminded about", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);
    const [first] = await rowsOf(user.id);
    await markSent(first!.id);

    // Any change recalculates the row; the sent occurrence isn't repeated.
    await editOccurrence(
      user.id,
      series.id,
      next,
      "all",
      timedForm("2027-01-12 09:00", "2027-01-12 09:30", {
        title: "Daily standup",
        rrule: "FREQ=DAILY",
      }),
    );
    expect(await scheduledOf(user.id)).toMatchObject([
      { targetAt: dayAfter, occurrenceStart: dayAfter },
    ]);

    // Moving the reminded occurrence makes it a new target.
    await editOccurrence(
      user.id,
      series.id,
      next,
      "this",
      timedForm("2027-01-12 11:00", "2027-01-12 11:30", {
        title: "Daily standup",
      }),
    );
    expect(await scheduledOf(user.id)).toMatchObject([
      { targetAt: at("2027-01-12 11:00"), occurrenceStart: next },
    ]);
  });

  it("finds a yearly occurrence more than a year away", async () => {
    const user = await createTestUser();
    await createEvent(
      user.id,
      timedForm("2024-02-29 12:00", "2024-02-29 13:00", {
        rrule: "FREQ=YEARLY",
        reminderOffsetMinutes: 1440,
      }),
    );
    expect(await rowsOf(user.id)).toMatchObject([
      {
        targetAt: at("2028-02-29 12:00"),
        fireAt: at("2028-02-28 12:00"),
      },
    ]);
  });
});

// --- Daily nudge ---------------------------------------------------------------

const confirmZone = (userId: string, timezone: string) =>
  savePreferences(userId, { timezone, locale: "en-US", weekStart: 1 });

const nudgeAt = (userId: string, dailyNudgeTime: string | null) =>
  setDailyNudgeTime(userId, setDailyNudgeTimeSchema.parse({ dailyNudgeTime }));

describe("daily nudge", () => {
  it("schedules the next local occurrence of the time, and removes it when turned off", async () => {
    const user = await createTestUser();
    await confirmZone(user.id, NEW_YORK);

    await nudgeAt(user.id, "18:00");
    expect(await rowsOf(user.id)).toMatchObject([
      {
        kind: "daily_nudge",
        taskId: null,
        eventId: null,
        targetAt: at("2027-01-11 18:00"),
        fireAt: at("2027-01-11 18:00"),
      },
    ]);

    // 08:00 has passed today: tomorrow's.
    await nudgeAt(user.id, "08:00");
    expect(await rowsOf(user.id)).toMatchObject([
      { targetAt: at("2027-01-12 08:00") },
    ]);

    await nudgeAt(user.id, null);
    expect(await rowsOf(user.id)).toEqual([]);
    const [preferences] = await db
      .select({ time: userPreferences.dailyNudgeTime })
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id));
    expect(preferences?.time).toBeNull();
  });

  it("waits for a confirmed time zone", async () => {
    const user = await createTestUser();
    await nudgeAt(user.id, "08:00");
    expect(await rowsOf(user.id)).toEqual([]);

    await confirmZone(user.id, NEW_YORK);
    expect(await rowsOf(user.id)).toMatchObject([
      { kind: "daily_nudge", targetAt: at("2027-01-12 08:00") },
    ]);
  });

  it("refuses a malformed time", () => {
    expect(
      setDailyNudgeTimeSchema.safeParse({ dailyNudgeTime: "24:00" }).success,
    ).toBe(false);
    expect(
      setDailyNudgeTimeSchema.parse({ dailyNudgeTime: "" }).dailyNudgeTime,
    ).toBeNull();
  });

  it("moves only the nudge when the time zone changes", async () => {
    const user = await createTestUser();
    await confirmZone(user.id, NEW_YORK);
    await nudgeAt(user.id, "08:00");
    const task = await timedTask(user.id, "2027-01-12 17:00");
    const event = await createEvent(
      user.id,
      timedForm("2027-01-12 14:00", "2027-01-12 15:00", {
        reminderOffsetMinutes: 10,
      }),
    );
    const before = await rowsOf(user.id);
    const itemRows = (rows: typeof before) =>
      rows.filter((row) => row.kind !== "daily_nudge");

    await confirmZone(user.id, TOKYO);

    const after = await rowsOf(user.id);
    expect(itemRows(after)).toEqual(itemRows(before));
    expect(itemRows(after).map((row) => row.taskId ?? row.eventId)).toEqual([
      event.id,
      task.id,
    ]);
    // 00:00 on 12 January in Tokyo now; 08:00 there is still to come.
    expect(after.find((row) => row.kind === "daily_nudge")).toMatchObject({
      targetAt: at("2027-01-12 08:00", TOKYO),
    });
  });
});

// --- Schema --------------------------------------------------------------------

describe("reminders schema", () => {
  it("refuses an offset outside the list on tasks and events, in the CHECK and the forms", async () => {
    const user = await createTestUser();
    const task = await timedTask(user.id, "2027-01-12 17:00");
    const event = await createEvent(
      user.id,
      timedForm("2027-01-12 14:00", "2027-01-12 15:00"),
    );

    expect(
      await errorOf(() =>
        db
          .update(tasks)
          .set({ reminderOffsetMinutes: 15 as 10 })
          .where(eq(tasks.id, task.id)),
      ),
    ).toMatchObject({
      cause: {
        code: "23514",
        constraint: "tasks_reminder_offset_minutes_check",
      },
    });
    expect(
      await errorOf(() =>
        db
          .update(calendarEvents)
          .set({ reminderOffsetMinutes: 5 as 10 })
          .where(eq(calendarEvents.id, event.id)),
      ),
    ).toMatchObject({
      cause: {
        code: "23514",
        constraint: "calendar_events_reminder_offset_minutes_check",
      },
    });

    const parsed = setTaskReminderSchema.safeParse({
      id: task.id,
      reminderOffsetMinutes: 15,
    });
    expect(parsed.error?.flatten().fieldErrors).toEqual({
      reminderOffsetMinutes: ["Choose a reminder from the list."],
    });
    expect(
      setTaskReminderSchema.parse({ id: task.id, reminderOffsetMinutes: "60" })
        .reminderOffsetMinutes,
    ).toBe(60);
    expect(
      createCalendarEventSchema.safeParse(
        timedForm("2027-01-12 14:00", "2027-01-12 15:00", {
          reminderOffsetMinutes: 45,
        }),
      ).success,
    ).toBe(false);
  });

  it("ties each kind to its link, and keeps one scheduled, non-snoozed row per item", async () => {
    const user = await createTestUser();
    const task = await timedTask(user.id, "2027-01-12 17:00");
    const base = {
      userId: user.id,
      targetAt: at("2027-01-12 17:00"),
      fireAt: at("2027-01-12 16:30"),
    };

    expect(
      await errorOf(() =>
        db
          .insert(reminders)
          .values({ ...base, kind: "daily_nudge", taskId: task.id }),
      ),
    ).toMatchObject({
      cause: { code: "23514", constraint: "reminders_link_check" },
    });
    expect(
      await errorOf(() =>
        db
          .insert(reminders)
          .values({ ...base, kind: "event", taskId: task.id }),
      ),
    ).toMatchObject({
      cause: { code: "23514", constraint: "reminders_link_check" },
    });
    expect(
      await errorOf(() =>
        db.insert(reminders).values({
          ...base,
          kind: "task_deadline",
          taskId: task.id,
          status: "skipped",
        }),
      ),
    ).toMatchObject({
      cause: { code: "23514", constraint: "reminders_skip_reason_check" },
    });

    // The service's row is already scheduled.
    expect(
      await errorOf(() =>
        db
          .insert(reminders)
          .values({ ...base, kind: "task_deadline", taskId: task.id }),
      ),
    ).toMatchObject({
      cause: { code: "23505", constraint: "reminders_one_scheduled_key" },
    });
    // A snoozed one and the record sit beside it.
    await db.insert(reminders).values([
      { ...base, kind: "task_deadline", taskId: task.id, snoozed: true },
      {
        ...base,
        kind: "task_deadline",
        taskId: task.id,
        status: "sent",
        sentAt: NOW,
      },
    ]);
    expect(await rowsOf(user.id)).toHaveLength(3);
  });

  it("refuses a link to another user's task or event", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const task = await timedTask(alice.id, "2027-01-12 17:00");
    const event = await createEvent(
      alice.id,
      timedForm("2027-01-12 14:00", "2027-01-12 15:00"),
    );
    // A delivered row, so Alice's scheduled one doesn't clash first.
    const base = {
      userId: bob.id,
      targetAt: at("2027-01-12 17:00"),
      fireAt: at("2027-01-12 16:30"),
      status: "sent" as const,
      sentAt: NOW,
    };

    expect(
      await errorOf(() =>
        db
          .insert(reminders)
          .values({ ...base, kind: "task_deadline", taskId: task.id }),
      ),
    ).toMatchObject({
      cause: { code: "23503", constraint: "reminders_task_id_user_id_fk" },
    });
    expect(
      await errorOf(() =>
        db
          .insert(reminders)
          .values({ ...base, kind: "event", eventId: event.id }),
      ),
    ).toMatchObject({
      cause: { code: "23503", constraint: "reminders_event_id_user_id_fk" },
    });
  });
});

// --- Cross-user ------------------------------------------------------------------

describe("cross-user access", () => {
  it("can't set a reminder on another user's task, or move their reminders", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await confirmZone(alice.id, NEW_YORK);
    await nudgeAt(alice.id, "08:00");
    const task = await timedTask(alice.id, "2027-01-12 17:00");
    const series = await dailyStandup(alice.id);
    const before = await rowsOf(alice.id);

    await expect(
      setTaskReminder(bob.id, { id: task.id, reminderOffsetMinutes: 0 }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      changeTaskStatus(bob.id, { id: task.id, status: "completed" }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      editOccurrence(
        bob.id,
        series.id,
        at("2027-01-12 09:00"),
        "all",
        timedForm("2027-01-12 09:00", "2027-01-12 09:30", {
          rrule: "FREQ=DAILY",
          reminderOffsetMinutes: null,
        }),
      ),
    ).rejects.toThrow(NotFoundError);
    await confirmZone(bob.id, TOKYO);
    await nudgeAt(bob.id, "07:00");

    expect(await rowsOf(alice.id)).toEqual(before);
    expect(await rowsOf(bob.id)).toMatchObject([{ kind: "daily_nudge" }]);
  });
});

// --- Claiming ------------------------------------------------------------------

/** Inserts scheduled nudge-shaped rows for fresh users, firing at `fireAts`. */
async function dueRows(fireAts: Date[]) {
  const ids: string[] = [];
  for (const fireAt of fireAts) {
    const user = await createTestUser();
    const [row] = await db
      .insert(reminders)
      .values({
        userId: user.id,
        kind: "daily_nudge",
        targetAt: fireAt,
        fireAt,
      })
      .returning({ id: reminders.id });
    ids.push(row!.id);
  }
  return ids;
}

const statusOf = async (id: string) => {
  const [row] = await db
    .select({ status: reminders.status, claimedAt: reminders.claimedAt })
    .from(reminders)
    .where(eq(reminders.id, id));
  return row;
};

describe("claimDueReminders", () => {
  it("claims what fires before the next sweep, oldest first, and nothing else", async () => {
    const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
    const [late, inFourteen, now, inFifteen, inSixteen] = await dueRows([
      minutes(-90),
      minutes(14),
      NOW,
      minutes(15),
      minutes(16),
    ]);
    const [sent] = await dueRows([minutes(-5)]);
    await markSent(sent!);

    const claimed = await claimDueReminders(NOW);

    expect(claimed.map(({ id }) => id)).toEqual([late, now, inFourteen]);
    expect(await statusOf(late!)).toEqual({
      status: "sending",
      claimedAt: NOW,
    });
    expect(await statusOf(inFifteen!)).toEqual({
      status: "scheduled",
      claimedAt: null,
    });
    expect(await statusOf(inSixteen!)).toMatchObject({ status: "scheduled" });
    expect(await statusOf(sent!)).toMatchObject({ status: "sent" });

    // Claimed rows stay claimed until 5.5 sends them.
    expect(await claimDueReminders(NOW)).toEqual([]);
  });

  it("never lets two concurrent claims take the same row", async () => {
    const ids = await dueRows(
      Array.from({ length: 40 }, (_, i) => minutesBefore(NOW, i)),
    );

    const batches = await Promise.all(
      Array.from({ length: 4 }, () => claimDueReminders(NOW, 15, 15)),
    );
    const claimed = batches.flat().map(({ id }) => id);
    expect(new Set(claimed).size).toBe(claimed.length);

    // Whatever the batch limit left behind, a later claim takes once.
    const rest = (await claimDueReminders(NOW)).map(({ id }) => id);
    expect([...claimed, ...rest].sort()).toEqual([...ids].sort());
  });

  it("skips a row another transaction holds instead of waiting for it", async () => {
    const [held, free] = await dueRows([
      minutesBefore(NOW, 2),
      minutesBefore(NOW, 1),
    ]);

    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = db.transaction(async (tx) => {
      await tx
        .select({ id: reminders.id })
        .from(reminders)
        .where(eq(reminders.id, held!))
        .for("update");
      locked();
      await released;
    });
    await isLocked;

    const first = await claimDueReminders(NOW);
    release();
    await holder;
    expect(first.map(({ id }) => id)).toEqual([free]);

    const second = await claimDueReminders(NOW);
    expect(second.map(({ id }) => id)).toEqual([held]);
  });

  it("is what runSweep counts", async () => {
    await dueRows([minutesBefore(NOW, 1), NOW]);
    captureLogs();
    const sweep = await runSweep(NOW);
    vi.restoreAllMocks();
    expect(sweep.counts).toEqual({
      claimed: 2,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
    const rows = await db
      .select({ status: reminders.status })
      .from(reminders)
      .where(eq(reminders.status, "sending"));
    expect(rows).toHaveLength(2);
  });
});
