// The event dialog's values (chunk 4.4) and the rules that keep them
// consistent while the user types. Pure and client-safe: no server-only
// imports, and no `rrule-temporal` (the builder's rules come from
// recurrence-rules.ts). The rules come from
// docs/decisions/0012-calendar-recurrence-time-blocks-views.md.
//
// - Times are wall-clock values in the event's zone, as the server takes
//   them. All-day events show an inclusive end date; the server stores the
//   exclusive end.
// - Moving the start keeps the event's length (60 minutes for a new one).
// - The repeat builder's fields are strings while being edited and become a
//   stored rule only on save, with an error per field.

import type { CalendarEventOccurrence } from "./calendar-events";
import {
  addDays,
  dayOfWeek,
  daysBetween,
  instantFromLocal,
  isLocalDate,
  localDateOf,
  localDateTimeOf,
  type LocalDate,
} from "./dates";
import {
  describeRecurrence,
  fromRrule,
  type MonthlyOn,
  type Recurrence,
  type RecurrenceFrequency,
  type RecurrenceOrdinal,
  type RecurrenceWeekday,
  RECURRENCE_WEEKDAYS,
  recurrenceSchema,
  toRrule,
} from "./recurrence-rules";

/** A new event's length, and the length kept when an event has none. */
export const DEFAULT_EVENT_DURATION_MINUTES = 60;

/** New events remind 10 minutes before by default (ADR 0013). */
export const NEW_EVENT_REMINDER = "10";

/** Times a timed event falls back to when it was all-day. */
const DEFAULT_START_TIME = "09:00";

export type RepeatFrequency = "none" | RecurrenceFrequency;
export type RepeatEnds = "never" | "count" | "until";

/** The repeat builder's fields, as the form holds them. */
export type RepeatValues = {
  frequency: RepeatFrequency;
  interval: string;
  weekdays: RecurrenceWeekday[];
  monthlyOn: MonthlyOn;
  ends: RepeatEnds;
  count: string;
  until: string;
};

/** Builder fields that can show their own error. */
export type RepeatField =
  "frequency" | "interval" | "weekdays" | "monthlyOn" | "count" | "until";
export type RepeatErrors = Partial<Record<RepeatField, string[]>>;

export type EventFormValues = {
  title: string;
  allDay: boolean;
  startDate: LocalDate;
  startTime: string;
  /** Inclusive for an all-day event. */
  endDate: LocalDate;
  endTime: string;
  /** The zone the times are in. Kept while all-day, for switching back. */
  tz: string;
  location: string;
  description: string;
  goalId: string;
  lifeAreaId: string;
  repeat: RepeatValues;
  /**
   * Minutes before the start to remind, as the select holds it ("" for
   * none). A series has one setting for every occurrence (ADR 0013).
   */
  reminder: string;
};

// --- Wall-clock arithmetic ----------------------------------------------------

/** Minutes since 1970 of a local date and time read as if in UTC. */
function floatingMinutes(date: LocalDate, time: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year!, month! - 1, day!, hour, minute) / 60_000;
}

function fromFloatingMinutes(minutes: number): {
  date: LocalDate;
  time: string;
} {
  const iso = new Date(minutes * 60_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Monday-first weekday code of a local date. */
export function weekdayOf(date: LocalDate): RecurrenceWeekday {
  return RECURRENCE_WEEKDAYS[(dayOfWeek(date) + 6) % 7]!;
}

function daysInMonth(date: LocalDate): number {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month!, 0)).getUTCDate();
}

/** True when no later date in the month has the same weekday. */
function isLastWeekdayOfMonth(date: LocalDate): boolean {
  return Number(date.slice(8)) + 7 > daysInMonth(date);
}

// --- Defaults and loading -----------------------------------------------------

/** A builder that doesn't repeat, with its options set from the start date. */
export function defaultRepeat(startDate: LocalDate): RepeatValues {
  return {
    frequency: "none",
    interval: "1",
    weekdays: [weekdayOf(startDate)],
    monthlyOn: { type: "dayOfMonth", day: Number(startDate.slice(8)) },
    ends: "never",
    count: "10",
    until: "",
  };
}

/** The builder's fields for a stored rule (or none). */
export function repeatFromRule(
  rule: string | null,
  startDate: LocalDate,
): RepeatValues {
  const base = defaultRepeat(startDate);
  if (!rule) return base;
  const recurrence = fromRrule(rule);
  const end = recurrence.end;
  return {
    ...base,
    frequency: recurrence.frequency,
    interval: String(recurrence.interval),
    ...(recurrence.frequency === "weekly" && {
      weekdays: recurrence.weekdays,
    }),
    ...(recurrence.frequency === "monthly" && {
      monthlyOn: recurrence.monthlyOn,
    }),
    ends: end.type,
    ...(end.type === "count" && { count: String(end.count) }),
    ...(end.type === "until" && { until: end.until }),
  };
}

