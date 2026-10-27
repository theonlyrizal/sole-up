// The calendar's "By area" view (chunk 4.10): one day split into a column
// per active life area, plus "No area". Our own layout, built from scratch:
// FullCalendar's resource views are premium and not used (ADR 0012).
// Pure: no server-only imports, so the view and the tests share it.
//
// Events go in their own life area's column, and time blocks in their
// task's goal's area. Within a column, timed items are placed by elapsed
// time from the start of the local day, so a 23- or 25-hour day around a
// DST change keeps every item at its real time. Items that overlap sit side
// by side, as on Week and Day (chunk 4.6), rather than over each other.

import type { LifeAreaStatus } from "./life-areas";
import { type LocalDate, localDayRange } from "./dates";
import type { ScheduleEntry } from "./schedule";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * The shortest time an item takes up in the layout, so a 5-minute item is
 * tall enough to read and to click (24 px at the view's 48 px an hour, the
 * WCAG 2.2 target size) and still never covers its neighbour: two short
 * items closer than this sit side by side.
 */
export const MIN_LAYOUT_MINUTES = 30;

/** A life area as the columns need it. */
export type ColumnArea = { id: string; name: string; status: LifeAreaStatus };

/** A timed item placed in its column. */
export type PlacedEntry = {
  entry: ScheduleEntry;
  /** Its top edge and height as fractions of the day (0 to 1). */
  top: number;
  height: number;
  /** Its place among the items it overlaps: lane `lane` of `lanes`. */
  lane: number;
  lanes: number;
};

/** One column of the view. */
export type AreaColumn = {
  /** A stable key: the area's ID, or "none". */
  key: string;
  /** The area's ID; null for "No area". */
  areaId: string | null;
  name: string;
  /** An archived area's column, shown only while it holds items. */
  archived: boolean;
  allDay: ScheduleEntry[];
  timed: PlacedEntry[];
};

/** The column key of "No area". */
export const NO_AREA_KEY = "none";

/** An item's life area: an event's own, or a block's task's goal's area. */
export function entryAreaId(entry: ScheduleEntry): string | null {
  return entry.kind === "event"
    ? entry.event.lifeAreaId
    : entry.kind === "block"
      ? entry.block.lifeAreaId
      : null;
}

/**
 * The day's columns: every active area in the order given (the user's
 * order), then any archived area that holds one of the items (labelled as
 * archived, so nothing is shown under the wrong area), then "No area",
 * which also takes items whose area isn't among `areas`. Each column keeps
 * its all-day items in the order given and lays out its timed ones.
 */
export function areaColumns(
  entries: ScheduleEntry[],
  areas: ColumnArea[],
  date: LocalDate,
  timeZone: string,
): AreaColumn[] {
  const known = new Map(areas.map((area) => [area.id, area]));
  const byKey = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    const areaId = entryAreaId(entry);
    const key = areaId !== null && known.has(areaId) ? areaId : NO_AREA_KEY;
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }
  const shown = [
    ...areas.filter((area) => area.status === "active"),
    ...areas.filter((area) => area.status !== "active" && byKey.has(area.id)),
  ];
  const column = (key: string, area: ColumnArea | null): AreaColumn => {
    const items = byKey.get(key) ?? [];
    return {
      key,
      areaId: area?.id ?? null,
      name: area?.name ?? "No area",
      archived: area !== null && area.status !== "active",
      allDay: items.filter((entry) => entry.allDay),
      timed: layoutDay(
        items.filter((entry) => !entry.allDay),
        date,
        timeZone,
      ),
    };
  };
  return [
    ...shown.map((area) => column(area.id, area)),
    column(NO_AREA_KEY, null),
  ];
}

/** A timed item's interval in the layout, clipped to the day, in ms. */
type Interval = { entry: ScheduleEntry; start: number; end: number };

/**
 * Places a column's timed items on `date` in `timeZone`. An item that
 * began the day before or runs past midnight is clipped to the day. Items
 * are taken by start (longer first at the same start); each joins the
 * first lane that is free by its start, and every item in a run of
 * overlapping items shares that run's lane count, so they split the
 * column's width evenly.
 */
export function layoutDay(
  entries: ScheduleEntry[],
  date: LocalDate,
  timeZone: string,
): PlacedEntry[] {
  const day = localDayRange(date, timeZone);
  const dayStart = day.start.getTime();
  const dayEnd = day.end.getTime();
  const length = dayEnd - dayStart;
  const minimum = MIN_LAYOUT_MINUTES * MINUTE_MS;

  const intervals = entries
    .map((entry): Interval => {
      const start = Math.max(Date.parse(entry.start), dayStart);
      const end = Math.min(Date.parse(entry.end ?? entry.start), dayEnd);
      // At least the minimum, kept inside the day.
      const laidEnd = Math.min(Math.max(end, start + minimum), dayEnd);
      return { entry, start: Math.min(start, laidEnd - minimum), end: laidEnd };
    })
    .sort(
      (a, b) =>
        a.start - b.start ||
        b.end - a.end ||
        a.entry.order - b.entry.order ||
        a.entry.title.localeCompare(b.entry.title) ||
        a.entry.id.localeCompare(b.entry.id),
    );

  const placed: PlacedEntry[] = [];
  let run: { item: Interval; lane: number }[] = [];
  let laneEnds: number[] = [];
  let runEnd = -Infinity;
  const closeRun = () => {
    for (const { item, lane } of run) {
      placed.push({
        entry: item.entry,
        top: (item.start - dayStart) / length,
        height: (item.end - item.start) / length,
        lane,
        lanes: laneEnds.length,
      });
    }
    run = [];
    laneEnds = [];
  };
  for (const item of intervals) {
    // An item starting exactly when the run ends doesn't overlap it.
    if (item.start >= runEnd) closeRun();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    run.push({ item, lane });
    runEnd = run.length === 1 ? item.end : Math.max(runEnd, item.end);
  }
  closeRun();
  return placed;
}

/** An hour line on the day's time axis. */
export type HourMark = {
  /** When it is: an instant whose local time labels the line. */
  at: Date;
  /** Its distance from the top, as a fraction of the day. */
  offset: number;
};

/**
 * The day's hour lines, one per elapsed hour from its first instant. A
 * spring-forward day has 23 and a fall-back day 25, each labelled with its
 * real local time (so one hour label is missing or repeated).
 */
export function dayHourMarks(date: LocalDate, timeZone: string): HourMark[] {
  const day = localDayRange(date, timeZone);
  const length = day.end.getTime() - day.start.getTime();
  const marks: HourMark[] = [];
  for (let elapsed = 0; elapsed < length; elapsed += HOUR_MS) {
    marks.push({
      at: new Date(day.start.getTime() + elapsed),
      offset: elapsed / length,
    });
  }
  return marks;
}

/** How many hours the local day lasts (23, 24 or 25 around DST). */
export function dayLengthHours(date: LocalDate, timeZone: string): number {
  const day = localDayRange(date, timeZone);
  return (day.end.getTime() - day.start.getTime()) / HOUR_MS;
}
