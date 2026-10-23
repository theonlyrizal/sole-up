// Helpers for addressing and labelling events on the calendar page (chunks
// 4.4 and 4.5). Pure and client-safe.

import type { CalendarEventOccurrence } from "./calendar-events";
import { addDays, formatLocalDate, type LocalDate } from "./dates";

/**
 * The key one row of the list is addressed by: the series and original
 * start of an occurrence, or the event's ID for a one-off.
 */
export function occurrenceKey(event: CalendarEventOccurrence): string {
  const start = originalStartParam(event);
  return start === null ? event.id : `${event.id}:${start}`;
}

/**
 * An occurrence's original start as the scoped actions take it: an ISO
 * instant for a timed series, a local date for an all-day one. Null for a
 * one-off event.
 */
export function originalStartParam(
  event: CalendarEventOccurrence,
): string | null {
  if (event.originalStart === null) return null;
  return event.originalStart instanceof Date
    ? event.originalStart.toISOString()
    : event.originalStart;
}

/** "Today · Friday, 23 October 2026", "Tomorrow · …", or the full date. */
export function calendarDayLabel(
  date: LocalDate,
  today: LocalDate,
  locale: string,
): string {
  const label = formatLocalDate(date, locale, "full");
  if (date === today) return `Today · ${label}`;
  return date === addDays(today, 1) ? `Tomorrow · ${label}` : label;
}
