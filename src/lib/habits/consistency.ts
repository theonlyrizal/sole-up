// The habit cadence engine: active days, each day's state for history
// strips, the consistency figure and this week's progress, each with its
// definition. Pure: no server-only imports. Every rule comes from
// docs/decisions/0014-habit-cadence-logs-consistency.md ("Consistency").
// Today, Track, Home and the weekly review call this and never recount.

import {
  addDays,
  dayOfWeek,
  daysBetween,
  startOfWeek,
  type LocalDate,
  type WeekStart,
} from "../dates";
import { WEEK_DAYS } from "../preferences";

import { scheduleForWeek, type HabitCadence } from "./cadence";
import type {
  Habit,
  HabitCadenceType,
  HabitLogStatus,
  HabitMeasure,
} from "./habit";

/** The habit fields the engine reads. */
export type EngineHabit = Pick<
  Habit,
  "measure" | "unit" | "startDate" | "endDate"
>;
/** A schedule row (`HabitSchedule` fits). `target` is set for quantity. */
export type EngineSchedule = HabitCadence & {
  effectiveFrom: LocalDate;
  target: number | null;
};
/** A pause: `startDate` is the first paused day, `endDate` the first active day again. */
export type EnginePause = { startDate: LocalDate; endDate: LocalDate | null };
export type EngineLog = {
  localDate: LocalDate;
  status: HabitLogStatus;
  value: number | null;
};

/** Everything the engine needs for one habit, apart from a range. */
export type HabitWeekInput = {
  habit: EngineHabit;
  schedules: readonly EngineSchedule[];
  pauses: readonly EnginePause[];
  logs: readonly EngineLog[];
  /** The user's local today. */
  today: LocalDate;
  weekStart: WeekStart;
};

/**
 * A range of whole user weeks: `from` is a week's first day and `to` a
 * week's last day, inclusive. `to` the day before `from` is an empty range.
 */
export type HabitRange = { from: LocalDate; to: LocalDate };
export type HabitRangeInput = HabitWeekInput & { range: HabitRange };

/**
 * Whether a date counts as an active day: on or after the start date, on or
 * before the end date, and in no pause (pause ends are exclusive).
 */
export function isActiveDay(
  habit: Pick<EngineHabit, "startDate" | "endDate">,
  pauses: readonly EnginePause[],
  date: LocalDate,
): boolean {
  if (date < habit.startDate) return false;
  if (habit.endDate !== null && date > habit.endDate) return false;
  return !pauses.some(
    (pause) =>
      pause.startDate <= date &&
      (pause.endDate === null || date < pause.endDate),
  );
}

/**
 * A `times_per_week` week's base target: N for a week of 7 active days,
 * otherwise N × active days ÷ 7 rounded to the nearest whole number, halves
 * up. Integers only: `floor((2·N·a + 7) / 14)`.
 */
export function weekTarget(timesPerWeek: number, activeDays: number): number {
  if (!Number.isInteger(timesPerWeek) || !Number.isInteger(activeDays)) {
    throw new RangeError("Times and active days must be integers");
  }
  if (activeDays < 0 || activeDays > 7) {
    throw new RangeError("A week has 0 to 7 active days");
  }
  return Math.floor((2 * timesPerWeek * activeDays + 7) / 14);
}

/**
 * What a day of a habit's history shows:
 * - `inactive`: before the start, after the end, or paused. A log there is
 *   kept and shown but never counted.
 * - `not_scheduled`: a `weekly_days` habit's other weekdays.
 * - `extra`: completed on a day that isn't scheduled. Counted nowhere.
 * - `completed` (with its credit) or `skipped`.
 * - `missed`: a past counted day with no log (`daily`, `weekly_days`).
 * - `unlogged`: a past `times_per_week` day with no log. There is no
 *   per-day Missed for that cadence; the week's count speaks for it.
 * - `today` and `future`: not logged yet.
 */
export const HABIT_DAY_STATES = [
  "inactive",
  "not_scheduled",
  "extra",
  "completed",
  "skipped",
  "missed",
  "unlogged",
  "today",
  "future",
] as const;
export type HabitDayState = (typeof HABIT_DAY_STATES)[number];

