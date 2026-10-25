import { z } from "zod";

import { isLocalDate, type LocalDate } from "@/lib/dates";
import { canonicalTimeZone } from "@/lib/preferences";
import { fromRrule } from "@/lib/recurrence";
import {
  TIME_BLOCK_MAX_MINUTES,
  TIME_BLOCK_MIN_MINUTES,
  TIME_BLOCK_SCOPES,
  TIME_BLOCK_STATUSES,
} from "@/lib/time-blocks";
import {
  eventsBetweenSchema,
  rruleFieldSchema,
} from "@/server/modules/calendar-events/validation";

const idSchema = z.uuid("Choose a time block.");

const startDateSchema = z
  .string({ error: "Pick a date." })
  .trim()
  .refine((value): value is LocalDate => isLocalDate(value), "Pick a date.");

const startTimeSchema = z
  .string({ error: "Enter a start time." })
  .trim()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a start time.");

const DURATION_MESSAGE = "Choose a length from 1 minute to 24 hours.";
const durationSchema = z
  .number({ error: DURATION_MESSAGE })
  .int(DURATION_MESSAGE)
  .min(TIME_BLOCK_MIN_MINUTES, DURATION_MESSAGE)
  .max(TIME_BLOCK_MAX_MINUTES, DURATION_MESSAGE);

const timeZoneSchema = z
  .string({ error: "Choose a time zone." })
  .transform((value, context) => {
    const zone = canonicalTimeZone(value.trim());
    if (!zone) {
      context.addIssue({ code: "custom", message: "Choose a time zone." });
      return z.NEVER;
    }
    return zone;
  });

/**
 * A block's times as the form sends them (ADR 0012): a local start date
 * and time in `tz`, and a length of at most 24 hours. Timed only.
 */
const timeFields = {
  startDate: startDateSchema,
  startTime: startTimeSchema,
  durationMinutes: durationSchema,
  tz: timeZoneSchema,
};

type TimeFields = z.output<z.ZodObject<typeof timeFields>> & {
  rrule?: string | null;
};

/** A repeat that ends on a date ends on or after the start date. */
function checkRuleEnd(block: TimeFields, context: z.core.$RefinementCtx) {
  if (!block.rrule) return;
  const end = fromRrule(block.rrule).end;
  if (end.type === "until" && end.until < block.startDate) {
    context.addIssue({
      code: "custom",
      path: ["rrule"],
      message: "End the repeat on or after the start date.",
    });
  }
}

const whenOf = ({ startDate, startTime, durationMinutes, tz }: TimeFields) => ({
  startDate,
  startTime,
  durationMinutes,
  tz,
});

/** A one-off block for one of the user's tasks, or a series when `rrule` is set. */
export const createTimeBlockSchema = z
  .strictObject({
    taskId: z.uuid("Choose one of your tasks."),
    ...timeFields,
    rrule: rruleFieldSchema,
  })
  .superRefine(checkRuleEnd)
  .transform(({ taskId, rrule, ...block }) => ({
    taskId,
    when: whenOf(block),
    rrule,
  }));
export type CreateTimeBlockInput = z.output<typeof createTimeBlockSchema>;

/**
 * Replaces a one-off block's times; setting `rrule` makes it a series. A
 * series changes through `editTimeBlockOccurrenceSchema`. The task stays.
 */
export const updateTimeBlockSchema = z
  .strictObject({ id: idSchema, ...timeFields, rrule: rruleFieldSchema })
  .superRefine(checkRuleEnd)
  .transform(({ id, rrule, ...block }) => ({ id, when: whenOf(block), rrule }));
export type UpdateTimeBlockInput = z.output<typeof updateTimeBlockSchema>;

export const timeBlockIdSchema = z.strictObject({ id: idSchema });
export type TimeBlockIdInput = z.output<typeof timeBlockIdSchema>;

/** An occurrence's key: its original start as an ISO 8601 instant. */
const originalStartSchema = z.iso
  .datetime({ offset: true, error: "Choose an occurrence." })
  .transform((value) => new Date(value));

const occurrenceFields = { id: idSchema, originalStart: originalStartSchema };

/**
 * A change to one occurrence of a series, with the scope it applies to
 * (ADR 0012). "this" changes only that occurrence, so it can't change the
 * rule; "following" and "all" take the series' rule (null stops repeating).
 */
export const editTimeBlockOccurrenceSchema = z
  .discriminatedUnion(
    "scope",
    [
      z.strictObject({
        ...occurrenceFields,
        scope: z.literal("this"),
        ...timeFields,
      }),
      z.strictObject({
        ...occurrenceFields,
        scope: z.literal("following"),
        ...timeFields,
        rrule: rruleFieldSchema,
      }),
      z.strictObject({
        ...occurrenceFields,
        scope: z.literal("all"),
        ...timeFields,
        rrule: rruleFieldSchema,
      }),
    ],
    "Choose which blocks to change.",
  )
  .superRefine(checkRuleEnd)
  .transform(({ id, originalStart, scope, ...fields }) => {
    const { rrule = null, ...block } = fields as TimeFields;
    return { id, originalStart, scope, rrule, when: whenOf(block) };
  });
export type EditTimeBlockOccurrenceInput = z.output<
  typeof editTimeBlockOccurrenceSchema
>;

/** Deletes one occurrence, it and every later one, or the whole series. */
export const deleteTimeBlockOccurrenceSchema = z.strictObject({
  ...occurrenceFields,
  scope: z.enum(TIME_BLOCK_SCOPES, "Choose which blocks to delete."),
});
export type DeleteTimeBlockOccurrenceInput = z.output<
  typeof deleteTimeBlockOccurrenceSchema
>;

/**
 * Sets a block's status: a one-off's (no `originalStart`), or one
 * occurrence's of a series (with its `originalStart`).
 */
export const setTimeBlockStatusSchema = z.strictObject({
  id: idSchema,
  originalStart: originalStartSchema.optional(),
  status: z.enum(TIME_BLOCK_STATUSES, "Choose a status."),
});
export type SetTimeBlockStatusInput = z.output<typeof setTimeBlockStatusSchema>;

/** Whole local days in `tz`, `localEnd` exclusive, as for events. */
export const blocksBetweenSchema = eventsBetweenSchema;
export type BlocksBetweenInput = z.output<typeof blocksBetweenSchema>;