/**
 * A new timed event in the user's zone: starting at the next whole hour of
 * their day and lasting DEFAULT_EVENT_DURATION_MINUTES.
 */
export function newEventValues(now: Date, timeZone: string): EventFormValues {
  const local = localDateTimeOf(now, timeZone);
  const hour = floatingMinutes(local.date, `${local.time.slice(0, 2)}:00`);
  const start = fromFloatingMinutes(hour + 60);
  const end = fromFloatingMinutes(hour + 60 + DEFAULT_EVENT_DURATION_MINUTES);
  return {
    title: "",
    allDay: false,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    tz: timeZone,
    location: "",
    description: "",
    goalId: "",
    lifeAreaId: "",
    repeat: defaultRepeat(start.date),
    reminder: NEW_EVENT_REMINDER,
  };
}

/**
 * The form's values for an event or one occurrence of a series, as it
 * shows them: a timed one in its own zone, an all-day one with its
 * inclusive end date.
 */
export function eventFormValuesOf(
  event: CalendarEventOccurrence,
  userTimeZone: string,
): EventFormValues {
  const details = {
    title: event.title,
    location: event.location ?? "",
    description: event.description ?? "",
    goalId: event.goalId ?? "",
    lifeAreaId: event.lifeAreaId ?? "",
    reminder: event.reminderOffsetMinutes?.toString() ?? "",
  };
  if (event.allDay) {
    const end = fromFloatingMinutes(
      floatingMinutes(event.startDate, DEFAULT_START_TIME) +
        DEFAULT_EVENT_DURATION_MINUTES,
    );
    return {
      ...details,
      allDay: true,
      startDate: event.startDate,
      startTime: DEFAULT_START_TIME,
      endDate: addDays(event.endDate, -1),
      endTime: end.time,
      tz: userTimeZone,
      repeat: repeatFromRule(event.rrule, event.startDate),
    };
  }
  const start = localDateTimeOf(event.startAt, event.tz);
  const end = localDateTimeOf(event.endAt, event.tz);
  return {
    ...details,
    allDay: false,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    tz: event.tz,
    repeat: repeatFromRule(event.rrule, start.date),
  };
}

// --- Changing the start -------------------------------------------------------

/**
 * The repeat after the start moves from `from` to `to`, so it still
 * includes the new start: a weekly repeat swaps the old start's weekday
 * for the new one, and a monthly one takes the new day of the month or
 * weekday, in the same form (the last weekday stays last when it can).
 */
export function repeatForNewStart(
  repeat: RepeatValues,
  from: LocalDate,
  to: LocalDate,
): RepeatValues {
  if (from === to || !isLocalDate(from) || !isLocalDate(to)) return repeat;
  const oldDay = weekdayOf(from);
  const newDay = weekdayOf(to);
  const weekdays =
    repeat.weekdays.includes(oldDay) && !repeat.weekdays.includes(newDay)
      ? RECURRENCE_WEEKDAYS.filter(
          (day) =>
            day === newDay || (day !== oldDay && repeat.weekdays.includes(day)),
        )
      : repeat.weekdays;

  let monthlyOn: MonthlyOn;
  if (repeat.monthlyOn.type === "dayOfMonth") {
    monthlyOn = { type: "dayOfMonth", day: Number(to.slice(8)) };
  } else {
    const nth = Math.ceil(Number(to.slice(8)) / 7);
    const ordinal: RecurrenceOrdinal =
      (repeat.monthlyOn.ordinal === -1 && isLastWeekdayOfMonth(to)) || nth > 4
        ? -1
        : (nth as RecurrenceOrdinal);
    monthlyOn = { type: "weekdayOfMonth", ordinal, weekday: newDay };
  }
  return { ...repeat, weekdays, monthlyOn };
}

/**
 * The values with a new start date and/or time, keeping the event's length:
 * its minutes when timed (60 when it had none), its days when all-day.
 */
export function withStart(
  values: EventFormValues,
  start: { startDate?: string; startTime?: string },
): EventFormValues {
  const startDate = start.startDate ?? values.startDate;
  const startTime = start.startTime ?? values.startTime;
  const next = { ...values, startDate, startTime };
  if (!isLocalDate(startDate)) return next;
  next.repeat = repeatForNewStart(values.repeat, values.startDate, startDate);

  const valid =
    isLocalDate(values.startDate) &&
    isLocalDate(values.endDate) &&
    isTime(values.startTime) &&
    isTime(values.endTime);
  if (values.allDay) {
    const days =
      isLocalDate(values.startDate) && isLocalDate(values.endDate)
        ? Math.max(daysBetween(values.startDate, values.endDate), 0)
        : 0;
    next.endDate = addDays(startDate, days);
    return next;
  }
  if (!isTime(startTime)) return next;
  const length = valid
    ? floatingMinutes(values.endDate, values.endTime) -
      floatingMinutes(values.startDate, values.startTime)
    : 0;
  const end = fromFloatingMinutes(
    floatingMinutes(startDate, startTime) +
      (length > 0 ? length : DEFAULT_EVENT_DURATION_MINUTES),
  );
  next.endDate = end.date;
  next.endTime = end.time;
  return next;
}

