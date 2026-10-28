import { describe, expect, it } from "vitest";

import type { CalendarEventOccurrence } from "./calendar-events";
import {
  defaultRepeat,
  eventFormValuesOf,
  eventPayload,
  monthlyOptions,
  newEventValues,
  readRepeat,
  repeatForNewStart,
  repeatFromRule,
  repeatSummary,
  thisEventBlocker,
  timesInZone,
  withAllDay,
  withStart,
  type EventFormValues,
  type RepeatValues,
} from "./event-form";
import { toRrule } from "./recurrence-rules";

const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";

function values(fields: Partial<EventFormValues> = {}): EventFormValues {
  return {
    ...newEventValues(new Date("2026-11-03T23:20:00Z"), TOKYO),
    ...fields,
  };
}

function repeat(fields: Partial<RepeatValues>): RepeatValues {
  return { ...defaultRepeat("2026-11-04"), ...fields };
}

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Dentist",
  description: null,
  location: null,
  goalId: null,
  lifeAreaId: null,
  source: "internal" as const,
  reminderOffsetMinutes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  modified: false,
};

describe("newEventValues", () => {
  it("starts at the next whole hour of the user's day and lasts 60 minutes", () => {
    // 23:20 UTC is 08:20 on 4 Nov in Tokyo.
    expect(values()).toMatchObject({
      allDay: false,
      startDate: "2026-11-04",
      startTime: "09:00",
      endDate: "2026-11-04",
      endTime: "10:00",
      tz: TOKYO,
      repeat: { frequency: "none", weekdays: ["WE"] },
      // New events remind 10 minutes before (ADR 0013).
      reminder: "10",
    });
  });

  it("rolls over to the next day late in the evening", () => {
    // 14:40 UTC is 23:40 in Tokyo.
    const late = newEventValues(new Date("2026-11-04T14:40:00Z"), TOKYO);
    expect(late).toMatchObject({
      startDate: "2026-11-05",
      startTime: "00:00",
      endDate: "2026-11-05",
      endTime: "01:00",
    });
  });
});

describe("eventFormValuesOf", () => {
  it("shows a timed event in its own zone", () => {
    const event: CalendarEventOccurrence = {
      ...base,
      allDay: false,
      startAt: new Date("2026-11-04T14:00:00Z"),
      endAt: new Date("2026-11-04T15:30:00Z"),
      tz: NEW_YORK,
      startDate: null,
      endDate: null,
      rrule: "FREQ=WEEKLY;BYDAY=WE",
      seriesId: base.id,
      originalStart: new Date("2026-11-04T14:00:00Z"),
      reminderOffsetMinutes: 30,
    };
    expect(eventFormValuesOf(event, TOKYO)).toMatchObject({
      reminder: "30",
      allDay: false,
      startDate: "2026-11-04",
      startTime: "09:00",
      endDate: "2026-11-04",
      endTime: "10:30",
      tz: NEW_YORK,
      repeat: { frequency: "weekly", weekdays: ["WE"], ends: "never" },
    });
  });

  it("shows an all-day event's end date inclusive", () => {
    const event: CalendarEventOccurrence = {
      ...base,
      allDay: true,
      startAt: null,
      endAt: null,
      tz: null,
      startDate: "2026-11-04",
      endDate: "2026-11-07",
      rrule: null,
      seriesId: null,
      originalStart: null,
    };
    expect(eventFormValuesOf(event, TOKYO)).toMatchObject({
      allDay: true,
      startDate: "2026-11-04",
      endDate: "2026-11-06",
      tz: TOKYO,
      // An existing event without a reminder keeps none.
      reminder: "",
    });
  });
});

describe("withStart", () => {
  it("keeps the event's length when the start moves", () => {
    const moved = withStart(values({ endTime: "10:45" }), {
      startTime: "23:30",
    });
    expect(moved).toMatchObject({
      startDate: "2026-11-04",
      startTime: "23:30",
      endDate: "2026-11-05",
      endTime: "01:15",
    });
  });

  it("falls back to 60 minutes when the end isn't after the start", () => {
    const moved = withStart(values({ endTime: "08:00" }), {
      startTime: "13:00",
    });
    expect(moved).toMatchObject({ endDate: "2026-11-04", endTime: "14:00" });
  });

  it("keeps an all-day event's number of days", () => {
    const allDay = values({
      allDay: true,
      startDate: "2026-11-04",
      endDate: "2026-11-06",
    });
    expect(withStart(allDay, { startDate: "2026-11-10" })).toMatchObject({
      startDate: "2026-11-10",
      endDate: "2026-11-12",
    });
  });

  it("leaves the end alone while the start date is incomplete", () => {
    const moved = withStart(values(), { startDate: "" });
    expect(moved).toMatchObject({ startDate: "", endDate: "2026-11-04" });
  });

  it("moves a weekly repeat's day with the start", () => {
    const weekly = values({
      repeat: repeat({ frequency: "weekly", weekdays: ["MO", "WE"] }),
    });
    const moved = withStart(weekly, { startDate: "2026-11-06" });
    expect(moved.repeat.weekdays).toEqual(["MO", "FR"]);
  });
});

