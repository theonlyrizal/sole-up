// Pure helpers for changing a repeating series through a scope (ADR 0012).
// No database access: service.ts loads and writes the rows.
//
// - An occurrence is addressed by its original start, the start its rule
//   generates: an instant for a timed series, a local date for an all-day
//   one. Every builder frequency has at most one occurrence a day, so the
//   original start's local date (in the series' zone) names it too.
// - A modified exception is a full snapshot of its occurrence (times,
//   title, description, location, links).
// - "All" and "following" edits apply only the fields the user changed
//   from what the occurrence showed. A change of times moves the series by
//   the same number of days and takes the new time of day and length.
// - The series' exceptions then follow it (`reconcileExceptions`).

import {
  type CalendarEventEditableField,
  type CalendarEventTiming,
  calendarEventTiming,
} from "@/lib/calendar-events";
import {
  addDays,
  daysBetween,
  instantFromLocal,
  localDateOf,
  type LocalDate,
} from "@/lib/dates";
import {
  type AllDaySeries,
  fromRrule,
  occurrenceStartOn,
  seriesStartDate,
  type TimedSeries,
} from "@/lib/recurrence";
import type {
  calendarEventExceptions,
  calendarEvents,
} from "@/server/db/schema";

import type { CreateCalendarEventInput } from "./validation";

export type CalendarEventRow = typeof calendarEvents.$inferSelect;
export type ExceptionRow = typeof calendarEventExceptions.$inferSelect;

/** The columns an edit can write to a series or one-off event. */
export type SeriesColumns = Pick<CalendarEventRow, CalendarEventEditableField>;

/** An exception's columns other than its ID, owner and series. */
export type ExceptionColumns = Omit<
  ExceptionRow,
  "id" | "userId" | "eventId" | "createdAt" | "updatedAt"
>;

/** An occurrence's key: its original start (instant or local date). */
export type OriginalStart = Date | LocalDate;

export const DETAIL_FIELDS = [
  "title",
  "description",
  "location",
  "goalId",
  "lifeAreaId",
] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];
export type Details = Pick<CalendarEventRow, DetailField>;

/** One occurrence's times, in its series' shape; an all-day end is exclusive. */
export type Times =
  | { allDay: false; startAt: Date; endAt: Date }
  | { allDay: true; startDate: LocalDate; endDate: LocalDate };

/** What one occurrence shows. */
export type OccurrenceValues = Details & { times: Times };

/** The form's times, as validation passes them. */
export type When = CreateCalendarEventInput["when"];

/** A rule with one occurrence: how a one-off event expands. */
const ONE_OCCURRENCE = "FREQ=DAILY;COUNT=1";

/** The series in the shape `src/lib/recurrence.ts` takes. */
export function asSeries(row: SeriesColumns): TimedSeries | AllDaySeries {
  const rrule = row.rrule ?? ONE_OCCURRENCE;
  // The shape CHECK guarantees the columns of the row's shape are set.
  return row.allDay
    ? { allDay: true, rrule, startDate: row.startDate!, endDate: row.endDate! }
    : {
        allDay: false,
        rrule,
        startAt: row.startAt!,
        endAt: row.endAt!,
        tz: row.tz!,
      };
}

export function originalStartOf(row: ExceptionRow): OriginalStart {
  // The original CHECK sets exactly one of the two.
  return row.originalStartAt ?? row.originalStartDate!;
}

export function sameOriginalStart(a: OriginalStart, b: OriginalStart): boolean {
  return a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : a === b;
}

/** The local date an original start falls on, in the series' zone. */
export function originalDateOf(
  series: SeriesColumns,
  key: OriginalStart,
): LocalDate {
  return key instanceof Date ? localDateOf(key, series.tz!) : key;
}

/** The rule's start on `date`, or null when it generates none that day. */
export function occurrenceOn(
  series: SeriesColumns,
  date: LocalDate,
): OriginalStart | null {
  const recurring = asSeries(series);
  return recurring.allDay
    ? occurrenceStartOn(recurring, date)
    : occurrenceStartOn(recurring, date);
}

/** True when the series' rule generates an occurrence starting at `key`. */
export function generatesOccurrence(
  series: SeriesColumns,
  key: OriginalStart,
): boolean {
  if (series.allDay === key instanceof Date) return false;
  const start = occurrenceOn(series, originalDateOf(series, key));
  return start !== null && sameOriginalStart(start, key);
}

/** The times the rule gives the occurrence starting at `key`. */
export function generatedTimes(
  series: SeriesColumns,
  key: OriginalStart,
): Times {
  if (key instanceof Date) {
    const duration = series.endAt!.getTime() - series.startAt!.getTime();
    return {
      allDay: false,
      startAt: key,
      endAt: new Date(key.getTime() + duration),
    };
  }
  const days = daysBetween(series.startDate!, series.endDate!);
  return { allDay: true, startDate: key, endDate: addDays(key, days) };
}

export function sameTimes(a: Times, b: Times): boolean {
  if (a.allDay || b.allDay) {
    return (
      a.allDay &&
      b.allDay &&
      a.startDate === b.startDate &&
      a.endDate === b.endDate
    );
  }
  return (
    a.startAt.getTime() === b.startAt.getTime() &&
    a.endAt.getTime() === b.endAt.getTime()
  );
}