/**
 * The values switched to all-day or back. To all-day: the dates stay, but
 * a timed end at midnight ends the day before (23:00–00:00 is one day).
 * Back to timed: the kept times return, and an end that is no longer after
 * the start becomes the start plus the default length.
 */
export function withAllDay(
  values: EventFormValues,
  allDay: boolean,
): EventFormValues {
  if (allDay === values.allDay) return values;
  const next = { ...values, allDay };
  if (!isLocalDate(values.startDate) || !isLocalDate(values.endDate))
    return next;
  if (allDay) {
    let endDate = values.endDate;
    if (values.endTime === "00:00" && endDate > values.startDate)
      endDate = addDays(endDate, -1);
    next.endDate = endDate < values.startDate ? values.startDate : endDate;
    return next;
  }
  if (!isTime(values.startTime) || !isTime(values.endTime)) return next;
  const start = floatingMinutes(values.startDate, values.startTime);
  if (floatingMinutes(values.endDate, values.endTime) <= start) {
    const end = fromFloatingMinutes(start + DEFAULT_EVENT_DURATION_MINUTES);
    next.endDate = end.date;
    next.endTime = end.time;
  }
  return next;
}

// --- The repeat builder ---------------------------------------------------------

/** "On day 23", "On the fourth Friday", "On the last Friday". */
export function monthlyOnLabel(on: MonthlyOn): string {
  if (on.type === "dayOfMonth") return `On day ${on.day}`;
  const ordinal = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    [-1]: "last",
  }[on.ordinal];
  const weekday = {
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
    SU: "Sunday",
  }[on.weekday];
  return `On the ${ordinal} ${weekday}`;
}

/** A stable key for a monthly option (radio values). */
export function monthlyOnKey(on: MonthlyOn): string {
  return on.type === "dayOfMonth"
    ? `day:${on.day}`
    : `weekday:${on.ordinal}${on.weekday}`;
}

/**
 * The monthly choices for a start date: its day of the month, its nth
 * weekday (first to fourth) and, in the month's last week, the last
 * weekday. A current choice that isn't among them is kept first.
 */
export function monthlyOptions(
  startDate: LocalDate,
  current: MonthlyOn,
): MonthlyOn[] {
  if (!isLocalDate(startDate)) return [current];
  const day = Number(startDate.slice(8));
  const weekday = weekdayOf(startDate);
  const nth = Math.ceil(day / 7);
  const options: MonthlyOn[] = [{ type: "dayOfMonth", day }];
  if (nth <= 4)
    options.push({
      type: "weekdayOfMonth",
      ordinal: nth as RecurrenceOrdinal,
      weekday,
    });
  if (isLastWeekdayOfMonth(startDate))
    options.push({ type: "weekdayOfMonth", ordinal: -1, weekday });
  const key = monthlyOnKey(current);
  return options.some((option) => monthlyOnKey(option) === key)
    ? options
    : [current, ...options];
}

/** "day", "week", … for the "Every [n] …" label. */
export const REPEAT_UNITS: Record<RecurrenceFrequency, [string, string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  yearly: ["year", "years"],
};

const WHOLE_NUMBER = /^\d+$/;

function toNumber(value: string): number {
  return WHOLE_NUMBER.test(value.trim()) ? Number(value.trim()) : Number.NaN;
}

function repeatFieldOf(path: readonly PropertyKey[]): RepeatField {
  const [first, second] = path;
  if (first === "interval") return "interval";
  if (first === "weekdays") return "weekdays";
  if (first === "monthlyOn") return "monthlyOn";
  if (first === "end") return second === "until" ? "until" : "count";
  return "frequency";
}

export type ReadRepeatResult =
  | { ok: true; rrule: string | null; recurrence: Recurrence | null }
  | { ok: false; errors: RepeatErrors };

/**
 * The stored rule for the builder's fields, or an error for each field
 * that is wrong. A repeat that ends on a date must end on or after
 * `startDate` (the server checks this too).
 */
