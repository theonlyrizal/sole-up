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

/** The statuses the Goals page filters by. Archived goals have their own view. */
export const GOAL_LIST_STATUSES = [
  "active",
  "paused",
  "completed",
  "dropped",
] as const satisfies readonly GoalStatus[];
export type GoalListStatus = (typeof GOAL_LIST_STATUSES)[number];

/** The filter a `?status=` value asks for; anything unknown is Active. */
export function goalListStatus(value: unknown): GoalListStatus {
  return GOAL_LIST_STATUSES.find((status) => status === value) ?? "active";
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  dropped: "Dropped",
  archived: "Archived",
};

/** Shown as a small label, never as a score or a sort key. */
export const GOAL_PRIORITY_LABELS: Record<GoalPriority, string> = {
  low: "Low priority",
  medium: "Medium priority",
  high: "High priority",
};

/** One status action on a goal: its button label and confirmation. */
export type GoalStatusAction = {
  to: GoalStatus;
  label: string;
  /** Toast after it succeeds. Plain and kind: no judgement about why. */
  done: string;
};

const PAUSE: GoalStatusAction = {
  to: "paused",
  label: "Pause",
  done: "Paused. Pick it up again whenever it suits you.",
};
const COMPLETE: GoalStatusAction = {
  to: "completed",
  label: "Mark complete",
  done: "Marked complete. Nice work.",
};
const DROP: GoalStatusAction = {
  to: "dropped",
  label: "Drop",
  done: "Dropped. Priorities change, and you can reopen it any time.",
};
const ARCHIVE: GoalStatusAction = {
  to: "archived",
  label: "Archive",
  done: "Archived. It's out of the way and can be restored.",
};

/**
 * The status actions offered for a goal, in display order. Resume, Reopen
 * and Restore all go back to `active` (ADR 0010: restore always lands in
 * Active). Archived goals aren't on the Goals page, so Restore shows only
 * on the goal's detail page until the archive view (chunk 1.6).
 */
export function goalStatusActions(status: GoalStatus): GoalStatusAction[] {
  switch (status) {
    case "active":
      return [COMPLETE, PAUSE, DROP, ARCHIVE];
    case "paused":
      return [
        { to: "active", label: "Resume", done: "Resumed. Welcome back." },
        COMPLETE,
        DROP,
        ARCHIVE,
      ];
    case "completed":
    case "dropped":
      return [
        { to: "active", label: "Reopen", done: "Reopened and back in Active." },
        ARCHIVE,
      ];
    case "archived":
      return [
        {
          to: "active",
          label: "Restore to Active",
          done: "Restored and back in Active.",
        },
      ];
  }
}
