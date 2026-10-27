// The calendar page's views (chunks 4.5, 4.6, 4.10 and 4.11): Agenda, Week,
// Day, By area and Timeline.
// Pure: no server-only imports, so the query, the page, the calendar
// components and the tests share it.
//
// Week and Day are time grids. Their range is whole local days in the
// user's saved zone: a week starts on the user's week start, a day is one
// date. Both hold events (occurrences of repeating ones included), time
// blocks (chunk 4.8) and timed task deadlines, which show as markers.
// Planned tasks and all-day deadlines stay on Today, Upcoming and the Agenda.
//
// By area is one day too, with a column per life area (see area-columns.ts).
// It shows events and time blocks only, so it has its own query.

import type { AgendaTaskFields } from "./agenda";
import {
  type AgendaEntry,
  AGENDA_PATH,
  blockEntry,
  eventEntry,
} from "./agenda";
import type { CalendarEventOccurrence } from "./calendar-events";
import type { TimeBlockOccurrence } from "./time-blocks";
import {
  addDays,
  formatLocalDate,
  isLocalDate,
  type LocalDate,
  localDateOf,
  startOfWeek,
  type WeekStart,
} from "./dates";

export const CALENDAR_VIEWS = [
  "agenda",
  "week",
  "day",
  "areas",
  "timeline",
] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** Each view's tab label. */
export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  agenda: "Agenda",
  week: "Week",
  day: "Day",
  areas: "By area",
  timeline: "Timeline",
};

/**
 * The views over a day or a week named by the view itself: the time grids
 * and By area. The timeline (chunk 4.11) chooses its span in the URL, so it
 * has its own range (see area-timeline.ts).
 */
export type GridView = Exclude<CalendarView, "agenda" | "timeline">;

/** The views FullCalendar draws as time grids. */
export type TimeGridType = Exclude<GridView, "areas">;

/**
 * A grid view's range: `date` is the day the user asked for (the anchor,
 * kept so Day can stand in for Week on a phone), `start`/`end` the local
 * days shown, `end` exclusive.
 */
export type GridRange<View extends GridView = GridView> = {
  view: View;
  date: LocalDate;
  start: LocalDate;
  end: LocalDate;
};

/**
 * How long a timed deadline's marker lasts on the grid, so it has a place
 * in the overlap layout. A deadline itself is an instant.
 */
export const DEADLINE_MARKER_MINUTES = 15;

type SearchParam = string | string[] | undefined;

