import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  calendarEventIdSchema,
  createCalendarEventSchema,
  deleteCalendarEventOccurrenceSchema,
  editCalendarEventOccurrenceSchema,
  eventsBetweenSchema,
  updateCalendarEventSchema,
} from "./validation";

const ID = "4f9c7f3e-2a51-4c55-9a1f-0c6a1e1f3b2d";

function fieldErrors(result: { success: boolean; error?: z.ZodError }) {
  expect(result.success).toBe(false);
  return z.flattenError(result.error!).fieldErrors as Record<string, string[]>;
}

const timed = {
  title: "Dentist",
  allDay: false,
  startDate: "2026-10-24",
  startTime: "09:00",
  endDate: "2026-10-24",
  endTime: "10:00",
  tz: "America/New_York",
};

const allDay = {
  title: "Trip",
  allDay: true,
  startDate: "2026-10-24",
  endDate: "2026-10-26",
};

describe("createCalendarEventSchema", () => {
  it("trims text, blanks optional fields to null and groups the times", () => {
    expect(
      createCalendarEventSchema.parse({
        ...timed,
        title: "  Dentist  ",
        description: "   ",
        location: " Main St ",
      }),
    ).toEqual({
      title: "Dentist",
      description: null,
      location: "Main St",
      goalId: null,
      lifeAreaId: null,
      rrule: null,
      when: {
        allDay: false,
        startDate: "2026-10-24",
        startTime: "09:00",
        endDate: "2026-10-24",
        endTime: "10:00",
        tz: "America/New_York",
      },
    });
  });

  it("ignores times and zone on an all-day event", () => {
    expect(
      createCalendarEventSchema.parse({
        ...allDay,
        startTime: "09:00",
        tz: "Europe/London",
      }).when,
    ).toEqual({ allDay: true, startDate: "2026-10-24", endDate: "2026-10-26" });
  });

  it("accepts a one-day all-day event (inclusive end on the start day)", () => {
    expect(
      createCalendarEventSchema.safeParse({ ...allDay, endDate: "2026-10-24" })
        .success,
    ).toBe(true);
  });

  it("rejects an all-day end before the start", () => {
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({
          ...allDay,
          endDate: "2026-10-23",
        }),
      ),
    ).toEqual({ endDate: ["End on or after the start date."] });
  });

  it("accepts a timed event crossing midnight", () => {
    expect(
      createCalendarEventSchema.safeParse({
        ...timed,
        startTime: "22:00",
        endDate: "2026-10-25",
        endTime: "01:00",
      }).success,
    ).toBe(true);
  });

  it("rejects a timed end at or before the start", () => {
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({ ...timed, endTime: "09:00" }),
      ),
    ).toEqual({ endTime: ["End after the start."] });
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({
          ...timed,
          startTime: "22:00",
          endTime: "01:00",
        }),
      ),
    ).toEqual({ endTime: ["End after the start."] });
  });

  it("compares instants, so a spring-gap start equal to the end is rejected", () => {
    // 02:30 doesn't exist in New York on 2027-03-14 and becomes 03:30.
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({
          ...timed,
          startDate: "2027-03-14",
          startTime: "02:30",
          endDate: "2027-03-14",
          endTime: "03:30",
        }),
      ),
    ).toEqual({ endTime: ["End after the start."] });
  });

  it("names every missing field of the timed shape", () => {
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({ title: "Call", allDay: false }),
      ),
    ).toEqual({
      startDate: ["Pick a start date."],
      endDate: ["Pick an end date."],
      startTime: ["Enter a start time."],
      endTime: ["Enter an end time."],
      tz: ["Choose a time zone."],
    });
  });

  it("needs both dates for an all-day event", () => {
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({ title: "Trip", allDay: true }),
      ),
    ).toEqual({
      startDate: ["Pick a start date."],
      endDate: ["Pick an end date."],
    });
  });

  it("rejects bad values with field errors", () => {
    const errors = fieldErrors(
      createCalendarEventSchema.safeParse({
        ...timed,
        title: " ",
        location: "x".repeat(201),
        startDate: "2026-02-30",
        endTime: "24:00",
        tz: "+05:00",
        goalId: "not-a-uuid",
        lifeAreaId: "not-a-uuid",
      }),
    );
    expect(Object.keys(errors).sort()).toEqual([
      "endTime",
      "goalId",
      "lifeAreaId",
      "location",
      "startDate",
      "title",
      "tz",
    ]);
  });

  it("requires allDay to be a boolean", () => {
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({ ...timed, allDay: "on" }),
      ),
    ).toEqual({ allDay: ["Choose all-day or timed."] });
  });

  it("stores the zone in its canonical spelling", () => {
    const parsed = createCalendarEventSchema.parse({ ...timed, tz: "UTC" });
    expect(parsed.when).toMatchObject({ tz: "UTC" });
  });

  it("rejects unknown keys such as userId", () => {
    expect(
      createCalendarEventSchema.safeParse({ ...timed, userId: ID }).success,
    ).toBe(false);
  });
});

