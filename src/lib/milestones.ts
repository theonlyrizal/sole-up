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
