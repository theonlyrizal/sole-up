// Quiet hours (ADR 0013): a local start and end, evaluated in the user's
// current zone, DST included. The end may be earlier than the start, and
// the hours then cross midnight. Pure: shared by the sweep and, from 5.6,
// the Settings form.

import { addDays, instantFromLocal, localDateTimeOf } from "@/lib/dates";

export type QuietHours = {
  /** "HH:MM" local time the quiet hours begin. */
  start: string;
  /** "HH:MM" local time they end (exclusive). */
  end: string;
};

/** What Settings suggests when quiet hours are first turned on (ADR 0013). */
export const SUGGESTED_QUIET_HOURS: QuietHours = {
  start: "22:00",
  end: "07:00",
};

/** True when a local "HH:MM" time falls inside the quiet hours. */
export function isInQuietHours(time: string, { start, end }: QuietHours) {
  return end < start
    ? time >= start || time < end
    : time >= start && time < end;
}

/** Quiet hours from the stored columns, or null while they are off. */
export function quietHoursOf(
  start: string | null,
  end: string | null,
): QuietHours | null {
  return start && end && start !== end ? { start, end } : null;
}

/**
 * When the quiet hours `now` falls inside end, as an instant, or null when
 * `now` is outside them. "HH:MM" strings compare correctly as text.
 */
export function quietHoursEndAt(
  now: Date,
  timeZone: string,
  { start, end }: QuietHours,
): Date | null {
  const local = localDateTimeOf(now, timeZone);
  const crossesMidnight = end < start;
  if (!isInQuietHours(local.time, { start, end })) return null;

  // Before midnight in hours that cross it, they end tomorrow.
  const endDate =
    crossesMidnight && local.time >= start
      ? addDays(local.date, 1)
      : local.date;
  const endAt = instantFromLocal(endDate, end, timeZone);
  // A DST gap can resolve the end to an instant already past; then they're over.
  return endAt > now ? endAt : null;
}
