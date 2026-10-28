// Habit constants and status rules shared by the server (schema, validation,
// service, audit) and the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0014-habit-cadence-logs-consistency.md.

import { addDays, type LocalDate } from "../dates";

export const HABIT_STATUSES = ["active", "paused", "archived"] as const;
export type HabitStatus = (typeof HABIT_STATUSES)[number];

/** `check` is done or not; `quantity` has a unit and a per-day target. */
export const HABIT_MEASURES = ["check", "quantity"] as const;
export type HabitMeasure = (typeof HABIT_MEASURES)[number];

export const HABIT_CADENCE_TYPES = [
  "daily",
  "weekly_days",
  "times_per_week",
] as const;
export type HabitCadenceType = (typeof HABIT_CADENCE_TYPES)[number];

export const HABIT_LOG_STATUSES = ["completed", "skipped"] as const;
export type HabitLogStatus = (typeof HABIT_LOG_STATUSES)[number];

export const HABIT_TITLE_MAX = 200;
export const HABIT_DESCRIPTION_MAX = 2000;
export const HABIT_UNIT_MAX = 30;
export const HABIT_LOG_NOTE_MAX = 2000;

/**
 * A target or logged value: above 0, at most 2 decimal places, up to
 * 99,999.99. Stored as `numeric(7, 2)`.
 */
export const HABIT_AMOUNT_PRECISION = 7;
export const HABIT_AMOUNT_SCALE = 2;
export const HABIT_AMOUNT_MAX = 99_999.99;

/** `weekly_days` picks 1 to 6 weekdays; all seven is `daily`. */
export const HABIT_WEEKLY_DAYS_MIN = 1;
export const HABIT_WEEKLY_DAYS_MAX = 6;
/** `times_per_week` is 1 to 6; seven is `daily`. */
export const HABIT_TIMES_PER_WEEK_MIN = 1;
export const HABIT_TIMES_PER_WEEK_MAX = 6;

/**
 * Fields an edit changes in place. Measure and unit are fixed at creation;
 * cadence and target are versioned schedules; status has its own actions.
 */
export const HABIT_EDITABLE_FIELDS = [
  "title",
  "description",
  "startDate",
  "endDate",
  "goalId",
] as const;
export type HabitEditableField = (typeof HABIT_EDITABLE_FIELDS)[number];

/** The status actions: what each moves to and the statuses it starts from. */
export const HABIT_STATUS_ACTIONS = {
  pause: { to: "paused", from: ["active"] },
  resume: { to: "active", from: ["paused"] },
  archive: { to: "archived", from: ["active", "paused"] },
  restore: { to: "active", from: ["archived"] },
} as const satisfies Record<
  string,
  { to: HabitStatus; from: readonly HabitStatus[] }
>;
export type HabitStatusAction = keyof typeof HABIT_STATUS_ACTIONS;

/**
 * What a status action does from `status`: `change` it, nothing (`noop`,
 * already there), or refuse it (`conflict`, e.g. resuming an archived
 * habit, which only Restore leaves).
 */
export function habitStatusActionOutcome(
  action: HabitStatusAction,
  status: HabitStatus,
): "change" | "noop" | "conflict" {
  const { to, from } = HABIT_STATUS_ACTIONS[action];
  if ((from as readonly HabitStatus[]).includes(status)) return "change";
  return status === to ? "noop" : "conflict";
}

/**
 * The first paused day of a new pause (ADR 0014): today, or tomorrow when
 * today already has a log so the day just logged keeps counting. Never
 * before `notBefore`, the exclusive end of the habit's latest closed pause,
 * so pauses never overlap (that end can be after today when the user's
 * zone moved back a day).
 */
export function pauseStartDate(
  today: LocalDate,
  todayLogged: boolean,
  notBefore: LocalDate | null,
): LocalDate {
  const start = todayLogged ? addDays(today, 1) : today;
  return notBefore && notBefore > start ? notBefore : start;
}

/**
 * How resuming (or restoring) closes an open pause: end it today, the first
 * active day again, or delete it when that would leave it empty (it began
 * today or later).
 */
export function closePause(
  pauseStart: LocalDate,
  today: LocalDate,
): { endDate: LocalDate } | "delete" {
  return today > pauseStart ? { endDate: today } : "delete";
}

/** What the UI receives for one habit. Amounts are numbers, not strings. */
export type Habit = {
  id: string;
  title: string;
  description: string | null;
  measure: HabitMeasure;
  unit: string | null;
  startDate: LocalDate;
  endDate: LocalDate | null;
  status: HabitStatus;
  statusChangedAt: Date;
  goalId: string | null;
};
