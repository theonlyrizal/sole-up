// The calendar's "Timeline" view (chunk 4.11): a row per active life area,
// plus "No area", across a day or a week on a horizontal time axis. Our own
// layout, built from scratch like By area (area-columns.ts): FullCalendar's
// resource timeline is premium and not used (ADR 0012).
// Pure: no server-only imports, so the view and the tests share it.
//
// Rows hold the same items as By area's columns (events by their own area,
// time blocks by their task's goal's area). Items are placed by elapsed
// time from the range's first local midnight, so a week with a DST change
// (167 or 169 hours) keeps every item at its real time. All-day events run
// from local midnight to local midnight on the same axis. Items that
// overlap in a row stack in lanes, and the row grows to fit them.

import {
  type AreaGroup,
  type ColumnArea,
  dayHourMarks,
  groupByArea,
  layoutSpan,
  type SpanPlacement,
} from "./area-columns";
import { AGENDA_PATH } from "./agenda";
import {
  type GridItemPosition,
  gridItemTarget,
  type GridKey,
  gridRange,
  gridRangeLabel,
} from "./calendar-views";
import {
  addDays,
  formatLocalDate,
  instantFromLocal,
  isLocalDate,
  type LocalDate,
  startOfLocalDay,
  type WeekStart,
} from "./dates";
import { timeRangeLabel } from "./event-form";
import { type ScheduleEntry, timelineTimeLabel } from "./schedule";

const HOUR_MS = 60 * 60_000;

export const TIMELINE_SPANS = ["day", "week"] as const;
export type TimelineSpan = (typeof TIMELINE_SPANS)[number];

/** The span `?view=timeline` shows: a week, the overview By area lacks. */
export const DEFAULT_TIMELINE_SPAN: TimelineSpan = "week";

/** Each span's switch label. */
export const TIMELINE_SPAN_LABELS: Record<TimelineSpan, string> = {
  day: "Day",
  week: "Week",
};

/**
 * How wide an hour is (in rem) and the least time an item takes up, per
 * span. Both give a short item at least 32 px of width, above the WCAG 2.2
 * target size, so it stays readable and clickable: two short items closer
 * than that stack instead.
 */
export const TIMELINE_SCALE: Record<
  TimelineSpan,
  { hourRem: number; minimumMinutes: number }
> = {
  day: { hourRem: 4, minimumMinutes: 30 },
  week: { hourRem: 1, minimumMinutes: 120 },
};

/**
 * The timeline's range: `date` is the day the user asked for (the anchor),
 * `start`/`end` the local days shown, `end` exclusive. A week starts on the
 * user's week start, as Week does.
 */
export type TimelineRange = {
  span: TimelineSpan;
  date: LocalDate;
  start: LocalDate;
  end: LocalDate;
};

type SearchParam = string | string[] | undefined;

