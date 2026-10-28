// Quiet hours (ADR 0013): a local start and end, evaluated in the user's
// current zone, DST included. The end may be earlier than the start, and
// the hours then cross midnight. Pure: shared by the sweep and, from 5.6,
// the Settings form.

import { addDays, instantAtOrAfterLocal, localDateTimeOf } from "@/lib/dates";

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
  // An end a spring-forward gap skips is when the clock jumps past it. In a
  // fall-back overlap it is the first time the clock reads `end`, so in the
  // repeated hour after it the end has passed and they're over.
  const endAt = instantAtOrAfterLocal(endDate, end, timeZone);
  return endAt > now ? endAt : null;
}