export function timesOf(timing: CalendarEventTiming): Times {
  return timing.allDay
    ? { allDay: true, startDate: timing.startDate, endDate: timing.endDate }
    : { allDay: false, startAt: timing.startAt, endAt: timing.endAt };
}

/** Timing columns for `times`, timed ones in zone `tz`. */
export function timingOf(times: Times, tz: string | null): CalendarEventTiming {
  return times.allDay
    ? {
        allDay: true,
        startAt: null,
        endAt: null,
        tz: null,
        startDate: times.startDate,
        endDate: times.endDate,
      }
    : {
        allDay: false,
        startAt: times.startAt,
        endAt: times.endAt,
        tz: tz!,
        startDate: null,
        endDate: null,
      };
}

/** The editable columns of a stored event. */
export function seriesColumnsOf(row: CalendarEventRow): SeriesColumns {
  return {
    ...detailsOf(row),
    allDay: row.allDay,
    startAt: row.startAt,
    endAt: row.endAt,
    tz: row.tz,
    startDate: row.startDate,
    endDate: row.endDate,
    rrule: row.rrule,
  };
}

export function sameValues(a: OccurrenceValues, b: OccurrenceValues): boolean {
  return (
    DETAIL_FIELDS.every((field) => a[field] === b[field]) &&
    sameTimes(a.times, b.times)
  );
}

export function detailsOf(source: Details): Details {
  return {
    title: source.title,
    description: source.description,
    location: source.location,
    goalId: source.goalId,
    lifeAreaId: source.lifeAreaId,
  };
}

/** A modified exception's snapshot. */
function exceptionTimes(row: ExceptionRow): Times {
  return row.originalStartAt
    ? { allDay: false, startAt: row.startAt!, endAt: row.endAt! }
    : { allDay: true, startDate: row.startDate!, endDate: row.endDate! };
}

/**
 * What the occurrence at `key` shows: its modified exception, or the
 * series' values at the generated times. Null when it is cancelled.
 */
export function displayedValues(
  series: SeriesColumns,
  key: OriginalStart,
  exception: ExceptionRow | undefined,
): OccurrenceValues | null {
  if (exception?.kind === "cancelled") return null;
  if (exception) {
    // The override CHECK sets a modified exception's title and times.
    return {
      ...detailsOf({ ...exception, title: exception.title! }),
      times: exceptionTimes(exception),
    };
  }
  return { ...detailsOf(series), times: generatedTimes(series, key) };
}

/** Columns of a cancelled exception at `key`. */
export function cancelledColumns(key: OriginalStart): ExceptionColumns {
  return {
    ...originalColumns(key),
    kind: "cancelled",
    title: null,
    description: null,
    location: null,
    goalId: null,
    lifeAreaId: null,
    startAt: null,
    endAt: null,
    startDate: null,
    endDate: null,
  };
}

/** Columns of a modified exception at `key` showing `values`. */
export function modifiedColumns(
  key: OriginalStart,
  values: OccurrenceValues,
): ExceptionColumns {
  const { times, ...details } = values;
  return {
    ...originalColumns(key),
    kind: "modified",
    ...details,
    startAt: times.allDay ? null : times.startAt,
    endAt: times.allDay ? null : times.endAt,
    startDate: times.allDay ? times.startDate : null,
    endDate: times.allDay ? times.endDate : null,
  };
}

function originalColumns(key: OriginalStart) {
  return key instanceof Date
    ? { originalStartAt: key, originalStartDate: null }
    : { originalStartAt: null, originalStartDate: key };
}

export type SeriesEdit = {
  /** The series' columns after the edit. */
  next: SeriesColumns;
  /** Days every occurrence moves by. */
  shift: number;
  /** Detail fields the user changed from what the occurrence showed. */
  changed: DetailField[];
  /** The occurrence's new times, when the user changed them. */
  times: Times | null;
};

/**
 * A series after an "all events" edit made from one of its occurrences
 * (or, from a base starting at the split occurrence, a "this and
 * following" one). `displayed` is what that occurrence showed; `input`
 * is what the form sent for it.
 *
 * - Only the fields that differ from `displayed` change on the series.
 * - Changed times move the series' first occurrence by the same number of
 *   days as the occurrence moved, at the new time of day and zone, with
 *   the new length (elapsed time, or whole days for all-day).
 * - The rule is the one the form sent; null stops the repeat.
 */
