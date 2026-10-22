// Task constants shared by the server (schema, validation, service, audit) and
// the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0011-task-status-planning-priority-estimates.md
// and docs/decisions/0004-task-hierarchy-and-dates.md.

export const TASK_STATUSES = ["open", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TITLE_MAX = 200;
export const TASK_NOTES_MAX = 2000;

/** Estimates are whole minutes, from 1 to one day. */
export const TASK_ESTIMATE_MIN_MINUTES = 1;
export const TASK_ESTIMATE_MAX_MINUTES = 1440;
