import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CalendarEventOccurrence } from "@/lib/calendar-events";
import { instantFromLocal, localDateTimeOf } from "@/lib/dates";
import { db } from "@/server/db/client";
import {
  auditEvents,
  calendarEventExceptions,
  calendarEvents,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  deleteCalendarEventOccurrence,
  editCalendarEventOccurrence,
  eventsBetween,
  getCalendarEvent,
  updateCalendarEvent,
} from "./service";
import {
  createCalendarEventSchema,
  deleteCalendarEventOccurrenceSchema,
  editCalendarEventOccurrenceSchema,
  eventsBetweenSchema,
  updateCalendarEventSchema,
} from "./validation";

const NEW_YORK = "America/New_York";

type Scope = "this" | "following" | "all";
type Form = Record<string, unknown>;

/** The UTC instant of a New York wall-clock time, e.g. "2026-10-05 09:00". */
const at = (local: string) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, NEW_YORK);
};

/** A timed form in New York from local date-times. */
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

/** An all-day form; `lastDay` is inclusive, as the form sends it. */
const allDayForm = (
  startDate: string,
  lastDay: string,
  fields: Form = {},
): Form => ({
  title: "Holiday",
  allDay: true,
  startDate,
  endDate: lastDay,
  ...fields,
});

const createSeries = (userId: string, form: Form, rrule: string) =>
  createCalendarEvent(
    userId,
    createCalendarEventSchema.parse({ ...form, rrule }),
  );

const keyOf = (originalStart: Date | string) =>
  originalStart instanceof Date ? originalStart.toISOString() : originalStart;

const editOccurrence = (
  userId: string,
  id: string,
  originalStart: Date | string,
  scope: Scope,
  form: Form,
) =>
  editCalendarEventOccurrence(
    userId,
    editCalendarEventOccurrenceSchema.parse({
      id,
      originalStart: keyOf(originalStart),
      scope,
      ...form,
    }),
  );

const deleteOccurrence = (
  userId: string,
  id: string,
  originalStart: Date | string,
  scope: Scope,
) =>
  deleteCalendarEventOccurrence(
    userId,
    deleteCalendarEventOccurrenceSchema.parse({
      id,
      originalStart: keyOf(originalStart),
      scope,
    }),
  );

const occurrences = (userId: string, localStart: string, localEnd: string) =>
  eventsBetween(
    userId,
    eventsBetweenSchema.parse({ localStart, localEnd, tz: NEW_YORK }),
  );

/** "YYYY-MM-DD HH:MM title" in New York, or "YYYY-MM-DD title" all-day. */
const summary = (list: CalendarEventOccurrence[]) =>
  list.map((occurrence) => {
    if (occurrence.allDay) return `${occurrence.startDate} ${occurrence.title}`;
    const { date, time } = localDateTimeOf(occurrence.startAt, NEW_YORK);
    return `${date} ${time} ${occurrence.title}`;
  });

async function seriesRow(id: string) {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id));
  return row;
}

async function exceptionRows(eventId: string) {
  return db
    .select()
    .from(calendarEventExceptions)
    .where(eq(calendarEventExceptions.eventId, eventId))
    .orderBy(
      asc(calendarEventExceptions.originalStartAt),
      asc(calendarEventExceptions.originalStartDate),
    );
}

async function eventsFor(userId: string, entityId?: string) {
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        entityId ? eq(auditEvents.entityId, entityId) : undefined,
      ),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
}

const newGoal = (userId: string) =>
  createGoal(userId, createGoalSchema.parse({ title: "Run a 10k" }));

/** A daily 09:00–09:30 standup from 5 October 2026 (before any DST change). */
const dailyStandup = (
  userId: string,
  rrule = "FREQ=DAILY",
  fields: Form = {},
) =>
  createSeries(
    userId,
    timedForm("2026-10-05 09:00", "2026-10-05 09:30", fields),
    rrule,
  );

describe("calendar_event_exceptions schema", () => {
  it("refuses an exception on another user's series", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const series = await dailyStandup(owner.id);

    await expect(
      db.insert(calendarEventExceptions).values({
        userId: other.id,
        eventId: series.id,
        originalStartDate: "2026-10-06",
        kind: "cancelled",
      }),
    ).rejects.toMatchObject({
      cause: {
        code: "23503",
        constraint: "calendar_event_exceptions_event_id_user_id_fk",
      },
    });
  });

  it("keeps a cancelled exception empty and a modified one in the original's shape", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);
    const base = { userId: user.id, eventId: series.id };

    await expect(
      db.insert(calendarEventExceptions).values({
        ...base,
        originalStartAt: at("2026-10-06 09:00"),
        kind: "cancelled",
        title: "Should not be here",
      }),
    ).rejects.toMatchObject({
      cause: {
        code: "23514",
        constraint: "calendar_event_exceptions_override_check",
      },
    });
    await expect(
      db.insert(calendarEventExceptions).values({
        ...base,
        originalStartAt: at("2026-10-06 09:00"),
        kind: "modified",
        title: "Standup",
        startDate: "2026-10-06",
        endDate: "2026-10-07",
      }),
    ).rejects.toMatchObject({
      cause: {
        code: "23514",
        constraint: "calendar_event_exceptions_override_check",
      },
    });
  });
});

