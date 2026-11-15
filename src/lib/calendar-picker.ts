import { addDays, dayOfWeek, type LocalDate, type WeekStart } from "./dates";

/** A month jump keeps the day number where it exists in the new month. */
export function shiftMonth(date: LocalDate, offset: number): LocalDate {
  const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + offset);
  if (next.getUTCFullYear() < 0 || next.getUTCFullYear() > 9999) return date;

  const last = new Date(next);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  next.setUTCDate(Math.min(Number(date.slice(8)), last.getUTCDate()));
  return next.toISOString().slice(0, 10);
}

/** Full weeks, including the neighboring dates in the first and last rows. */
export function monthDays(
  date: LocalDate,
  weekStart: WeekStart,
): LocalDate[][] {
  const first = `${date.slice(0, 7)}-01`;
  const last = new Date(`${first}T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const firstWeekday = dayOfWeek(first);
  const offset = (firstWeekday - weekStart + 7) % 7;
  const weeks = Math.ceil((offset + last.getUTCDate()) / 7);
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) =>
      addDays(first, week * 7 + day - offset),
    ),
  );
}
