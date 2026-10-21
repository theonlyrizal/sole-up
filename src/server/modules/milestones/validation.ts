import { z } from "zod";

import { isLocalDate } from "@/lib/dates";
import {
  MILESTONE_DESCRIPTION_MAX,
  MILESTONE_STATUSES,
  MILESTONE_TITLE_MAX,
} from "@/lib/milestones";

const idSchema = z.uuid("Choose a milestone.");
const goalIdSchema = z.uuid("Choose a goal.");

const titleSchema = z
  .string({ error: "Give the milestone a title." })
  .trim()
  .min(1, "Give the milestone a title.")
  .max(
    MILESTONE_TITLE_MAX,
    `Keep the title to ${MILESTONE_TITLE_MAX} characters or fewer.`,
  );

/** Optional description: blank becomes null. */
const descriptionSchema = z
  .string()
  .trim()
  .max(
    MILESTONE_DESCRIPTION_MAX,
    `Keep the description to ${MILESTONE_DESCRIPTION_MAX} characters or fewer.`,
  )
  .nullish()
  .transform((value) => value || null);

/** Optional local date, "YYYY-MM-DD". Blank becomes null. */
const dueDateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isLocalDate(value), "Enter a valid date.")
  .nullish()
  .transform((value) => value || null);

const milestoneFields = {
  title: titleSchema,
  description: descriptionSchema,
  dueDate: dueDateSchema,
};

export const createMilestoneSchema = z.strictObject({
  goalId: goalIdSchema,
  ...milestoneFields,
});
export type CreateMilestoneInput = z.output<typeof createMilestoneSchema>;

/** Replaces every editable field; status and order have their own paths. */
export const updateMilestoneSchema = z.strictObject({
  id: idSchema,
  ...milestoneFields,
});
export type UpdateMilestoneInput = z.output<typeof updateMilestoneSchema>;

const unique = (ids: string[]) => new Set(ids).size === ids.length;

/** Every milestone of the goal, in the new order. */
export const reorderMilestonesSchema = z.strictObject({
  goalId: goalIdSchema,
  ids: z
    .array(idSchema)
    .min(1)
    .max(500)
    .refine(unique, "Each milestone can appear only once."),
});
export type ReorderMilestonesInput = z.output<typeof reorderMilestonesSchema>;

/**
 * Complete (`completed`), reopen or undrop (`open`), and drop (`dropped`)
 * are all this one change.
 */
export const changeMilestoneStatusSchema = z.strictObject({
  id: idSchema,
  status: z.enum(MILESTONE_STATUSES, {
    error: "Choose a status from the list.",
  }),
});
export type ChangeMilestoneStatusInput = z.output<
  typeof changeMilestoneStatusSchema
>;

export const milestoneIdSchema = z.strictObject({ id: idSchema });
export type MilestoneIdInput = z.output<typeof milestoneIdSchema>;
