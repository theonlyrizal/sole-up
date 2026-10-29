// Habit log rules and the words Today and the history strip use for them
// (chunk 6.4). Pure: no server-only imports. The rules come from
// docs/decisions/0014-habit-cadence-logs-consistency.md ("Logs").

import {
  addDays,
  dayOfWeek,
  startOfWeek,
  type LocalDate,
  type WeekStart,
} from "../dates";

import { scheduleForWeek } from "./cadence";
import {
  cutToOneDecimal,
  isActiveDay,
  weekProgress,
  type HabitDay,
  type HabitDayState,
  type HabitWeekInput,
} from "./consistency";
import type { HabitLogStatus, HabitMeasure, HabitStatus } from "./habit";

/** A log as the UI and the undo toast hold it. */
export type HabitLogValue = { status: HabitLogStatus; value: number | null };

export const VALUE_REQUIRED = "Enter the amount you did.";
export const CHECK_HAS_NO_VALUE = "Only quantity habits take an amount.";
export const SKIP_HAS_NO_VALUE = "A skip has no amount.";
export const FUTURE_DAY = "You can't log a day that hasn't come yet.";
export const INACTIVE_DAY =
  "This day doesn't count for the habit: it's before its start, after its end, or paused.";

/**
 * Why a log's `value` doesn't fit, or null when it does: required on a
 * completed quantity log, refused on a skip and on every check log.
 */
export function logValueProblem(
  measure: HabitMeasure,
  { status, value }: HabitLogValue,
): string | null {
  if (status === "skipped") return value === null ? null : SKIP_HAS_NO_VALUE;
  if (measure === "check") return value === null ? null : CHECK_HAS_NO_VALUE;
  return value === null ? VALUE_REQUIRED : null;
}

/** The fields a correction changes, in a fixed order; empty for none. */
export function changedLogFields(
  from: HabitLogValue,
  to: HabitLogValue,
): ("status" | "value")[] {
  return [
    from.status !== to.status && ("status" as const),
    from.value !== to.value && ("value" as const),
  ].filter((field) => field !== false);
}

/**
 * Whether a habit has a row on Today (chunk 6.4): any habit logged today
 * that isn't archived, and otherwise an active habit on an active day when
 * today is scheduled (`weekly_days`) or the week's target isn't met yet
 * (`times_per_week`). `daily` habits show on every active day.
 */
export function showsOnToday(
  status: HabitStatus,
  input: HabitWeekInput,
): boolean {
  if (status === "archived") return false;
  if (input.logs.some((log) => log.localDate === input.today)) return true;
  if (status !== "active") return false;
  if (!isActiveDay(input.habit, input.pauses, input.today)) return false;

  const weekLastDay = addDays(startOfWeek(input.today, input.weekStart), 6);
  const schedule = scheduleForWeek(input.schedules, weekLastDay);
  if (!schedule) return false;
  switch (schedule.cadenceType) {
    case "daily":
      return true;
    case "weekly_days":
      return schedule.cadenceConfig.days.includes(dayOfWeek(input.today));
    case "times_per_week": {
      const progress = weekProgress(input);
      return progress.done < progress.target;
    }
  }
}

/** "1 of 3 so far this week", from `weekProgress`. */
export function weekProgressLabel(progress: {
  done: number;
  target: number;
}): string {
  return `${cutToOneDecimal(progress.done)} of ${progress.target} so far this week`;
}

const formatNumber = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);

/** An amount with its unit, such as "1.5 km", in the user's locale. */
export function formatAmount(
  value: number,
  unit: string,
  locale: string,
): string {
  return `${formatNumber(value, locale)} ${unit}`;
}

/** What a log says about itself: "Done", "Skipped", "5 of 8 glasses". */
export function describeLog(
  log: HabitLogValue,
  habit: { measure: HabitMeasure; unit: string | null },
  target: number | null,
  locale: string,
): string {
  if (log.status === "skipped") return "Skipped";
  if (habit.measure === "check" || log.value === null || !habit.unit) {
    return "Done";
  }
  return target === null
    ? formatAmount(log.value, habit.unit, locale)
    : `${formatNumber(log.value, locale)} of ${formatAmount(target, habit.unit, locale)}`;
}

const DAY_STATE_LABELS: Record<HabitDayState, string> = {
  inactive: "Not active",
  not_scheduled: "Not scheduled",
  extra: "Extra, not counted",
  completed: "Done",
  skipped: "Skipped",
  missed: "Missed",
  unlogged: "Not logged",
  today: "Today, not logged yet",
  future: "Coming up",
};

/**
 * A history day in words, for its accessible name and tooltip: the state,
 * and the log where the state alone doesn't say it (an amount, a log kept
 * on a day that no longer counts).
 */
export function habitDayLabel(
  day: { state: HabitDayState; log: HabitLogValue | null },
  habit: { measure: HabitMeasure; unit: string | null },
  target: number | null,
  locale: string,
): string {
  const label = DAY_STATE_LABELS[day.state];
  if (!day.log) return label;
  const logged = describeLog(day.log, habit, target, locale);
  if (day.state === "inactive" || day.state === "not_scheduled") {
    return `${label} · ${logged}`;
  }
  if (logged === label) return label;
  return day.state === "extra" ? `${label} · ${logged}` : logged;
}

/**
 * Whether a history day can be opened to log or correct it: an active day
 * up to today, or any day that already has a log (so a log kept on a day
 * that no longer counts can still be cleared).
 */
export function isLoggableDay(
  day: Pick<HabitDay, "date" | "state"> & { log: HabitLogValue | null },
  today: LocalDate,
): boolean {
  if (day.date > today) return false;
  return day.state !== "inactive" || day.log !== null;
}

/** The two weeks the Track strip shows: last week and this one. */
export function stripRange(
  today: LocalDate,
  weekStart: WeekStart,
): { from: LocalDate; to: LocalDate } {
  const from = addDays(startOfWeek(today, weekStart), -7);
  return { from, to: addDays(from, 13) };
}
