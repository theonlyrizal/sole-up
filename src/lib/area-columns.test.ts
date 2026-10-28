import { describe, expect, it } from "vitest";

import { blockEntry, eventEntry } from "./agenda";
import {
  type AreaColumn,
  areaColumns,
  type ColumnArea,
  dayHourMarks,
  dayLengthHours,
  entryAreaId,
  layoutDay,
  MIN_LAYOUT_MINUTES,
  NO_AREA_KEY,
} from "./area-columns";
import type { CalendarEventOccurrence } from "./calendar-events";
import { formatTimeOfDay, instantFromLocal } from "./dates";
import type { ScheduleEntry } from "./schedule";
import type { TimeBlockOccurrence } from "./time-blocks";

// Tokyo is UTC+9 with no DST, so the early hours of a Tokyo day are the day
// before in UTC: a UTC-date bug shows. New York changes its clocks on 8
// March 2026 (a 23-hour day) and 1 November 2026 (25 hours).
const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";
const DAY = "2026-10-27";

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

/** A timed event's row, "HH:MM" on DAY unless a full "date time" is given. */
function event(
  title: string,
  start: string,
  end: string,
  lifeAreaId: string | null = null,
  timeZone = TOKYO,
): ScheduleEntry {
  const local = (time: string) =>
    time.includes(" ") ? time : `${DAY} ${time}`;
  return eventEntry({
    ...stamps,
    id: id(),
    title,
    description: null,
    location: null,
    goalId: null,
    lifeAreaId,
    source: "internal",
    reminderOffsetMinutes: null,
    allDay: false,
    startAt: at(local(start), timeZone),
    endAt: at(local(end), timeZone),
    tz: timeZone,
    startDate: null,
    endDate: null,
  } satisfies CalendarEventOccurrence);
}

function allDay(title: string, lifeAreaId: string | null = null) {
  return eventEntry({
    ...stamps,
    id: id(),
    title,
    description: null,
    location: null,
    goalId: null,
    lifeAreaId,
    source: "internal",
    reminderOffsetMinutes: null,
    allDay: true,
    startAt: null,
    endAt: null,
    tz: null,
    startDate: DAY,
    endDate: "2026-10-28",
  } satisfies CalendarEventOccurrence);
}

/** A time block's row; its lane is its task's goal's area. */
function block(
  title: string,
  start: string,
  end: string,
  lifeAreaId: string | null = null,
) {
  return blockEntry({
    ...stamps,
    id: id(),
    taskId: id(),
    startAt: at(`${DAY} ${start}`),
    endAt: at(`${DAY} ${end}`),
    tz: TOKYO,
    status: "scheduled",
    taskTitle: title,
    taskStatus: "open",
    goalId: lifeAreaId === null ? null : id(),
    lifeAreaId,
  } satisfies TimeBlockOccurrence);
}

/** "title lane/lanes" for each placed item, in layout order. */
function lanes(column: AreaColumn | undefined) {
  return column?.timed.map(
    ({ entry, lane, lanes: count }) => `${entry.title} ${lane}/${count}`,
  );
}

const HOUR = 1 / 24;

describe("entryAreaId", () => {
  it("is an event's own area and a block's task's goal's area", () => {
    expect(entryAreaId(event("Dentist", "09:00", "10:00", HEALTH))).toBe(
      HEALTH,
    );
    expect(entryAreaId(block("Report", "09:00", "10:00", WORK))).toBe(WORK);
    expect(entryAreaId(block("Inbox task", "09:00", "10:00"))).toBeNull();
  });
});

describe("areaColumns", () => {
  it("has a column per active area in the user's order, then No area", () => {
    const columns = areaColumns([], AREAS, DAY, TOKYO);
    expect(columns.map((column) => column.name)).toEqual([
      "Work",
      "Health",
      "No area",
    ]);
    expect(columns.at(-1)).toMatchObject({
      key: NO_AREA_KEY,
      areaId: null,
      archived: false,
      allDay: [],
      timed: [],
    });
  });

  it("is only No area for a user without areas", () => {
    expect(areaColumns([], [], DAY, TOKYO).map((c) => c.name)).toEqual([
      "No area",
    ]);
  });

  it("puts events by their area and blocks by their task's goal's area", () => {
    const columns = areaColumns(
      [
        allDay("Race day", HEALTH),
        event("Dentist", "09:00", "10:00", HEALTH),
        block("Write report", "09:00", "11:00", WORK),
        event("Errands", "12:00", "13:00"),
        block("Inbox task", "14:00", "15:00"),
      ],
      AREAS,
      DAY,
      TOKYO,
    );
    const byName = (name: string) => columns.find((c) => c.name === name)!;
    expect(byName("Work").timed.map((p) => p.entry.title)).toEqual([
      "Write report",
    ]);
    expect(byName("Health").allDay.map((e) => e.title)).toEqual(["Race day"]);
    expect(byName("Health").timed.map((p) => p.entry.title)).toEqual([
      "Dentist",
    ]);
    expect(byName("No area").timed.map((p) => p.entry.title)).toEqual([
      "Errands",
      "Inbox task",
    ]);
  });

  it("shows an archived area only while it holds items, and marks it", () => {
    const columns = areaColumns(
      [event("Exit interview", "09:00", "10:00", OLD)],
      AREAS,
      DAY,
      TOKYO,
    );
    expect(columns.map((c) => [c.name, c.archived])).toEqual([
      ["Work", false],
      ["Health", false],
      ["Old job", true],
      ["No area", false],
    ]);
  });

  it("puts an item whose area it doesn't know under No area", () => {
    const columns = areaColumns(
      [event("Mystery", "09:00", "10:00", id())],
      AREAS,
      DAY,
      TOKYO,
    );
    expect(lanes(columns.at(-1))).toEqual(["Mystery 0/1"]);
  });
});

