// A goal's tasks on its detail page (chunk 2.7): grouping by milestone and
// the goal's "next action". Pure: no server-only imports.

import type { LocalDate } from "./dates";
import { compareTasksBy, type SortableTask } from "./task-list";
import type { Task } from "./tasks";
import { dueDayOf } from "./upcoming";

export type GoalTask = SortableTask &
  Pick<Task, "status" | "goalId" | "milestoneId">;

/**
 * The first day a task asks for attention: the earlier of its planned date
 * and its deadline's local day in `timeZone`, or null with neither.
 */
export function actionDayOf(
  task: Pick<Task, "plannedDate" | "dueDate" | "dueAt">,
  timeZone: string,
): LocalDate | null {
  const days = [task.plannedDate, dueDayOf(task, timeZone)].filter(
    (day): day is LocalDate => day !== null,
  );
  if (days.length === 0) return null;
  return days.reduce((earliest, day) => (day < earliest ? day : earliest));
}

/**
 * Earliest action day first, undated tasks last; ties by deadline, then
 * position (as on the Plan page).
 */
export function compareByActionDay(
  timeZone: string,
): (a: GoalTask, b: GoalTask) => number {
  const byDue = compareTasksBy("due", timeZone);
  return (a, b) => {
    const dayA = actionDayOf(a, timeZone);
    const dayB = actionDayOf(b, timeZone);
    if (dayA !== dayB) {
      if (dayA === null) return 1;
      if (dayB === null) return -1;
      return dayA.localeCompare(dayB);
    }
    return byDue(a, b);
  };
}

/**
 * A goal's next action: its open task with the earliest planned or due day
 * (passed ones included, since they need attention first). Null when no
 * open task has a date; the page then prompts for one. Status never comes
 * into the goal's progress (ADR 0010).
 */
export function nextActionOf<T extends GoalTask>(
  tasks: T[],
  timeZone: string,
): T | null {
  const dated = tasks.filter(
    (task) => task.status === "open" && actionDayOf(task, timeZone) !== null,
  );
  return dated.sort(compareByActionDay(timeZone))[0] ?? null;
}

/** A goal's tasks split into those directly under it and per milestone. */
export type GoalTaskGroups<T> = {
  direct: T[];
  /** By milestone ID; a milestone with no tasks is absent. */
  byMilestone: Map<string, T[]>;
};

/**
 * Groups a goal's tasks for its page, each group sorted open first, then by
 * action day (`compareByActionDay`).
 */
export function groupGoalTasks<T extends GoalTask>(
  tasks: T[],
  timeZone: string,
): GoalTaskGroups<T> {
  const byAction = compareByActionDay(timeZone);
  const sorted = [...tasks].sort(
    (a, b) =>
      Number(a.status !== "open") - Number(b.status !== "open") ||
      byAction(a, b),
  );
  const direct: T[] = [];
  const byMilestone = new Map<string, T[]>();
  for (const task of sorted) {
    if (task.milestoneId) {
      byMilestone.set(task.milestoneId, [
        ...(byMilestone.get(task.milestoneId) ?? []),
        task,
      ]);
    } else {
      direct.push(task);
    }
  }
  return { direct, byMilestone };
}
