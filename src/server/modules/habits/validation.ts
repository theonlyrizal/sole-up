import { z } from "zod";

import { isLocalDate, type LocalDate } from "@/lib/dates";
import {
  CADENCE_CONFIG_SCHEMAS,
  type HabitCadence,
} from "@/lib/habits/cadence";
import {
  HABIT_CADENCE_TYPES,
  HABIT_DESCRIPTION_MAX,
  HABIT_MEASURES,
  HABIT_TITLE_MAX,
  HABIT_UNIT_MAX,
} from "@/lib/habits/habit";

// Input for the habit service (ADR 0014). Each schema checks the fields
// that decide each other together, so a broken rule is a field error here
// rather than a CHECK failing in the database later.

const idSchema = z.uuid("Choose a habit.");

const titleSchema = z
  .string({ error: "Give the habit a title." })
  .trim()
  .min(1, "Give the habit a title.")
  .max(
    HABIT_TITLE_MAX,
    `Keep the title to ${HABIT_TITLE_MAX} characters or fewer.`,
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

const startDateSchema = z
  .string({ error: "Pick a start date." })
  .trim()
  .refine(
    (value): value is LocalDate => isLocalDate(value),
    "Pick a start date.",
  );

/** Optional local date, "YYYY-MM-DD". Blank becomes null. */
const endDateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isLocalDate(value), "Enter a valid date.")
  .nullish()
  .transform((value) => value || null);

const goalIdSchema = z
  .uuid("Choose one of your goals.")
  .nullish()
  .transform((value) => value ?? null);

export const AMOUNT_MESSAGE =
  "Enter a number above 0 with at most 2 decimal places, up to 99,999.99.";
const AMOUNT_PATTERN = /^\d{1,5}(?:\.\d{1,2})?$/;

/**
 * An optional amount per day (a quantity habit's target). Takes a number or
 * a form's string; blank becomes null. Checked as text so that 0.1 + 0.2
 * style floats can't sneak past the 2-decimal rule.
 */
const optionalAmountSchema = z
  .union([z.number(), z.string()], { error: AMOUNT_MESSAGE })
  .nullish()
  .transform((value, context) => {
    if (value === null || value === undefined) return null;
    const text = typeof value === "number" ? String(value) : value.trim();
    if (text === "") return null;
    if (!AMOUNT_PATTERN.test(text) || Number(text) <= 0) {
      context.addIssue({ code: "custom", message: AMOUNT_MESSAGE });
      return z.NEVER;
    }
    return Number(text);
  });

const cadenceFields = {
  cadenceType: z.enum(HABIT_CADENCE_TYPES, {
    error: "Choose how often from the list.",
  }),
  // Checked against its type below, where the type is known.
  cadenceConfig: z.unknown().optional(),
};

type Context = z.core.$RefinementCtx;

/**
 * The cadence's config checked against its type, as the stored pair, or
 * NEVER with the config's issues under `cadenceConfig`.
 */
function checkCadence(
  input: { cadenceType: HabitCadence["cadenceType"]; cadenceConfig: unknown },
  context: Context,
): HabitCadence | typeof z.NEVER {
  const result = CADENCE_CONFIG_SCHEMAS[input.cadenceType].safeParse(
    input.cadenceConfig ?? {},
  );
  if (result.success) {
    return {
      cadenceType: input.cadenceType,
      cadenceConfig: result.data,
    } as HabitCadence;
  }
  for (const issue of result.error.issues) {
    context.addIssue({
      code: "custom",
      path: ["cadenceConfig", ...issue.path],
      message: issue.message,
    });
  }
  return z.NEVER;
}

export const END_BEFORE_START = "The end date can't be before the start date.";

/** "YYYY-MM-DD" strings compare in calendar order. */
function checkDateOrder(
  input: { startDate: LocalDate; endDate: string | null },
  context: Context,
) {
  if (input.endDate && input.endDate < input.startDate) {
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: END_BEFORE_START,
    });
  }
}

const habitFields = {
  title: titleSchema,
  description: optionalText(HABIT_DESCRIPTION_MAX, "description"),
  startDate: startDateSchema,
  endDate: endDateSchema,
  goalId: goalIdSchema,
};

export const UNIT_REQUIRED = "Name the unit, such as glasses, min or km.";
export const TARGET_REQUIRED = "Enter the amount to aim for each day.";
export const CHECK_HAS_NO_UNIT = "Only quantity habits have a unit.";
export const CHECK_HAS_NO_TARGET = "Only quantity habits have a target.";

/**
 * A new habit and its first schedule. `unit` and `target` are required for
 * a quantity habit and refused for a check habit. Measure and unit can't be
 * changed afterwards.
 */
export const createHabitSchema = z
  .strictObject({
    ...habitFields,
    measure: z.enum(HABIT_MEASURES, {
      error: "Choose how the habit is measured.",
    }),
    unit: optionalText(HABIT_UNIT_MAX, "unit"),
    ...cadenceFields,
    target: optionalAmountSchema,
  })
  .transform(({ cadenceType, cadenceConfig, ...input }, context) => {
    checkDateOrder(input, context);
    if (input.measure === "quantity") {
      if (!input.unit) {
        context.addIssue({
          code: "custom",
          path: ["unit"],
          message: UNIT_REQUIRED,
        });
      }
      if (input.target === null) {
        context.addIssue({
          code: "custom",
          path: ["target"],
          message: TARGET_REQUIRED,
        });
      }
    } else {
      if (input.unit) {
        context.addIssue({
          code: "custom",
          path: ["unit"],
          message: CHECK_HAS_NO_UNIT,
        });
      }
      if (input.target !== null) {
        context.addIssue({
          code: "custom",
          path: ["target"],
          message: CHECK_HAS_NO_TARGET,
        });
      }
    }
    const cadence = checkCadence({ cadenceType, cadenceConfig }, context);
    return { ...input, cadence };
  });
export type CreateHabitInput = z.output<typeof createHabitSchema>;

/** Replaces every field edited in place (HABIT_EDITABLE_FIELDS). */
export const updateHabitSchema = z
  .strictObject({ id: idSchema, ...habitFields })
  .superRefine(checkDateOrder);
export type UpdateHabitInput = z.output<typeof updateHabitSchema>;

/**
 * A new cadence and target from the current week. Whether `target` fits the
 * habit's measure is checked by the service, which knows the measure.
 */
export const changeHabitScheduleSchema = z
  .strictObject({
    id: idSchema,
    ...cadenceFields,
    target: optionalAmountSchema,
  })
  .transform(({ cadenceType, cadenceConfig, ...input }, context) => ({
    ...input,
    cadence: checkCadence({ cadenceType, cadenceConfig }, context),
  }));
export type ChangeHabitScheduleInput = z.output<
  typeof changeHabitScheduleSchema
>;

export const habitIdSchema = z.strictObject({ id: idSchema });
export type HabitIdInput = z.output<typeof habitIdSchema>;