export function seriesAfterEdit(
  base: SeriesColumns,
  displayed: OccurrenceValues,
  input: Details & { when: When; rrule: string | null },
): SeriesEdit {
  const { when, rrule, ...details } = input;
  const changed = DETAIL_FIELDS.filter(
    (field) => details[field] !== displayed[field],
  );
  const next: SeriesColumns = { ...base, rrule };
  for (const field of changed) Object.assign(next, { [field]: details[field] });

  const inputTiming = calendarEventTiming(when);
  const inputTimes = timesOf(inputTiming);
  const timesChanged =
    !sameTimes(inputTimes, displayed.times) ||
    (!when.allDay && !base.allDay && when.tz !== base.tz);
  if (!timesChanged) return { next, shift: 0, changed, times: null };

  const displayedDate = displayed.times.allDay
    ? displayed.times.startDate
    : localDateOf(displayed.times.startAt, base.tz!);
  const shift = daysBetween(displayedDate, when.startDate);
  const startDate = addDays(seriesStartDate(asSeries(base)), shift);
  if (inputTimes.allDay) {
    const days = daysBetween(inputTimes.startDate, inputTimes.endDate);
    Object.assign(next, {
      ...inputTiming,
      startDate,
      endDate: addDays(startDate, days),
    });
  } else if (!when.allDay) {
    const startAt = instantFromLocal(startDate, when.startTime, when.tz);
    const duration = inputTimes.endAt.getTime() - inputTimes.startAt.getTime();
    Object.assign(next, {
      ...inputTiming,
      startAt,
      endAt: new Date(startAt.getTime() + duration),
    });
  }
  return { next, shift, changed, times: inputTimes };
}

/** True when the rule ends on a date before the series' first occurrence. */
export function endsBeforeStart(series: SeriesColumns): boolean {
  if (!series.rrule) return false;
  const end = fromRrule(series.rrule).end;
  return end.type === "until" && end.until < seriesStartDate(asSeries(series));
}

export type Reconciled = {
  /** Exceptions kept, with their new columns (which may be unchanged). */
  kept: { row: ExceptionRow; next: ExceptionColumns }[];
  /** Exceptions the change removes, which the user should be told about. */
  dropped: ExceptionRow[];
  /** Exceptions whose occurrence the old rule no longer generated. */
  stale: ExceptionRow[];
  /**
   * When the repeat stops: the first occurrence's modified exception, whose
   * values become the one-off event's.
   */
  folded: { row: ExceptionRow; values: OccurrenceValues } | null;
};

/**
 * Carries a series' exceptions over a change from `from` to `to`, where
 * every occurrence moved by `shift` days. `edit` is the occurrence the
 * change was made from, whose own exception also takes the change.
 *
 * - An exception moves to the occurrence `shift` days later. It is dropped
 *   when the new rule generates none that day.
 * - A modified exception keeps the values it changed: a field equal to the
 *   old series' takes the new series' value, and times equal to the old
 *   generated ones follow the new generated ones. Times it moved are kept,
 *   unless the series switched between timed and all-day; then it is
 *   dropped.
 * - When the repeat stops (`to.rrule` is null), only the first occurrence
 *   remains: its modified exception is folded into the event, and every
 *   other exception, including a cancelled first occurrence, is dropped.
 */
export function reconcileExceptions({
  from,
  to,
  shift,
  exceptions,
  edit,
}: {
  from: SeriesColumns;
  to: SeriesColumns;
  shift: number;
  exceptions: readonly ExceptionRow[];
  edit?: {
    key: OriginalStart;
    changed: DetailField[];
    input: Details;
    times: Times | null;
  };
}): Reconciled {
  const result: Reconciled = { kept: [], dropped: [], stale: [], folded: null };

  for (const row of exceptions) {
    const key = originalStartOf(row);
    if (!generatesOccurrence(from, key)) {
      result.stale.push(row);
      continue;
    }
    const newKey = occurrenceOn(to, addDays(originalDateOf(from, key), shift));
    if (newKey === null) {
      result.dropped.push(row);
      continue;
    }
    if (row.kind === "cancelled") {
      result.kept.push({ row, next: cancelledColumns(newKey) });
      continue;
    }

    const isEdit = edit !== undefined && sameOriginalStart(edit.key, key);
    const details = detailsOf({ ...row, title: row.title! });
    for (const field of DETAIL_FIELDS) {
      const value =
        isEdit && edit.changed.includes(field)
          ? edit.input[field]
          : details[field] === from[field]
            ? to[field]
            : details[field];
      Object.assign(details, { [field]: value });
    }

    let times = exceptionTimes(row);
    if (isEdit && edit.times) times = edit.times;
    else if (sameTimes(times, generatedTimes(from, key)))
      times = generatedTimes(to, newKey);
    else if (from.allDay !== to.allDay) {
      result.dropped.push(row);
      continue;
    }
    result.kept.push({
      row,
      next: modifiedColumns(newKey, { ...details, times }),
    });
  }

  if (to.rrule === null) {
    for (const { row, next } of result.kept) {
      if (next.kind === "modified" && !result.folded) {
        result.folded = { row, values: valuesOf(next) };
      } else {
        result.dropped.push(row);
      }
    }
    result.kept = [];
  }
  return result;
}

/** A modified exception's columns as occurrence values. */
function valuesOf(columns: ExceptionColumns): OccurrenceValues {
  return {
    ...detailsOf({ ...columns, title: columns.title! }),
    times: columns.originalStartAt
      ? { allDay: false, startAt: columns.startAt!, endAt: columns.endAt! }
      : {
          allDay: true,
          startDate: columns.startDate!,
          endDate: columns.endDate!,
        },
  };
}
