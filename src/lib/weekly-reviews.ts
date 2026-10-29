// Weekly review constants and period rules shared by the server (schema,
// validation, service, audit) and the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0015-weekly-review-period-structure-lock.md.

import { addDays, startOfWeek, type LocalDate, type WeekStart } from "./dates";

/** Each text field holds up to this many characters. */
export const REVIEW_TEXT_MAX = 5000;

/** A review holds at most this many priorities. */
export const REVIEW_PRIORITIES_MAX = 10;

/** A period is one week: `period_end = period_start + 7`, exclusive. */
export const REVIEW_PERIOD_DAYS = 7;

/** A period stays open for this many days after `period_end`. */
export const REVIEW_OPEN_DAYS_AFTER_END = 7;

/** The text fields a save can write, all optional. */
export const REVIEW_TEXT_FIELDS = [
  "wins",
  "blockers",
  "lessons",
  "prioritiesNote",
] as const;
export type ReviewTextField = (typeof REVIEW_TEXT_FIELDS)[number];

/** Shown when a write reaches a review whose period has closed. */
export const REVIEW_CLOSED = "This review is closed for editing.";

/** Shown when a review is started for a week that isn't open. */
export const REVIEW_PERIOD_NOT_OPEN =
  "You can review only this week or last week.";

/** One priority: a link to exactly one goal or one task. */
export type ReviewPriority = { goalId: string } | { taskId: string };

export type WeeklyReview = {
  id: string;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  wins: string | null;
  blockers: string | null;
  lessons: string | null;
  prioritiesNote: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** The first day on which the review of a period is read-only. */
export function reviewClosesOn(periodEnd: LocalDate): LocalDate {
  return addDays(periodEnd, REVIEW_OPEN_DAYS_AFTER_END);
}

/**
 * True while `today` (in the user's current zone) is before
 * `period_end + 7`: during the period's own week and the week after it.
 */
export function isReviewOpen(periodEnd: LocalDate, today: LocalDate): boolean {
  return today < reviewClosesOn(periodEnd);
}

/**
 * The periods that can be started on `today`: this week's and last week's
 * first days under the current week start.
 */
export function openPeriodStarts(
  today: LocalDate,
  weekStart: WeekStart,
): { thisWeek: LocalDate; lastWeek: LocalDate } {
  const thisWeek = startOfWeek(today, weekStart);
  return { thisWeek, lastWeek: addDays(thisWeek, -REVIEW_PERIOD_DAYS) };
}

/** A priority's target as one string, for comparing and finding duplicates. */
export function priorityKey(priority: ReviewPriority): string {
  return "goalId" in priority
    ? `goal:${priority.goalId}`
    : `task:${priority.taskId}`;
}