/** One day of history. `credit` is 0 to 1, and above 0 only when completed. */
export type HabitDay = {
  date: LocalDate;
  state: HabitDayState;
  credit: number;
  log: EngineLog | null;
};

/** The consistency figure for a range. `atTarget` is set for quantity habits. */
export type HabitConsistency = {
  completed: number;
  expected: number;
  skipped: number;
  atTarget?: number;
  definition: string;
};

/** The week holding today, as progress against its target. */
export type HabitWeekProgress = {
  from: LocalDate;
  to: LocalDate;
  done: number;
  target: number;
  skipped: number;
  atTarget?: number;
  definition: string;
};

/** Each day of a range, for history strips. */
export function habitDays(input: HabitRangeInput): HabitDay[] {
  const logs = logsByDate(input.logs);
  return rangeWeekStarts(input.range, input.weekStart).flatMap((from) => {
    const week = weekFacts(input, from, logs);
    return week.days.map((day) => {
      const state = dayState(day, week.schedule.cadenceType, input.today);
      return {
        date: day.date,
        state,
        credit: state === "completed" ? day.units / week.unitsPerDay : 0,
        log: day.log,
      };
    });
  });
}

/**
 * The consistency figure over a range of whole weeks. Weeks after the one
 * holding today contribute nothing.
 */
export function consistency(input: HabitRangeInput): HabitConsistency {
  const logs = logsByDate(input.logs);
  const weeks = rangeWeekStarts(input.range, input.weekStart)
    .filter((from) => from <= input.today)
    .map((from) => weekFacts(input, from, logs));

  let completed = ZERO;
  let expected = 0;
  let skipped = 0;
  let atTarget = 0;
  for (const week of weeks) {
    const count = countWeek(week, input.today);
    completed = addFraction(completed, count.units, week.unitsPerDay);
    expected += count.expected;
    skipped += count.skipped;
    atTarget += count.atTarget;
  }

  const definitionSchedule =
    weeks.at(-1)?.schedule ?? scheduleOrThrow(input.schedules, input.range.to);
  const definition = definitionText({
    scope: "range",
    habit: input.habit,
    schedule: definitionSchedule,
    weekStart: input.weekStart,
    scheduleChanged: new Set(weeks.map((week) => week.schedule)).size > 1,
  });
  return {
    completed: fractionToNumber(completed),
    expected,
    skipped,
    ...(input.habit.measure === "quantity" ? { atTarget } : {}),
    definition,
  };
}

/**
 * The week holding today against its whole target, for "so far this week".
 * `times_per_week`: done is capped at the week's target (pro-rated, minus
 * skips). `daily`/`weekly_days`: the target is the week's active, scheduled
 * days that aren't skipped, later days included, and done is their credit.
 */
export function weekProgress(input: HabitWeekInput): HabitWeekProgress {
  const from = startOfWeek(input.today, input.weekStart);
  const week = weekFacts(input, from, logsByDate(input.logs));
  const quantity = input.habit.measure === "quantity";

  let target: number;
  let units: number;
  let fullDays: number;
  let skipped: number;
  if (week.schedule.cadenceType === "times_per_week") {
    const tally = timesPerWeekTally(week);
    target = tally.target;
    units = Math.min(tally.units, target * week.unitsPerDay);
    fullDays = Math.min(tally.fullDays, target);
    skipped = tally.skips;
  } else {
    const due = week.days.filter((day) => day.active && day.scheduled);
    const expected = due.filter((day) => day.log?.status !== "skipped");
    target = expected.length;
    units = sum(expected.map((day) => day.units));
    fullDays = expected.filter((day) => day.units === week.unitsPerDay).length;
    skipped = due.length - expected.length;
  }

  return {
    from,
    to: week.to,
    done: units / week.unitsPerDay,
    target,
    skipped,
    ...(quantity ? { atTarget: fullDays } : {}),
    definition: definitionText({
      scope: "week",
      habit: input.habit,
      schedule: week.schedule,
      weekStart: input.weekStart,
      scheduleChanged: false,
    }),
  };
}