describe("layoutDay", () => {
  it("places items by their local time in the user's zone", () => {
    // 09:00 in Tokyo is 00:00 UTC; a UTC layout would put it at the top.
    const [placed] = layoutDay(
      [event("Dentist", "09:00", "10:30")],
      DAY,
      TOKYO,
    );
    expect(placed!.top).toBeCloseTo(9 * HOUR);
    expect(placed!.height).toBeCloseTo(1.5 * HOUR);
    expect(placed).toMatchObject({ lane: 0, lanes: 1 });
  });

  it("sets overlapping items side by side and splits the width evenly", () => {
    const placed = layoutDay(
      [
        event("Standup", "09:30", "10:30"),
        event("Dentist", "09:00", "10:00"),
        // Starts as Standup ends: no overlap, the full width again.
        event("Lunch", "10:30", "11:30"),
      ],
      DAY,
      TOKYO,
    );
    expect(lanes({ timed: placed } as AreaColumn)).toEqual([
      "Dentist 0/2",
      "Standup 1/2",
      "Lunch 0/1",
    ]);
  });

  it("reuses a lane once it is free, within one run of overlaps", () => {
    const placed = layoutDay(
      [
        event("Workshop", "09:00", "12:00"),
        event("Call", "09:00", "10:00"),
        event("Review", "10:00", "11:00"),
        event("Sync", "10:30", "11:30"),
      ],
      DAY,
      TOKYO,
    );
    // The longer item goes first at the same start. Review takes Call's
    // lane; Sync overlaps both others, so the run needs three lanes.
    expect(lanes({ timed: placed } as AreaColumn)).toEqual([
      "Workshop 0/3",
      "Call 1/3",
      "Review 1/3",
      "Sync 2/3",
    ]);
  });

  it("clips items crossing midnight to the day", () => {
    const placed = layoutDay(
      [
        event("Late call", "2026-10-26 23:00", "01:00"),
        event("Night shift", "23:00", "2026-10-28 02:00"),
      ],
      DAY,
      TOKYO,
    );
    expect(placed[0]!.entry.title).toBe("Late call");
    expect(placed[0]!.top).toBe(0);
    expect(placed[0]!.height).toBeCloseTo(HOUR);
    expect(placed[1]!.top).toBeCloseTo(23 * HOUR);
    expect(placed[1]!.top + placed[1]!.height).toBeCloseTo(1);
  });

  it(`gives a short item ${MIN_LAYOUT_MINUTES} minutes of room, kept inside the day`, () => {
    const placed = layoutDay(
      [
        event("Pill", "08:00", "08:05"),
        event("Check-in", "08:15", "08:20"),
        event("Lights out", "23:50", "23:55"),
      ],
      DAY,
      TOKYO,
    );
    const minimum = MIN_LAYOUT_MINUTES / (24 * 60);
    expect(placed[0]!.height).toBeCloseTo(minimum);
    // Too close to fit one under the other: side by side instead.
    expect(lanes({ timed: placed } as AreaColumn)).toEqual([
      "Pill 0/2",
      "Check-in 1/2",
      "Lights out 0/1",
    ]);
    expect(placed[2]!.top + placed[2]!.height).toBeCloseTo(1);
    expect(placed[2]!.height).toBeCloseTo(minimum);
  });

  it("keeps real times on a 25-hour fall-back day", () => {
    // 1 November 2026 in New York: 01:00–02:00 happens twice, so 09:00 is
    // ten elapsed hours after midnight.
    const [placed] = layoutDay(
      [event("Brunch", "2026-11-01 09:00", "2026-11-01 10:00", null, NEW_YORK)],
      "2026-11-01",
      NEW_YORK,
    );
    expect(placed!.top).toBeCloseTo(10 / 25);
    expect(placed!.height).toBeCloseTo(1 / 25);
  });
});

describe("the time axis", () => {
  it("has 24 hour lines on an ordinary day, from local midnight", () => {
    const marks = dayHourMarks(DAY, TOKYO);
    expect(marks).toHaveLength(24);
    expect(formatTimeOfDay(marks[0]!.at, "en-GB", TOKYO)).toBe("00:00");
    expect(marks[9]!.offset).toBeCloseTo(9 * HOUR);
    expect(dayLengthHours(DAY, TOKYO)).toBe(24);
  });

  it("follows DST: 23 hours in spring, 25 in autumn, labelled in local time", () => {
    expect(dayLengthHours("2026-03-08", NEW_YORK)).toBe(23);
    expect(dayLengthHours("2026-11-01", NEW_YORK)).toBe(25);
    const spring = dayHourMarks("2026-03-08", NEW_YORK).map((mark) =>
      formatTimeOfDay(mark.at, "en-GB", NEW_YORK),
    );
    expect(spring.slice(0, 4)).toEqual(["00:00", "01:00", "03:00", "04:00"]);
    const autumn = dayHourMarks("2026-11-01", NEW_YORK).map((mark) =>
      formatTimeOfDay(mark.at, "en-GB", NEW_YORK),
    );
    expect(autumn).toHaveLength(25);
    expect(autumn.slice(0, 4)).toEqual(["00:00", "01:00", "01:00", "02:00"]);
  });
});
