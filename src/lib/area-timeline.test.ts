import { describe, expect, it } from "vitest";

import { blockEntry, eventEntry } from "./agenda";
import type { ColumnArea } from "./area-columns";
import {
  parseTimelineRange,
  shiftTimelineDate,
  TIMELINE_SCALE,
  timelineHref,
  timelineItemTarget,
  timelineItemTimeLabel,
  type TimelineItemPosition,
  timelineLengthHours,
  timelineRange,
  timelineRangeLabel,
  type TimelineRow,
  timelineRows,
  timelineTicks,
} from "./area-timeline";
import type { CalendarEventOccurrence } from "./calendar-events";
import { formatTimeOfDay, instantFromLocal } from "./dates";
import type { ScheduleEntry } from "./schedule";
import type { TimeBlockOccurrence } from "./time-blocks";

// Tokyo is UTC+9 with no DST, so the early hours of a Tokyo day are the day
// before in UTC: a UTC-date bug shows. New York falls back on Sunday 1
// November 2026, so the week of 26 October lasts 169 hours there.
const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";
const TODAY = "2026-10-27"; // a Tuesday
const MONDAY = 1;
const WEEK = timelineRange("week", TODAY, MONDAY); // 26 Oct to 1 Nov
const DAY = timelineRange("day", TODAY, MONDAY);

let nextId = 0;
function id(): string {
  nextId += 1;
  return `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`;
}

const HEALTH = id();
const WORK = id();
const OLD = id();
const AREAS: ColumnArea[] = [
  { id: WORK, name: "Work", status: "active" },
  { id: HEALTH, name: "Health", status: "active" },
  { id: OLD, name: "Old job", status: "archived" },
];

const at = (local: string, timeZone = TOKYO) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, timeZone);
};

const stamps = {
  rrule: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  seriesId: null,
  originalStart: null,
  modified: false,
};

const eventFields = {
  ...stamps,
  description: null,
  location: null,
  goalId: null,
  source: "internal" as const,
};

/** A timed event's row between two local "date time"s. */
function event(
  title: string,
  start: string,
  end: string,
  lifeAreaId: string | null = null,
  timeZone = TOKYO,
): ScheduleEntry {
  return eventEntry({
    ...eventFields,
    id: id(),
    title,
    lifeAreaId,
    allDay: false,
    startAt: at(start, timeZone),
    endAt: at(end, timeZone),
    tz: timeZone,
    startDate: null,
    endDate: null,
  } satisfies CalendarEventOccurrence);
}

/** An all-day event's row from `startDate` to `endDate` (exclusive). */
function allDay(
  title: string,
  startDate: string,
  endDate: string,
  lifeAreaId: string | null = null,
) {
  return eventEntry({
    ...eventFields,
    id: id(),
    title,
    lifeAreaId,
    allDay: true,
    startAt: null,
    endAt: null,
    tz: null,
    startDate,
    endDate,
  } satisfies CalendarEventOccurrence);
}

/** A time block's row; its lane is its task's goal's area. */
function block(title: string, start: string, end: string, lifeAreaId: string) {
  return blockEntry({
    ...stamps,
    id: id(),
    taskId: id(),
    startAt: at(start),
    endAt: at(end),
    tz: TOKYO,
    status: "scheduled",
    taskTitle: title,
    taskStatus: "open",
    goalId: id(),
    lifeAreaId,
  } satisfies TimeBlockOccurrence);
}

/** "<row>: <title> <lane>/<lanes>, …" for each row. */
const summary = (rows: TimelineRow[]) =>
  rows.map(
    (row) =>
      `${row.name}${row.archived ? " (archived)" : ""} [${row.lanes}]: ${row.items
        .map(({ entry, lane, lanes }) => `${entry.title} ${lane}/${lanes}`)
        .join(", ")}`,
  );

const rowNamed = (rows: TimelineRow[], name: string) =>
  rows.find((row) => row.name === name)!;

