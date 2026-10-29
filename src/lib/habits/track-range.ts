// The Track page's range (chunk 6.5): which whole weeks its history and
// figures cover, and the words for them. Pure: no server-only imports, so
// the query, the page and the tests share one definition. The counting
// itself is the 6.2 engine's (docs/decisions/0014-habit-cadence-logs-
// consistency.md); nothing here recounts.

import { addDays, startOfWeek, type LocalDate, type WeekStart } from "../dates";

import {
  cutToOneDecimal,
  type HabitRange,
  type HabitWeekProgress,
} from "./consistency";
import type { HabitCadenceType, HabitMeasure } from "./habit";

/** The ranges Track offers; the first is the default. */
export const TRACK_RANGES = ["4w", "12w", "week"] as const;
export type TrackRange = (typeof TRACK_RANGES)[number];
export const DEFAULT_TRACK_RANGE: TrackRange = "4w";

/** Each range's tab label, also the figure's label. */
export const TRACK_RANGE_LABELS: Record<TrackRange, string> = {
  "4w": "Last 4 weeks",
  "12w": "Last 12 weeks",
  week: "This week",
};

const WEEKS: Record<TrackRange, number> = { "4w": 4, "12w": 12, week: 1 };

/** The range from the page's `range` search param; anything else is 4w. */
export function parseTrackRange(
  value: string | string[] | undefined,
): TrackRange {
  const raw = Array.isArray(value) ? value[0] : value;
  return TRACK_RANGES.find((range) => range === raw) ?? DEFAULT_TRACK_RANGE;
}

/** The page's URL for a range; the default stays the plain path. */
export function trackHref(range: TrackRange): string {
  return range === DEFAULT_TRACK_RANGE ? "/track" : `/track?range=${range}`;
}

/**
 * The whole user weeks a range covers, the current week last: the last 4
 * or 12 weeks each include the week holding `today`, and "This week" is
 * that week alone. Its later days are in the range but count for nothing.
 */
export function trackRangeDates(
  today: LocalDate,
  weekStart: WeekStart,
  range: TrackRange,
): HabitRange {
  const thisWeek = startOfWeek(today, weekStart);
  const from = addDays(thisWeek, -7 * (WEEKS[range] - 1));
  return { from, to: addDays(thisWeek, 6) };
}

/** The first day of each week of a range, oldest first. */
export function weekStartsOf(range: HabitRange): LocalDate[] {
  const starts: LocalDate[] = [];
  for (let from = range.from; from <= range.to; from = addDays(from, 7)) {
    starts.push(from);
  }
  return starts;
}

const utc = (date: LocalDate) => new Date(`${date}T00:00:00Z`);

/** A range's dates as one span, such as "Oct 12 – Nov 8, 2026". */
export function formatDateSpan(range: HabitRange, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).formatRange(utc(range.from), utc(range.to));
}

/** A week's first day without the year, such as "Oct 26", for row labels. */
export function shortDateLabel(date: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utc(date));
}

/**
 * The week in progress as Track's "This week" shows it: "1 of 3 times so
 * far this week", "2 of 5 days so far this week · 1 skipped", with the
 * days at target for a quantity habit. Never a consistency figure, and with
 * nothing expected this week, no numbers at all.
 */
export function weekProgressFigure(
  progress: Pick<HabitWeekProgress, "done" | "target" | "skipped"> & {
    atTarget?: number;
  },
  cadence: HabitCadenceType,
  measure: HabitMeasure,
): string {
  if (progress.target === 0) {
    return progress.skipped > 0
      ? `Nothing expected this week · ${progress.skipped} skipped`
      : "Nothing expected this week";
  }
  const one = progress.target === 1;
  const noun =
    cadence === "times_per_week"
      ? one
        ? "time"
        : "times"
      : one
        ? "day"
        : "days";
  const parts = [
    `${cutToOneDecimal(progress.done)} of ${progress.target} ${noun} so far this week`,
  ];
  if (measure === "quantity") parts.push(`${progress.atTarget ?? 0} at target`);
  if (progress.skipped > 0) parts.push(`${progress.skipped} skipped`);
  return parts.join(" · ");
}