function firstValue(value: SearchParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The days the timeline shows around `date`: its week, or the day. */
export function timelineRange(
  span: TimelineSpan,
  date: LocalDate,
  weekStart: WeekStart,
): TimelineRange {
  const { start, end } = gridRange(span, date, weekStart);
  return { span, date, start, end };
}

/**
 * The range from the page's `span` and `date` search params: a missing or
 * unknown span is a week, a missing or malformed date is today.
 */
export function parseTimelineRange(
  params: { span?: SearchParam; date?: SearchParam },
  today: LocalDate,
  weekStart: WeekStart,
): TimelineRange {
  const span =
    TIMELINE_SPANS.find((known) => known === firstValue(params.span)) ??
    DEFAULT_TIMELINE_SPAN;
  const date = firstValue(params.date);
  return timelineRange(
    span,
    date !== undefined && isLocalDate(date) ? date : today,
    weekStart,
  );
}

/**
 * The page's URL for the timeline around `date`. The default span and
 * today are left out, so this week's timeline is the plain `?view=timeline`.
 */
export function timelineHref(
  span: TimelineSpan,
  date: LocalDate,
  today: LocalDate,
): string {
  const params = new URLSearchParams({ view: "timeline" });
  if (span !== DEFAULT_TIMELINE_SPAN) params.set("span", span);
  if (date !== today) params.set("date", date);
  return `${AGENDA_PATH}?${params.toString()}`;
}

/** The anchor day of the previous (-1) or next (1) week or day. */
export function shiftTimelineDate(
  range: TimelineRange,
  direction: -1 | 1,
): LocalDate {
  return addDays(range.date, direction * (range.span === "week" ? 7 : 1));
}

/** The range as Week or Day would label it. */
export function timelineRangeLabel(
  range: TimelineRange,
  locale: string,
): string {
  return gridRangeLabel({ ...range, view: range.span }, locale);
}

/** The instants the range runs between: its first and end day's midnights. */
export function timelineBounds(
  range: TimelineRange,
  timeZone: string,
): { start: Date; end: Date } {
  return {
    start: startOfLocalDay(range.start, timeZone),
    end: startOfLocalDay(range.end, timeZone),
  };
}

/** How many hours the range lasts (167, 168 or 169 for a week around DST). */
export function timelineLengthHours(
  range: TimelineRange,
  timeZone: string,
): number {
  const { start, end } = timelineBounds(range, timeZone);
  return (end.getTime() - start.getTime()) / HOUR_MS;
}

/** One row of the timeline: an area's items, placed along the range. */
export type TimelineRow = Omit<AreaGroup, "entries"> & {
  items: SpanPlacement[];
  /** How many lanes the row needs: the most items that overlap, at least 1. */
  lanes: number;
};

/**
 * The timeline's rows (`groupByArea`: active areas in the user's order, an
 * archived one only while it holds items, then "No area"), each with its
 * items placed along the range in `timeZone`.
 */
export function timelineRows(
  entries: ScheduleEntry[],
  areas: ColumnArea[],
  range: TimelineRange,
  timeZone: string,
): TimelineRow[] {
  const bounds = timelineBounds(range, timeZone);
  const { minimumMinutes } = TIMELINE_SCALE[range.span];
  return groupByArea(entries, areas).map(({ entries: items, ...group }) => {
    const placed = layoutSpan(items, bounds, minimumMinutes, timeZone);
    return {
      ...group,
      items: placed,
      lanes: Math.max(1, ...placed.map((item) => item.lanes)),
    };
  });
}

/** A line on the time axis. */
export type TimelineTick = {
  /** When it is: an instant whose local time or date labels the line. */
  at: Date;
  /** Its distance from the left, as a fraction of the range. */
  offset: number;
  /**
   * What labels it: "time" (each hour of a day), "day" (each day's
   * midnight in a week), or nothing (a week's 06:00, 12:00 and 18:00).
   */
  label: "time" | "day" | null;
  /** The local day it falls on. */
  day: LocalDate;
};

/**
 * The time axis's lines. A day has one per elapsed hour, labelled with its
 * real local time (so a DST day has 23 or 25). A week has each day's local
 * midnight, labelled with the day, and fainter lines at 06:00, 12:00 and
 * 18:00 local time.
 */
export function timelineTicks(
  range: TimelineRange,
  timeZone: string,
): TimelineTick[] {
  if (range.span === "day") {
    return dayHourMarks(range.start, timeZone).map((mark) => ({
      at: mark.at,
      offset: mark.offset,
      label: "time",
      day: range.start,
    }));
  }
  const { start, end } = timelineBounds(range, timeZone);
  const length = end.getTime() - start.getTime();
  const ticks: TimelineTick[] = [];
  for (let day = range.start; day < range.end; day = addDays(day, 1)) {
    for (const time of ["00:00", "06:00", "12:00", "18:00"]) {
      const at =
        time === "00:00"
          ? startOfLocalDay(day, timeZone)
          : instantFromLocal(day, time, timeZone);
      ticks.push({
        at,
        offset: (at.getTime() - start.getTime()) / length,
        label: time === "00:00" ? "day" : null,
        day,
      });
    }
  }
  return ticks;
}

/**
 * An item's time for its description: "All day" (with its dates on a week
 * or when it spans days), the times on a day ("09:00 – 10:00", both dates
 * when it began on an earlier day), or the day and times on a week ("Tue,
 * 27 Oct, 09:00 – 10:00").
 */
export function timelineItemTimeLabel(
  entry: ScheduleEntry,
  range: TimelineRange,
  locale: string,
  timeZone: string,
): string {
  if (entry.allDay) {
    const last = entry.end === null ? entry.start : addDays(entry.end, -1);
    if (last !== entry.start) {
      return `All day, ${formatLocalDate(entry.start, locale)} to ${formatLocalDate(last, locale)}`;
    }
    return range.span === "day"
      ? "All day"
      : `All day, ${formatLocalDate(entry.start, locale)}`;
  }
  if (range.span === "day") {
    return timelineTimeLabel(entry, range.date, locale, timeZone);
  }
  return timeRangeLabel(
    new Date(entry.start),
    new Date(entry.end ?? entry.start),
    locale,
    timeZone,
    true,
  );
}

/** Where an item button sits on the timeline, for arrow-key moves. */
export type TimelineItemPosition = {
  /** Its row: any key that sorts in row order (the row index, zero-padded). */
  row: string;
  /** Its left and top edge on screen. */
  left: number;
  top: number;
};

/** Each key's meaning with time across and areas down: Week's, turned. */
const TURNED_KEYS: Record<GridKey, GridKey> = {
  ArrowLeft: "ArrowUp",
  ArrowRight: "ArrowDown",
  ArrowUp: "ArrowLeft",
  ArrowDown: "ArrowRight",
  Home: "Home",
  End: "End",
};

/**
 * The item a key moves to from `current` (an index into `items`), or null
 * when there is nowhere to go. Left and Right move through a row in time
 * order; Up and Down move to the nearest-in-time item of the previous or
 * next row that has any; Home and End go to the first and last item. This
 * is Week's rule (`gridItemTarget`) with the axes swapped.
 */
export function timelineItemTarget(
  items: TimelineItemPosition[],
  current: number,
  key: GridKey,
): number | null {
  const turned = items.map((item): GridItemPosition => ({
    day: item.row,
    allDay: false,
    top: item.left,
    left: item.top,
  }));
  return gridItemTarget(turned, current, TURNED_KEYS[key]);
}