export function readRepeat(
  repeat: RepeatValues,
  startDate: string,
): ReadRepeatResult {
  if (repeat.frequency === "none")
    return { ok: true, rrule: null, recurrence: null };

  const end =
    repeat.ends === "count"
      ? { type: "count", count: toNumber(repeat.count) }
      : repeat.ends === "until"
        ? { type: "until", until: repeat.until.trim() }
        : { type: "never" };
  const candidate = {
    frequency: repeat.frequency,
    interval: toNumber(repeat.interval),
    end,
    ...(repeat.frequency === "weekly" && { weekdays: repeat.weekdays }),
    ...(repeat.frequency === "monthly" && { monthlyOn: repeat.monthlyOn }),
  };

  const errors: RepeatErrors = {};
  const add = (field: RepeatField, message: string) => {
    const list = (errors[field] ??= []);
    if (!list.includes(message)) list.push(message);
  };
  const parsed = recurrenceSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      add(repeatFieldOf(issue.path), issue.message);
  } else if (
    parsed.data.end.type === "until" &&
    isLocalDate(startDate) &&
    parsed.data.end.until < startDate
  ) {
    add("until", "End the repeat on or after the start date.");
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const recurrence = parsed.data!;
  return { ok: true, rrule: toRrule(recurrence), recurrence };
}

/** The builder's plain-language summary, or null while it has errors. */
export function repeatSummary(
  repeat: RepeatValues,
  startDate: string,
  locale: string,
): string | null {
  if (!isLocalDate(startDate)) return null;
  const result = readRepeat(repeat, startDate);
  if (!result.ok) return null;
  if (!result.recurrence) return "Does not repeat";
  return describeRecurrence(result.recurrence, { start: startDate, locale });
}

// --- Saving -------------------------------------------------------------------

/** The fields the event actions take, without the rule. */
export type EventPayload = {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  tz: string | null;
  goalId: string | null;
  lifeAreaId: string | null;
  /** All-day events never remind, so they send none. */
  reminderOffsetMinutes: string | null;
};

export function eventPayload(values: EventFormValues): EventPayload {
  return {
    title: values.title,
    description: values.description,
    location: values.location,
    allDay: values.allDay,
    startDate: values.startDate,
    startTime: values.allDay ? null : values.startTime,
    endDate: values.endDate,
    endTime: values.allDay ? null : values.endTime,
    tz: values.allDay ? null : values.tz,
    goalId: values.goalId || null,
    lifeAreaId: values.lifeAreaId || null,
    reminderOffsetMinutes: values.allDay ? null : values.reminder,
  };
}

/**
 * Why "this event" can't take the change, or null when it can. One
 * occurrence keeps its series' shape, zone and rule (ADR 0012), and its
 * series' reminder (ADR 0013).
 */
export function thisEventBlocker(
  initial: EventFormValues,
  values: EventFormValues,
  repeatChanged: boolean,
): string | null {
  if (initial.allDay !== values.allDay)
    return "Switching between all-day and timed applies to more than one event.";
  if (!values.allDay && initial.tz !== values.tz)
    return "A new time zone applies to more than one event.";
  if (repeatChanged) return "A new repeat applies to more than one event.";
  if (initial.reminder !== values.reminder)
    return "A reminder applies to every event in the series.";
  return null;
}

// --- Display --------------------------------------------------------------------

/**
 * When a timed event's zone isn't the user's: its times in the user's zone,
 * such as "Tue, 4 Nov, 23:00 – 00:00". Null otherwise, or while the times
 * are incomplete.
 */
export function timesInZone(
  values: Pick<
    EventFormValues,
    "allDay" | "startDate" | "startTime" | "endDate" | "endTime" | "tz"
  >,
  userTimeZone: string,
  locale: string,
): string | null {
  if (values.allDay || values.tz === userTimeZone) return null;
  if (
    !isLocalDate(values.startDate) ||
    !isLocalDate(values.endDate) ||
    !isTime(values.startTime) ||
    !isTime(values.endTime)
  )
    return null;
  try {
    const start = instantFromLocal(
      values.startDate,
      values.startTime,
      values.tz,
    );
    const end = instantFromLocal(values.endDate, values.endTime, values.tz);
    return timeRangeLabel(start, end, locale, userTimeZone, true);
  } catch {
    return null;
  }
}

/**
 * A timed span in `timeZone`: "09:00 – 10:00", with the dates when asked
 * or when it ends on a later day ("Tue, 4 Nov, 23:00 – Wed, 5 Nov, 01:00").
 */
export function timeRangeLabel(
  start: Date,
  end: Date,
  locale: string,
  timeZone: string,
  withDate = false,
): string {
  const time = new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
    timeZone,
  });
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  });
  const dateTime = (instant: Date) =>
    `${date.format(instant)}, ${time.format(instant)}`;
  const sameDay = localDateOf(start, timeZone) === localDateOf(end, timeZone);
  if (sameDay)
    return withDate
      ? `${dateTime(start)} – ${time.format(end)}`
      : `${time.format(start)} – ${time.format(end)}`;
  return `${withDate ? dateTime(start) : time.format(start)} – ${dateTime(end)}`;
}
