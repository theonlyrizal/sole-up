import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { auditEvents, calendarEvents, users } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { createGoal, deleteGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import {
  createLifeArea,
  deleteLifeArea,
} from "@/server/modules/life-areas/service";
import { createLifeAreaSchema } from "@/server/modules/life-areas/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  eventsBetween,
  getCalendarEvent,
  updateCalendarEvent,
} from "./service";
import {
  createCalendarEventSchema,
  eventsBetweenSchema,
  updateCalendarEventSchema,
} from "./validation";

const NEW_YORK = "America/New_York";
const TOKYO = "Asia/Tokyo";

type EventInsert = typeof calendarEvents.$inferInsert;
type DriverError = { cause?: { code?: string; constraint?: string } };

async function insertError(values: EventInsert): Promise<DriverError | null> {
  try {
    await db.insert(calendarEvents).values(values);
    return null;
  } catch (error: unknown) {
    return error as DriverError;
  }
}

async function expectCheck(values: EventInsert, constraint: string) {
  expect(await insertError(values)).toMatchObject({
    cause: { code: "23514", constraint },
  });
}

/** A timed event from local date-times in `tz`, e.g. "2026-10-24 09:00". */
const timedEvent = (
  userId: string,
  start: string,
  end: string,
  fields: Record<string, unknown> = {},
  tz = NEW_YORK,
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
      tz,
      ...fields,
    }),
  );
};

/** An all-day event; `lastDay` is inclusive, as the form sends it. */
const allDayEvent = (
  userId: string,
  startDate: string,
  lastDay: string,
  fields: Record<string, unknown> = {},
) =>
  createCalendarEvent(
    userId,
    createCalendarEventSchema.parse({
      title: "Trip",
      allDay: true,
      startDate,
      endDate: lastDay,
      ...fields,
    }),
  );

/** IDs of the events overlapping local days [localStart, localEnd) in `tz`. */
async function idsBetween(
  userId: string,
  localStart: string,
  localEnd: string,
  tz = NEW_YORK,
) {
  const events = await eventsBetween(
    userId,
    eventsBetweenSchema.parse({ localStart, localEnd, tz }),
  );
  return events.map((event) => event.id);
}

const newGoal = (userId: string) =>
  createGoal(userId, createGoalSchema.parse({ title: "Run a 10k" }));

const newArea = (userId: string) =>
  createLifeArea(userId, createLifeAreaSchema.parse({ name: "Health" }));

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

async function rowOf(id: string) {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id));
  return row;
}

