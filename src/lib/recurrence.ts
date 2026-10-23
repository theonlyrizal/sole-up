// Recurrence rules for calendar events and time blocks. Pure: no server-only
// imports. The rules come from docs/decisions/0012-calendar-recurrence-time-blocks-views.md.
//
// The only module that imports `rrule-temporal`, as `dates.ts` is for
// Temporal. The library bundles its own Temporal polyfill and uses a global
// `Temporal` only when one exists; it never installs one, so ADR 0008 holds.
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
import { z } from "zod";

import { CALENDAR_RANGE_MAX_DAYS } from "./calendar-events";
import {
  addDays,
  daysBetween,
  formatLocalDate,
  instantFromLocal,
  isLocalDate,
  localDateOf,
  localDateTimeOf,
  startOfLocalDay,
  type LocalDate,
} from "./dates";

export const RECURRENCE_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/** RFC 5545 weekday codes, Monday first. */
export const RECURRENCE_WEEKDAYS = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
] as const;
export type RecurrenceWeekday = (typeof RECURRENCE_WEEKDAYS)[number];

/** "nth weekday of the month": first to fourth, or -1 for the last. */
export const RECURRENCE_ORDINALS = [1, 2, 3, 4, -1] as const;
export type RecurrenceOrdinal = (typeof RECURRENCE_ORDINALS)[number];

export const RECURRENCE_INTERVAL_MAX = 99;
export const RECURRENCE_COUNT_MAX = 999;
const RRULE_MAX_LENGTH = 200;

export type RecurrenceEnd =
  | { type: "never" }
  | { type: "count"; count: number }
  | { type: "until"; until: LocalDate };

export type MonthlyOn =
  | { type: "dayOfMonth"; day: number }
  | {
      type: "weekdayOfMonth";
      ordinal: RecurrenceOrdinal;
      weekday: RecurrenceWeekday;
    };

/**
 * The repeat builder's values. Yearly repeats on the start's month and day,
 * so it has no fields of its own.
 */
export type Recurrence =
  | { frequency: "daily"; interval: number; end: RecurrenceEnd }
  | {
      frequency: "weekly";
      interval: number;
      weekdays: RecurrenceWeekday[];
      end: RecurrenceEnd;
    }
  | {
      frequency: "monthly";
      interval: number;
      monthlyOn: MonthlyOn;
      end: RecurrenceEnd;
    }
  | { frequency: "yearly"; interval: number; end: RecurrenceEnd };

const intervalSchema = z
  .int("Enter a whole number.")
  .min(1, "Repeat at least every 1.")
  .max(
    RECURRENCE_INTERVAL_MAX,
    `Repeat at most every ${RECURRENCE_INTERVAL_MAX}.`,
  );

const weekdaySchema = z.enum(RECURRENCE_WEEKDAYS, "Choose a day of the week.");

const endSchema = z.discriminatedUnion(
  "type",
  [
    z.strictObject({ type: z.literal("never") }),
    z.strictObject({
      type: z.literal("count"),
      count: z
        .int("Enter a whole number.")
        .min(1, "Repeat at least once.")
        .max(
          RECURRENCE_COUNT_MAX,
          `Repeat at most ${RECURRENCE_COUNT_MAX} times.`,
        ),
    }),
    z.strictObject({
      type: z.literal("until"),
      until: z.string().refine(isLocalDate, "Enter a valid date."),
    }),
  ],
  "Choose when the repeat ends.",
);

const monthlyOnSchema = z.discriminatedUnion(
  "type",
  [
    z.strictObject({
      type: z.literal("dayOfMonth"),
      day: z
        .int("Choose a day of the month.")
        .min(1, "Choose a day of the month.")
        .max(31, "Choose a day of the month."),
    }),
    z.strictObject({
      type: z.literal("weekdayOfMonth"),
      ordinal: z.literal(
        RECURRENCE_ORDINALS,
        "Choose first, second, third, fourth or last.",
      ),
      weekday: weekdaySchema,
    }),
  ],
  "Choose which day of the month.",
);

/** The repeat builder's values, as the form sends them. Weekdays come out sorted Monday first. */
export const recurrenceSchema = z.discriminatedUnion(
  "frequency",
  [
    z.strictObject({
      frequency: z.literal("daily"),
      interval: intervalSchema,
      end: endSchema,
    }),
    z.strictObject({
      frequency: z.literal("weekly"),
      interval: intervalSchema,
      weekdays: z
        .array(weekdaySchema)
        .min(1, "Choose at least one day.")
        .refine(
          (days) => new Set(days).size === days.length,
          "Choose each day once.",
        )
        .transform((days) =>
          RECURRENCE_WEEKDAYS.filter((day) => days.includes(day)),
        ),
      end: endSchema,
    }),
    z.strictObject({
      frequency: z.literal("monthly"),
      interval: intervalSchema,
      monthlyOn: monthlyOnSchema,
      end: endSchema,
    }),
    z.strictObject({
      frequency: z.literal("yearly"),
      interval: intervalSchema,
      end: endSchema,
    }),
  ],
  "Choose how often it repeats.",
) satisfies z.ZodType<Recurrence>;

