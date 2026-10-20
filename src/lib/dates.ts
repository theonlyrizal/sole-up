import { Temporal } from "temporal-polyfill";

// Date and time-zone helpers. The only module that imports the Temporal
// implementation: Temporal is ES2026, but Node 24 (our runtime) and Safari
// don't ship it yet, so it comes from `temporal-polyfill` (imported, not
// installed as a global). When both ship it, swap the import for the global.
//
// Vocabulary (see docs/decisions/0004-task-hierarchy-and-dates.md):
// - LocalDate: a calendar date with no zone, "YYYY-MM-DD". Matches a
//   Postgres `date` column read in string mode. Changing the user's time zone
//   never rewrites one.
// - Instant: a point in time, a JS `Date`. Persisted as `timestamptz` (UTC).
// - TimeZone: an IANA zone name such as "Europe/Berlin".

/** "YYYY-MM-DD". */
export type LocalDate = string;

/** 0 = Sunday … 6 = Saturday, the same numbering as `Date#getDay()`. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

/** True for a real calendar date in "YYYY-MM-DD" form ("2026-02-30" is not). */
export function isLocalDate(value: string): value is LocalDate {
  if (!LOCAL_DATE_PATTERN.test(value)) return false;
  try {
    Temporal.PlainDate.from(value, { overflow: "reject" });
    return true;
  } catch {
    return false;
  }
}

function parseLocalDate(date: LocalDate): Temporal.PlainDate {
  if (!isLocalDate(date)) throw new RangeError("Invalid local date");
  return Temporal.PlainDate.from(date);
}

function toInstant(instant: Date): Temporal.Instant {
  const ms = instant.getTime();
  if (Number.isNaN(ms)) throw new RangeError("Invalid instant");
  return Temporal.Instant.fromEpochMilliseconds(ms);
}

/**
 * The user's date "today" in `timeZone`. Everything that asks "what is due
 * today" must use this, never the server's clock date or UTC's date.
 * `now` is injectable for tests.
 */
export function todayFor(timeZone: string, now: Date = new Date()): LocalDate {
  return localDateOf(now, timeZone);
}

/** The local calendar date that `instant` falls on in `timeZone`. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  return toInstant(instant)
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
}

/**
 * The local wall-clock date and time of `instant` in `timeZone`, as
 * `{ date: "YYYY-MM-DD", time: "HH:MM" }`.
 */
export function localDateTimeOf(
  instant: Date,
  timeZone: string,
): { date: LocalDate; time: string } {
  const zoned = toInstant(instant).toZonedDateTimeISO(timeZone);
  return {
    date: zoned.toPlainDate().toString(),
    time: zoned.toPlainTime().toString({ smallestUnit: "minute" }),
  };
}

/**
 * The instant at which a local date and wall-clock time ("HH:MM" or
 * "HH:MM:SS") happens in `timeZone`. On DST transitions this follows the
 * ECMAScript "compatible" rule: a time skipped by a spring-forward gap moves
 * forward by the gap's length, and a repeated time in a fall-back overlap
 * resolves to the earlier occurrence.
 */
export function instantFromLocal(
  date: LocalDate,
  time: string,
  timeZone: string,
): Date {
  if (!LOCAL_TIME_PATTERN.test(time))
    throw new RangeError("Invalid local time");
  const zoned = parseLocalDate(date)
    .toPlainDateTime(Temporal.PlainTime.from(time, { overflow: "reject" }))
    .toZonedDateTime(timeZone, { disambiguation: "compatible" });
  return new Date(zoned.epochMilliseconds);
}

/**
 * The first instant of a local date in `timeZone`. Usually midnight, but not
 * in zones whose DST change skips midnight (the day then starts at 01:00).
 */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const zoned = parseLocalDate(date).toZonedDateTime({ timeZone });
  return new Date(zoned.epochMilliseconds);
}

/**
 * The half-open instant range `[start, end)` covered by a local date in
 * `timeZone`. Its length is 23, 24 or 25 hours depending on DST.
 */
export function localDayRange(
  date: LocalDate,
  timeZone: string,
): { start: Date; end: Date } {
  return {
    start: startOfLocalDay(date, timeZone),
    end: startOfLocalDay(addDays(date, 1), timeZone),
  };
}

/** `date` plus `days` calendar days (negative to go back). */
export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) throw new RangeError("Days must be an integer");
  return parseLocalDate(date).add({ days }).toString();
}

/** Day of the week of a local date: 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: LocalDate): WeekStart {
  // Temporal numbers Monday 1 … Sunday 7.
  return (parseLocalDate(date).dayOfWeek % 7) as WeekStart;
}

/** The first day of the week containing `date`, for a user's week start. */
export function startOfWeek(date: LocalDate, weekStart: WeekStart): LocalDate {
  const offset = (dayOfWeek(date) - weekStart + 7) % 7;
  return addDays(date, -offset);
}