function firstValue(value: SearchParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The view from the page's `view` search param; anything else is Agenda. */
export function parseCalendarView(params: {
  view?: SearchParam;
}): CalendarView {
  const view = firstValue(params.view);
  return CALENDAR_VIEWS.find((known) => known === view) ?? "agenda";
}

/** The days a grid view shows around `date`: a week, or one day. */
export function gridRange<View extends GridView>(
  view: View,
  date: LocalDate,
  weekStart: WeekStart,
): GridRange<View> {
  const start = view === "week" ? startOfWeek(date, weekStart) : date;
  return { view, date, start, end: addDays(start, view === "week" ? 7 : 1) };
}

/**
 * A grid's range from the page's `date` search param: a missing or
 * malformed date is today.
 */
export function parseGridRange<View extends GridView>(
  view: View,
  params: { date?: SearchParam },
  today: LocalDate,
  weekStart: WeekStart,
): GridRange<View> {
  const date = firstValue(params.date);
  return gridRange(
    view,
    date !== undefined && isLocalDate(date) ? date : today,
    weekStart,
  );
}

/**
 * The page's URL for a grid view around `date`. Today is left out, so
 * "Today" is the plain `?view=week` or `?view=day`.
 */
export function gridHref(
  view: GridView,
  date: LocalDate,
  today: LocalDate,
): string {
  const params = new URLSearchParams({ view });
  if (date !== today) params.set("date", date);
  return `${AGENDA_PATH}?${params.toString()}`;
}

/**
 * The Day view that opens one item's dialog (chunk 4.9): the day it starts
 * on, or today for an item that began before today and is still going,
 * with the item's entry ID in `item`.
 */
export function calendarItemHref(
  entry: Pick<AgendaEntry, "id" | "allDay" | "start">,
  today: LocalDate,
  timeZone: string,
): string {
  const startDay = entry.allDay
    ? entry.start
    : localDateOf(new Date(entry.start), timeZone);
  const day = startDay < today ? today : startDay;
  const params = new URLSearchParams({ view: "day" });
  if (day !== today) params.set("date", day);
  params.set("item", entry.id);
  return `${AGENDA_PATH}?${params.toString()}`;
}

/** The entry ID from the page's `item` search param, if any. */
export function parseCalendarItem(params: {
  item?: SearchParam;
}): string | null {
  const item = firstValue(params.item);
  return item ? item : null;
}

/** The anchor day of the previous (-1) or next (1) week or day. */
export function shiftGridDate(range: GridRange, direction: -1 | 1): LocalDate {
  return addDays(range.date, direction * (range.view === "week" ? 7 : 1));
}

/** True when `date` is one of the range's days. */
export function inGridRange(date: LocalDate, range: GridRange): boolean {
  return date >= range.start && date < range.end;
}

/** The range's days, in order. */
export function gridDays(range: GridRange): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = range.start; day < range.end; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/**
 * "19 Oct 2026 to 25 Oct 2026" for a week, or the full date ("Friday, 23
 * October 2026") for a day.
 */
export function gridRangeLabel(range: GridRange, locale: string): string {
  if (range.view !== "week")
    return formatLocalDate(range.start, locale, "full");
  const last = addDays(range.end, -1);
  return `${formatLocalDate(range.start, locale)} to ${formatLocalDate(last, locale)}`;
}

/**
 * A Week column's short heading, such as "Mon 19" in `en-GB` (the full
 * date goes in its accessible name). Formatted as a calendar date at noon
 * UTC, so no time zone can move it to another day.
 */
export function gridDayShortLabel(date: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * The grid's items for `range`: every event occurrence and time block
 * given, and the timed deadlines of the tasks given that fall on its days in `timeZone`, each a
 * short marker at its time. Plans and all-day deadlines are left out.
 */
export function gridEntries<T extends AgendaTaskFields>(
  events: CalendarEventOccurrence[],
  tasks: T[],
  range: GridRange,
  timeZone: string,
  blocks: TimeBlockOccurrence[] = [],
): AgendaEntry<T>[] {
  const deadlines = tasks.flatMap((task): AgendaEntry<T>[] => {
    if (task.dueAt === null) return [];
    if (!inGridRange(localDateOf(task.dueAt, timeZone), range)) return [];
    const end = new Date(
      task.dueAt.getTime() + DEADLINE_MARKER_MINUTES * 60_000,
    );
    return [
      {
        id: `task:${task.id}:due`,
        title: task.title,
        allDay: false,
        start: task.dueAt.toISOString(),
        end: end.toISOString(),
        order: 1,
        kind: "task",
        task,
        role: "due",
      },
    ];
  });
  return [
    ...events.map((event) => eventEntry(event)),
    ...blocks.map((block) => blockEntry(block)),
    ...deadlines,
  ];
}

/** Where an item button sits on the grid, for arrow-key moves. */
export type GridItemPosition = {
  /**
   * The column it is in: its local day on Week and Day, or any key that
   * sorts in column order (By area's column index, zero-padded).
   */
  day: string;
  /** In the all-day row (before the day's timed items). */
  allDay: boolean;
  /** Its top and left edge on screen. */
  top: number;
  left: number;
};

/** The keys that move between grid items. */
export const GRID_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
] as const;
export type GridKey = (typeof GRID_KEYS)[number];

export function isGridKey(key: string): key is GridKey {
  return (GRID_KEYS as readonly string[]).includes(key);
}

/** Reading order within a day: all-day items, then by time, then left. */
function compareInDay(a: GridItemPosition, b: GridItemPosition): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.top - b.top || a.left - b.left;
}

/**
 * The item a key moves to from `current` (an index into `items`), or null
 * when there is nowhere to go. Up and Down move through the day in reading
 * order; Left and Right move to the nearest-in-time item of the previous or
 * next day that has any; Home and End go to the first and last item of the
 * whole view.
 */
export function gridItemTarget(
  items: GridItemPosition[],
  current: number,
  key: GridKey,
): number | null {
  const from = items[current];
  if (!from) return null;
  const order = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.day.localeCompare(b.item.day) || compareInDay(a.item, b.item),
    );
  const position = order.findIndex(({ index }) => index === current);
  const sameDay = order.filter(({ item }) => item.day === from.day);
  const inDay = sameDay.findIndex(({ index }) => index === current);
  switch (key) {
    case "ArrowUp":
      return sameDay[inDay - 1]?.index ?? null;
    case "ArrowDown":
      return sameDay[inDay + 1]?.index ?? null;
    case "Home":
      return position === 0 ? null : order[0]!.index;
    case "End":
      return position === order.length - 1 ? null : order.at(-1)!.index;
    case "ArrowLeft":
    case "ArrowRight": {
      const days = [...new Set(order.map(({ item }) => item.day))];
      const day = days[days.indexOf(from.day) + (key === "ArrowLeft" ? -1 : 1)];
      if (day === undefined) return null;
      // The item in that day closest to this one's place in its day.
      const candidates = order.filter(({ item }) => item.day === day);
      const nearest = candidates.reduce((best, candidate) =>
        distance(candidate.item, from) < distance(best.item, from)
          ? candidate
          : best,
      );
      return nearest.index;
    }
  }
}

/** How far apart two items sit in their days: all-day rows count as top. */
function distance(a: GridItemPosition, b: GridItemPosition): number {
  if (a.allDay && b.allDay) return 0;
  if (a.allDay !== b.allDay) return Number.MAX_SAFE_INTEGER / 2;
  return Math.abs(a.top - b.top);
}
