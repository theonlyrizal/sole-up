// The Upcoming view (chunk 2.6): the user's next days, each with the tasks
// planned or due on it. Pure: no server-only imports, so the query, the page
// and the tests share one definition.
//
// Days are local dates in the user's saved time zone. A timed deadline falls
// on the day its instant has in that zone, whatever zone it was set in.

import {
  addDays,
  formatInstant,
  formatLocalDate,
  formatTimeOfDay,
  type LocalDate,
  localDateOf,
  startOfLocalDay,
} from "./dates";
import { compareTasksBy, formatEstimate, type SortableTask } from "./task-list";
import type { Task } from "./tasks";

/** How many days ahead the view can show; the first is the default. */
export const UPCOMING_RANGES = [14, 30] as const;
export type UpcomingRange = (typeof UPCOMING_RANGES)[number];
export const DEFAULT_UPCOMING_RANGE: UpcomingRange = 14;

/** The range from the page's `days` search param; anything else is 14. */
export function parseUpcomingRange(
  value: string | string[] | undefined,
): UpcomingRange {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return (
    UPCOMING_RANGES.find((range) => range === days) ?? DEFAULT_UPCOMING_RANGE
  );
}

/** The page's URL for a range; the default stays the plain path. */
export function upcomingHref(range: UpcomingRange): string {
  return range === DEFAULT_UPCOMING_RANGE
    ? "/plan/upcoming"
    : `/plan/upcoming?days=${range}`;
}

/**
 * The days Upcoming covers: tomorrow through today + `days` (Today has
 * today), as inclusive local dates and as the half-open instant range
 * `[start, end)` they span in the user's zone.
 */
export type UpcomingWindow = {
  from: LocalDate;
  to: LocalDate;
  start: Date;
  end: Date;
};

export function upcomingWindow(
  today: LocalDate,
  days: UpcomingRange,
  timeZone: string,
): UpcomingWindow {
  const from = addDays(today, 1);
  const to = addDays(today, days);
  return {
    from,
    to,
    start: startOfLocalDay(from, timeZone),
    end: startOfLocalDay(addDays(to, 1), timeZone),
  };
}

type UpcomingTask = SortableTask &
  Pick<Task, "status" | "plannedDate" | "dueDate" | "dueAt">;

/** The local day a task's deadline falls on in `timeZone`, if it has one. */
export function dueDayOf(
  task: Pick<Task, "dueDate" | "dueAt">,
  timeZone: string,
): LocalDate | null {
  if (task.dueAt) return localDateOf(task.dueAt, timeZone);
  return task.dueDate;
}

/**
 * A task on one day: planned for it, due on it, or both. A task planned for
 * one day and due on another shows on each.
 */
export type UpcomingEntry<T> = { task: T; planned: boolean; due: boolean };
export type UpcomingDay<T> = { date: LocalDate; entries: UpcomingEntry<T>[] };

const inWindow = (date: LocalDate | null, window: UpcomingWindow) =>
  date !== null && date >= window.from && date <= window.to;

/**
 * Open tasks merged onto the days of `window`, earliest day first. Days with
 * nothing on them are left out. Within a day: all-day items first (due
 * before planned, then by priority), then timed deadlines by time.
 */
export function groupUpcomingTasks<T extends UpcomingTask>(
  tasks: readonly T[],
  window: UpcomingWindow,
  timeZone: string,
): UpcomingDay<T>[] {
  const days = new Map<LocalDate, UpcomingEntry<T>[]>();
  const add = (date: LocalDate, entry: UpcomingEntry<T>) => {
    const entries = days.get(date) ?? [];
    entries.push(entry);
    days.set(date, entries);
  };

  for (const task of tasks) {
    if (task.status !== "open") continue;
    const plannedDay = inWindow(task.plannedDate, window)
      ? task.plannedDate
      : null;
    const dueDay = dueDayOf(task, timeZone);
    const dueInWindow = inWindow(dueDay, window) ? dueDay : null;
    if (plannedDay && plannedDay === dueInWindow) {
      add(plannedDay, { task, planned: true, due: true });
      continue;
    }
    if (plannedDay) add(plannedDay, { task, planned: true, due: false });
    if (dueInWindow) add(dueInWindow, { task, planned: false, due: true });
  }

  const byPriority = compareTasksBy("priority", timeZone);
  const timeOf = (entry: UpcomingEntry<T>) =>
    entry.due && entry.task.dueAt ? entry.task.dueAt.getTime() : -Infinity;
  const compareEntries = (a: UpcomingEntry<T>, b: UpcomingEntry<T>) => {
    const byTime = timeOf(a) - timeOf(b);
    if (byTime) return byTime;
    if (a.due !== b.due) return a.due ? -1 : 1;
    return byPriority(a.task, b.task);
  };

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({
      date,
      entries: entries.sort(compareEntries),
    }));
}

/** A day's heading: "Tomorrow · Saturday, 24 October 2026" or the date. */
export function upcomingDayLabel(
  date: LocalDate,
  today: LocalDate,
  locale: string,
): string {
  const label = formatLocalDate(date, locale, "full");
  return date === addDays(today, 1) ? `Tomorrow · ${label}` : label;
}

/**
 * What an entry is on its day ("Planned", "Due", "Due 5:00 PM", "Planned,
 * due"), then the task's other date if it falls on another day, then its
 * estimate. Times are in the user's zone.
 */
export function upcomingEntryDetails(
  entry: UpcomingEntry<
    Pick<Task, "plannedDate" | "dueDate" | "dueAt" | "estimatedMinutes">
  >,
  locale: string,
  timeZone: string,
): string[] {
  const { task, planned, due } = entry;
  const time =
    due && task.dueAt
      ? ` ${formatTimeOfDay(task.dueAt, locale, timeZone)}`
      : "";
  const details = [
    planned && due ? `Planned, due${time}` : planned ? "Planned" : `Due${time}`,
  ];
  if (planned && !due) {
    if (task.dueAt) {
      details.push(`Due ${formatInstant(task.dueAt, locale, timeZone)}`);
    } else if (task.dueDate) {
      details.push(`Due ${formatLocalDate(task.dueDate, locale)}`);
    }
  }
  if (due && !planned && task.plannedDate) {
    details.push(`Planned ${formatLocalDate(task.plannedDate, locale)}`);
  }
  if (task.estimatedMinutes) {
    details.push(formatEstimate(task.estimatedMinutes));
  }
  return details;
}