describe("the timeline's range", () => {
  it("is a week from the user's week start by default, or one day", () => {
    expect(parseTimelineRange({}, TODAY, MONDAY)).toEqual({
      span: "week",
      date: TODAY,
      start: "2026-10-26",
      end: "2026-11-02",
    });
    expect(parseTimelineRange({}, TODAY, 0).start).toBe("2026-10-25");
    expect(
      parseTimelineRange({ span: "day", date: "2026-11-04" }, TODAY, MONDAY),
    ).toEqual({
      span: "day",
      date: "2026-11-04",
      start: "2026-11-04",
      end: "2026-11-05",
    });
  });

  it("falls back to a week and today for unknown values", () => {
    expect(
      parseTimelineRange({ span: "month", date: "2026-13-40" }, TODAY, MONDAY),
    ).toEqual(WEEK);
  });

  it("round trips through the URL, leaving out the week and today", () => {
    expect(timelineHref("week", TODAY, TODAY)).toBe(
      "/plan/calendar?view=timeline",
    );
    expect(timelineHref("day", "2026-10-30", TODAY)).toBe(
      "/plan/calendar?view=timeline&span=day&date=2026-10-30",
    );
    const params = Object.fromEntries(
      new URLSearchParams(
        timelineHref("day", "2026-11-04", TODAY).split("?")[1],
      ),
    );
    expect(parseTimelineRange(params, TODAY, MONDAY)).toEqual(
      timelineRange("day", "2026-11-04", MONDAY),
    );
  });

  it("moves by a week or a day, and is labelled as Week and Day are", () => {
    expect(shiftTimelineDate(WEEK, 1)).toBe("2026-11-03");
    expect(shiftTimelineDate(WEEK, -1)).toBe("2026-10-20");
    expect(shiftTimelineDate(DAY, 1)).toBe("2026-10-28");
    expect(timelineRangeLabel(WEEK, "en-GB")).toBe("26 Oct 2026 to 1 Nov 2026");
    expect(timelineRangeLabel(DAY, "en-GB")).toBe("Tuesday, 27 October 2026");
  });

  it("lasts 168 hours, or 169 in New York's fall-back week", () => {
    expect(timelineLengthHours(WEEK, TOKYO)).toBe(168);
    expect(timelineLengthHours(DAY, TOKYO)).toBe(24);
    expect(timelineLengthHours(WEEK, NEW_YORK)).toBe(169);
  });
});

