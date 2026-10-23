// The Agenda view (chunk 4.5): a chronological list of the user's events
// (occurrences of repeating ones included), timed task deadlines and planned
// tasks for a chosen range of days. Pure: no server-only imports, so the
// query, the page, the calendar component and the tests share it.
//
// Days are local dates in the user's saved time zone. The range is whole
// local days, `start` included and `start + days` excluded, which is the
// range `eventsBetween` takes. All-day task deadlines are not on the Agenda
// (ADR 0012 lists timed deadlines only); Upcoming shows them.

import type { CalendarEventOccurrence } from "./calendar-events";
import { occurrenceKey } from "./calendar-list";
import {
  addDays,
  formatLocalDate,
  isLocalDate,
  type LocalDate,
  localDateOf,
} from "./dates";
import type { Task } from "./tasks";

/**
 * How many days the Agenda can show at once. The default is 30, the list
 * the calendar page showed before the Agenda (chunk 4.4).
 */
export const AGENDA_DAY_COUNTS = [7, 14, 30] as const;
export type AgendaDayCount = (typeof AGENDA_DAY_COUNTS)[number];
export const DEFAULT_AGENDA_DAYS: AgendaDayCount = 30;

/** Each day count's tab label. */
export const AGENDA_DAY_COUNT_LABELS: Record<AgendaDayCount, string> = {
  7: "7 days",
  14: "14 days",
  30: "30 days",
};

/** The Agenda's range: `days` local days from `start`. */
export type AgendaRange = { start: LocalDate; days: AgendaDayCount };

/** The page's path; the range lives in its search params. */
export const AGENDA_PATH = "/plan/calendar";

type SearchParam = string | string[] | undefined;

function firstValue(value: SearchParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The range from the page's `start` and `days` search params. A missing or
 * malformed `start` is today; a `days` other than 7, 14 or 30 is 30.
 */
export function parseAgendaRange(
  params: { start?: SearchParam; days?: SearchParam },
  today: LocalDate,
): AgendaRange {
  const start = firstValue(params.start);
  const days = Number(firstValue(params.days));
  return {
    start: start !== undefined && isLocalDate(start) ? start : today,
    days:
      AGENDA_DAY_COUNTS.find((count) => count === days) ?? DEFAULT_AGENDA_DAYS,
  };
}

/**
 * The page's URL for a range. Defaults are left out, so the plain path is
 * the next 30 days from today; a range starting today has no `start`.
 */
export function agendaHref(range: AgendaRange, today: LocalDate): string {
  const params = new URLSearchParams();
  if (range.start !== today) params.set("start", range.start);
  if (range.days !== DEFAULT_AGENDA_DAYS) params.set("days", `${range.days}`);
  const search = params.toString();
  return search ? `${AGENDA_PATH}?${search}` : AGENDA_PATH;
}

/** The first day after the range (exclusive end). */
export function agendaEnd(range: AgendaRange): LocalDate {
  return addDays(range.start, range.days);
}

/** The range just before (-1) or after (1) this one, of the same length. */
export function shiftAgendaRange(
  range: AgendaRange,
  direction: -1 | 1,
): AgendaRange {
  return { ...range, start: addDays(range.start, direction * range.days) };
}

/** "23 Oct 2026 to 5 Nov 2026": the range's first and last day. */
export function agendaRangeLabel(range: AgendaRange, locale: string): string {
  const last = addDays(agendaEnd(range), -1);
  return `${formatLocalDate(range.start, locale)} to ${formatLocalDate(last, locale)}`;
}

/** True when `date` is one of the range's days. */
export function inAgendaRange(date: LocalDate, range: AgendaRange): boolean {
  return date >= range.start && date < agendaEnd(range);
}

/** What a task entry stands for on its day. */
export type AgendaTaskRole = "planned" | "due" | "plannedDue";

/** The task fields the Agenda reads. */
export type AgendaTaskFields = Pick<
  Task,
  "id" | "title" | "plannedDate" | "dueAt" | "dueTz"
>;

/**
 * One row of the Agenda, ready for the calendar component: `start`/`end`
 * are ISO instants for timed rows and local dates for all-day rows (end
 * exclusive). `order` breaks ties at the same start: events first.
 */
export type AgendaEntry<T extends AgendaTaskFields = AgendaTaskFields> = {
  id: string;
  title: string;
  allDay: boolean;
  start: string;
  end: string | null;
  order: number;
} & (
  | { kind: "event"; event: CalendarEventOccurrence }
  | { kind: "task"; task: T; role: AgendaTaskRole }
);

/** An event occurrence's row (the Week and Day grids use it too). */
export function eventEntry(event: CalendarEventOccurrence): AgendaEntry<never> {
  const base = {
    id: `event:${occurrenceKey(event)}`,
    title: event.title,
    order: 0,
  };
  return event.allDay
    ? {
        ...base,
        allDay: true,
        start: event.startDate,
        end: event.endDate,
        kind: "event",
        event,
      }
    : {
        ...base,
        allDay: false,
        start: event.startAt.toISOString(),
        end: event.endAt.toISOString(),
        kind: "event",
        event,
      };
}

/**
 * A task's rows inside the range: its plan as an all-day row on the planned
 * date, and its timed deadline at its time on its local day in `timeZone`.
 * Planned and due on the same day is one row, at the deadline's time.
 */
function taskEntries<T extends AgendaTaskFields>(
  task: T,
  range: AgendaRange,
  timeZone: string,
): AgendaEntry<T>[] {
  const planned =
    task.plannedDate !== null && inAgendaRange(task.plannedDate, range)
      ? task.plannedDate
      : null;
  const dueDay =
    task.dueAt !== null &&
    inAgendaRange(localDateOf(task.dueAt, timeZone), range)
      ? localDateOf(task.dueAt, timeZone)
      : null;
  const entries: AgendaEntry<T>[] = [];
  if (task.dueAt !== null && dueDay !== null) {
    entries.push({
      id: `task:${task.id}:due`,
      title: task.title,
      allDay: false,
      start: task.dueAt.toISOString(),
      end: null,
      order: 1,
      kind: "task",
      task,
      role: planned === dueDay ? "plannedDue" : "due",
    });
  }
  if (planned !== null && planned !== dueDay) {
    entries.push({
      id: `task:${task.id}:planned`,
      title: task.title,
      allDay: true,
      start: planned,
      end: addDays(planned, 1),
      order: 1,
      kind: "task",
      task,
      role: "planned",
    });
  }
  return entries;
}

/**
 * The Agenda's rows for `range`: every event occurrence given, and each
 * task's plan and timed deadline that fall inside it. The calendar
 * component orders them; this keeps the input order otherwise.
 */
export function agendaEntries<T extends AgendaTaskFields>(
  events: CalendarEventOccurrence[],
  tasks: T[],
  range: AgendaRange,
  timeZone: string,
): AgendaEntry<T>[] {
  return [
    ...events.map((event) => eventEntry(event)),
    ...tasks.flatMap((task) => taskEntries(task, range, timeZone)),
  ];
}

/** The short label that says what a row is, read before its title. */
export function agendaEntryKind(entry: AgendaEntry): string {
  if (entry.kind === "event") return "Event";
  switch (entry.role) {
    case "planned":
      return "Planned task";
    case "due":
      return "Task due";
    case "plannedDue":
      return "Planned task, due";
  }
}