describe("repeating series", () => {
  it("creates a series with its rule and expands it in eventsBetween", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id, "FREQ=DAILY;COUNT=3");
    const oneOff = await createCalendarEvent(
      user.id,
      createCalendarEventSchema.parse(
        timedForm("2026-10-06 12:00", "2026-10-06 13:00", { title: "Lunch" }),
      ),
    );

    expect(series.rrule).toBe("FREQ=DAILY;COUNT=3");
    const [created] = await eventsFor(user.id, series.id);
    expect(created?.changes).toMatchObject({
      rrule: { from: null, to: "FREQ=DAILY;COUNT=3" },
    });

    const list = await occurrences(user.id, "2026-10-01", "2026-10-31");
    expect(summary(list)).toEqual([
      "2026-10-05 09:00 Standup",
      "2026-10-06 09:00 Standup",
      "2026-10-06 12:00 Lunch",
      "2026-10-07 09:00 Standup",
    ]);
    expect(list[0]).toMatchObject({
      id: series.id,
      seriesId: series.id,
      originalStart: at("2026-10-05 09:00"),
      modified: false,
      rrule: "FREQ=DAILY;COUNT=3",
    });
    expect(list[2]).toMatchObject({
      id: oneOff.id,
      seriesId: null,
      originalStart: null,
      modified: false,
    });
  });

  it("keeps the local time across a DST change", async () => {
    const user = await createTestUser();
    await createSeries(
      user.id,
      timedForm("2026-10-30 09:00", "2026-10-30 10:00"),
      "FREQ=DAILY",
    );

    const list = await occurrences(user.id, "2026-10-31", "2026-11-03");
    expect(list.map((occurrence) => occurrence.startAt)).toEqual([
      new Date("2026-10-31T13:00:00Z"),
      new Date("2026-11-01T14:00:00Z"),
      new Date("2026-11-02T14:00:00Z"),
    ]);
  });

  it("shows an occurrence moved before the series start and the range", async () => {
    const user = await createTestUser();
    const series = await createSeries(
      user.id,
      allDayForm("2026-10-10", "2026-10-10"),
      "FREQ=DAILY",
    );
    await editOccurrence(
      user.id,
      series.id,
      "2026-10-10",
      "this",
      allDayForm("2026-10-03", "2026-10-03"),
    );

    const list = await occurrences(user.id, "2026-10-01", "2026-10-05");
    expect(list).toMatchObject([
      {
        id: series.id,
        startDate: "2026-10-03",
        endDate: "2026-10-04",
        originalStart: "2026-10-10",
        modified: true,
      },
    ]);
  });

  it("makes a one-off a series through update, but changes a series only through a scope", async () => {
    const user = await createTestUser();
    const event = await createCalendarEvent(
      user.id,
      createCalendarEventSchema.parse(
        timedForm("2026-10-05 09:00", "2026-10-05 09:30"),
      ),
    );

    const series = await updateCalendarEvent(
      user.id,
      updateCalendarEventSchema.parse({
        id: event.id,
        ...timedForm("2026-10-05 09:00", "2026-10-05 09:30"),
        rrule: "FREQ=WEEKLY;BYDAY=MO",
      }),
    );
    expect(series.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
    const [, updated] = await eventsFor(user.id, event.id);
    expect(updated?.changes).toEqual({
      fields: ["rrule"],
      rrule: { from: null, to: "FREQ=WEEKLY;BYDAY=MO" },
    });

    await expect(
      updateCalendarEvent(
        user.id,
        updateCalendarEventSchema.parse({
          id: event.id,
          ...timedForm("2026-10-05 10:00", "2026-10-05 10:30"),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      editOccurrence(
        user.id,
        (
          await createCalendarEvent(
            user.id,
            createCalendarEventSchema.parse(
              timedForm("2026-10-06 09:00", "2026-10-06 09:30"),
            ),
          )
        ).id,
        at("2026-10-06 09:00"),
        "this",
        timedForm("2026-10-06 10:00", "2026-10-06 10:30"),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses an occurrence the rule doesn't generate, or one that was cancelled", async () => {
    const user = await createTestUser();
    const series = await createSeries(
      user.id,
      timedForm("2026-10-05 09:00", "2026-10-05 09:30"),
      "FREQ=WEEKLY;BYDAY=MO",
    );
    const form = timedForm("2026-10-06 10:00", "2026-10-06 10:30");

    for (const originalStart of [
      at("2026-10-06 09:00"), // a Tuesday
      at("2026-10-12 09:01"), // the right day, wrong time
      "2026-10-12", // an all-day key on a timed series
    ]) {
      await expect(
        editOccurrence(user.id, series.id, originalStart, "this", form),
      ).rejects.toBeInstanceOf(NotFoundError);
    }

    await deleteOccurrence(user.id, series.id, at("2026-10-12 09:00"), "this");
    await expect(
      deleteOccurrence(user.id, series.id, at("2026-10-12 09:00"), "this"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("this event", () => {
  it("moves and renames one timed occurrence, recording no text", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id, "FREQ=DAILY;COUNT=3");

    const result = await editOccurrence(
      user.id,
      series.id,
      at("2026-10-06 09:00"),
      "this",
      timedForm("2026-10-06 14:00", "2026-10-06 15:00", {
        title: "Secret offsite",
        location: "Hidden room",
      }),
    );
    expect(result).toEqual({
      event: expect.objectContaining({ id: series.id }),
      dropped: [],
    });

    const list = await occurrences(user.id, "2026-10-01", "2026-10-31");
    expect(summary(list)).toEqual([
      "2026-10-05 09:00 Standup",
      "2026-10-06 14:00 Secret offsite",
      "2026-10-07 09:00 Standup",
    ]);
    expect(list[1]).toMatchObject({
      location: "Hidden room",
      originalStart: at("2026-10-06 09:00"),
      endAt: at("2026-10-06 15:00"),
      modified: true,
    });

    const [exception] = await exceptionRows(series.id);
    const [created] = await eventsFor(user.id, exception!.id);
    expect(created).toMatchObject({
      eventType: "calendar_event_exception.created",
      entityType: "calendar_event_exception",
      changes: {
        eventId: { from: null, to: series.id },
        originalStartAt: { from: null, to: "2026-10-06T13:00:00.000Z" },
        kind: { from: null, to: "modified" },
        startAt: { from: null, to: "2026-10-06T18:00:00.000Z" },
        endAt: { from: null, to: "2026-10-06T19:00:00.000Z" },
      },
    });

    // A second edit updates the same exception; the same values again are a no-op.
    const again = timedForm("2026-10-06 14:00", "2026-10-06 15:00", {
      title: "Secret offsite",
    });
    await editOccurrence(
      user.id,
      series.id,
      at("2026-10-06 09:00"),
      "this",
      again,
    );
    await editOccurrence(
      user.id,
      series.id,
      at("2026-10-06 09:00"),
      "this",
      again,
    );
    const history = await eventsFor(user.id, exception!.id);
    expect(history).toHaveLength(2);
    expect(history[1]?.changes).toEqual({
      fields: ["location"],
      scope: "this",
    });

    const logged = JSON.stringify(await eventsFor(user.id));
    expect(logged).not.toContain("Secret");
    expect(logged).not.toContain("Hidden");
  });

  it("keeps the series' shape and zone for one occurrence", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);

    await expect(
      editOccurrence(
        user.id,
        series.id,
        at("2026-10-06 09:00"),
        "this",
        allDayForm("2026-10-06", "2026-10-06", { title: "Standup" }),
      ),
    ).rejects.toMatchObject({
      fieldErrors: { allDay: [expect.stringContaining("all-day and timed")] },
    });
    await expect(
      editOccurrence(user.id, series.id, at("2026-10-06 09:00"), "this", {
        ...timedForm("2026-10-06 09:00", "2026-10-06 09:30"),
        tz: "Europe/London",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await exceptionRows(series.id)).toEqual([]);
  });

  it("refuses another user's goal on an occurrence", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const series = await dailyStandup(user.id);
    const foreignGoal = await newGoal(other.id);

    await expect(
      editOccurrence(
        user.id,
        series.id,
        at("2026-10-06 09:00"),
        "this",
        timedForm("2026-10-06 09:00", "2026-10-06 09:30", {
          goalId: foreignGoal.id,
        }),
      ),
    ).rejects.toMatchObject({
      fieldErrors: { goalId: ["Choose one of your goals."] },
    });
  });

  it("edits and cancels occurrences of an all-day series", async () => {
    const user = await createTestUser();
    const series = await createSeries(
      user.id,
      allDayForm("2026-10-05", "2026-10-06"),
      "FREQ=WEEKLY;BYDAY=MO",
    );

    await editOccurrence(
      user.id,
      series.id,
      "2026-10-12",
      "this",
      allDayForm("2026-10-13", "2026-10-15", { title: "Long holiday" }),
    );
    await deleteOccurrence(user.id, series.id, "2026-10-19", "this");

    const list = await occurrences(user.id, "2026-10-01", "2026-10-31");
    expect(summary(list)).toEqual([
      "2026-10-05 Holiday",
      "2026-10-13 Long holiday",
      "2026-10-26 Holiday",
    ]);
    expect(list[1]).toMatchObject({ endDate: "2026-10-16", modified: true });

    // Deleting a modified occurrence turns its exception into a cancellation.
    const [modified] = await exceptionRows(series.id);
    expect(
      await deleteOccurrence(user.id, series.id, "2026-10-12", "this"),
    ).toEqual({ dropped: [] });
    expect(
      (await exceptionRows(series.id)).map((row) => [
        row.originalStartDate,
        row.kind,
        row.title,
      ]),
    ).toEqual([
      ["2026-10-12", "cancelled", null],
      ["2026-10-19", "cancelled", null],
    ]);
    const [, cancelled] = await eventsFor(user.id, modified!.id);
    expect(cancelled?.changes).toEqual({
      fields: ["kind", "title", "startDate", "endDate"],
      scope: "this",
      kind: { from: "modified", to: "cancelled" },
      startDate: { from: "2026-10-13", to: null },
      endDate: { from: "2026-10-16", to: null },
    });
    expect(
      summary(await occurrences(user.id, "2026-10-01", "2026-10-31")),
    ).toEqual(["2026-10-05 Holiday", "2026-10-26 Holiday"]);
  });
});

describe("all events", () => {
  it("applies the changed fields and times to a timed series and carries its exceptions", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const series = await dailyStandup(user.id, "FREQ=DAILY;COUNT=10");
    const moved = timedForm("2026-10-07 14:00", "2026-10-07 14:30", {
      title: "Standup (moved)",
    });
    await editOccurrence(
      user.id,
      series.id,
      at("2026-10-07 09:00"),
      "this",
      moved,
    );
    await editOccurrence(
      user.id,
      series.id,
      at("2026-10-08 09:00"),
      "this",
      timedForm("2026-10-08 09:00", "2026-10-08 09:30", { goalId: goal.id }),
    );
    await deleteOccurrence(user.id, series.id, at("2026-10-09 09:00"), "this");

    const result = await editOccurrence(
      user.id,
      series.id,
      at("2026-10-10 09:00"),
      "all",
      timedForm("2026-10-10 10:00", "2026-10-10 10:45", {
        title: "Daily sync",
        rrule: "FREQ=DAILY;COUNT=10",
      }),
    );

    expect(result.dropped).toEqual([]);
    expect(result.event).toMatchObject({
      id: series.id,
      title: "Daily sync",
      startAt: at("2026-10-05 10:00"),
      endAt: at("2026-10-05 10:45"),
      rrule: "FREQ=DAILY;COUNT=10",
    });
    expect(
      (await exceptionRows(series.id)).map((row) => ({
        originalStartAt: row.originalStartAt,
        kind: row.kind,
        title: row.title,
        goalId: row.goalId,
        startAt: row.startAt,
        endAt: row.endAt,
      })),
    ).toEqual([
      {
        originalStartAt: at("2026-10-07 10:00"),
        kind: "modified",
        title: "Standup (moved)",
        goalId: null,
        startAt: at("2026-10-07 14:00"),
        endAt: at("2026-10-07 14:30"),
      },
      {
        originalStartAt: at("2026-10-08 10:00"),
        kind: "modified",
        title: "Daily sync",
        goalId: goal.id,
        startAt: at("2026-10-08 10:00"),
        endAt: at("2026-10-08 10:45"),
      },
      {
        originalStartAt: at("2026-10-09 10:00"),
        kind: "cancelled",
        title: null,
        goalId: null,
        startAt: null,
        endAt: null,
      },
    ]);

    expect(
      summary(await occurrences(user.id, "2026-10-05", "2026-10-15")),
    ).toEqual([
      "2026-10-05 10:00 Daily sync",
      "2026-10-06 10:00 Daily sync",
      "2026-10-07 14:00 Standup (moved)",
      "2026-10-08 10:00 Daily sync",
      "2026-10-10 10:00 Daily sync",
      "2026-10-11 10:00 Daily sync",
      "2026-10-12 10:00 Daily sync",
      "2026-10-13 10:00 Daily sync",
      "2026-10-14 10:00 Daily sync",
    ]);

    const seriesEvents = await eventsFor(user.id, series.id);
    expect(seriesEvents.at(-1)?.changes).toEqual({
      fields: ["title", "startAt", "endAt"],
      startAt: {
        from: "2026-10-05T13:00:00.000Z",
        to: "2026-10-05T14:00:00.000Z",
      },
      endAt: {
        from: "2026-10-05T13:30:00.000Z",
        to: "2026-10-05T14:45:00.000Z",
      },
      scope: "all",
    });
    const [, , cancelledId] = (await exceptionRows(series.id)).map(
      (row) => row.id,
    );
    expect((await eventsFor(user.id, cancelledId)).at(-1)?.changes).toEqual({
      fields: ["originalStartAt"],
      scope: "all",
      originalStartAt: {
        from: "2026-10-09T13:00:00.000Z",
        to: "2026-10-09T14:00:00.000Z",
      },
    });
  });

  it("moves an all-day series by the days its occurrence moved", async () => {
    const user = await createTestUser();
    const series = await createSeries(
      user.id,
      allDayForm("2026-10-05", "2026-10-05"),
      "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6",
    );
    await deleteOccurrence(user.id, series.id, "2026-10-07", "this");
    await editOccurrence(
      user.id,
      series.id,
      "2026-10-19",
      "this",
      allDayForm("2026-10-19", "2026-10-19", { title: "Late" }),
    );

    const result = await editOccurrence(
      user.id,
      series.id,
      "2026-10-12",
      "all",
      allDayForm("2026-10-13", "2026-10-13", {
        rrule: "FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6",
      }),
    );

    expect(result).toMatchObject({
      event: { startDate: "2026-10-06", endDate: "2026-10-07" },
      dropped: [],
    });
    expect(
      summary(await occurrences(user.id, "2026-10-01", "2026-10-31")),
    ).toEqual([
      "2026-10-06 Holiday",
      "2026-10-13 Holiday",
      "2026-10-15 Holiday",
      "2026-10-20 Late",
      "2026-10-22 Holiday",
    ]);
    expect(
      (await exceptionRows(series.id)).map((row) => [
        row.originalStartDate,
        row.kind,
        row.startDate,
      ]),
    ).toEqual([
      ["2026-10-08", "cancelled", null],
      ["2026-10-20", "modified", "2026-10-20"],
    ]);
  });

  it("stops repeating: the first occurrence's changes become the event's", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id, "FREQ=DAILY;COUNT=5");
    await editOccurrence(
      user.id,
      series.id,
      at("2026-10-05 09:00"),
      "this",
      timedForm("2026-10-05 09:00", "2026-10-05 09:30", { title: "Kickoff" }),
    );
    await editOccurrence(
      user.id,
      series.id,
      at("2026-10-07 09:00"),
      "this",
      timedForm("2026-10-07 09:00", "2026-10-07 09:30", { title: "Other" }),
    );
    await deleteOccurrence(user.id, series.id, at("2026-10-08 09:00"), "this");
    const [kickoff, other, cancelled] = await exceptionRows(series.id);

    const result = await editOccurrence(
      user.id,
      series.id,
      at("2026-10-06 09:00"),
      "all",
      timedForm("2026-10-06 09:00", "2026-10-06 09:30"),
    );

    expect(result.event).toMatchObject({
      rrule: null,
      title: "Kickoff",
      startAt: at("2026-10-05 09:00"),
    });
    expect(result.dropped).toEqual([
      {
        id: other!.id,
        kind: "modified",
        originalStart: at("2026-10-07 09:00"),
      },
      {
        id: cancelled!.id,
        kind: "cancelled",
        originalStart: at("2026-10-08 09:00"),
      },
    ]);
    expect(await exceptionRows(series.id)).toEqual([]);
    for (const row of [kickoff, other, cancelled]) {
      expect(await eventsFor(user.id, row!.id)).toEqual([]);
    }
    expect(
      await occurrences(user.id, "2026-10-01", "2026-10-31"),
    ).toMatchObject([{ id: series.id, title: "Kickoff", seriesId: null }]);
    expect((await eventsFor(user.id, series.id)).at(-1)?.changes).toEqual({
      fields: ["title", "rrule"],
      rrule: { from: "FREQ=DAILY;COUNT=5", to: null },
      scope: "all",
      droppedExceptions: 2,
    });
  });

  it("deletes the whole series with its exceptions and their audit events", async () => {
    const user = await createTestUser();
    const series = await createSeries(
      user.id,
      allDayForm("2026-10-05", "2026-10-05"),
      "FREQ=DAILY",
    );
    await deleteOccurrence(user.id, series.id, "2026-10-06", "this");
    await editOccurrence(
      user.id,
      series.id,
      "2026-10-07",
      "this",
      allDayForm("2026-10-07", "2026-10-07", { title: "Off" }),
    );
    const [cancelled, modified] = await exceptionRows(series.id);

    const result = await deleteOccurrence(
      user.id,
      series.id,
      "2026-10-09",
      "all",
    );

    expect(result.dropped.map(({ id }) => id)).toEqual([
      cancelled!.id,
      modified!.id,
    ]);
    expect(await seriesRow(series.id)).toBeUndefined();
    expect(await exceptionRows(series.id)).toEqual([]);
    expect(await eventsFor(user.id)).toEqual([]);
  });

  it("deleteCalendarEvent also removes a series' exceptions and their audit events", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);
    await deleteOccurrence(user.id, series.id, at("2026-10-06 09:00"), "this");

    await deleteCalendarEvent(user.id, { id: series.id });
    expect(await exceptionRows(series.id)).toEqual([]);
    expect(await eventsFor(user.id)).toEqual([]);
  });
});

describe("this and following events", () => {
  it("splits a timed series: earlier exceptions stay, later ones move", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const series = await dailyStandup(user.id);
    await editOccurrence(
      user.id,
      series.id,
      at("2026-10-06 09:00"),
      "this",
      timedForm("2026-10-06 09:00", "2026-10-06 09:30", { title: "Early" }),
    );
    await editOccurrence(
      user.id,
      series.id,
      at("2026-10-09 09:00"),
      "this",
      timedForm("2026-10-09 09:00", "2026-10-09 09:30", {
        title: "Late",
        goalId: goal.id,
      }),
    );
    await deleteOccurrence(user.id, series.id, at("2026-10-10 09:00"), "this");
    const [early, late, cancelled] = await exceptionRows(series.id);

    const result = await editOccurrence(
      user.id,
      series.id,
      at("2026-10-08 09:00"),
      "following",
      timedForm("2026-10-08 09:00", "2026-10-08 09:30", {
        title: "New standup",
        rrule: "FREQ=DAILY",
      }),
    );

    const split = result.event;
    expect(split.id).not.toBe(series.id);
    expect(split).toMatchObject({
      title: "New standup",
      startAt: at("2026-10-08 09:00"),
      endAt: at("2026-10-08 09:30"),
      rrule: "FREQ=DAILY",
    });
    expect(result.dropped).toEqual([]);
    expect((await seriesRow(series.id))?.rrule).toBe(
      "FREQ=DAILY;UNTIL=20261007",
    );
    expect((await exceptionRows(series.id)).map((row) => row.id)).toEqual([
      early!.id,
    ]);
    expect(
      (await exceptionRows(split.id)).map((row) => [row.id, row.title]),
    ).toEqual([
      [late!.id, "Late"],
      [cancelled!.id, null],
    ]);

    expect(
      summary(await occurrences(user.id, "2026-10-05", "2026-10-12")),
    ).toEqual([
      "2026-10-05 09:00 Standup",
      "2026-10-06 09:00 Early",
      "2026-10-07 09:00 Standup",
      "2026-10-08 09:00 New standup",
      "2026-10-09 09:00 Late",
      "2026-10-11 09:00 New standup",
    ]);

    expect((await eventsFor(user.id, series.id)).at(-1)?.changes).toEqual({
      fields: ["rrule"],
      rrule: { from: "FREQ=DAILY", to: "FREQ=DAILY;UNTIL=20261007" },
      scope: "following",
      splitIntoId: split.id,
    });
    expect((await eventsFor(user.id, split.id))[0]).toMatchObject({
      eventType: "calendar_event.created",
      changes: {
        rrule: { from: null, to: "FREQ=DAILY" },
        scope: "following",
        splitFromId: series.id,
      },
    });
    expect((await eventsFor(user.id, late!.id)).at(-1)?.changes).toEqual({
      fields: ["eventId"],
      scope: "following",
      eventId: { from: series.id, to: split.id },
    });
  });

  it("splits on a DST change day and re-keys the carried exceptions", async () => {
    const user = await createTestUser();
    const series = await createSeries(
      user.id,
      timedForm("2026-10-29 09:00", "2026-10-29 10:00"),
      "FREQ=DAILY",
    );
    await editOccurrence(
      user.id,
      series.id,
      at("2026-11-03 09:00"),
      "this",
      timedForm("2026-11-03 09:00", "2026-11-03 10:00", {
        location: "Room 2",
      }),
    );
    await deleteOccurrence(user.id, series.id, at("2026-11-04 09:00"), "this");

    // 1 November 2026: New York falls back at 02:00, so 09:00 is 14:00 UTC.
    const result = await editOccurrence(
      user.id,
      series.id,
      new Date("2026-11-01T14:00:00Z"),
      "following",
      timedForm("2026-11-01 10:00", "2026-11-01 11:00", {
        rrule: "FREQ=DAILY",
      }),
    );

    expect(result.event).toMatchObject({
      startAt: new Date("2026-11-01T15:00:00Z"),
      endAt: new Date("2026-11-01T16:00:00Z"),
    });
    expect((await seriesRow(series.id))?.rrule).toBe(
      "FREQ=DAILY;UNTIL=20261031",
    );
    expect(
      (await exceptionRows(result.event.id)).map((row) => [
        row.originalStartAt,
        row.kind,
        row.startAt,
        row.location,
      ]),
    ).toEqual([
      [
        new Date("2026-11-03T15:00:00Z"),
        "modified",
        new Date("2026-11-03T15:00:00Z"),
        "Room 2",
      ],
      [new Date("2026-11-04T15:00:00Z"), "cancelled", null, null],
    ]);

    const list = await occurrences(user.id, "2026-10-30", "2026-11-06");
    expect(summary(list)).toEqual([
      "2026-10-30 09:00 Standup",
      "2026-10-31 09:00 Standup",
      "2026-11-01 10:00 Standup",
      "2026-11-02 10:00 Standup",
      "2026-11-03 10:00 Standup",
      "2026-11-05 10:00 Standup",
    ]);
    expect(list.map((occurrence) => occurrence.startAt)).toEqual([
      new Date("2026-10-30T13:00:00Z"),
      new Date("2026-10-31T13:00:00Z"),
      new Date("2026-11-01T15:00:00Z"),
      new Date("2026-11-02T15:00:00Z"),
      new Date("2026-11-03T15:00:00Z"),
      new Date("2026-11-05T15:00:00Z"),
    ]);
  });

  it("keeps the remaining count when a counted series splits", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id, "FREQ=DAILY;COUNT=10");

    const { event } = await editOccurrence(
      user.id,
      series.id,
      at("2026-10-08 09:00"),
      "following",
      timedForm("2026-10-08 09:00", "2026-10-08 09:30", {
        title: "Later standup",
        rrule: "FREQ=DAILY;COUNT=10",
      }),
    );

    expect(event.rrule).toBe("FREQ=DAILY;COUNT=7");
    expect(await occurrences(user.id, "2026-10-01", "2026-10-31")).toHaveLength(
      10,
    );
  });

  it("drops exceptions the new all-day rule doesn't generate, and keeps moved ones", async () => {
    const user = await createTestUser();
    const series = await createSeries(
      user.id,
      allDayForm("2026-10-05", "2026-10-05"),
      "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    );
    await deleteOccurrence(user.id, series.id, "2026-10-09", "this");
    await editOccurrence(
      user.id,
      series.id,
      "2026-10-16",
      "this",
      allDayForm("2026-10-16", "2026-10-16", { title: "Half day" }),
    );
    await editOccurrence(
      user.id,
      series.id,
      "2026-10-19",
      "this",
      allDayForm("2026-10-20", "2026-10-20", { title: "Moved" }),
    );
    const [beforeSplit, halfDay, moved] = await exceptionRows(series.id);

    const result = await editOccurrence(
      user.id,
      series.id,
      "2026-10-14",
      "following",
      allDayForm("2026-10-14", "2026-10-14", {
        rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
      }),
    );

    expect(result.dropped).toEqual([
      { id: halfDay!.id, kind: "modified", originalStart: "2026-10-16" },
    ]);
    expect((await exceptionRows(series.id)).map((row) => row.id)).toEqual([
      beforeSplit!.id,
    ]);
    expect(
      (await exceptionRows(result.event.id)).map((row) => [
        row.id,
        row.originalStartDate,
        row.startDate,
      ]),
    ).toEqual([[moved!.id, "2026-10-19", "2026-10-20"]]);
    expect(await eventsFor(user.id, halfDay!.id)).toEqual([]);
    expect((await eventsFor(user.id, series.id)).at(-1)?.changes).toMatchObject(
      {
        scope: "following",
        droppedExceptions: 1,
      },
    );
    expect(
      summary(await occurrences(user.id, "2026-10-05", "2026-10-24")),
    ).toEqual([
      "2026-10-05 Holiday",
      "2026-10-07 Holiday",
      "2026-10-12 Holiday",
      "2026-10-14 Holiday",
      "2026-10-20 Moved",
      "2026-10-21 Holiday",
    ]);
  });

  it("changes the whole series when it starts at the first occurrence", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);

    const { event } = await editOccurrence(
      user.id,
      series.id,
      at("2026-10-05 09:00"),
      "following",
      timedForm("2026-10-05 09:00", "2026-10-05 09:30", {
        title: "Renamed",
        rrule: "FREQ=DAILY",
      }),
    );

    expect(event).toMatchObject({ id: series.id, title: "Renamed" });
    expect(await db.select().from(calendarEvents)).toHaveLength(1);
  });

  it("deletes from the first occurrence: the whole series goes", async () => {
    const user = await createTestUser();
    const series = await createSeries(
      user.id,
      allDayForm("2026-10-05", "2026-10-05"),
      "FREQ=DAILY",
    );
    await deleteOccurrence(user.id, series.id, "2026-10-07", "this");

    const result = await deleteOccurrence(
      user.id,
      series.id,
      "2026-10-05",
      "following",
    );

    expect(result.dropped).toHaveLength(1);
    await expect(
      getCalendarEvent(user.id, { id: series.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await eventsFor(user.id)).toEqual([]);
  });

  it("deletes from a later occurrence: the series ends the day before", async () => {
    const user = await createTestUser();
    const series = await dailyStandup(user.id);
    await editOccurrence(
      user.id,
      series.id,
      at("2026-10-06 09:00"),
      "this",
      timedForm("2026-10-06 09:00", "2026-10-06 09:30", { title: "Early" }),
    );
    await deleteOccurrence(user.id, series.id, at("2026-10-09 09:00"), "this");
    const [early, later] = await exceptionRows(series.id);

    const result = await deleteOccurrence(
      user.id,
      series.id,
      at("2026-10-08 09:00"),
      "following",
    );

    expect(result.dropped).toEqual([
      {
        id: later!.id,
        kind: "cancelled",
        originalStart: at("2026-10-09 09:00"),
      },
    ]);
    expect((await seriesRow(series.id))?.rrule).toBe(
      "FREQ=DAILY;UNTIL=20261007",
    );
    expect((await exceptionRows(series.id)).map((row) => row.id)).toEqual([
      early!.id,
    ]);
    expect((await eventsFor(user.id, series.id)).at(-1)?.changes).toEqual({
      fields: ["rrule"],
      rrule: { from: "FREQ=DAILY", to: "FREQ=DAILY;UNTIL=20261007" },
      scope: "following",
      droppedExceptions: 1,
    });
    expect(
      summary(await occurrences(user.id, "2026-10-01", "2026-10-31")),
    ).toEqual([
      "2026-10-05 09:00 Standup",
      "2026-10-06 09:00 Early",
      "2026-10-07 09:00 Standup",
    ]);
  });
});