describe("timelineRows", () => {
  it("has a row per active area in the user's order, then No area", () => {
    expect(summary(timelineRows([], AREAS, WEEK, TOKYO))).toEqual([
      "Work [1]: ",
      "Health [1]: ",
      "No area [1]: ",
    ]);
    expect(summary(timelineRows([], [], WEEK, TOKYO))).toEqual([
      "No area [1]: ",
    ]);
  });

  it("puts events by their area and blocks by their task's goal's area", () => {
    const rows = timelineRows(
      [
        event("Dentist", "2026-10-27 08:00", "2026-10-27 09:00", HEALTH),
        block("Write report", "2026-10-28 09:00", "2026-10-28 11:00", WORK),
        event("Errands", "2026-10-29 13:00", "2026-10-29 14:00"),
        event("Exit interview", "2026-10-30 10:00", "2026-10-30 11:00", OLD),
      ],
      AREAS,
      WEEK,
      TOKYO,
    );
    expect(summary(rows)).toEqual([
      "Work [1]: Write report 0/1",
      "Health [1]: Dentist 0/1",
      "Old job (archived) [1]: Exit interview 0/1",
      "No area [1]: Errands 0/1",
    ]);
  });

  it("places items by their Tokyo time across the week, not UTC", () => {
    // Tuesday 08:00 in Tokyo is Monday 23:00 in UTC.
    const [placed] = rowNamed(
      timelineRows(
        [event("Dentist", "2026-10-27 08:00", "2026-10-27 11:00", HEALTH)],
        AREAS,
        WEEK,
        TOKYO,
      ),
      "Health",
    ).items;
    expect(placed!.offset).toBeCloseTo((24 + 8) / 168);
    expect(placed!.length).toBeCloseTo(3 / 168);
  });

  it("runs all-day events from local midnight to local midnight", () => {
    const [conference, trip] = rowNamed(
      timelineRows(
        [
          allDay("Conference", "2026-10-28", "2026-10-29"),
          // Begins before the week: clipped to its start.
          allDay("Trip", "2026-10-24", "2026-10-27"),
        ],
        AREAS,
        WEEK,
        TOKYO,
      ),
      "No area",
    ).items.sort((a, b) => b.offset - a.offset);
    expect(conference!.offset).toBeCloseTo(48 / 168);
    expect(conference!.length).toBeCloseTo(24 / 168);
    expect(trip!.offset).toBe(0);
    expect(trip!.length).toBeCloseTo(24 / 168);
  });

  it("clips an item crossing into the week from the night before", () => {
    const [placed] = rowNamed(
      timelineRows(
        [event("Night shift", "2026-10-25 22:00", "2026-10-26 03:00")],
        AREAS,
        WEEK,
        TOKYO,
      ),
      "No area",
    ).items;
    expect(placed!.offset).toBe(0);
    expect(placed!.length).toBeCloseTo(3 / 168);
  });

  it("stacks overlapping items in lanes and grows the row to fit", () => {
    const rows = timelineRows(
      [
        event("Dentist", "2026-10-27 08:00", "2026-10-27 09:00", HEALTH),
        event("Physio", "2026-10-27 08:30", "2026-10-27 09:30", HEALTH),
        event("Massage", "2026-10-27 08:45", "2026-10-27 10:00", HEALTH),
        // Starts as the others end: back in the first lane.
        event("Walk", "2026-10-27 10:00", "2026-10-27 11:00", HEALTH),
      ],
      AREAS,
      DAY,
      TOKYO,
    );
    expect(summary(rows)[1]).toBe(
      "Health [3]: Dentist 0/3, Physio 1/3, Massage 2/3, Walk 0/1",
    );
  });

  it("gives short items more room on a week, so close ones stack there", () => {
    const entries = [
      event("Pill", "2026-10-27 08:00", "2026-10-27 08:05"),
      event("Check-in", "2026-10-27 09:00", "2026-10-27 09:05"),
    ];
    // An hour apart: side by side on a day (30 minutes each)…
    expect(summary(timelineRows(entries, [], DAY, TOKYO))).toEqual([
      "No area [1]: Pill 0/1, Check-in 0/1",
    ]);
    expect(
      timelineRows(entries, [], DAY, TOKYO)[0]!.items[0]!.length,
    ).toBeCloseTo(TIMELINE_SCALE.day.minimumMinutes / (24 * 60));
    // …but within the two hours each takes on a week, so they stack.
    expect(summary(timelineRows(entries, [], WEEK, TOKYO))).toEqual([
      "No area [2]: Pill 0/2, Check-in 1/2",
    ]);
  });

  it("keeps real times in New York's 169-hour fall-back week", () => {
    // Sunday 1 November 09:00 is 6 days and 10 elapsed hours in.
    const [placed] = timelineRows(
      [event("Brunch", "2026-11-01 09:00", "2026-11-01 11:00", null, NEW_YORK)],
      [],
      WEEK,
      NEW_YORK,
    )[0]!.items;
    expect(placed!.offset).toBeCloseTo((6 * 24 + 10) / 169);
    expect(placed!.length).toBeCloseTo(2 / 169);
  });
});