describe("updateCalendarEventSchema", () => {
  it("needs an ID and the same fields as create", () => {
    expect(
      updateCalendarEventSchema.parse({ id: ID, ...allDay }),
    ).toMatchObject({ id: ID, title: "Trip", when: { allDay: true } });
    expect(fieldErrors(updateCalendarEventSchema.safeParse(allDay))).toEqual({
      id: ["Choose an event."],
    });
  });
});

describe("repeat rule", () => {
  it("stores a rule in canonical form, and blank as a one-off", () => {
    expect(
      createCalendarEventSchema.parse({
        ...timed,
        rrule: " FREQ=WEEKLY;BYDAY=FR,MO;INTERVAL=1 ",
      }).rrule,
    ).toBe("FREQ=WEEKLY;BYDAY=MO,FR");
    expect(createCalendarEventSchema.parse({ ...timed, rrule: "" }).rrule).toBe(
      null,
    );
    expect(
      updateCalendarEventSchema.parse({ id: ID, ...allDay, rrule: null }).rrule,
    ).toBe(null);
  });

  it("rejects parts outside the repeat builder", () => {
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({
          ...timed,
          rrule: "FREQ=HOURLY",
        }),
      ),
    ).toEqual({ rrule: ["Repeat daily, weekly, monthly or yearly."] });
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({
          ...timed,
          rrule: "FREQ=DAILY;BYHOUR=9",
        }),
      ),
    ).toEqual({ rrule: ["Repeat rules can't use BYHOUR."] });
  });

  it("needs a repeat that ends on a date to end on or after the start", () => {
    expect(
      fieldErrors(
        createCalendarEventSchema.safeParse({
          ...timed,
          rrule: "FREQ=DAILY;UNTIL=20261023",
        }),
      ),
    ).toEqual({ rrule: ["End the repeat on or after the start date."] });
    expect(
      createCalendarEventSchema.safeParse({
        ...timed,
        rrule: "FREQ=DAILY;UNTIL=20261024",
      }).success,
    ).toBe(true);
  });
});

