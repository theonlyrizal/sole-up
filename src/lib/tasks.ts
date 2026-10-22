// Task constants shared by the server (schema, validation, service, audit) and
// the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0011-task-status-planning-priority-estimates.md
// and docs/decisions/0004-task-hierarchy-and-dates.md.

import type { LocalDate } from "./dates";
import type { Priority } from "./priorities";

export const TASK_STATUSES = ["open", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TITLE_MAX = 200;
export const TASK_NOTES_MAX = 2000;

/** Estimates are whole minutes, from 1 to one day. */
export const TASK_ESTIMATE_MIN_MINUTES = 1;
export const TASK_ESTIMATE_MAX_MINUTES = 1440;

/**
 * Fields a plain edit can change. Status, plan, deadline and parent each have
 * their own operation and audit event.
 */
export const TASK_EDITABLE_FIELDS = [
  "title",
  "notes",
  "priority",
  "estimatedMinutes",
] as const;
export type TaskEditableField = (typeof TASK_EDITABLE_FIELDS)[number];

/** The audit event a status change records, named for where the task lands. */
export const TASK_STATUS_EVENTS = {
  open: "task.reopened",
  completed: "task.completed",
  cancelled: "task.cancelled",
} as const satisfies Record<TaskStatus, string>;

/**
 * `completed_at` and `cancelled_at` after a real status change (ADR 0011):
 * each is set on entering its status and cleared on leaving it. `now` is
 * whatever the caller uses for the change's time.
 */
export function timestampsAfterTaskStatusChange<T>(
  to: TaskStatus,
  now: T,
): { completedAt: T | null; cancelledAt: T | null } {
  return {
    completedAt: to === "completed" ? now : null,
    cancelledAt: to === "cancelled" ? now : null,
  };
}

/** What the UI receives for one task. */
export type Task = {
  id: string;
  goalId: string | null;
  milestoneId: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: Priority | null;
  /** All-day deadline. Excludes `dueAt`. */
  dueDate: LocalDate | null;
  /** Timed deadline (UTC instant), always with the zone it was set in. */
  dueAt: Date | null;
  dueTz: string | null;
  plannedDate: LocalDate | null;
  estimatedMinutes: number | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  sortOrder: number;
  createdAt: Date;
};

/**
 * A task's parent as one `<select>` value: "" (no parent), "goal:<id>" or
 * "milestone:<id>". Lets one picker offer goals and their milestones.
 */
export type TaskParentChoice = "" | `goal:${string}` | `milestone:${string}`;

export function taskParentChoice(parent: {
  goalId: string | null;
  milestoneId: string | null;
}): TaskParentChoice {
  if (parent.milestoneId) return `milestone:${parent.milestoneId}`;
  if (parent.goalId) return `goal:${parent.goalId}`;
  return "";
}

/** The goal and milestone IDs for a picker value; anything else is no parent. */
export function parentFromChoice(choice: string): {
  goalId: string | null;
  milestoneId: string | null;
} {
  const [kind, id] = choice.split(":", 2);
  if (kind === "goal" && id) return { goalId: id, milestoneId: null };
  if (kind === "milestone" && id) return { goalId: null, milestoneId: id };
  return { goalId: null, milestoneId: null };
}

/**
 * True when a task with these fields lands in the inbox (ADR 0011): open,
 * no parent and no planned date. A due date alone doesn't matter.
 */
export function isInboxTask(task: {
  status: TaskStatus;
  goalId: string | null;
  milestoneId: string | null;
  plannedDate: LocalDate | null;
}): boolean {
  return (
    task.status === "open" &&
    !task.goalId &&
    !task.milestoneId &&
    !task.plannedDate
  );
}
