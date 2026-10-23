// The repeat builder's rules for calendar events and time blocks: its
// values, the stored RRULE form and a plain-language summary. Pure and
// client-safe, with no `rrule-temporal` import (that library bundles its own
// Temporal polyfill), so the event form can use it. Expansion lives in
// recurrence.ts, which re-exports everything here.
// The rules come from docs/decisions/0012-calendar-recurrence-time-blocks-views.md.

import { z } from "zod";

import { formatLocalDate, isLocalDate, type LocalDate } from "./dates";

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

/** A local date's midnight written as if it were UTC (floating time). */
function floatingInstant(date: LocalDate): Date {
  return new Date(`${date}T00:00:00Z`);
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
