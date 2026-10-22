// The Today view's sections (chunk 2.5, ADR 0011). Pure: no server-only
// imports, so the query, the page and the tests share one definition.
//
// "Today" is the user's local date in their saved time zone, never the
// server's or UTC's. Nothing here changes a task: a plan from an earlier day
// stays as it is until the user decides.

import { addDays, type LocalDate, localDayRange, todayFor } from "./dates";
import {
  compareTasksBy,
  formatEstimate,
  type SortableTask,
  type TaskSort,
} from "./task-list";
import type { Task } from "./tasks";

/** Display order on the page. */
export const TODAY_SECTIONS = ["planned", "due", "decide", "earlier"] as const;
export type TodaySection = (typeof TODAY_SECTIONS)[number];

export const TODAY_SECTION_LABELS: Record<TodaySection, string> = {
  planned: "Planned for today",
  due: "Due today",
  decide: "Needs a decision",
  earlier: "Earlier, not done",
};

/** One line under each heading. Calm wording: no "late", "missed" or red. */
export const TODAY_SECTION_HINTS: Record<TodaySection, string> = {
  planned: "What you chose to do today.",
  due: "Due by the end of today.",
  decide:
    "Their deadline has passed. Do one today, give it a new date, or mark it done.",
  earlier:
    "Planned for an earlier day and still open. They stay put until you choose: today, another day, or no plan.",
};

/** The user's today, and where it starts and ends, at one instant. */
export type TodayClock = {
  today: LocalDate;
  now: Date;
  /** First instant of today in the user's zone. */
  dayStart: Date;
  /** First instant of tomorrow: when the view should be read again. */
  dayEnd: Date;
};

export function todayClock(
  timeZone: string,
  now: Date = new Date(),
): TodayClock {
  const today = todayFor(timeZone, now);
  const { start, end } = localDayRange(today, timeZone);
  return { today, now, dayStart: start, dayEnd: end };
}

/** The user's date `days` after today, in their zone. */
export function relativeDay(
  timeZone: string,
  days: number,
  now: Date = new Date(),
): LocalDate {
  return addDays(todayFor(timeZone, now), days);
}

type SectionTask = Pick<Task, "status" | "plannedDate" | "dueDate" | "dueAt">;

/**
 * The one section an open task belongs to on Today, or null if none. When a
 * task matches more than one, the first that applies wins:
 *
 * 1. **Planned for today**: planning it today is a decision already made,
 *    even if its deadline has passed.
 * 2. **Needs a decision**: the deadline has passed (an all-day deadline
 *    before today, or a timed one before now, earlier today included).
 * 3. **Due today**: an all-day deadline today, or a timed one later today.
 * 4. **Earlier, not done**: planned for a day before today.
 */
export function todaySection(
  task: SectionTask,
  clock: TodayClock,
): TodaySection | null {
  if (task.status !== "open") return null;
  const { today, now, dayEnd } = clock;
  if (task.plannedDate === today) return "planned";
  if (
    (task.dueDate !== null && task.dueDate < today) ||
    (task.dueAt !== null && task.dueAt.getTime() < now.getTime())
  ) {
    return "decide";
  }
  if (
    task.dueDate === today ||
    (task.dueAt !== null && task.dueAt.getTime() < dayEnd.getTime())
  ) {
    return "due";
  }
  if (task.plannedDate !== null && task.plannedDate < today) return "earlier";
  return null;
}

/** How each section is ordered. */
const SECTION_SORTS: Record<TodaySection, TaskSort> = {
  // What matters most first.
  planned: "priority",
  // Soonest deadline first; all-day deadlines before timed ones.
  due: "due",
  // Oldest deadline first.
  decide: "due",
  // Oldest plan first.
  earlier: "planned",
};

/** Tasks sorted into Today's sections. Tasks in no section are left out. */
export function groupTodayTasks<T extends SectionTask & SortableTask>(
  tasks: readonly T[],
  clock: TodayClock,
  timeZone: string,
): Record<TodaySection, T[]> {
  const sections: Record<TodaySection, T[]> = {
    planned: [],
    due: [],
    decide: [],
    earlier: [],
  };
  for (const task of tasks) {
    const section = todaySection(task, clock);
    if (section) sections[section].push(task);
  }
  for (const section of TODAY_SECTIONS) {
    sections[section].sort(compareTasksBy(SECTION_SORTS[section], timeZone));
  }
  return sections;
}

/**
 * A summary of today's plan, so it can be kept realistic: "3 tasks · 1 h
 * 30 min estimated" (estimates only count where there is one).
 */
export function plannedSummary(
  tasks: readonly Pick<Task, "estimatedMinutes">[],
): string {
  const count = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  const estimated = tasks.filter((task) => task.estimatedMinutes !== null);
  if (estimated.length === 0) return count;
  const minutes = estimated.reduce(
    (sum, task) => sum + (task.estimatedMinutes ?? 0),
    0,
  );
  const unestimated = tasks.length - estimated.length;
  return unestimated === 0
    ? `${count} · ${formatEstimate(minutes)} estimated`
    : `${count} · ${formatEstimate(minutes)} estimated, ${unestimated} without an estimate`;
}
