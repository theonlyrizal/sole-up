// Milestone constants and status rules shared by the server (schema,
// validation, service, audit) and the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0010-goal-status-priority-progress.md.

import type { LocalDate } from "./dates";

export const MILESTONE_STATUSES = ["open", "completed", "dropped"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const MILESTONE_TITLE_MAX = 200;
export const MILESTONE_DESCRIPTION_MAX = 2000;

/** Fields an edit can change; status and order have their own paths. */
export const MILESTONE_EDITABLE_FIELDS = [
  "title",
  "description",
  "dueDate",
] as const;
export type MilestoneEditableField = (typeof MILESTONE_EDITABLE_FIELDS)[number];

/**
 * `completed_at` after a real status change: set on entering `completed`,
 * cleared on any move out of it (reopen or drop). `now` is whatever the
 * caller uses for the change's time.
 */
export function completedAtAfterMilestoneStatusChange<T>(
  to: MilestoneStatus,
  now: T,
): T | null {
  return to === "completed" ? now : null;
}

/** A goal's progress (ADR 0010): dropped milestones don't count. */
export type MilestoneProgress = {
  completed: number;
  countable: number;
};

/** The definition shown next to progress, so the number is never a mystery. */
export const MILESTONE_PROGRESS_HELP =
  "Progress counts completed milestones out of all milestones. Dropped milestones don't count.";

/**
 * "2 of 5 milestones", or null when nothing can be counted (no milestones, or
 * all dropped). Callers show no progress at all in that case, never "0%".
 */
export function milestoneProgressLabel(
  progress: MilestoneProgress | null,
): string | null {
  if (!progress || progress.countable === 0) return null;
  const noun = progress.countable === 1 ? "milestone" : "milestones";
  return `${progress.completed} of ${progress.countable} ${noun}`;
}

/**
 * Every countable milestone is done. The UI may offer to complete the goal,
 * but never does it on its own (ADR 0010).
 */
export function allCountableMilestonesDone(
  progress: MilestoneProgress | null,
): boolean {
  return (
    progress !== null &&
    progress.countable > 0 &&
    progress.completed === progress.countable
  );
}

/** What the UI receives for one milestone. */
export type Milestone = {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  dueDate: LocalDate | null;
  completedAt: Date | null;
  sortOrder: number;
};
