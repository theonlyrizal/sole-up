import { z } from "zod";

import { isLocalDate } from "@/lib/dates";
import {
  GOAL_DESCRIPTION_MAX,
  GOAL_PRIORITIES,
  GOAL_REASON_MAX,
  GOAL_STATUSES,
  GOAL_TITLE_MAX,
} from "@/lib/goals";

const idSchema = z.uuid("Choose a goal.");

const titleSchema = z
  .string({ error: "Give the goal a title." })
  .trim()
  .min(1, "Give the goal a title.")
  .max(
    GOAL_TITLE_MAX,
    `Keep the title to ${GOAL_TITLE_MAX} characters or fewer.`,
  );

/** Optional text: blank becomes null. */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `Keep the ${label} to ${max} characters or fewer.`)
    .nullish()
    .transform((value) => value || null);
}

const lifeAreaIdSchema = z
  .uuid("Choose one of your areas.")
  .nullish()
  .transform((value) => value ?? null);

const prioritySchema = z
  .enum(GOAL_PRIORITIES, { error: "Choose a priority from the list." })
  .nullish()
  .transform((value) => value ?? null);

/** Optional local date, "YYYY-MM-DD". Blank becomes null. */
const localDateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isLocalDate(value), "Enter a valid date.")
  .nullish()
  .transform((value) => value || null);

const goalFields = {
  title: titleSchema,
  description: optionalText(GOAL_DESCRIPTION_MAX, "description"),
  reason: optionalText(GOAL_REASON_MAX, "reason"),
  lifeAreaId: lifeAreaIdSchema,
  priority: prioritySchema,
  startDate: localDateSchema,
  targetDate: localDateSchema,
};

export const TARGET_BEFORE_START =
  "The target date can't be before the start date.";

/**
 * Checks the date pair together, so a reversed range is a `targetDate`
 * field error here rather than the database's CHECK failing later.
 * "YYYY-MM-DD" strings compare in calendar order.
 */
function withDateOrder<
  T extends z.ZodType<{
    startDate: string | null;
    targetDate: string | null;
  }>,
>(schema: T) {
  return schema.superRefine((goal, context) => {
    if (goal.startDate && goal.targetDate && goal.targetDate < goal.startDate) {
      context.addIssue({
        code: "custom",
        path: ["targetDate"],
        message: TARGET_BEFORE_START,
      });
    }
  });
}

export const createGoalSchema = withDateOrder(z.strictObject(goalFields));
export type CreateGoalInput = z.output<typeof createGoalSchema>;

/** Replaces every editable field; status changes go through changeStatus. */
export const updateGoalSchema = withDateOrder(
  z.strictObject({ id: idSchema, ...goalFields }),
);
export type UpdateGoalInput = z.output<typeof updateGoalSchema>;

export const changeGoalStatusSchema = z.strictObject({
  id: idSchema,
  status: z.enum(GOAL_STATUSES, { error: "Choose a status from the list." }),
});
export type ChangeGoalStatusInput = z.output<typeof changeGoalStatusSchema>;

export const goalIdSchema = z.strictObject({ id: idSchema });
export type GoalIdInput = z.output<typeof goalIdSchema>;
