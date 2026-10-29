import { z } from "zod";

import type { WeekStart } from "@/lib/dates";
import { canonicalLocale, canonicalTimeZone } from "@/lib/preferences";
import { NUDGE_TIME_PATTERN } from "@/lib/reminders";
import { nudgeTimeSchema } from "@/server/modules/reminders/validation";

/** An IANA zone known to the server's runtime, stored in canonical form. */
export const timeZoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const zone = canonicalTimeZone(value);
    if (!zone) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a time zone from the list.",
      });
      return z.NEVER;
    }
    return zone;
  });

/** A BCP 47 locale the server can format dates in, stored in canonical form. */
export const localeSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const locale = canonicalLocale(value);
    if (!locale) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a language and region from the list.",
      });
      return z.NEVER;
    }
    return locale;
  });

export const weekStartSchema = z
  .number({ error: "Choose the first day of the week." })
  .int()
  .min(0, "Choose the first day of the week.")
  .max(6, "Choose the first day of the week.")
  .transform((value) => value as WeekStart);

/**
 * Saving preferences, from first sign-in or the Settings page. All three are
 * always sent: the time zone is confirmed explicitly every time it is saved.
 */
export const savePreferencesSchema = z.strictObject({
  timezone: timeZoneSchema,
  locale: localeSchema,
  weekStart: weekStartSchema,
});

export type SavePreferencesInput = z.output<typeof savePreferencesSchema>;

/** The daily planning nudge's local time (ADR 0013); null turns it off. */
export const setDailyNudgeTimeSchema = z.strictObject({
  dailyNudgeTime: nudgeTimeSchema,
});

export type SetDailyNudgeTimeInput = z.output<typeof setDailyNudgeTimeSchema>;

const QUIET_TIME_MESSAGE = "Enter a valid time.";

/** A quiet-hours bound as the form sends it, "HH:MM"; blank while off. */
const quietTimeSchema = z
  .string({ error: QUIET_TIME_MESSAGE })
  .trim()
  .refine(
    (value) => value === "" || NUDGE_TIME_PATTERN.test(value),
    QUIET_TIME_MESSAGE,
  );

const WEEKLY_REVIEW_DAY_MESSAGE = "Choose a day from the list.";

/** The weekly review reminder's weekday, 0 = Sunday … 6; null while off. */
const weeklyReviewDaySchema = z
  .number({ error: WEEKLY_REVIEW_DAY_MESSAGE })
  .int(WEEKLY_REVIEW_DAY_MESSAGE)
  .min(0, WEEKLY_REVIEW_DAY_MESSAGE)
  .max(6, WEEKLY_REVIEW_DAY_MESSAGE)
  .transform((value) => value as WeekStart)
  .nullable();

/**
 * Settings' Reminders form (ADR 0013), saved together: the global switch,
 * private mode, quiet hours (off unless `quietHours` is true, with a start
 * and an end that differ), the daily nudge time (blank turns it off) and
 * the weekly review reminder (ADR 0015: off while no day is chosen, and a
 * chosen day needs a time).
 */
export const saveReminderSettingsSchema = z
  .strictObject({
    remindersEnabled: z.boolean({ error: "Choose on or off." }),
    remindersPrivate: z.boolean({ error: "Choose on or off." }),
    quietHours: z.boolean({ error: "Choose on or off." }),
    quietHoursStart: quietTimeSchema,
    quietHoursEnd: quietTimeSchema,
    dailyNudgeTime: nudgeTimeSchema,
    weeklyReviewDay: weeklyReviewDaySchema,
    weeklyReviewTime: quietTimeSchema,
  })
  .superRefine((input, context) => {
    if (input.weeklyReviewDay !== null && input.weeklyReviewTime === "") {
      context.addIssue({
        code: "custom",
        path: ["weeklyReviewTime"],
        message: "Enter a time for the weekly review reminder.",
      });
    }
    if (!input.quietHours) return;
    if (input.quietHoursStart === "") {
      context.addIssue({
        code: "custom",
        path: ["quietHoursStart"],
        message: "Enter when quiet hours start.",
      });
    }
    if (input.quietHoursEnd === "") {
      context.addIssue({
        code: "custom",
        path: ["quietHoursEnd"],
        message: "Enter when quiet hours end.",
      });
    }
    if (
      input.quietHoursStart !== "" &&
      input.quietHoursStart === input.quietHoursEnd
    ) {
      context.addIssue({
        code: "custom",
        path: ["quietHoursEnd"],
        message: "Quiet hours need to end at a different time than they start.",
      });
    }
  })
  .transform(
    ({
      quietHours,
      quietHoursStart,
      quietHoursEnd,
      weeklyReviewDay,
      weeklyReviewTime,
      ...input
    }) => ({
      ...input,
      quietHoursStart: quietHours ? quietHoursStart : null,
      quietHoursEnd: quietHours ? quietHoursEnd : null,
      weeklyReviewDay,
      weeklyReviewTime: weeklyReviewDay === null ? null : weeklyReviewTime,
    }),
  );

export type SaveReminderSettingsInput = z.output<
  typeof saveReminderSettingsSchema
>;