describe("another user's series", () => {
  it("is not found through any scope, and nothing changes", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const series = await dailyStandup(owner.id);
    await editOccurrence(
      owner.id,
      series.id,
      at("2026-10-06 09:00"),
      "this",
      timedForm("2026-10-06 09:00", "2026-10-06 09:30", { title: "Private" }),
    );
    const before = {
      series: await seriesRow(series.id),
      exceptions: await exceptionRows(series.id),
      events: await eventsFor(owner.id),
    };

    for (const scope of ["this", "following", "all"] as const) {
      // The occurrence with the owner's exception, and a plain one.
      for (const day of ["2026-10-06", "2026-10-07"]) {
        const originalStart = at(`${day} 09:00`);
        await expect(
          editOccurrence(
            intruder.id,
            series.id,
            originalStart,
            scope,
            timedForm(`${day} 10:00`, `${day} 10:30`, {
              title: "Hijacked",
              ...(scope !== "this" && { rrule: "FREQ=DAILY" }),
            }),
          ),
        ).rejects.toBeInstanceOf(NotFoundError);
        await expect(
          deleteOccurrence(intruder.id, series.id, originalStart, scope),
        ).rejects.toBeInstanceOf(NotFoundError);
      }
    }

    expect(await occurrences(intruder.id, "2026-10-01", "2026-10-31")).toEqual(
      [],
    );
    expect(await seriesRow(series.id)).toEqual(before.series);
    expect(await exceptionRows(series.id)).toEqual(before.exceptions);
    expect(await eventsFor(owner.id)).toEqual(before.events);
    expect(await eventsFor(intruder.id)).toEqual([]);
  });
});