/**
 * The figure as shown: "12 of 14 days · 2 skipped", "7 of 9 times",
 * "11.6 of 14 days · 10 at target". Never a percentage. A fractional
 * `completed` is cut (not rounded) to one decimal, and with nothing
 * expected there is no figure.
 */
export function formatConsistency(
  result: Pick<HabitConsistency, "completed" | "expected" | "skipped"> & {
    atTarget?: number;
  },
  cadence: HabitCadenceType,
  measure: HabitMeasure,
): string {
  if (result.expected === 0) return "Nothing expected in this range";
  const noun =
    cadence === "times_per_week"
      ? result.expected === 1
        ? "time"
        : "times"
      : result.expected === 1
        ? "day"
        : "days";
  const parts = [
    `${cutToOneDecimal(result.completed)} of ${result.expected} ${noun}`,
  ];
  if (measure === "quantity") parts.push(`${result.atTarget ?? 0} at target`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  return parts.join(" · ");
}

/**
 * A number cut (not rounded) to one decimal, so a target never looks
 * reached when it wasn't: 13.96 → "13.9", 14 → "14".
 */
export function cutToOneDecimal(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Expected a finite number of at least 0");
  }
  return String(Math.floor(value * 10) / 10);
}

// --- Weeks and days ---------------------------------------------------------

type DayFacts = {
  date: LocalDate;
  active: boolean;
  scheduled: boolean;
  log: EngineLog | null;
  /** Credit in units of `unitsPerDay`: target cents, or 1 for check habits. */
  units: number;
};

type WeekFacts = {
  from: LocalDate;
  to: LocalDate;
  schedule: EngineSchedule;
  unitsPerDay: number;
  days: DayFacts[];
};

/** The first day of each week in a range, checking it is whole weeks. */
function rangeWeekStarts(range: HabitRange, weekStart: WeekStart): LocalDate[] {
  if (startOfWeek(range.from, weekStart) !== range.from) {
    throw new RangeError("A range starts on the first day of a week");
  }
  const days = daysBetween(range.from, range.to) + 1;
  if (days < 0 || days % 7 !== 0) {
    throw new RangeError("A range is whole weeks, ending on a week's last day");
  }
  return Array.from({ length: days / 7 }, (_, i) => addDays(range.from, i * 7));
}

function scheduleOrThrow(
  schedules: readonly EngineSchedule[],
  weekLastDay: LocalDate,
): EngineSchedule {
  const schedule = scheduleForWeek(schedules, weekLastDay);
  if (!schedule) throw new RangeError("A habit always has a schedule");
  return schedule;
}

function logsByDate(logs: readonly EngineLog[]): Map<LocalDate, EngineLog> {
  return new Map(logs.map((log) => [log.localDate, log]));
}

/** Every day uses the schedule of its week. */
function weekFacts(
  input: HabitWeekInput,
  from: LocalDate,
  logs: Map<LocalDate, EngineLog>,
): WeekFacts {
  const to = addDays(from, 6);
  const schedule = scheduleOrThrow(input.schedules, to);
  const unitsPerDay = unitsPerDayOf(input.habit.measure, schedule);
  const days = Array.from({ length: 7 }, (_, i): DayFacts => {
    const date = addDays(from, i);
    const log = logs.get(date) ?? null;
    return {
      date,
      active: isActiveDay(input.habit, input.pauses, date),
      scheduled: isScheduledDay(schedule, date),
      log,
      units: creditUnits(input.habit.measure, log, unitsPerDay),
    };
  });
  return { from, to, schedule, unitsPerDay, days };
}

function isScheduledDay(schedule: HabitCadence, date: LocalDate): boolean {
  return schedule.cadenceType === "weekly_days"
    ? schedule.cadenceConfig.days.includes(dayOfWeek(date))
    : true;
}

/** Amounts in cents, so credit adds up exactly (2 decimal places). */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function unitsPerDayOf(
  measure: HabitMeasure,
  schedule: EngineSchedule,
): number {
  if (measure === "check") return 1;
  if (schedule.target === null || schedule.target <= 0) {
    throw new RangeError("A quantity habit's schedule has a target");
  }
  return toCents(schedule.target);
}

