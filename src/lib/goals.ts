// Goal constants and status rules shared by the server (schema, validation,
// service, audit) and the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0010-goal-status-priority-progress.md.

import type { LocalDate } from "./dates";

export const GOAL_STATUSES = [
  "active",
  "paused",
  "completed",
  "dropped",
  "archived",
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_PRIORITIES = ["low", "medium", "high"] as const;
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];

export const GOAL_TITLE_MAX = 200;
export const GOAL_DESCRIPTION_MAX = 2000;
export const GOAL_REASON_MAX = 2000;

/** Fields an edit can change; status changes go through their own path. */
export const GOAL_EDITABLE_FIELDS = [
  "title",
  "description",
  "reason",
  "lifeAreaId",
  "priority",
  "startDate",
  "targetDate",
] as const;
export type GoalEditableField = (typeof GOAL_EDITABLE_FIELDS)[number];

/** The statuses a goal moves between freely; any of them can be archived. */
const LIVE_STATUSES: readonly GoalStatus[] = [
  "active",
  "paused",
  "completed",
  "dropped",
];

/**
 * Whether a goal may move from `from` to a different status `to`: any live
 * status to any other or to `archived`, and `archived` only back to
 * `active` (restore). Setting the same status again is a no-op, handled by
 * the caller before asking.
 */
export function canChangeGoalStatus(from: GoalStatus, to: GoalStatus): boolean {
  if (from === to) return false;
  if (from === "archived") return to === "active";
  return LIVE_STATUSES.includes(from);
}

/**
 * `completed_at` after a real status change: set on entering `completed`,
 * kept when a completed goal is archived, otherwise cleared (including on
 * restore). `now` is whatever the caller uses for the change's time.
 */
export function completedAtAfterStatusChange<T>(
  from: GoalStatus,
  to: GoalStatus,
  current: T | null,
  now: T,
): T | null {
  if (to === "completed") return now;
  if (from === "completed" && to === "archived") return current;
  return null;
}

/** What the UI receives for one goal. */
export type Goal = {
  id: string;
  lifeAreaId: string | null;
  title: string;
  description: string | null;
  reason: string | null;
  status: GoalStatus;
  priority: GoalPriority | null;
  startDate: LocalDate | null;
  targetDate: LocalDate | null;
  completedAt: Date | null;
  statusChangedAt: Date;
};
