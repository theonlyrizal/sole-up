// The habit form's cadence picker and the list's summaries. Pure, so the
// form and the server-rendered list describe a schedule the same way.

import type { WeekStart } from "../dates";

import type { HabitCadence } from "./cadence";
import type { HabitCadenceType } from "./habit";

/** Short and full weekday names, by `dayOfWeek` number (0 = Sunday). */
export const WEEKDAY_NAMES: readonly (readonly [string, string])[] = [
  ["Sun", "Sunday"],
  ["Mon", "Monday"],
  ["Tue", "Tuesday"],
  ["Wed", "Wednesday"],
  ["Thu", "Thursday"],
  ["Fri", "Friday"],
  ["Sat", "Saturday"],
];

/** The seven weekday numbers in the user's week order. */
export function weekdaysFrom(weekStart: WeekStart): WeekStart[] {
  return Array.from(
    { length: 7 },
    (_, offset) => ((weekStart + offset) % 7) as WeekStart,
  );
}

/** What the picker holds: every choice is kept while the user switches. */
export type CadencePickerValue = {
  cadenceType: HabitCadenceType;
  days: number[];
  timesPerWeek: string;
};

export function pickerValueOf(cadence: HabitCadence): CadencePickerValue {
  return {
    cadenceType: cadence.cadenceType,
    days:
      cadence.cadenceType === "weekly_days" ? cadence.cadenceConfig.days : [],
    timesPerWeek:
      cadence.cadenceType === "times_per_week"
        ? String(cadence.cadenceConfig.timesPerWeek)
        : "3",
  };
}

/** True when the chosen days are every day of the week. */
export function isEveryDay(value: CadencePickerValue): boolean {
  return value.cadenceType === "weekly_days" && new Set(value.days).size === 7;
}

/**
 * The cadence to send. All seven weekdays is the daily cadence (ADR 0014).
 * Days go as chosen; the server checks the count and sorts them.
 */
export function cadenceInput(value: CadencePickerValue): {
  cadenceType: HabitCadenceType;
  cadenceConfig: Record<string, unknown>;
} {
  if (value.cadenceType === "daily" || isEveryDay(value)) {
    return { cadenceType: "daily", cadenceConfig: {} };
  }
  if (value.cadenceType === "weekly_days") {
    return { cadenceType: "weekly_days", cadenceConfig: { days: value.days } };
  }
  return {
    cadenceType: "times_per_week",
    cadenceConfig: { timesPerWeek: Number(value.timesPerWeek) },
  };
}

/**
 * A schedule in a few words: "Every day", "Mon, Wed, Fri" (in the user's
 * week order) or "3 times a week".
 */
export function describeCadence(
  cadence: HabitCadence,
  weekStart: WeekStart,
): string {
  switch (cadence.cadenceType) {
    case "daily":
      return "Every day";
    case "weekly_days": {
      const chosen = new Set(cadence.cadenceConfig.days);
      return weekdaysFrom(weekStart)
        .filter((day) => chosen.has(day))
        .map((day) => WEEKDAY_NAMES[day]![0])
        .join(", ");
    }
    case "times_per_week": {
      const times = cadence.cadenceConfig.timesPerWeek;
      return times === 1 ? "Once a week" : `${times} times a week`;
    }
  }
}

/** A quantity habit's daily target, such as "8 glasses a day". */
export function describeTarget(
  target: number,
  unit: string,
  locale: string,
): string {
  const amount = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(target);
  return `${amount} ${unit} a day`;
}

/** What a habit's delete takes with it, for the confirmation. */
export function habitDeleteConsequences(logCount: number): string {
  if (logCount === 0) return "It has no logs yet.";
  return logCount === 1
    ? "Its 1 log goes with it."
    : `All ${logCount} of its logs go with it.`;
}
