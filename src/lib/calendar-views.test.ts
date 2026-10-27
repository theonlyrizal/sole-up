import { describe, expect, it } from "vitest";

import type { CalendarEventOccurrence } from "./calendar-events";
import {
  DEADLINE_MARKER_MINUTES,
  gridDays,
  gridDayShortLabel,
  gridEntries,
  gridHref,
  type GridItemPosition,
  gridItemTarget,
  gridRange,
  gridRangeLabel,
  inGridRange,
  isGridKey,
  parseCalendarView,
  parseGridRange,
  shiftGridDate,
} from "./calendar-views";
import type { Task } from "./tasks";
import type { TimeBlockOccurrence } from "./time-blocks";

// Tokyo is UTC+9 with no DST, so a time early in a Tokyo day falls on the
// day before in UTC: a UTC-date bug puts it on the wrong day. 23 October
// 2026 is a Friday.
const TOKYO = "Asia/Tokyo";
const TODAY = "2026-10-23";

let nextId = 0;
function id(): string {
  nextId += 1;
  return `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`;
}

function task(fields: Partial<Task> = {}): Task {
  const taskId = id();
  return {
    id: taskId,
    goalId: null,
    milestoneId: null,
    title: `Task ${taskId.slice(-2)}`,
    notes: null,
    status: "open",
    priority: null,
    dueDate: null,
    dueAt: null,
    dueTz: null,
    plannedDate: null,
    estimatedMinutes: null,
    completedAt: null,
    cancelledAt: null,
    sortOrder: nextId,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...fields,
  };
}

function timeBlock(
  fields: Partial<TimeBlockOccurrence> = {},
): TimeBlockOccurrence {
  return {
    id: id(),
    taskId: id(),
    startAt: new Date("2026-10-23T00:00:00Z"),
    endAt: new Date("2026-10-23T01:00:00Z"),
    tz: TOKYO,
    rrule: null,
    status: "scheduled",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    seriesId: null,
    originalStart: null,
    modified: false,
    taskTitle: "Write report",
    taskStatus: "open",
    goalId: null,
    lifeAreaId: null,
    ...fields,
  };
}

function allDayEvent(
  startDate: string,
  endDate: string,
): CalendarEventOccurrence {
  return {
    id: id(),
    title: "Trip",
    description: null,
    location: null,
    rrule: null,
    goalId: null,
    lifeAreaId: null,
    source: "internal",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    seriesId: null,
    modified: false,
    allDay: true,
    startAt: null,
    endAt: null,
    tz: null,
    startDate,
    endDate,
    originalStart: null,
  };
}

describe("parseCalendarView", () => {
  it("reads week and day, and falls back to the Agenda", () => {
    expect(parseCalendarView({ view: "week" })).toBe("week");
    expect(parseCalendarView({ view: ["day", "week"] })).toBe("day");
    expect(parseCalendarView({})).toBe("agenda");
    expect(parseCalendarView({ view: "month" })).toBe("agenda");
  });
});

describe("gridRange", () => {
  it("starts a week on the user's week start", () => {
    // Monday start: Friday the 23rd is in the week of Monday the 19th.
    expect(gridRange("week", TODAY, 1)).toEqual({
      view: "week",
      date: TODAY,
      start: "2026-10-19",
      end: "2026-10-26",
    });
    // Sunday and Saturday starts.
    expect(gridRange("week", TODAY, 0).start).toBe("2026-10-18");
    expect(gridRange("week", TODAY, 6).start).toBe("2026-10-17");
    // A day that is the week start begins its own week.
    expect(gridRange("week", "2026-10-19", 1).start).toBe("2026-10-19");
  });

  it("is one day for Day", () => {
    expect(gridRange("day", TODAY, 1)).toEqual({
      view: "day",
      date: TODAY,
      start: TODAY,
      end: "2026-10-24",
    });
  });

  it("lists its days", () => {
    expect(gridDays(gridRange("week", TODAY, 1))).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(gridDays(gridRange("day", TODAY, 1))).toEqual([TODAY]);
  });

  it("knows which days are inside, end exclusive", () => {
    const week = gridRange("week", TODAY, 1);
    expect(inGridRange("2026-10-19", week)).toBe(true);
    expect(inGridRange("2026-10-25", week)).toBe(true);
    expect(inGridRange("2026-10-26", week)).toBe(false);
    expect(inGridRange("2026-10-18", week)).toBe(false);
  });
});

