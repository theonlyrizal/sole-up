import { z } from "zod";

import type { WeekStart } from "@/lib/dates";
import { canonicalLocale, canonicalTimeZone } from "@/lib/preferences";

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