describe("withAllDay", () => {
  it("keeps one day for a timed event ending at midnight", () => {
    const late = values({
      startTime: "23:00",
      endDate: "2026-11-05",
      endTime: "00:00",
    });
    expect(withAllDay(late, true)).toMatchObject({
      allDay: true,
      startDate: "2026-11-04",
      endDate: "2026-11-04",
    });
  });

  it("gives back a timed length when the kept times no longer fit", () => {
    const allDay = values({
      allDay: true,
      startTime: "15:00",
      endDate: "2026-11-04",
      endTime: "10:00",
    });
    expect(withAllDay(allDay, false)).toMatchObject({
      allDay: false,
      endDate: "2026-11-04",
      endTime: "16:00",
    });
  });
});

describe("repeatForNewStart", () => {
  it("keeps a monthly repeat in its form", () => {
    const byDay = repeat({
      frequency: "monthly",
      monthlyOn: { type: "dayOfMonth", day: 4 },
    });
    expect(
      repeatForNewStart(byDay, "2026-11-04", "2026-11-20").monthlyOn,
    ).toEqual({ type: "dayOfMonth", day: 20 });

    const last = repeat({
      frequency: "monthly",
      monthlyOn: { type: "weekdayOfMonth", ordinal: -1, weekday: "FR" },
    });
    // 27 Nov 2026 is the last Friday; 20 Nov the third.
    expect(
      repeatForNewStart(last, "2026-11-27", "2026-12-25").monthlyOn,
    ).toEqual({ type: "weekdayOfMonth", ordinal: -1, weekday: "FR" });
    expect(
      repeatForNewStart(last, "2026-11-27", "2026-11-20").monthlyOn,
    ).toEqual({ type: "weekdayOfMonth", ordinal: 3, weekday: "FR" });
  });
});

describe("monthlyOptions", () => {
  it("offers the day, the nth weekday and, in the last week, the last weekday", () => {
    expect(
      monthlyOptions("2026-11-27", { type: "dayOfMonth", day: 27 }),
    ).toEqual([
      { type: "dayOfMonth", day: 27 },
      { type: "weekdayOfMonth", ordinal: 4, weekday: "FR" },
      { type: "weekdayOfMonth", ordinal: -1, weekday: "FR" },
    ]);
    // The 30th is the fifth Monday: only "last" names its weekday.
    expect(
      monthlyOptions("2026-11-30", { type: "dayOfMonth", day: 30 }),
    ).toEqual([
      { type: "dayOfMonth", day: 30 },
      { type: "weekdayOfMonth", ordinal: -1, weekday: "MO" },
    ]);
  });

  it("keeps a stored choice that the start date wouldn't offer", () => {
    const stored = { type: "dayOfMonth" as const, day: 31 };
    expect(monthlyOptions("2026-11-04", stored)[0]).toEqual(stored);
  });
});

describe("readRepeat", () => {
  it("is a one-off when it doesn't repeat", () => {
    expect(readRepeat(defaultRepeat("2026-11-04"), "2026-11-04")).toEqual({
      ok: true,
      rrule: null,
      recurrence: null,
    });
  });

  it("builds the canonical rule", () => {
    const result = readRepeat(
      repeat({
        frequency: "weekly",
        interval: "2",
        weekdays: ["TH", "MO"],
        ends: "until",
        until: "2026-12-20",
      }),
      "2026-11-04",
    );
    expect(result).toMatchObject({
      ok: true,
      rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261220",
    });
  });

  it("reports each builder field's error", () => {
    expect(
      readRepeat(
        repeat({ frequency: "weekly", interval: "0", weekdays: [] }),
        "2026-11-04",
      ),
    ).toEqual({
      ok: false,
      errors: {
        interval: ["Repeat at least every 1."],
        weekdays: ["Choose at least one day."],
      },
    });
    expect(
      readRepeat(
        repeat({
          frequency: "daily",
          interval: "1.5",
          ends: "count",
          count: "",
        }),
        "2026-11-04",
      ),
    ).toMatchObject({
      ok: false,
      errors: { interval: ["Enter a whole number."], count: expect.any(Array) },
    });
    expect(
      readRepeat(
        repeat({ frequency: "daily", ends: "count", count: "1000" }),
        "2026-11-04",
      ),
    ).toEqual({ ok: false, errors: { count: ["Repeat at most 999 times."] } });
    expect(
      readRepeat(repeat({ frequency: "daily", ends: "until" }), "2026-11-04"),
    ).toEqual({ ok: false, errors: { until: ["Enter a valid date."] } });
  });

  it("refuses a repeat that ends before the start date", () => {
    expect(
      readRepeat(
        repeat({ frequency: "daily", ends: "until", until: "2026-11-03" }),
        "2026-11-04",
      ),
    ).toEqual({
      ok: false,
      errors: { until: ["End the repeat on or after the start date."] },
    });
  });

  it("round-trips a stored rule through the builder", () => {
    for (const rule of [
      "FREQ=DAILY;COUNT=5",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261220",
      "FREQ=MONTHLY;BYDAY=-1FR",
      "FREQ=MONTHLY;BYMONTHDAY=31",
      "FREQ=YEARLY;INTERVAL=3",
    ]) {
      const result = readRepeat(
        repeatFromRule(rule, "2026-11-04"),
        "2026-11-04",
      );
      expect(result).toMatchObject({ ok: true, rrule: rule });
    }
  });
});