const FREQ_VALUES: Record<string, RecurrenceFrequency> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
};
const RULE_PARTS = [
  "FREQ",
  "INTERVAL",
  "BYDAY",
  "BYMONTHDAY",
  "COUNT",
  "UNTIL",
] as const;
type RulePart = (typeof RULE_PARTS)[number];

const NUMBER_PATTERN = /^[1-9]\d{0,3}$/;
const WEEKDAY_PATTERN = /^(MO|TU|WE|TH|FR|SA|SU)$/;
const NTH_WEEKDAY_PATTERN = /^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/;
const UNTIL_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;

type ParseResult =
  { success: true; data: Recurrence } | { success: false; error: string };

/** Parses a stored RRULE value into builder values, or says why it can't. */
function parseRrule(value: string): ParseResult {
  const fail = (error: string): ParseResult => ({ success: false, error });
  if (value.length === 0 || value.length > RRULE_MAX_LENGTH)
    return fail("The repeat rule is malformed.");

  const parts = new Map<RulePart, string>();
  for (const part of value.split(";")) {
    const match = /^([A-Z]+)=([A-Z0-9,-]+)$/.exec(part);
    if (!match) return fail("The repeat rule is malformed.");
    const [, key, partValue] = match;
    if (!(RULE_PARTS as readonly string[]).includes(key))
      return fail(`Repeat rules can't use ${key}.`);
    if (parts.has(key as RulePart))
      return fail(`The repeat rule repeats ${key}.`);
    parts.set(key as RulePart, partValue);
  }

  const frequency = FREQ_VALUES[parts.get("FREQ") ?? ""];
  if (!frequency) return fail("Repeat daily, weekly, monthly or yearly.");

  const intervalValue = parts.get("INTERVAL") ?? "1";
  if (!NUMBER_PATTERN.test(intervalValue))
    return fail("The repeat interval must be a whole number.");
  const interval = Number(intervalValue);

  const count = parts.get("COUNT");
  const until = parts.get("UNTIL");
  let end: RecurrenceEnd = { type: "never" };
  if (count !== undefined && until !== undefined)
    return fail(
      "A repeat ends after a number of times or on a date, not both.",
    );
  if (count !== undefined) {
    if (!NUMBER_PATTERN.test(count))
      return fail("The repeat count must be a whole number.");
    end = { type: "count", count: Number(count) };
  } else if (until !== undefined) {
    const match = UNTIL_PATTERN.exec(until);
    if (!match) return fail("The repeat end must be a date.");
    end = { type: "until", until: `${match[1]}-${match[2]}-${match[3]}` };
  }

  const byDay = parts.get("BYDAY");
  const byMonthDay = parts.get("BYMONTHDAY");
  let candidate: unknown;
  switch (frequency) {
    case "daily":
    case "yearly":
      if (byDay !== undefined || byMonthDay !== undefined)
        return fail(`A ${frequency} repeat can't choose days.`);
      candidate = { frequency, interval, end };
      break;
    case "weekly": {
      if (byMonthDay !== undefined)
        return fail("A weekly repeat can't choose a day of the month.");
      if (byDay === undefined)
        return fail("A weekly repeat needs its days of the week.");
      const weekdays = byDay.split(",");
      if (!weekdays.every((day) => WEEKDAY_PATTERN.test(day)))
        return fail("A weekly repeat's days must be plain weekdays.");
      candidate = { frequency, interval, weekdays, end };
      break;
    }
    case "monthly": {
      if ((byDay === undefined) === (byMonthDay === undefined))
        return fail(
          "A monthly repeat needs either a day of the month or a weekday.",
        );
      let monthlyOn: MonthlyOn;
      if (byMonthDay !== undefined) {
        if (!NUMBER_PATTERN.test(byMonthDay))
          return fail("A monthly repeat's day must be a day of the month.");
        monthlyOn = { type: "dayOfMonth", day: Number(byMonthDay) };
      } else {
        const match = NTH_WEEKDAY_PATTERN.exec(byDay!);
        if (!match)
          return fail(
            "A monthly repeat's weekday must be the first to fourth, or last.",
          );
        monthlyOn = {
          type: "weekdayOfMonth",
          ordinal: Number(match[1]) as RecurrenceOrdinal,
          weekday: match[2] as RecurrenceWeekday,
        };
      }
      candidate = { frequency, interval, monthlyOn, end };
      break;
    }
  }

  const parsed = recurrenceSchema.safeParse(candidate);
  if (!parsed.success)
    return fail(
      parsed.error.issues[0]?.message ?? "The repeat rule is invalid.",
    );
  return { success: true, data: parsed.data };
}