describe("parseGridRange and gridHref", () => {
  it("reads the date, falling back to today", () => {
    expect(parseGridRange("day", { date: "2026-11-02" }, TODAY, 1).date).toBe(
      "2026-11-02",
    );
    expect(parseGridRange("day", { date: "2026-13-40" }, TODAY, 1).date).toBe(
      TODAY,
    );
    expect(parseGridRange("week", {}, TODAY, 1).start).toBe("2026-10-19");
  });

  it("leaves today out of the URL, and round-trips", () => {
    expect(gridHref("week", TODAY, TODAY)).toBe("/plan/calendar?view=week");
    expect(gridHref("day", "2026-10-30", TODAY)).toBe(
      "/plan/calendar?view=day&date=2026-10-30",
    );
    const params = new URLSearchParams(
      gridHref("week", "2026-11-04", TODAY).split("?")[1],
    );
    expect(
      parseGridRange(
        parseCalendarView({ view: params.get("view")! }) as "week",
        { date: params.get("date")! },
        TODAY,
        1,
      ),
    ).toEqual(gridRange("week", "2026-11-04", 1));
  });

  it("moves a week or a day at a time", () => {
    const week = gridRange("week", TODAY, 1);
    expect(shiftGridDate(week, 1)).toBe("2026-10-30");
    expect(shiftGridDate(week, -1)).toBe("2026-10-16");
    const day = gridRange("day", TODAY, 1);
    expect(shiftGridDate(day, 1)).toBe("2026-10-24");
    expect(shiftGridDate(day, -1)).toBe("2026-10-22");
    // Across a month end.
    expect(shiftGridDate(gridRange("day", "2026-10-31", 1), 1)).toBe(
      "2026-11-01",
    );
  });
});

describe("labels", () => {
  it("names a week by its first and last day, and a day in full", () => {
    expect(gridRangeLabel(gridRange("week", TODAY, 1), "en-GB")).toBe(
      "19 Oct 2026 to 25 Oct 2026",
    );
    expect(gridRangeLabel(gridRange("day", TODAY, 1), "en-GB")).toBe(
      "Friday, 23 October 2026",
    );
  });

  it("gives a column's short heading for its own date in any zone", () => {
    expect(gridDayShortLabel("2026-10-19", "en-GB")).toBe("Mon 19");
    expect(gridDayShortLabel("2026-10-25", "en-US")).toBe("25 Sun");
  });
});

describe("gridEntries", () => {
  const week = gridRange("week", TODAY, 1);

  it("keeps events and turns timed deadlines into short markers on their Tokyo day", () => {
    const trip = allDayEvent("2026-10-20", "2026-10-22");
    // 00:30 on Saturday the 24th in Tokyo is still Friday in UTC.
    const rent = task({
      dueAt: new Date("2026-10-23T15:30:00Z"),
      dueTz: TOKYO,
    });
    const entries = gridEntries([trip], [rent], week, TOKYO);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      kind: "event",
      allDay: true,
      start: "2026-10-20",
      end: "2026-10-22",
    });
    expect(entries[1]).toMatchObject({
      id: `task:${rent.id}:due`,
      kind: "task",
      role: "due",
      allDay: false,
      start: "2026-10-23T15:30:00.000Z",
      end: new Date(
        Date.parse("2026-10-23T15:30:00Z") + DEADLINE_MARKER_MINUTES * 60_000,
      ).toISOString(),
    });
  });

  it("leaves out plans, all-day deadlines and deadlines outside the days", () => {
    const planned = task({ plannedDate: TODAY });
    const allDayDue = task({ dueDate: TODAY });
    // 00:30 on Monday the 26th in Tokyo: the next week.
    const nextWeek = task({
      dueAt: new Date("2026-10-25T15:30:00Z"),
      dueTz: TOKYO,
    });
    // 23:59 on Sunday the 18th in Tokyo: the week before.
    const lastWeek = task({
      dueAt: new Date("2026-10-18T14:59:00Z"),
      dueTz: TOKYO,
    });
    expect(
      gridEntries([], [planned, allDayDue, nextWeek, lastWeek], week, TOKYO),
    ).toEqual([]);
  });

  it("adds time blocks as timed items under their task's title, between events and deadlines", () => {
    const block = timeBlock({
      startAt: new Date("2026-10-23T15:30:00Z"),
      endAt: new Date("2026-10-23T16:30:00Z"),
    });
    const occurrence = timeBlock({
      startAt: new Date("2026-10-22T00:00:00Z"),
      endAt: new Date("2026-10-22T00:30:00Z"),
      rrule: "FREQ=DAILY",
      seriesId: "series",
      originalStart: new Date("2026-10-22T00:00:00Z"),
    });
    const entries = gridEntries([], [], week, TOKYO, [block, occurrence]);
    expect(entries[0]).toEqual({
      id: `block:${block.id}:`,
      title: "Write report",
      allDay: false,
      start: "2026-10-23T15:30:00.000Z",
      end: "2026-10-23T16:30:00.000Z",
      order: 0.5,
      kind: "block",
      block,
    });
    // Occurrences of one series are told apart by their original start.
    expect(entries[1]!.id).toBe(
      `block:${occurrence.id}:2026-10-22T00:00:00.000Z`,
    );
  });

  it("shows a planned task's timed deadline as a deadline only", () => {
    const both = task({
      plannedDate: TODAY,
      dueAt: new Date("2026-10-23T05:00:00Z"),
      dueTz: TOKYO,
    });
    const entries = gridEntries([], [both], gridRange("day", TODAY, 1), TOKYO);
    expect(entries.map((entry) => entry.id)).toEqual([`task:${both.id}:due`]);
  });
});