describe("calendar_events schema", () => {
  const timedRow = (userId: string): EventInsert => ({
    userId,
    title: "Call",
    allDay: false,
    startAt: new Date("2026-10-24T13:00:00Z"),
    endAt: new Date("2026-10-24T14:00:00Z"),
    tz: NEW_YORK,
  });
  const allDayRow = (userId: string): EventInsert => ({
    userId,
    title: "Trip",
    allDay: true,
    startDate: "2026-10-24",
    endDate: "2026-10-25",
  });

  it("accepts both shapes and defaults the source to internal", async () => {
    const user = await createTestUser();
    await db
      .insert(calendarEvents)
      .values([timedRow(user.id), allDayRow(user.id)]);

    const rows = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.userId, user.id));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ source: "internal", externalId: null });
    }
  });

  it("enforces exactly one shape", async () => {
    const user = await createTestUser();
    const check = "calendar_events_shape_check";

    await expectCheck({ ...timedRow(user.id), tz: null }, check);
    await expectCheck({ ...timedRow(user.id), endAt: null }, check);
    await expectCheck(
      { ...timedRow(user.id), startDate: "2026-10-24", endDate: "2026-10-25" },
      check,
    );
    await expectCheck({ ...allDayRow(user.id), endDate: null }, check);
    await expectCheck({ ...allDayRow(user.id), tz: NEW_YORK }, check);
    await expectCheck(
      {
        ...allDayRow(user.id),
        startAt: new Date("2026-10-24T00:00:00Z"),
        endAt: new Date("2026-10-25T00:00:00Z"),
      },
      check,
    );
  });

  it("needs the end after the start in both shapes", async () => {
    const user = await createTestUser();
    const check = "calendar_events_end_check";
    const timed = timedRow(user.id);

    await expectCheck({ ...timed, endAt: timed.startAt }, check);
    await expectCheck(
      { ...timed, endAt: new Date("2026-10-24T12:59:59Z") },
      check,
    );
    // All-day ends are exclusive: the same day is zero days long.
    await expectCheck({ ...allDayRow(user.id), endDate: "2026-10-24" }, check);
    await expectCheck({ ...allDayRow(user.id), endDate: "2026-10-23" }, check);
  });

  it("checks source and text lengths", async () => {
    const user = await createTestUser();
    const row = timedRow(user.id);

    await expectCheck(
      { ...row, source: "google" as "internal" },
      "calendar_events_source_check",
    );
    await expectCheck(
      { ...row, title: "" },
      "calendar_events_title_length_check",
    );
    await expectCheck(
      { ...row, title: "x".repeat(201) },
      "calendar_events_title_length_check",
    );
    await expectCheck(
      { ...row, description: "" },
      "calendar_events_description_length_check",
    );
    await expectCheck(
      { ...row, location: "x".repeat(201) },
      "calendar_events_location_length_check",
    );
  });

  it("deleting a goal or life area clears only that link and keeps user_id", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const area = await newArea(user.id);
    const event = await timedEvent(
      user.id,
      "2026-10-24 09:00",
      "2026-10-24 10:00",
      { goalId: goal.id, lifeAreaId: area.id },
    );

    await deleteGoal(user.id, { id: goal.id });
    expect(await rowOf(event.id)).toMatchObject({
      userId: user.id,
      goalId: null,
      lifeAreaId: area.id,
    });

    await deleteLifeArea(user.id, { id: area.id });
    expect(await rowOf(event.id)).toMatchObject({
      userId: user.id,
      goalId: null,
      lifeAreaId: null,
    });
  });

  it("is deleted with its user", async () => {
    const user = await createTestUser();
    const event = await allDayEvent(user.id, "2026-10-24", "2026-10-24");

    await db.delete(users).where(eq(users.id, user.id));

    expect(await rowOf(event.id)).toBeUndefined();
  });
});

