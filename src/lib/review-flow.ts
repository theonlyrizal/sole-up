// The weekly review flow's steps, URLs and period choice (chunk 7.3).
// Pure: no server-only imports, so the page and its components share it.

import { addDays, isLocalDate, type LocalDate } from "./dates";
import { REVIEW_PERIOD_DAYS } from "./weekly-reviews";

export const REVIEW_STEPS = [
  "look-back",
  "reflect",
  "adjust",
  "priorities",
] as const;
export type ReviewStep = (typeof REVIEW_STEPS)[number];

export const REVIEW_STEP_LABELS: Record<ReviewStep, string> = {
  "look-back": "Look back",
  reflect: "Reflect",
  adjust: "Adjust",
  priorities: "Choose priorities",
};

/** The step a `?step=` value asks for; anything unknown is the first. */
export function parseReviewStep(value: unknown): ReviewStep {
  return REVIEW_STEPS.find((step) => step === value) ?? "look-back";
}

/** A `?week=` value as a local date, or null when it isn't one. */
export function parseReviewWeek(value: unknown): LocalDate | null {
  return typeof value === "string" && isLocalDate(value) ? value : null;
}

/** The step before or after `step`, or null at either end. */
export function adjacentReviewStep(
  step: ReviewStep,
  direction: -1 | 1,
): ReviewStep | null {
  return REVIEW_STEPS[REVIEW_STEPS.indexOf(step) + direction] ?? null;
}

/**
 * The flow's URL for a week and step. The first step is left out, and so
 * is the week when none is given (the page then picks the default).
 */
export function reviewHref(week?: LocalDate, step?: ReviewStep): string {
  const params = new URLSearchParams();
  if (week) params.set("week", week);
  if (step && step !== "look-back") params.set("step", step);
  const query = params.toString();
  return query ? `/review?${query}` : "/review";
}

/**
 * The week the flow opens on (ADR 0015): last week, unless its review is
 * already finished, then this week.
 */
export function defaultReviewWeek(
  { thisWeek, lastWeek }: { thisWeek: LocalDate; lastWeek: LocalDate },
  lastWeekFinished: boolean,
): LocalDate {
  return lastWeekFinished ? thisWeek : lastWeek;
}

/**
 * "Next week" for a review: the period after the reviewed one (ADR 0015).
 * `days` are the days a task can still be planned on, from `today` on, so
 * a review of last week offers only the rest of this week.
 */
export function nextReviewWeek(
  periodEnd: LocalDate,
  today: LocalDate,
): { start: LocalDate; end: LocalDate; days: LocalDate[] } {
  const end = addDays(periodEnd, REVIEW_PERIOD_DAYS);
  const days: LocalDate[] = [];
  for (let day = periodEnd; day < end; day = addDays(day, 1)) {
    if (day >= today) days.push(day);
  }
  return { start: periodEnd, end, days };
}
