// Recurrence rules for calendar events and time blocks. Pure: no server-only
// imports. The rules come from docs/decisions/0012-calendar-recurrence-time-blocks-views.md.
//
// The builder's values, the stored rule form and the summary are in
// recurrence-rules.ts (client-safe) and re-exported here; this module adds
// expansion, and is the only one that imports `rrule-temporal`, as `dates.ts`
// is for Temporal. The library bundles its own Temporal polyfill and uses a
// global `Temporal` only when one exists; it never installs one, so ADR 0008
// holds.
//
// - A series stores an RRULE value only (no DTSTART), limited to the parts
//   the form's repeat builder produces. `rruleSchema` rejects anything else.
// - `UNTIL` is a local date ("UNTIL=20261220"): the last day, inclusive, on
//   which an occurrence may start, in the series' zone. Every builder
//   frequency has at most one occurrence a day, so a date is enough.
// - Expansion runs in floating time: the library generates local dates and
//   wall-clock times as if in UTC, and each becomes an instant in the series'
//   zone through `instantFromLocal`. An occurrence therefore keeps its local
//   time across DST, and a time that a spring-forward gap skips moves forward
//   ("compatible", ADR 0008) rather than being dropped as RFC 5545 would.
// - The series start is always the first occurrence and counts toward
//   `COUNT`, even when it doesn't match the rule's days.

import { RRuleTemporal } from "rrule-temporal";

import { CALENDAR_RANGE_MAX_DAYS } from "./calendar-events";
import {
  addDays,
  daysBetween,
  instantFromLocal,
  isLocalDate,
  localDateOf,
  localDateTimeOf,
  startOfLocalDay,
  type LocalDate,
} from "./dates";
import {
  fromRrule,
  type Recurrence,
  type RecurrenceFrequency,
  toRrule,
} from "./recurrence-rules";

export * from "./recurrence-rules";

// --- Expansion ---------------------------------------------------------------

/** Whole local days, `localEnd` exclusive, as `eventsBetween` takes them. */
export type RecurrenceRange = {
  localStart: LocalDate;
  localEnd: LocalDate;
  tz: string;
};

/** A timed series row: its first occurrence's instants and its zone. */
export type TimedSeries = {
  allDay: false;
  rrule: string;
  startAt: Date;
  endAt: Date;
  tz: string;
};

/** An all-day series row: its first occurrence's dates, end exclusive. */
export type AllDaySeries = {
  allDay: true;
  rrule: string;
  startDate: LocalDate;
  endDate: LocalDate;
};

/**
 * An occurrence that differs from the rule, keyed by its original start. A
 * modified one may move (a missing end keeps the series' duration from the
 * new start) and carries a `patch` of other fields for the caller.
 */
export type TimedException<P = never> =
  | { kind: "cancelled"; originalStartAt: Date }
  | {
      kind: "modified";
      originalStartAt: Date;
      startAt?: Date;
      endAt?: Date;
      patch?: P;
    };

export type AllDayException<P = never> =
  | { kind: "cancelled"; originalStartDate: LocalDate }
  | {
      kind: "modified";
      originalStartDate: LocalDate;
      startDate?: LocalDate;
      endDate?: LocalDate;
      patch?: P;
    };

export type TimedOccurrence<P = never> = {
  originalStartAt: Date;
  startAt: Date;
  endAt: Date;
  modified: boolean;
  patch: P | null;
};

export type AllDayOccurrence<P = never> = {
  originalStartDate: LocalDate;
  startDate: LocalDate;
  endDate: LocalDate;
  modified: boolean;
  patch: P | null;
};

type LocalStart = { date: LocalDate; time: string };

/** Floating time: a local date and time written as if it were UTC. */
function floating(date: LocalDate, time = "00:00") {
  const value = `${date}T${time}:00+00:00[UTC]`;
  return { timeZoneId: "UTC", toString: () => value };
}