describe("calendar event service", () => {
  it("creates a timed event in UTC with its zone, and records structured fields only", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const area = await newArea(user.id);

    const event = await timedEvent(
      user.id,
      "2026-10-24 09:00",
      "2026-10-24 10:30",
      {
        title: "Secret appointment",
        description: "Private details",
        location: "Hidden place",
        goalId: goal.id,
        lifeAreaId: area.id,
      },
    );

    expect(event).toMatchObject({
      allDay: false,
      startAt: new Date("2026-10-24T13:00:00Z"),
      endAt: new Date("2026-10-24T14:30:00Z"),
      tz: NEW_YORK,
      startDate: null,
      endDate: null,
      title: "Secret appointment",
      location: "Hidden place",
      goalId: goal.id,
      lifeAreaId: area.id,
      source: "internal",
    });

    const [created] = await eventsFor(user.id, event.id);
    expect(created).toMatchObject({
      eventType: "calendar_event.created",
      entityType: "calendar_event",
      changes: {
        allDay: { from: null, to: false },
        startAt: { from: null, to: "2026-10-24T13:00:00.000Z" },
        endAt: { from: null, to: "2026-10-24T14:30:00.000Z" },
        tz: { from: null, to: NEW_YORK },
        startDate: { from: null, to: null },
        endDate: { from: null, to: null },
        goalId: { from: null, to: goal.id },
        lifeAreaId: { from: null, to: area.id },
        source: { from: null, to: "internal" },
      },
    });
    const logged = JSON.stringify(await eventsFor(user.id));
    expect(logged).not.toContain("Secret");
    expect(logged).not.toContain("Private");
    expect(logged).not.toContain("Hidden");
  });

  it("stores an all-day event's inclusive form end as an exclusive date", async () => {
    const user = await createTestUser();

    const event = await allDayEvent(user.id, "2026-10-24", "2026-10-26");

    expect(event).toMatchObject({
      allDay: true,
      startDate: "2026-10-24",
      endDate: "2026-10-27",
      startAt: null,
      endAt: null,
      tz: null,
    });
    expect(await getCalendarEvent(user.id, { id: event.id })).toEqual(event);
  });

  it("refuses another user's goal or life area with a field error", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const goal = await newGoal(other.id);
    const area = await newArea(other.id);

    await expect(
      allDayEvent(user.id, "2026-10-24", "2026-10-24", { goalId: goal.id }),
    ).rejects.toMatchObject({
      fieldErrors: { goalId: ["Choose one of your goals."] },
    });
    await expect(
      allDayEvent(user.id, "2026-10-24", "2026-10-24", {
        lifeAreaId: area.id,
      }),
    ).rejects.toMatchObject({
      fieldErrors: { lifeAreaId: ["Choose one of your areas."] },
    });

    const event = await allDayEvent(user.id, "2026-10-24", "2026-10-24");
    await expect(
      updateCalendarEvent(
        user.id,
        updateCalendarEventSchema.parse({
          id: event.id,
          title: "Trip",
          allDay: true,
          startDate: "2026-10-24",
          endDate: "2026-10-24",
          goalId: goal.id,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await rowOf(event.id)).toMatchObject({ goalId: null });
    expect(await eventsFor(other.id)).toHaveLength(2); // goal + area created
  });

  it("records changed field names without text, and skips a no-op edit", async () => {
    const user = await createTestUser();
    const event = await timedEvent(
      user.id,
      "2026-10-24 09:00",
      "2026-10-24 10:00",
    );
    const same = {
      id: event.id,
      title: "Dentist",
      allDay: false,
      startDate: "2026-10-24",
      startTime: "09:00",
      endDate: "2026-10-24",
      endTime: "10:00",
      tz: NEW_YORK,
    };

    await updateCalendarEvent(user.id, updateCalendarEventSchema.parse(same));
    expect(await eventsFor(user.id, event.id)).toHaveLength(1);

    const updated = await updateCalendarEvent(
      user.id,
      updateCalendarEventSchema.parse({
        ...same,
        title: "Dentist (moved)",
        location: "Clinic B",
        endTime: "11:00",
      }),
    );
    expect(updated).toMatchObject({
      title: "Dentist (moved)",
      location: "Clinic B",
      endAt: new Date("2026-10-24T15:00:00Z"),
    });

    const [, edit] = await eventsFor(user.id, event.id);
    expect(edit).toMatchObject({
      eventType: "calendar_event.updated",
      changes: {
        fields: ["title", "location", "endAt"],
        endAt: {
          from: "2026-10-24T14:00:00.000Z",
          to: "2026-10-24T15:00:00.000Z",
        },
      },
    });
    expect(Object.keys(edit!.changes as object).sort()).toEqual([
      "endAt",
      "fields",
    ]);
    expect(JSON.stringify(edit)).not.toContain("Clinic");
    expect(JSON.stringify(edit)).not.toContain("moved");
  });

  it("switches a timed event to all-day in one event with every timing field", async () => {
    const user = await createTestUser();
    const area = await newArea(user.id);
    const event = await timedEvent(
      user.id,
      "2026-10-24 09:00",
      "2026-10-24 10:00",
    );

    const updated = await updateCalendarEvent(
      user.id,
      updateCalendarEventSchema.parse({
        id: event.id,
        title: "Dentist",
        allDay: true,
        startDate: "2026-10-24",
        endDate: "2026-10-24",
        lifeAreaId: area.id,
      }),
    );

    expect(updated).toMatchObject({
      allDay: true,
      startAt: null,
      endAt: null,
      tz: null,
      startDate: "2026-10-24",
      endDate: "2026-10-25",
      lifeAreaId: area.id,
    });
    const [, edit] = await eventsFor(user.id, event.id);
    expect(edit!.changes).toEqual({
      fields: [
        "allDay",
        "startAt",
        "endAt",
        "tz",
        "startDate",
        "endDate",
        "lifeAreaId",
      ],
      allDay: { from: false, to: true },
      startAt: { from: "2026-10-24T13:00:00.000Z", to: null },
      endAt: { from: "2026-10-24T14:00:00.000Z", to: null },
      tz: { from: NEW_YORK, to: null },
      startDate: { from: null, to: "2026-10-24" },
      endDate: { from: null, to: "2026-10-25" },
      lifeAreaId: { from: null, to: area.id },
    });
  });

  it("hard-deletes an event with its audit events only", async () => {
    const user = await createTestUser();
    const kept = await allDayEvent(user.id, "2026-10-24", "2026-10-24");
    const gone = await allDayEvent(user.id, "2026-10-25", "2026-10-25");
    await updateCalendarEvent(
      user.id,
      updateCalendarEventSchema.parse({
        id: gone.id,
        title: "Trip",
        allDay: true,
        startDate: "2026-10-25",
        endDate: "2026-10-26",
      }),
    );

    await deleteCalendarEvent(user.id, { id: gone.id });

    expect(await rowOf(gone.id)).toBeUndefined();
    expect(await eventsFor(user.id, gone.id)).toEqual([]);
    expect(await eventsFor(user.id, kept.id)).toHaveLength(1);
    await expect(
      deleteCalendarEvent(user.id, { id: gone.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("treats another user's event as not found and changes nothing", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const event = await timedEvent(
      owner.id,
      "2026-10-24 09:00",
      "2026-10-24 10:00",
    );
    const before = await rowOf(event.id);

    await expect(
      getCalendarEvent(intruder.id, { id: event.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateCalendarEvent(
        intruder.id,
        updateCalendarEventSchema.parse({
          id: event.id,
          title: "Taken",
          allDay: true,
          startDate: "2026-10-24",
          endDate: "2026-10-24",
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      deleteCalendarEvent(intruder.id, { id: event.id }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await rowOf(event.id)).toEqual(before);
    expect(await eventsFor(owner.id, event.id)).toHaveLength(1);
    expect(await eventsFor(intruder.id)).toEqual([]);
    expect(await idsBetween(intruder.id, "2026-10-01", "2026-11-01")).toEqual(
      [],
    );
  });
});

describe("eventsBetween", () => {
  it("excludes events that only touch the range's edges", async () => {
    const user = await createTestUser();
    // The range is New York's 24 Oct: 04:00Z to 04:00Z the next day.
    const endsAtStart = await timedEvent(
      user.id,
      "2026-10-23 23:00",
      "2026-10-24 00:00",
    );
    const startsAtEnd = await timedEvent(
      user.id,
      "2026-10-25 00:00",
      "2026-10-25 01:00",
    );
    const startsAtStart = await timedEvent(
      user.id,
      "2026-10-24 00:00",
      "2026-10-24 00:30",
    );
    const endsJustAfterStart = await timedEvent(
      user.id,
      "2026-10-23 23:00",
      "2026-10-24 00:01",
    );
    const endsAtEnd = await timedEvent(
      user.id,
      "2026-10-24 23:00",
      "2026-10-25 00:00",
    );
    const spansRange = await timedEvent(
      user.id,
      "2026-10-23 12:00",
      "2026-10-25 12:00",
    );

    const ids = await idsBetween(user.id, "2026-10-24", "2026-10-25");

    expect(ids).toEqual([
      spansRange.id,
      endsJustAfterStart.id,
      startsAtStart.id,
      endsAtEnd.id,
    ]);
    expect(ids).not.toContain(endsAtStart.id);
    expect(ids).not.toContain(startsAtEnd.id);
  });

  it("shows an event crossing midnight on both days, and on its local day elsewhere", async () => {
    const user = await createTestUser();
    // 22:00–01:00 in New York is 02:00Z–05:00Z, i.e. 11:00–14:00 in Tokyo.
    const lateShow = await timedEvent(
      user.id,
      "2026-10-23 22:00",
      "2026-10-24 01:00",
    );

    expect(await idsBetween(user.id, "2026-10-23", "2026-10-24")).toEqual([
      lateShow.id,
    ]);
    expect(await idsBetween(user.id, "2026-10-24", "2026-10-25")).toEqual([
      lateShow.id,
    ]);
    expect(await idsBetween(user.id, "2026-10-22", "2026-10-23")).toEqual([]);
    expect(await idsBetween(user.id, "2026-10-25", "2026-10-26")).toEqual([]);

    expect(
      await idsBetween(user.id, "2026-10-24", "2026-10-25", TOKYO),
    ).toEqual([lateShow.id]);
    expect(
      await idsBetween(user.id, "2026-10-23", "2026-10-24", TOKYO),
    ).toEqual([]);
  });

  it("uses the 23-hour day when New York springs forward", async () => {
    const user = await createTestUser();
    // 14 Mar 2027 runs 05:00Z to 04:00Z: 00:00 EST to 00:00 EDT.
    const acrossChange = await timedEvent(
      user.id,
      "2027-03-14 01:00",
      "2027-03-14 04:00",
    );
    const lastHalfHour = await timedEvent(
      user.id,
      "2027-03-14 23:30",
      "2027-03-15 00:00",
    );
    // 04:15Z: inside a naive 24-hour day, but already 15 Mar in New York.
    const nextDay = await timedEvent(
      user.id,
      "2027-03-15 00:15",
      "2027-03-15 00:45",
    );

    expect(acrossChange).toMatchObject({
      startAt: new Date("2027-03-14T06:00:00Z"),
      endAt: new Date("2027-03-14T08:00:00Z"),
    });
    expect(await idsBetween(user.id, "2027-03-14", "2027-03-15")).toEqual([
      acrossChange.id,
      lastHalfHour.id,
    ]);
    expect(await idsBetween(user.id, "2027-03-15", "2027-03-16")).toEqual([
      nextDay.id,
    ]);
  });

  it("uses the 25-hour day when New York falls back", async () => {
    const user = await createTestUser();
    // 1 Nov 2026 runs 04:00Z to 05:00Z the next day: 00:00 EDT to 00:00 EST.
    const repeatedHour = await timedEvent(
      user.id,
      "2026-11-01 01:00",
      "2026-11-01 03:00",
    );
    // 04:15Z on 2 Nov: past a naive 24-hour day, still 1 Nov in New York.
    const lateEvening = await timedEvent(
      user.id,
      "2026-11-01 23:15",
      "2026-11-01 23:45",
    );

    // 01:00 is the first (EDT) one; 03:00 EST is three real hours later.
    expect(repeatedHour).toMatchObject({
      startAt: new Date("2026-11-01T05:00:00Z"),
      endAt: new Date("2026-11-01T08:00:00Z"),
    });
    expect(lateEvening.startAt).toEqual(new Date("2026-11-02T04:15:00Z"));
    expect(await idsBetween(user.id, "2026-11-01", "2026-11-02")).toEqual([
      repeatedHour.id,
      lateEvening.id,
    ]);
    expect(await idsBetween(user.id, "2026-11-02", "2026-11-03")).toEqual([]);
    expect(await idsBetween(user.id, "2026-10-31", "2026-11-01")).toEqual([]);
  });

  it("matches all-day events by local date with an exclusive end, in any zone", async () => {
    const user = await createTestUser();
    // 24–26 Oct inclusive, stored as 24 Oct to 27 Oct.
    const trip = await allDayEvent(user.id, "2026-10-24", "2026-10-26");

    expect(await idsBetween(user.id, "2026-10-26", "2026-10-27")).toEqual([
      trip.id,
    ]);
    expect(await idsBetween(user.id, "2026-10-27", "2026-10-28")).toEqual([]);
    expect(await idsBetween(user.id, "2026-10-23", "2026-10-24")).toEqual([]);
    expect(await idsBetween(user.id, "2026-10-20", "2026-10-25")).toEqual([
      trip.id,
    ]);
    for (const zone of [TOKYO, "Pacific/Honolulu", "Pacific/Kiritimati"]) {
      expect(
        await idsBetween(user.id, "2026-10-26", "2026-10-27", zone),
      ).toEqual([trip.id]);
      expect(
        await idsBetween(user.id, "2026-10-27", "2026-10-28", zone),
      ).toEqual([]);
    }
  });

  it("orders by start, all-day before a timed event at the same midnight", async () => {
    const user = await createTestUser();
    const morning = await timedEvent(
      user.id,
      "2026-10-24 09:00",
      "2026-10-24 10:00",
    );
    const midnight = await timedEvent(
      user.id,
      "2026-10-24 00:00",
      "2026-10-24 01:00",
    );
    const day = await allDayEvent(user.id, "2026-10-24", "2026-10-24");
    const earlier = await allDayEvent(user.id, "2026-10-23", "2026-10-24");

    expect(await idsBetween(user.id, "2026-10-24", "2026-10-25")).toEqual([
      earlier.id,
      day.id,
      midnight.id,
      morning.id,
    ]);
  });

  it("returns only the user's own events", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const mine = await allDayEvent(user.id, "2026-10-24", "2026-10-24");
    await allDayEvent(other.id, "2026-10-24", "2026-10-24");
    await timedEvent(other.id, "2026-10-24 09:00", "2026-10-24 10:00");

    expect(await idsBetween(user.id, "2026-10-24", "2026-10-25")).toEqual([
      mine.id,
    ]);
  });
});
