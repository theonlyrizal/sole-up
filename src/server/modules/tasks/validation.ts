import { z } from "zod";

import { isLocalDate } from "@/lib/dates";
import { canonicalTimeZone } from "@/lib/preferences";
import { PRIORITIES } from "@/lib/priorities";
import {
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_ESTIMATE_MIN_MINUTES,
  TASK_NOTES_MAX,
  TASK_STATUSES,
  TASK_TITLE_MAX,
} from "@/lib/tasks";

const idSchema = z.uuid("Choose a task.");

const titleSchema = z
  .string({ error: "Give the task a title." })
  .trim()
  .min(1, "Give the task a title.")
  .max(
    TASK_TITLE_MAX,
    `Keep the title to ${TASK_TITLE_MAX} characters or fewer.`,
  );

/** Optional notes: blank becomes null. */
const notesSchema = z
  .string()
  .trim()
  .max(
    TASK_NOTES_MAX,
    `Keep the notes to ${TASK_NOTES_MAX} characters or fewer.`,
  )
  .nullish()
  .transform((value) => value || null);

const prioritySchema = z
  .enum(PRIORITIES, { error: "Choose a priority from the list." })
  .nullish()
  .transform((value) => value ?? null);

const ESTIMATE_MESSAGE = `Enter whole minutes from ${TASK_ESTIMATE_MIN_MINUTES} to ${TASK_ESTIMATE_MAX_MINUTES}.`;

/**
 * Optional whole minutes. A form's blank string becomes null. The union's
 * own error replaces Zod's generic "Invalid input" when neither branch fits.
 */
const estimateSchema = z
  .union(
    [
      z.literal("").transform(() => null),
      z.coerce
        .number({ error: ESTIMATE_MESSAGE })
        .int(ESTIMATE_MESSAGE)
        .min(TASK_ESTIMATE_MIN_MINUTES, ESTIMATE_MESSAGE)
        .max(TASK_ESTIMATE_MAX_MINUTES, ESTIMATE_MESSAGE),
    ],
    { error: ESTIMATE_MESSAGE },
  )
  .nullish()
  .transform((value) => value ?? null);

/** Optional local date, "YYYY-MM-DD". Blank becomes null. */
const localDateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isLocalDate(value), "Enter a valid date.")
  .nullish()
  .transform((value) => value || null);

/** Optional wall-clock time, "HH:MM". Blank becomes null. */
const localTimeSchema = z
  .string()
  .trim()
  .regex(/^(?:$|(?:[01]\d|2[0-3]):[0-5]\d)$/, "Enter a valid time.")
  .nullish()
  .transform((value) => value || null);

/** Optional IANA zone, stored in its canonical form. Blank becomes null. */
const timeZoneSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value, context) => {
    if (!value) return null;
    const zone = canonicalTimeZone(value);
    if (!zone) {
      context.addIssue({ code: "custom", message: "Choose a time zone." });
      return z.NEVER;
    }
    return zone;
  });

const parentIdSchema = (message: string) =>
  z
    .uuid(message)
    .nullish()
    .transform((value) => value ?? null);

const parentFields = {
  goalId: parentIdSchema("Choose one of your goals."),
  milestoneId: parentIdSchema("Choose one of your milestones."),
};

/**
 * A deadline as a form sends it: no date (none), a date alone (all-day,
 * stored as `due_date`), or a date, time and zone (timed, stored as the
 * UTC instant `due_at` plus `due_tz`; ADR 0004).
 */
const dueFields = {
  dueDate: localDateSchema,
  dueTime: localTimeSchema,
  dueTz: timeZoneSchema,
};

export const ONE_PARENT =
  "A task can sit under a goal or a milestone, not both.";

/** At most one parent (ADR 0004), as a field error rather than the CHECK. */
function checkOneParent(
  task: { goalId: string | null; milestoneId: string | null },
  context: z.core.$RefinementCtx,
) {
  if (task.goalId && task.milestoneId) {
    context.addIssue({
      code: "custom",
      path: ["milestoneId"],
      message: ONE_PARENT,
    });
  }
}

/** A time needs a date and a zone; a zone means nothing without a time. */
function checkDueShape(
  due: { dueDate: string | null; dueTime: string | null; dueTz: string | null },
  context: z.core.$RefinementCtx,
) {
  if (due.dueTime && !due.dueDate) {
    context.addIssue({
      code: "custom",
      path: ["dueDate"],
      message: "Pick a date for this time.",
    });
  }
  if (due.dueTime && !due.dueTz) {
    context.addIssue({
      code: "custom",
      path: ["dueTz"],
      message: "Choose a time zone.",
    });
  }
  if (due.dueTz && !due.dueTime) {
    context.addIssue({
      code: "custom",
      path: ["dueTime"],
      message: "Enter a time, or clear the time zone.",
    });
  }
}

