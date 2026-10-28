// Habit cadences and their `cadence_config` shapes (ADR 0014 "Cadences").
// Pure: no server-only imports. The same schemas check form input, rows read
// back from the database's jsonb column, and audit events.

import { z } from "zod";

import type { LocalDate } from "../dates";

import {
  HABIT_TIMES_PER_WEEK_MAX,
  HABIT_TIMES_PER_WEEK_MIN,
  HABIT_WEEKLY_DAYS_MAX,
  HABIT_WEEKLY_DAYS_MIN,
  type HabitCadenceType,
} from "./habit";

const DAYS_MESSAGE = `Choose ${HABIT_WEEKLY_DAYS_MIN} to ${HABIT_WEEKLY_DAYS_MAX} days. Every day is the daily cadence.`;
const TIMES_MESSAGE = `Choose ${HABIT_TIMES_PER_WEEK_MIN} to ${HABIT_TIMES_PER_WEEK_MAX} times a week. Every day is the daily cadence.`;

/**
 * Weekday numbers, 0 = Sunday … 6 = Saturday (the numbering of `dayOfWeek`
 * and `week_start`): distinct, 1 to 6 of them, stored in ascending order.
 */
const weekdaysSchema = z
  .array(
    z
      .number({ error: DAYS_MESSAGE })
      .int(DAYS_MESSAGE)
      .min(0, DAYS_MESSAGE)
      .max(6, DAYS_MESSAGE),
    { error: DAYS_MESSAGE },
  )
  .min(HABIT_WEEKLY_DAYS_MIN, DAYS_MESSAGE)
  .max(HABIT_WEEKLY_DAYS_MAX, DAYS_MESSAGE)
  .refine((days) => new Set(days).size === days.length, "Choose each day once.")
  .transform((days) => [...days].sort((a, b) => a - b));

const timesPerWeekSchema = z
  .number({ error: TIMES_MESSAGE })
  .int(TIMES_MESSAGE)
  .min(HABIT_TIMES_PER_WEEK_MIN, TIMES_MESSAGE)
  .max(HABIT_TIMES_PER_WEEK_MAX, TIMES_MESSAGE);

/** The `cadence_config` each cadence type takes. Unknown keys are refused. */
export const CADENCE_CONFIG_SCHEMAS = {
  daily: z.strictObject({}),
  weekly_days: z.strictObject({ days: weekdaysSchema }),
  times_per_week: z.strictObject({ timesPerWeek: timesPerWeekSchema }),
} as const satisfies Record<HabitCadenceType, z.ZodType>;

export type CadenceConfig<T extends HabitCadenceType = HabitCadenceType> =
  z.output<(typeof CADENCE_CONFIG_SCHEMAS)[T]>;

/** A cadence type with its config, the pair a schedule row stores. */
export type HabitCadence = {
  [T in HabitCadenceType]: { cadenceType: T; cadenceConfig: CadenceConfig<T> };
}[HabitCadenceType];

/**
 * `{ cadenceType, cadenceConfig }`, with the config checked against its
 * type. A config of another type (`{ days }` on `daily`) is refused.
 */
export const cadenceSchema = z.discriminatedUnion(
  "cadenceType",
  [
    z.strictObject({
      cadenceType: z.literal("daily"),
      cadenceConfig: CADENCE_CONFIG_SCHEMAS.daily,
    }),
    z.strictObject({
      cadenceType: z.literal("weekly_days"),
      cadenceConfig: CADENCE_CONFIG_SCHEMAS.weekly_days,
    }),
    z.strictObject({
      cadenceType: z.literal("times_per_week"),
      cadenceConfig: CADENCE_CONFIG_SCHEMAS.times_per_week,
    }),
  ],
  { error: "Choose how often from the list." },
);

/** Every config shape, for audit events (which hold no type of their own). */
export const anyCadenceConfigSchema = z.union([
  CADENCE_CONFIG_SCHEMAS.daily,
  CADENCE_CONFIG_SCHEMAS.weekly_days,
  CADENCE_CONFIG_SCHEMAS.times_per_week,
]);

/**
 * A stored row's cadence, checked rather than trusted: jsonb comes back as
 * `unknown`. Throws when the row doesn't match its type.
 */
export function parseCadence(row: {
  cadenceType: string;
  cadenceConfig: unknown;
}): HabitCadence {
  return cadenceSchema.parse({
    cadenceType: row.cadenceType,
    cadenceConfig: row.cadenceConfig,
  });
}

/** One schedule row as the app uses it. `target` is a number, not a string. */
export type HabitSchedule = HabitCadence & {
  id: string;
  effectiveFrom: LocalDate;
  target: number | null;
};

/**
 * The schedule for a week (ADR 0014): the row with the latest
 * `effectiveFrom` on or before the week's last day, or the earliest row when
 * none is (after `start_date` moved earlier, say). Null only for no rows.
 */
export function scheduleForWeek<T extends { effectiveFrom: LocalDate }>(
  schedules: readonly T[],
  weekLastDay: LocalDate,
): T | null {
  let latest: T | null = null;
  let earliest: T | null = null;
  for (const schedule of schedules) {
    if (!earliest || schedule.effectiveFrom < earliest.effectiveFrom) {
      earliest = schedule;
    }
    if (
      schedule.effectiveFrom <= weekLastDay &&
      (!latest || schedule.effectiveFrom > latest.effectiveFrom)
    ) {
      latest = schedule;
    }
  }
  return latest ?? earliest;
}
