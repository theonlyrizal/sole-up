// Today's schedule (chunk 4.9): the timeline at the top of Today and Home's
// next commitment. Both read the calendar's own rows (`eventEntry`,
// `blockEntry`), so an item looks the same here as on the calendar page.
// Pure: no server-only imports, so the queries, the views and the tests
// share it.

import { type AgendaEntry, blockEntry, eventEntry } from "./agenda";
import type { CalendarEventOccurrence } from "./calendar-events";
import {
  addDays,
  formatLocalDate,
  formatTimeOfDay,
  formatInstant,
  type LocalDate,
  localDateOf,
  startOfLocalDay,
} from "./dates";
import { timeRangeLabel } from "./event-form";
import type { TimeBlockOccurrence } from "./time-blocks";

/**
 * How far ahead Home looks for the next commitment: today and the 29 days
 * after it, the Agenda's default range, so the card can point there.
 */
export const NEXT_COMMITMENT_DAYS = 30;

/** An event or time block row: what the timeline and Home show. */
export type ScheduleEntry = AgendaEntry<never>;

/** When an entry starts, as an instant; all-day ones at local midnight. */
export function startInstant(entry: ScheduleEntry, timeZone: string): number {
  return entry.allDay
    ? startOfLocalDay(entry.start, timeZone).getTime()
    : Date.parse(entry.start);
}

/** When an entry ends, as an instant; all-day ones at the end date's midnight. */
export function endInstant(entry: ScheduleEntry, timeZone: string): number {
  // Events and blocks always have an end; only task markers don't.
  const end = entry.end ?? entry.start;
  return entry.allDay
    ? startOfLocalDay(end, timeZone).getTime()
    : Date.parse(end);
}

/** Ties at the same start: all-day first, then events before blocks, then by title. */
function compareEntries(
  a: ScheduleEntry,
  b: ScheduleEntry,
  timeZone: string,
): number {
  return (
    Number(b.allDay) - Number(a.allDay) ||
    startInstant(a, timeZone) - startInstant(b, timeZone) ||
    a.order - b.order ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Today's timeline: the events, occurrences and time blocks given (those
 * overlapping today), all-day events first, then by start. Blocks keep
 * whatever status they have, so a done or skipped one still shows.
 */
export function timelineEntries(
  events: CalendarEventOccurrence[],
  blocks: TimeBlockOccurrence[],
  timeZone: string,
): ScheduleEntry[] {
  return [
    ...events.map((event) => eventEntry(event)),
    ...blocks.map((block) => blockEntry(block)),
  ].sort((a, b) => compareEntries(a, b, timeZone));
}

/**
 * A time block that is still a commitment: scheduled (not marked done or
 * skipped) and for a task that is still open.
 */
function isPendingBlock(block: TimeBlockOccurrence): boolean {
  return block.status === "scheduled" && block.taskStatus === "open";
}

/**
 * The next commitment: of the events and time blocks given, the one that
 * starts first among those that haven't ended at `now`. One already under
 * way counts. All-day events run from their first day's local midnight to
 * their end date's, in `timeZone` (the user's). Blocks marked done or
 * skipped, and blocks for closed tasks, aren't commitments any more. On a
 * tie, all-day first, then events before blocks.
 */
export function nextCommitmentOf(
  events: CalendarEventOccurrence[],
  blocks: TimeBlockOccurrence[],
  now: Date,
  timeZone: string,
): ScheduleEntry | null {
  const candidates = [
    ...events.map((event) => eventEntry(event)),
    ...blocks.filter(isPendingBlock).map((block) => blockEntry(block)),
  ].filter((entry) => endInstant(entry, timeZone) > now.getTime());
  candidates.sort(
    (a, b) =>
      startInstant(a, timeZone) - startInstant(b, timeZone) ||
      compareEntries(a, b, timeZone),
  );
  return candidates[0] ?? null;
}

/** "Today", "Tomorrow", or the full date. */
function dayWord(date: LocalDate, today: LocalDate, locale: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return formatLocalDate(date, locale, "full");
}

/**
 * A timeline row's time: "All day", "09:00 – 10:00", or, for one that
 * began on an earlier day, both ends with their dates.
 */
export function timelineTimeLabel(
  entry: ScheduleEntry,
  today: LocalDate,
  locale: string,
  timeZone: string,
): string {
  if (entry.allDay || entry.end === null) return "All day";
  const start = new Date(entry.start);
  return timeRangeLabel(
    start,
    new Date(entry.end),
    locale,
    timeZone,
    localDateOf(start, timeZone) !== today,
  );
}

/**
 * When the next commitment happens: "Now, until 10:00" once it has
 * started, else "Today · 09:00 – 10:00", "Tomorrow · All day" or the full
 * date with its times.
 */
export function commitmentWhenLabel(
  entry: ScheduleEntry,
  now: Date,
  today: LocalDate,
  locale: string,
  timeZone: string,
): string {
  if (entry.allDay || entry.end === null) {
    const first = entry.start < today ? today : entry.start;
    return `${dayWord(first, today, locale)} · All day`;
  }
  const start = new Date(entry.start);
  const end = new Date(entry.end);
  if (start <= now) {
    const until =
      localDateOf(end, timeZone) === today
        ? formatTimeOfDay(end, locale, timeZone)
        : formatInstant(end, locale, timeZone);
    return `Now, until ${until}`;
  }
  return `${dayWord(localDateOf(start, timeZone), today, locale)} · ${timeRangeLabel(start, end, locale, timeZone)}`;
}