/** Quick add sends only a title; the edit form may send everything. */
export const createTaskSchema = z
  .strictObject({
    title: titleSchema,
    notes: notesSchema,
    priority: prioritySchema,
    estimatedMinutes: estimateSchema,
    plannedDate: localDateSchema,
    ...parentFields,
    ...dueFields,
  })
  .superRefine((task, context) => {
    checkOneParent(task, context);
    checkDueShape(task, context);
  });
export type CreateTaskInput = z.output<typeof createTaskSchema>;

/** Replaces the plain fields; dates, parent and status have their own paths. */
export const updateTaskSchema = z.strictObject({
  id: idSchema,
  title: titleSchema,
  notes: notesSchema,
  priority: prioritySchema,
  estimatedMinutes: estimateSchema,
});
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;

/** Complete (`completed`), reopen (`open`) and cancel (`cancelled`). */
export const changeTaskStatusSchema = z.strictObject({
  id: idSchema,
  status: z.enum(TASK_STATUSES, { error: "Choose a status from the list." }),
});
export type ChangeTaskStatusInput = z.output<typeof changeTaskStatusSchema>;

/** A date in the past is allowed (backfill); null unplans. */
export const planTaskSchema = z.strictObject({
  id: idSchema,
  plannedDate: localDateSchema,
});
export type PlanTaskInput = z.output<typeof planTaskSchema>;

/** Today's and tomorrow's dates come from the user's saved zone. */
export const RELATIVE_PLAN_DAYS = ["today", "tomorrow"] as const;

/** Today's one-tap "plan for today" and "move to tomorrow". */
export const planTaskForDaySchema = z.strictObject({
  id: idSchema,
  day: z.enum(RELATIVE_PLAN_DAYS, { error: "Choose today or tomorrow." }),
});
export type PlanTaskForDayInput = z.output<typeof planTaskForDaySchema>;

/** Sets, changes or clears the deadline; all three fields blank clears it. */
export const rescheduleTaskDueSchema = z
  .strictObject({ id: idSchema, ...dueFields })
  .superRefine(checkDueShape);
export type RescheduleTaskDueInput = z.output<typeof rescheduleTaskDueSchema>;

/** Both null moves the task to the inbox (if it is also unplanned). */
export const moveTaskSchema = z
  .strictObject({ id: idSchema, ...parentFields })
  .superRefine(checkOneParent);
export type MoveTaskInput = z.output<typeof moveTaskSchema>;

/**
 * The Plan page's inline edit: planned date, deadline and parent in one
 * save. Blank fields clear them.
 */
export const scheduleTaskSchema = z
  .strictObject({
    id: idSchema,
    plannedDate: localDateSchema,
    ...dueFields,
    ...parentFields,
  })
  .superRefine((task, context) => {
    checkOneParent(task, context);
    checkDueShape(task, context);
  });
export type ScheduleTaskInput = z.output<typeof scheduleTaskSchema>;

export const taskIdSchema = z.strictObject({ id: idSchema });
export type TaskIdInput = z.output<typeof taskIdSchema>;

/** Most tasks one bulk action may change at once. */
export const TASK_BULK_MAX = 200;

/** One or more of the user's tasks, duplicates dropped. */
const idsSchema = z
  .array(idSchema, { error: "Choose at least one task." })
  .min(1, "Choose at least one task.")
  .max(TASK_BULK_MAX, `Choose ${TASK_BULK_MAX} tasks or fewer.`)
  .transform((ids) => [...new Set(ids)]);

/** Bulk "plan today": the server works out the user's today. */
export const taskIdsSchema = z.strictObject({ ids: idsSchema });
export type TaskIdsInput = z.output<typeof taskIdsSchema>;

export const planTasksSchema = z.strictObject({
  ids: idsSchema,
  plannedDate: localDateSchema,
});
export type PlanTasksInput = z.output<typeof planTasksSchema>;

/** Bulk "assign to a goal" (or a milestone, or back to no parent). */
export const moveTasksSchema = z
  .strictObject({ ids: idsSchema, ...parentFields })
  .superRefine(checkOneParent);
export type MoveTasksInput = z.output<typeof moveTasksSchema>;

/** The parent options a picker offers take no input. */
export const noInputSchema = z.strictObject({});
