import { describe, expect, it } from "vitest";

import type { CalendarEventOccurrence } from "./calendar-events";
import {
  calendarDayLabel,
  groupEventsByDay,
  occurrenceKey,
  originalStartParam,
} from "./calendar-list";
import { formatLocalDate } from "./dates";

const TOKYO = "Asia/Tokyo";
const TODAY = "2026-11-02";

let nextId = 0;
const base = () => {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
    title: `Event ${nextId}`,
    description: null,
    location: null,
    rrule: null,
    goalId: null,
    lifeAreaId: null,
    source: "internal" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    seriesId: null,
    originalStart: null,
    modified: false,
  };
};

function timed(startAt: string, endAt: string): CalendarEventOccurrence {
  return {
    ...base(),
    allDay: false,
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    tz: TOKYO,
    startDate: null,
    endDate: null,
  };
}

function allDay(startDate: string, endDate: string): CalendarEventOccurrence {
  return {
    ...base(),
    allDay: true,
    startAt: null,
    endAt: null,
    tz: null,
    startDate,
    endDate,
  };
}

describe("groupEventsByDay", () => {
  it("lists events under their local start day, ongoing ones today", () => {
    // 15:30 UTC on the 2nd is 00:30 on the 3rd in Tokyo.
    const afterMidnight = timed("2026-11-02T15:30:00Z", "2026-11-02T16:30:00Z");
    const morning = timed("2026-11-02T00:00:00Z", "2026-11-02T01:00:00Z");
    const ongoing = allDay("2026-10-30", "2026-11-04");
    const days = groupEventsByDay(
      [morning, afterMidnight, ongoing],
      TODAY,
      TOKYO,
    );
    expect(
      days.map(({ date, events }) => [date, events.map(({ id }) => id)]),
    ).toEqual([
      ["2026-11-02", [ongoing.id, morning.id]],
      ["2026-11-03", [afterMidnight.id]],
    ]);
  });
});

describe("occurrence keys", () => {
  it("address a one-off by ID and an occurrence by its original start", () => {
    const oneOff = allDay("2026-11-04", "2026-11-05");
    expect(originalStartParam(oneOff)).toBeNull();
    expect(occurrenceKey(oneOff)).toBe(oneOff.id);

    const occurrence = {
      ...timed("2026-11-04T00:00:00Z", "2026-11-04T01:00:00Z"),
      originalStart: new Date("2026-11-03T00:00:00Z"),
    } as CalendarEventOccurrence;
    expect(originalStartParam(occurrence)).toBe("2026-11-03T00:00:00.000Z");
    expect(occurrenceKey(occurrence)).toBe(
      `${occurrence.id}:2026-11-03T00:00:00.000Z`,
    );
  });
});

describe("calendarDayLabel", () => {
  it("names today and tomorrow", () => {
    const full = (date: string) => formatLocalDate(date, "en-GB", "full");
    expect(calendarDayLabel(TODAY, TODAY, "en-GB")).toBe(
      `Today · ${full(TODAY)}`,
    );
    expect(calendarDayLabel("2026-11-03", TODAY, "en-GB")).toBe(
      `Tomorrow · ${full("2026-11-03")}`,
    );
    expect(calendarDayLabel("2026-11-04", TODAY, "en-GB")).toBe(
      full("2026-11-04"),
    );
  });
});