/**
 * A day's credit: 0 without a completed log, all of it for a check habit,
 * and `min(value ÷ target, 1)` for a quantity habit. A completed quantity
 * log always has a value; one without earns nothing rather than a guess.
 */
function creditUnits(
  measure: HabitMeasure,
  log: EngineLog | null,
  unitsPerDay: number,
): number {
  if (log?.status !== "completed") return 0;
  if (measure === "check") return unitsPerDay;
  return log.value === null ? 0 : Math.min(toCents(log.value), unitsPerDay);
}

function dayState(
  day: DayFacts,
  cadence: HabitCadenceType,
  today: LocalDate,
): HabitDayState {
  if (!day.active) return "inactive";
  if (!day.scheduled) {
    return day.log?.status === "completed" ? "extra" : "not_scheduled";
  }
  if (day.log) return day.log.status;
  if (day.date === today) return "today";
  if (day.date > today) return "future";
  return cadence === "times_per_week" ? "unlogged" : "missed";
}

// --- Counting ---------------------------------------------------------------

type WeekCount = {
  expected: number;
  units: number;
  skipped: number;
  atTarget: number;
};

/** One past or current week's share of the consistency figure. */
function countWeek(week: WeekFacts, today: LocalDate): WeekCount {
  return week.schedule.cadenceType === "times_per_week"
    ? countTimesPerWeek(week, today)
    : countDays(week, today);
}

/**
 * `daily`/`weekly_days`: counted days are active, scheduled, not skipped,
 * and before today, or today with a completed log.
 */
function countDays(week: WeekFacts, today: LocalDate): WeekCount {
  const due = week.days.filter((day) => day.active && day.scheduled);
  const counted = due.filter(
    (day) =>
      day.log?.status !== "skipped" &&
      (day.date < today ||
        (day.date === today && day.log?.status === "completed")),
  );
  return {
    expected: counted.length,
    units: sum(counted.map((day) => day.units)),
    skipped: due.filter((day) => day.log?.status === "skipped").length,
    atTarget: counted.filter((day) => day.units === week.unitsPerDay).length,
  };
}

type TimesPerWeekTally = {
  target: number;
  skips: number;
  /** Credit on active days, uncapped. */
  units: number;
  /** Active days with a completed log. */
  loggedDays: number;
  /** Active days whose credit is a whole day. */
  fullDays: number;
};

/**
 * A `times_per_week` week: its base target from the active days (later
 * days this week too, under what is known now), lowered by one per skip.
 */
function timesPerWeekTally(week: WeekFacts): TimesPerWeekTally {
  if (week.schedule.cadenceType !== "times_per_week") {
    throw new TypeError("Not a times_per_week week");
  }
  const active = week.days.filter((day) => day.active);
  const skips = active.filter((day) => day.log?.status === "skipped").length;
  const base = weekTarget(
    week.schedule.cadenceConfig.timesPerWeek,
    active.length,
  );
  return {
    target: Math.max(0, base - skips),
    skips,
    units: sum(active.map((day) => day.units)),
    loggedDays: active.filter((day) => day.log?.status === "completed").length,
    fullDays: active.filter((day) => day.units === week.unitsPerDay).length,
  };
}

/**
 * A past week expects its target and completes `min(done, target)`. The
 * current week expects only the completions logged so far, up to its
 * target, so it never counts against the user before the week ends (a
 * partial quantity day counts with its partial credit, like today in a
 * `daily` habit).
 */
