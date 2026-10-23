// The calendar page's plain list of upcoming events (chunk 4.4, until the
// FullCalendar views of 4.5). Pure and client-safe.

import type { CalendarEventOccurrence } from "./calendar-events";
import { addDays, formatLocalDate, localDateOf, type LocalDate } from "./dates";

/** One day of the list, with the events that start on it. */
export type EventDay = { date: LocalDate; events: CalendarEventOccurrence[] };

/**
 * The local day an event is listed under in `timeZone`: the day it starts
 * (a timed one's in the user's zone, an all-day one's date), or `today`
 * for one that started earlier and is still going.
 */
export function listDayOf(
  event: CalendarEventOccurrence,
  today: LocalDate,
  timeZone: string,
): LocalDate {
  const start = event.allDay
    ? event.startDate
    : localDateOf(event.startAt, timeZone);
  return start < today ? today : start;
}

/**
 * Events grouped by their list day, days in order and only days with
 * events. Keeps the order `eventsBetween` returns within a day (all-day
 * first, then by start).
 */
export function groupEventsByDay(
  events: readonly CalendarEventOccurrence[],
  today: LocalDate,
  timeZone: string,
): EventDay[] {
  const days = new Map<LocalDate, CalendarEventOccurrence[]>();
  for (const event of events) {
    const date = listDayOf(event, today, timeZone);
    const list = days.get(date) ?? [];
    list.push(event);
    days.set(date, list);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      events: list.sort(
        (a, b) =>
          Number(b.allDay) - Number(a.allDay) ||
          startKey(a).localeCompare(startKey(b)),
      ),
    }));
}

function startKey(event: CalendarEventOccurrence): string {
  return event.allDay ? event.startDate : event.startAt.toISOString();
}

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