describe("editCalendarEventOccurrenceSchema", () => {
  it("takes an instant or a date as the occurrence, and the scope", () => {
    expect(
      editCalendarEventOccurrenceSchema.parse({
        id: ID,
        originalStart: "2026-10-24T13:00:00Z",
        scope: "all",
        ...timed,
        rrule: "FREQ=DAILY",
      }),
    ).toMatchObject({
      id: ID,
      originalStart: new Date("2026-10-24T13:00:00Z"),
      scope: "all",
      rrule: "FREQ=DAILY",
      title: "Dentist",
      when: { allDay: false, startTime: "09:00" },
    });
    expect(
      editCalendarEventOccurrenceSchema.parse({
        id: ID,
        originalStart: "2026-10-24",
        scope: "following",
        ...allDay,
      }),
    ).toMatchObject({ originalStart: "2026-10-24", rrule: null });
  });

  it("can't change the rule of one occurrence", () => {
    const input = {
      id: ID,
      originalStart: "2026-10-24",
      scope: "this",
      ...allDay,
    };
    expect(editCalendarEventOccurrenceSchema.parse(input).rrule).toBe(null);
    expect(
      editCalendarEventOccurrenceSchema.safeParse({
        ...input,
        rrule: "FREQ=DAILY",
      }).success,
    ).toBe(false);
  });

  it("rejects a bad occurrence or scope, and checks the times", () => {
    const input = {
      id: ID,
      originalStart: "2026-10-24",
      scope: "this",
      ...timed,
    };
    expect(
      fieldErrors(
        editCalendarEventOccurrenceSchema.safeParse({
          ...input,
          originalStart: "next Tuesday",
        }),
      ),
    ).toEqual({ originalStart: ["Choose an occurrence."] });
    expect(
      editCalendarEventOccurrenceSchema.safeParse({ ...input, scope: "some" })
        .success,
    ).toBe(false);
    expect(
      fieldErrors(
        editCalendarEventOccurrenceSchema.safeParse({
          ...input,
          endTime: "08:00",
        }),
      ),
    ).toEqual({ endTime: ["End after the start."] });
  });
});

describe("deleteCalendarEventOccurrenceSchema", () => {
  it("needs the series, the occurrence and a scope", () => {
    expect(
      deleteCalendarEventOccurrenceSchema.parse({
        id: ID,
        originalStart: "2026-10-24T13:00:00.000Z",
        scope: "following",
      }),
    ).toEqual({
      id: ID,
      originalStart: new Date("2026-10-24T13:00:00Z"),
      scope: "following",
    });
    expect(
      Object.keys(
        fieldErrors(
          deleteCalendarEventOccurrenceSchema.safeParse({
            id: ID,
            originalStart: "2026-10-24",
            scope: "everything",
          }),
        ),
      ),
    ).toEqual(["scope"]);
  });
});

describe("calendarEventIdSchema", () => {
  it("accepts a UUID only", () => {
    expect(calendarEventIdSchema.safeParse({ id: ID }).success).toBe(true);
    expect(calendarEventIdSchema.safeParse({ id: "1" }).success).toBe(false);
  });
});

describe("eventsBetweenSchema", () => {
  const range = {
    localStart: "2026-10-19",
    localEnd: "2026-10-26",
    tz: "America/New_York",
  };

  it("accepts whole local days with an exclusive end", () => {
    expect(eventsBetweenSchema.parse(range)).toEqual(range);
  });

  it("needs the end after the start", () => {
    expect(
      fieldErrors(
        eventsBetweenSchema.safeParse({ ...range, localEnd: "2026-10-19" }),
      ),
    ).toEqual({ localEnd: ["End after the start date."] });
  });

  it("allows at most 366 days", () => {
    expect(
      eventsBetweenSchema.safeParse({
        ...range,
        localStart: "2026-01-01",
        localEnd: "2027-01-02",
      }).success,
    ).toBe(true);
    expect(
      fieldErrors(
        eventsBetweenSchema.safeParse({
          ...range,
          localStart: "2026-01-01",
          localEnd: "2027-01-03",
        }),
      ),
    ).toEqual({ localEnd: ["Choose a range of 366 days or fewer."] });
  });

  it("rejects bad dates and zones", () => {
    expect(
      Object.keys(
        fieldErrors(
          eventsBetweenSchema.safeParse({
            localStart: "2026-13-01",
            localEnd: "",
            tz: "Mars/Olympus",
          }),
        ),
      ).sort(),
    ).toEqual(["localEnd", "localStart", "tz"]);
  });
});
