import { z } from "zod";

import {
  isReminderOffset,
  NUDGE_TIME_PATTERN,
  type ReminderOffset,
} from "@/lib/reminders";

const OFFSET_MESSAGE = "Choose a reminder from the list.";

/** One of the offsets in minutes; a select's numeric string is accepted. */
const offsetValueSchema = z.union(
  [
    z.literal("").transform(() => null),
    z.coerce
      .number({ error: OFFSET_MESSAGE })
      .refine(isReminderOffset, OFFSET_MESSAGE)
      .transform((value) => value as ReminderOffset),
  ],
  { error: OFFSET_MESSAGE },
);

/** An item's reminder: an offset, or blank/null/absent for none. */
export const reminderOffsetSchema = offsetValueSchema
  .nullish()
  .transform((value) => value ?? null);

/**
 * A reminder in an edit that may leave it alone: absent keeps the current
 * setting, null or blank removes it.
 */
export const reminderOffsetChangeSchema = offsetValueSchema
  .nullable()
  .optional();

/** The daily nudge's local time, "HH:MM"; blank or null turns it off. */
export const nudgeTimeSchema = z
  .string({ error: "Enter a valid time." })
  .trim()
  .refine(
    (value) => value === "" || NUDGE_TIME_PATTERN.test(value),
    "Enter a valid time.",
  )
  .nullish()
  .transform((value) => value || null);