function countTimesPerWeek(week: WeekFacts, today: LocalDate): WeekCount {
  const tally = timesPerWeekTally(week);
  const units = Math.min(tally.units, tally.target * week.unitsPerDay);
  const current = week.to >= today;
  return {
    expected: current ? Math.min(tally.loggedDays, tally.target) : tally.target,
    units,
    skipped: tally.skips,
    atTarget: Math.min(tally.fullDays, tally.target),
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// Credit is summed as an exact fraction: each week's credit is a whole
// number of its own target's cents, and targets differ between weeks after
// a schedule change. Floating point could turn an exact 14 into 13.999…,
// which the one-decimal cut would show as 13.9.
type Fraction = { numerator: bigint; denominator: bigint };
const ZERO: Fraction = { numerator: BigInt(0), denominator: BigInt(1) };

function addFraction(
  total: Fraction,
  numerator: number,
  denominator: number,
): Fraction {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  const sumNumerator = total.numerator * d + n * total.denominator;
  const sumDenominator = total.denominator * d;
  const divisor = gcd(sumNumerator, sumDenominator);
  return {
    numerator: sumNumerator / divisor,
    denominator: sumDenominator / divisor,
  };
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0 ? -a : a;
  let y = b;
  while (y !== BigInt(0)) [x, y] = [y, x % y];
  return x === BigInt(0) ? BigInt(1) : x;
}

/** Reduced first, so a whole or one-decimal total converts exactly. */
function fractionToNumber(fraction: Fraction): number {
  return Number(fraction.numerator) / Number(fraction.denominator);
}

// --- Definition text --------------------------------------------------------

function definitionText(options: {
  scope: "range" | "week";
  habit: EngineHabit;
  schedule: EngineSchedule;
  weekStart: WeekStart;
  scheduleChanged: boolean;
}): string {
  const { scope, habit, schedule, weekStart } = options;
  const sentences: string[] = [];

  if (habit.measure === "quantity") {
    const target = `${amountText(schedule.target ?? 0)}${habit.unit ? ` ${habit.unit}` : ""}`;
    sentences.push(
      `A completed day earns credit of the amount logged ÷ the target of ${target}, up to one full day; more than the target never carries over to another day or week.`,
    );
  } else {
    sentences.push("A day counts as done when it's logged as completed.");
  }

  const weeks = `weeks start on ${WEEK_DAYS[weekStart]}`;
  switch (schedule.cadenceType) {
    case "daily":
      sentences.push("Expected: every active day.");
      break;
    case "weekly_days":
      sentences.push(
        `Expected: ${weekdayList(schedule.cadenceConfig.days, weekStart)} each week. Completions on other days show as extras and aren't counted.`,
      );
      break;
    case "times_per_week": {
      const n = schedule.cadenceConfig.timesPerWeek;
      sentences.push(
        `Expected: ${n} ${n === 1 ? "time" : "times"} a week (${weeks}). A week the habit starts, ends or is paused in expects ${n} × its active days ÷ 7, rounded to the nearest whole number with halves rounded up. Completions above a week's target aren't counted.`,
      );
      break;
    }
  }

  sentences.push(
    schedule.cadenceType === "times_per_week"
      ? "Paused days and days outside the habit's dates aren't counted. Each skipped day lowers its week's target by one and is never a miss."
      : "Paused days, days outside the habit's dates and skipped days aren't counted, and a skip is never a miss.",
  );

  if (scope === "week") {
    sentences.push(
      schedule.cadenceType === "times_per_week"
        ? "This week shows what's done so far against the week's target."
        : "This week shows what's done so far against all of this week's expected days.",
    );
  } else {
    sentences.push(
      schedule.cadenceType === "times_per_week"
        ? "This week counts only the completions logged so far, up to its target, so it doesn't count against you before it ends."
        : "Today counts only once it's logged as completed.",
    );
    if (options.scheduleChanged) {
      sentences.push(
        "Earlier weeks in this range had a different schedule, and each week counts by the schedule it had.",
      );
    }
  }

  return sentences.join(" ");
}

/** Chosen weekdays in week order from the user's week start. */
function weekdayList(days: readonly number[], weekStart: WeekStart): string {
  const names = [...days]
    .sort((a, b) => ((a - weekStart + 7) % 7) - ((b - weekStart + 7) % 7))
    .map((day) => WEEK_DAYS[day]);
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** A target as written: 5, 2.5, 0.25 (at most 2 decimal places). */
function amountText(amount: number): string {
  return String(toCents(amount) / 100);
}