/** A stored RRULE value, parsed into builder values. Rejects every part outside the builder subset. */
export const rruleSchema = z
  .string("Choose how often it repeats.")
  .transform((value, context) => {
    const result = parseRrule(value);
    if (!result.success) {
      context.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.data;
  });

/** Builder values from a stored rule. Throws a `RangeError` for a rule outside the subset. */
export function fromRrule(rule: string): Recurrence {
  const result = parseRrule(rule);
  if (!result.success) throw new RangeError(result.error);
  return result.data;
}

/**
 * The stored rule for builder values, in canonical form: FREQ, INTERVAL
 * (omitted when 1), BYDAY or BYMONTHDAY, then COUNT or UNTIL.
 * Throws a `ZodError` for invalid values.
 */
export function toRrule(values: Recurrence): string {
  const recurrence = recurrenceSchema.parse(values);
  const parts = [`FREQ=${recurrence.frequency.toUpperCase()}`];
  if (recurrence.interval !== 1) parts.push(`INTERVAL=${recurrence.interval}`);
  if (recurrence.frequency === "weekly")
    parts.push(`BYDAY=${recurrence.weekdays.join(",")}`);
  if (recurrence.frequency === "monthly") {
    const on = recurrence.monthlyOn;
    parts.push(
      on.type === "dayOfMonth"
        ? `BYMONTHDAY=${on.day}`
        : `BYDAY=${on.ordinal}${on.weekday}`,
    );
  }
  const end = recurrence.end;
  if (end.type === "count") parts.push(`COUNT=${end.count}`);
  if (end.type === "until")
    parts.push(`UNTIL=${end.until.replaceAll("-", "")}`);
  return parts.join(";");
}

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

// --- Summary -----------------------------------------------------------------

const WEEKDAY_SHORT: Record<RecurrenceWeekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};
const WEEKDAY_LONG: Record<RecurrenceWeekday, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};
const ORDINAL_WORDS: Record<RecurrenceOrdinal, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last",
};
const UNITS: Record<RecurrenceFrequency, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

/** "Mon", "Mon and Thu", "Mon, Wed and Fri". */
function joinWords(words: string[]): string {
  return words.length <= 1
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

const ORDINAL_SUFFIXES: Partial<Record<number, string>> = {
  1: "st",
  2: "nd",
  3: "rd",
};

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st … 31st. */
function ordinalNumber(day: number): string {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : (ORDINAL_SUFFIXES[day % 10] ?? "th");
  return `${day}${suffix}`;
}

/**
 * A plain-language summary of a repeat for the form and dialogs, such as
 * "Every 2 weeks on Mon and Thu, until 20 Dec 2026". `start` is the series'
 * first date (yearly repeats fall on its month and day); `locale` formats
 * dates.
 */
export function describeRecurrence(
  rule: Recurrence | string,
  { start, locale }: { start: LocalDate; locale: string },
): string {
  const recurrence = typeof rule === "string" ? fromRrule(rule) : rule;
  const unit = UNITS[recurrence.frequency];
  let text =
    recurrence.interval === 1
      ? `Every ${unit}`
      : `Every ${recurrence.interval} ${unit}s`;

  switch (recurrence.frequency) {
    case "weekly":
      text += ` on ${joinWords(recurrence.weekdays.map((day) => WEEKDAY_SHORT[day]))}`;
      break;
    case "monthly": {
      const on = recurrence.monthlyOn;
      if (on.type === "dayOfMonth") {
        text += ` on the ${ordinalNumber(on.day)}`;
        if (on.day > 28) text += " (not in shorter months)";
      } else {
        text += ` on the ${ORDINAL_WORDS[on.ordinal]} ${WEEKDAY_LONG[on.weekday]}`;
      }
      break;
    }
    case "yearly": {
      const dayAndMonth = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(floatingInstant(start));
      text += ` on ${dayAndMonth}`;
      if (start.slice(5) === "02-29") text += " (leap years only)";
      break;
    }
  }

  const end = recurrence.end;
  if (end.type === "count")
    text += end.count === 1 ? ", once" : `, ${end.count} times`;
  if (end.type === "until")
    text += `, until ${formatLocalDate(end.until, locale)}`;
  return text;
}