describe("gridItemTarget", () => {
  // Monday: an all-day item and two timed ones (09:00, then 11:00 to the
  // right of a 10:00 one); Wednesday: one at 10:00; Tuesday is empty.
  const items: GridItemPosition[] = [
    { day: "2026-10-21", allDay: false, top: 500, left: 300 }, // 0 Wed 10:00
    { day: "2026-10-19", allDay: false, top: 450, left: 100 }, // 1 Mon 09:00
    { day: "2026-10-19", allDay: true, top: 50, left: 100 }, // 2 Mon all day
    { day: "2026-10-19", allDay: false, top: 550, left: 100 }, // 3 Mon 11:00
    { day: "2026-10-19", allDay: false, top: 500, left: 140 }, // 4 Mon 10:00
  ];

  it("moves through a day in reading order with up and down", () => {
    expect(gridItemTarget(items, 2, "ArrowDown")).toBe(1);
    expect(gridItemTarget(items, 1, "ArrowDown")).toBe(4);
    expect(gridItemTarget(items, 4, "ArrowDown")).toBe(3);
    expect(gridItemTarget(items, 3, "ArrowDown")).toBeNull();
    expect(gridItemTarget(items, 1, "ArrowUp")).toBe(2);
    expect(gridItemTarget(items, 2, "ArrowUp")).toBeNull();
  });

  it("moves to the nearest item of the next or previous day with items", () => {
    // Monday 10:00 → Wednesday 10:00, skipping empty Tuesday.
    expect(gridItemTarget(items, 4, "ArrowRight")).toBe(0);
    // Wednesday 10:00 → Monday 10:00 (not 09:00 or 11:00).
    expect(gridItemTarget(items, 0, "ArrowLeft")).toBe(4);
    // From the all-day row, the next day's first item.
    expect(gridItemTarget(items, 2, "ArrowRight")).toBe(0);
    expect(gridItemTarget(items, 0, "ArrowRight")).toBeNull();
    expect(gridItemTarget(items, 2, "ArrowLeft")).toBeNull();
  });

  it("goes to the first and last item with Home and End", () => {
    expect(gridItemTarget(items, 0, "Home")).toBe(2);
    expect(gridItemTarget(items, 2, "End")).toBe(0);
    expect(gridItemTarget(items, 2, "Home")).toBeNull();
    expect(gridItemTarget(items, 0, "End")).toBeNull();
  });

  it("knows its keys", () => {
    expect(isGridKey("ArrowLeft")).toBe(true);
    expect(isGridKey("Enter")).toBe(false);
    expect(gridItemTarget(items, 9, "ArrowDown")).toBeNull();
  });
});
