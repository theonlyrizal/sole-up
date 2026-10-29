import { z } from "zod";

import { isLocalDate, type LocalDate } from "@/lib/dates";
import {
  priorityKey,
  REVIEW_PRIORITIES_MAX,
  REVIEW_TEXT_MAX,
} from "@/lib/weekly-reviews";

// Input for the weekly review service (ADR 0015). Which periods are open
// and which goals and tasks can be linked depend on today and the user's
// records, so the service checks those.

const idSchema = z.uuid("Choose a review.");

/** Shown when a priorities list repeats a goal or a task. */
export const DUPLICATE_PRIORITY = "Add each goal or task only once.";

/** Shown when a priority links a goal or task the user can't add. */
export const PRIORITY_NOT_AVAILABLE =
  "Choose active or paused goals and open tasks.";

const maxText = `${REVIEW_TEXT_MAX.toLocaleString("en-US")} characters`;

/**
 * One optional text field. Absent leaves it as it is; blank or null clears
 * it to null.
 */
function reviewText(label: string) {
  return z
    .string()
    .trim()
    .max(REVIEW_TEXT_MAX, `Keep ${label} to ${maxText} or fewer.`)
    .nullable()
    .transform((value) => value || null)
    .optional();
}

export const startWeeklyReviewSchema = z.strictObject({
  periodStart: z
    .string({ error: "Pick a week to review." })
    .trim()
    .refine(
      (value): value is LocalDate => isLocalDate(value),
      "Pick a week to review.",
    ),
});
export type StartWeeklyReviewInput = z.output<typeof startWeeklyReviewSchema>;

export const saveWeeklyReviewTextSchema = z.strictObject({
  id: idSchema,
  wins: reviewText("wins"),
  blockers: reviewText("blockers"),
  lessons: reviewText("lessons"),
  prioritiesNote: reviewText("the note"),
});
export type SaveWeeklyReviewTextInput = z.output<
  typeof saveWeeklyReviewTextSchema
>;

const prioritySchema = z.union(
  [
    z.strictObject({ goalId: z.uuid("Choose one of your goals.") }),
    z.strictObject({ taskId: z.uuid("Choose one of your tasks.") }),
  ],
  { error: "Choose a goal or a task." },
);

export const setWeeklyReviewPrioritiesSchema = z.strictObject({
  id: idSchema,
  priorities: z
    .array(prioritySchema)
    .max(
      REVIEW_PRIORITIES_MAX,
      `Choose up to ${REVIEW_PRIORITIES_MAX} priorities.`,
    )
    .refine(
      (priorities) =>
        new Set(priorities.map(priorityKey)).size === priorities.length,
      DUPLICATE_PRIORITY,
    ),
});
export type SetWeeklyReviewPrioritiesInput = z.output<
  typeof setWeeklyReviewPrioritiesSchema
>;

export const weeklyReviewIdSchema = z.strictObject({ id: idSchema });
export type WeeklyReviewIdInput = z.output<typeof weeklyReviewIdSchema>;