function floatingInstant(date: LocalDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** The local starts a series generates, from `fromDate` to `toDate` inclusive. */
function createGenerator(recurrence: Recurrence, anchor: LocalStart) {
  const byDay =
    recurrence.frequency === "weekly"
      ? recurrence.weekdays
      : recurrence.frequency === "monthly" &&
          recurrence.monthlyOn.type === "weekdayOfMonth"
        ? [`${recurrence.monthlyOn.ordinal}${recurrence.monthlyOn.weekday}`]
        : undefined;
  const byMonthDay =
    recurrence.frequency === "monthly" &&
    recurrence.monthlyOn.type === "dayOfMonth"
      ? [recurrence.monthlyOn.day]
      : undefined;
  const rule = new RRuleTemporal({
    freq: recurrence.frequency.toUpperCase() as Uppercase<RecurrenceFrequency>,
    interval: recurrence.interval,
    dtstart: floating(anchor.date, anchor.time),
    tzid: "UTC",
    includeDtstart: true,
    ...(byDay && { byDay }),
    ...(byMonthDay && { byMonthDay }),
    ...(recurrence.end.type === "count" && { count: recurrence.end.count }),
  });
  const until =
    recurrence.end.type === "until" ? recurrence.end.until : undefined;

  return (fromDate: LocalDate, toDate: LocalDate): LocalStart[] => {
    const last = until !== undefined && until < toDate ? until : toDate;
    if (last < fromDate) return [];
    return rule
      .between(
        floatingInstant(fromDate),
        floatingInstant(addDays(last, 1)),
        true,
      )
      .map((occurrence) => {
        const local = occurrence.toPlainDateTime().toString();
        return { date: local.slice(0, 10), time: local.slice(11, 16) };
      })
      .filter((start) => start.date >= fromDate && start.date <= last);
  };
}

function assertRange(range: RecurrenceRange) {
  if (!isLocalDate(range.localStart) || !isLocalDate(range.localEnd))
    throw new RangeError("Invalid range dates");
  if (range.localEnd <= range.localStart)
    throw new RangeError("The range must end after it starts");
  if (range.localEnd > addDays(range.localStart, CALENDAR_RANGE_MAX_DAYS))
    throw new RangeError(
      `A range spans at most ${CALENDAR_RANGE_MAX_DAYS} days`,
    );
}

/**
 * The occurrences of a series that overlap `range`, in start order. Pure (no
 * database) and bounded: the range spans at most 366 days.
 *
 * - Timed: each occurrence starts at the series' local wall-clock time in its
 *   zone and lasts the series' elapsed duration. It overlaps when it starts
 *   before the range's last instant and ends after its first; touching an
 *   edge is not overlap.
 * - All-day: occurrences are dates, end exclusive, compared by date.
 * - Cancelled exceptions are removed. Modified ones are moved and carry their
 *   patch, including when only the moved occurrence overlaps the range.
 *   Exceptions whose original start the rule doesn't generate are ignored.
 */
export function expandOccurrences<P = never>(
  series: TimedSeries,
  range: RecurrenceRange,
  exceptions?: readonly TimedException<P>[],
): TimedOccurrence<P>[];
export function expandOccurrences<P = never>(
  series: AllDaySeries,
  range: RecurrenceRange,
  exceptions?: readonly AllDayException<P>[],
): AllDayOccurrence<P>[];
export function expandOccurrences<P>(
  series: TimedSeries | AllDaySeries,
  range: RecurrenceRange,
  exceptions: readonly (TimedException<P> | AllDayException<P>)[] = [],
): TimedOccurrence<P>[] | AllDayOccurrence<P>[] {
  assertRange(range);
  return series.allDay
    ? expandAllDay(series, range, exceptions as readonly AllDayException<P>[])
    : expandTimed(series, range, exceptions as readonly TimedException<P>[]);
}

/** A timed series' generator and the instant of each local start it yields. */
function timedGenerator(series: TimedSeries) {
  const anchor = localDateTimeOf(series.startAt, series.tz);
  const generate = createGenerator(fromRrule(series.rrule), anchor);
  // The anchor's own date keeps the stored instant, so a start in the later
  // half of a fall-back overlap is still the first occurrence.
  const toInstant = (start: LocalStart) =>
    start.date === anchor.date
      ? series.startAt
      : instantFromLocal(start.date, start.time, series.tz);
  return { anchor, generate, toInstant };
}

function allDayGenerator(series: AllDaySeries) {
  return createGenerator(fromRrule(series.rrule), {
    date: series.startDate,
    time: "00:00",
  });
}

/** The local date of a series' first occurrence (in its zone, if timed). */
export function seriesStartDate(series: TimedSeries | AllDaySeries): LocalDate {
  return series.allDay
    ? series.startDate
    : localDateOf(series.startAt, series.tz);
}

/**
 * The start of the occurrence the rule generates on local date `date` (in
 * the series' zone), or null when it generates none that day. Every builder
 * frequency has at most one occurrence a day, so a date names one
 * occurrence. Exceptions are not applied.
 */
export function occurrenceStartOn(
  series: TimedSeries,
  date: LocalDate,
): Date | null;
export function occurrenceStartOn(
  series: AllDaySeries,
  date: LocalDate,
): LocalDate | null;
export function occurrenceStartOn(
  series: TimedSeries | AllDaySeries,
  date: LocalDate,
): Date | LocalDate | null {
  if (series.allDay)
    return allDayGenerator(series)(date, date).length > 0 ? date : null;
  const { generate, toInstant } = timedGenerator(series);
  const [start] = generate(date, date);
  return start ? toInstant(start) : null;
}

/**
 * How many occurrences the rule generates before local date `date`. It
 * walks every occurrence from the series start, so use it for rules that
 * end after a count (at most RECURRENCE_COUNT_MAX occurrences).
 */
export function countOccurrencesBefore(
  series: TimedSeries | AllDaySeries,
  date: LocalDate,
): number {
  const first = seriesStartDate(series);
  if (date <= first) return 0;
  const generate = series.allDay
    ? allDayGenerator(series)
    : timedGenerator(series).generate;
  return generate(first, addDays(date, -1)).length;
}

/** The rule ended so that no occurrence starts on or after `date`. */
export function endRuleBefore(rule: string, date: LocalDate): string {
  return toRrule({
    ...fromRrule(rule),
    end: { type: "until", until: addDays(date, -1) },
  });
}

/** The rule ending after `count` occurrences. */
export function ruleWithCount(rule: string, count: number): string {
  return toRrule({ ...fromRrule(rule), end: { type: "count", count } });
}

function expandTimed<P>(
  series: TimedSeries,
  range: RecurrenceRange,
  exceptions: readonly TimedException<P>[],
): TimedOccurrence<P>[] {
  const duration = series.endAt.getTime() - series.startAt.getTime();
  if (!(duration > 0))
    throw new RangeError("A series must end after it starts");
  const { generate, toInstant } = timedGenerator(series);

  const rangeStart = startOfLocalDay(range.localStart, range.tz).getTime();
  const rangeEnd = startOfLocalDay(range.localEnd, range.tz).getTime();
  const overlaps = (occurrence: TimedOccurrence<P>) =>
    occurrence.startAt.getTime() < rangeEnd &&
    occurrence.endAt.getTime() > rangeStart;

  // Series-zone dates that could hold an overlapping start, plus a day of
  // slack on each side.
  const fromDate = addDays(
    localDateOf(new Date(rangeStart - duration), series.tz),
    -1,
  );
  const toDate = addDays(localDateOf(new Date(rangeEnd), series.tz), 1);

  const byOriginalStart = new Map(
    exceptions.map((exception) => [
      exception.originalStartAt.getTime(),
      exception,
    ]),
  );
  const applied = new Set<number>();
  const apply = (
    originalStartAt: Date,
    exception: TimedException<P> | undefined,
  ): TimedOccurrence<P> | null => {
    if (exception?.kind === "cancelled") return null;
    const startAt = exception?.startAt ?? originalStartAt;
    return {
      originalStartAt,
      startAt,
      endAt: exception?.endAt ?? new Date(startAt.getTime() + duration),
      modified: exception !== undefined,
      patch: exception?.patch ?? null,
    };
  };

  const occurrences: TimedOccurrence<P>[] = [];
  for (const start of generate(fromDate, toDate)) {
    const originalStartAt = toInstant(start);
    const key = originalStartAt.getTime();
    applied.add(key);
    const occurrence = apply(originalStartAt, byOriginalStart.get(key));
    if (occurrence && overlaps(occurrence)) occurrences.push(occurrence);
  }

  // Occurrences moved into the range from outside the generated window.
  for (const exception of exceptions) {
    const key = exception.originalStartAt.getTime();
    if (exception.kind !== "modified" || applied.has(key)) continue;
    const occurrence = apply(exception.originalStartAt, exception);
    if (!occurrence || !overlaps(occurrence)) continue;
    const date = localDateOf(exception.originalStartAt, series.tz);
    const generated = generate(date, date).some(
      (start) => toInstant(start).getTime() === key,
    );
    if (generated) occurrences.push(occurrence);
  }

  return occurrences.sort(
    (a, b) =>
      a.startAt.getTime() - b.startAt.getTime() ||
      a.originalStartAt.getTime() - b.originalStartAt.getTime(),
  );
}

function expandAllDay<P>(
  series: AllDaySeries,
  range: RecurrenceRange,
  exceptions: readonly AllDayException<P>[],
): AllDayOccurrence<P>[] {
  const days = daysBetween(series.startDate, series.endDate);
  if (!(days > 0)) throw new RangeError("A series must end after it starts");
  const generate = allDayGenerator(series);
  const overlaps = (occurrence: AllDayOccurrence<P>) =>
    occurrence.startDate < range.localEnd &&
    occurrence.endDate > range.localStart;

  const byOriginalStart = new Map(
    exceptions.map((exception) => [exception.originalStartDate, exception]),
  );
  const applied = new Set<LocalDate>();
  const apply = (
    originalStartDate: LocalDate,
    exception: AllDayException<P> | undefined,
  ): AllDayOccurrence<P> | null => {
    if (exception?.kind === "cancelled") return null;
    const startDate = exception?.startDate ?? originalStartDate;
    return {
      originalStartDate,
      startDate,
      endDate: exception?.endDate ?? addDays(startDate, days),
      modified: exception !== undefined,
      patch: exception?.patch ?? null,
    };
  };

  const occurrences: AllDayOccurrence<P>[] = [];
  const fromDate = addDays(range.localStart, -days);
  const toDate = addDays(range.localEnd, -1);
  for (const { date } of generate(fromDate, toDate)) {
    applied.add(date);
    const occurrence = apply(date, byOriginalStart.get(date));
    if (occurrence && overlaps(occurrence)) occurrences.push(occurrence);
  }

  for (const exception of exceptions) {
    const date = exception.originalStartDate;
    if (exception.kind !== "modified" || applied.has(date)) continue;
    const occurrence = apply(date, exception);
    if (occurrence && overlaps(occurrence) && generate(date, date).length > 0)
      occurrences.push(occurrence);
  }

  return occurrences.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.originalStartDate.localeCompare(b.originalStartDate),
  );
}