describe("timelineTicks", () => {
  it("marks each hour of a day in local time", () => {
    const ticks = timelineTicks(DAY, TOKYO);
    expect(ticks).toHaveLength(24);
    expect(ticks.every((tick) => tick.label === "time")).toBe(true);
    expect(formatTimeOfDay(ticks[8]!.at, "en-GB", TOKYO)).toBe("08:00");
    expect(ticks[8]!.offset).toBeCloseTo(8 / 24);
  });

  it("marks each day of a week, with fainter lines every six hours", () => {
    const ticks = timelineTicks(WEEK, TOKYO);
    expect(ticks).toHaveLength(28);
    const days = ticks.filter((tick) => tick.label === "day");
    expect(days.map((tick) => tick.day)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(days[2]!.offset).toBeCloseTo(48 / 168);
    expect(ticks[1]).toMatchObject({ label: null, day: "2026-10-26" });
    expect(ticks[1]!.offset).toBeCloseTo(6 / 168);
  });

  it("follows New York's fall-back day", () => {
    const ticks = timelineTicks(WEEK, NEW_YORK);
    const sunday = ticks.filter((tick) => tick.day === "2026-11-01");
    // Midnight, then 06:00 local, seven elapsed hours later.
    expect(sunday[0]!.offset).toBeCloseTo((6 * 24) / 169);
    expect(sunday[1]!.offset).toBeCloseTo((6 * 24 + 7) / 169);
    expect(
      timelineTicks(timelineRange("day", "2026-11-01", 1), NEW_YORK),
    ).toHaveLength(25);
  });
});

describe("timelineItemTimeLabel", () => {
  it("says the day on a week and only the times on a day", () => {
    const dentist = event("Dentist", "2026-10-27 08:00", "2026-10-27 09:00");
    expect(timelineItemTimeLabel(dentist, DAY, "en-GB", TOKYO)).toBe(
      "08:00 – 09:00",
    );
    expect(timelineItemTimeLabel(dentist, WEEK, "en-GB", TOKYO)).toBe(
      "Tue 27 Oct, 08:00 – 09:00",
    );
  });

  it("says all day, with the dates on a week or across days", () => {
    const conference = allDay("Conference", "2026-10-27", "2026-10-28");
    expect(timelineItemTimeLabel(conference, DAY, "en-GB", TOKYO)).toBe(
      "All day",
    );
    expect(timelineItemTimeLabel(conference, WEEK, "en-GB", TOKYO)).toBe(
      "All day, 27 Oct 2026",
    );
    expect(
      timelineItemTimeLabel(
        allDay("Trip", "2026-10-27", "2026-10-30"),
        DAY,
        "en-GB",
        TOKYO,
      ),
    ).toBe("All day, 27 Oct 2026 to 29 Oct 2026");
  });
});

describe("timelineItemTarget", () => {
  // Two items in the first row, one in the second, two in the third.
  const items: TimelineItemPosition[] = [
    { row: "000", left: 100, top: 10 },
    { row: "000", left: 200, top: 10 },
    { row: "001", left: 180, top: 60 },
    { row: "002", left: 10, top: 110 },
    { row: "002", left: 400, top: 110 },
  ];

  it("moves along a row with Left and Right", () => {
    expect(timelineItemTarget(items, 0, "ArrowRight")).toBe(1);
    expect(timelineItemTarget(items, 1, "ArrowRight")).toBeNull();
    expect(timelineItemTarget(items, 1, "ArrowLeft")).toBe(0);
    expect(timelineItemTarget(items, 0, "ArrowLeft")).toBeNull();
  });

  it("moves to the nearest-in-time item of the next row with Up and Down", () => {
    expect(timelineItemTarget(items, 1, "ArrowDown")).toBe(2);
    expect(timelineItemTarget(items, 2, "ArrowDown")).toBe(3);
    expect(timelineItemTarget(items, 4, "ArrowUp")).toBe(2);
    expect(timelineItemTarget(items, 2, "ArrowUp")).toBe(1);
    expect(timelineItemTarget(items, 0, "ArrowUp")).toBeNull();
    expect(timelineItemTarget(items, 3, "ArrowDown")).toBeNull();
  });

  it("goes to the first and last item with Home and End", () => {
    expect(timelineItemTarget(items, 2, "Home")).toBe(0);
    expect(timelineItemTarget(items, 2, "End")).toBe(4);
    expect(timelineItemTarget(items, 0, "Home")).toBeNull();
  });
});