describe("repeatSummary", () => {
  it("summarises the builder in plain language", () => {
    expect(
      repeatSummary(
        repeat({
          frequency: "weekly",
          interval: "2",
          weekdays: ["MO", "TH"],
          ends: "until",
          until: "2026-12-20",
        }),
        "2026-11-04",
        "en-GB",
      ),
    ).toBe("Every 2 weeks on Mon and Thu, until 20 Dec 2026");
    expect(
      repeatSummary(defaultRepeat("2026-11-04"), "2026-11-04", "en-GB"),
    ).toBe("Does not repeat");
    expect(
      repeatSummary(
        repeat({ frequency: "daily", interval: "0" }),
        "2026-11-04",
        "en-GB",
      ),
    ).toBeNull();
  });
});

describe("eventPayload", () => {
  it("leaves out times and zone for an all-day event", () => {
    expect(
      eventPayload(values({ allDay: true, goalId: "", lifeAreaId: "" })),
    ).toMatchObject({
      allDay: true,
      startTime: null,
      endTime: null,
      tz: null,
      goalId: null,
      lifeAreaId: null,
      reminderOffsetMinutes: null,
    });
  });

  it("sends a timed event's reminder as chosen", () => {
    expect(eventPayload(values())).toMatchObject({
      reminderOffsetMinutes: "10",
    });
    expect(eventPayload(values({ reminder: "" }))).toMatchObject({
      reminderOffsetMinutes: "",
    });
  });
});

describe("thisEventBlocker", () => {
  const initial = values();
  it("allows a change of times or text", () => {
    expect(
      thisEventBlocker(initial, { ...initial, startTime: "11:00" }, false),
    ).toBeNull();
  });

  it("refuses a change of shape, zone or repeat", () => {
    expect(
      thisEventBlocker(initial, { ...initial, allDay: true }, false),
    ).toMatch(/all-day/);
    expect(
      thisEventBlocker(initial, { ...initial, tz: NEW_YORK }, false),
    ).toMatch(/time zone/);
    expect(thisEventBlocker(initial, initial, true)).toMatch(/repeat/);
  });

  it("refuses a new reminder: it applies to the whole series", () => {
    expect(
      thisEventBlocker(initial, { ...initial, reminder: "60" }, false),
    ).toBe("A reminder applies to every event in the series.");
  });
});

describe("timesInZone", () => {
  it("shows the times in the user's zone when the event's zone differs", () => {
    const newYork = values({
      tz: NEW_YORK,
      startTime: "09:00",
      endTime: "10:00",
    });
    // 09:00 in New York on 4 Nov is 23:00 in Tokyo.
    expect(timesInZone(newYork, TOKYO, "en-GB")).toBe(
      "Wed 4 Nov, 23:00 – Thu 5 Nov, 00:00",
    );
  });

  it("shows nothing in the user's own zone, all day, or while incomplete", () => {
    expect(timesInZone(values(), TOKYO, "en-GB")).toBeNull();
    expect(
      timesInZone(values({ tz: NEW_YORK, allDay: true }), TOKYO, "en-GB"),
    ).toBeNull();
    expect(
      timesInZone(values({ tz: NEW_YORK, startTime: "" }), TOKYO, "en-GB"),
    ).toBeNull();
  });
});

it("round-trips builder values through toRrule", () => {
  // Sanity check that the builder's subset stays the stored rule's.
  expect(
    toRrule({
      frequency: "monthly",
      interval: 1,
      monthlyOn: { type: "weekdayOfMonth", ordinal: -1, weekday: "FR" },
      end: { type: "never" },
    }),
  ).toBe("FREQ=MONTHLY;BYDAY=-1FR");
});
