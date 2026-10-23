// Calendar event constants shared by the server (schema, validation, service,
// audit) and the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0012-calendar-recurrence-time-blocks-views.md.

import { addDays, instantFromLocal, type LocalDate } from "./dates";

export const CALENDAR_EVENT_TITLE_MAX = 200;
export const CALENDAR_EVENT_DESCRIPTION_MAX = 2000;
export const CALENDAR_EVENT_LOCATION_MAX = 200;

/** Where an event came from. Sync is out of scope (ADR 0007), so only ours. */
export const CALENDAR_EVENT_SOURCES = ["internal"] as const;
export type CalendarEventSource = (typeof CALENDAR_EVENT_SOURCES)[number];

/** The longest range one `eventsBetween` query may ask for (ADR 0012). */
export const CALENDAR_RANGE_MAX_DAYS = 366;

/** The longest stored RRULE value (the builder's rules are far shorter). */
export const CALENDAR_EVENT_RRULE_MAX = 200;

/**
 * Which occurrences of a repeating event an edit or delete applies to
 * (ADR 0012): this one, this one and every later one, or the whole series.
 */
export const CALENDAR_EVENT_SCOPES = ["this", "following", "all"] as const;
export type CalendarEventScope = (typeof CALENDAR_EVENT_SCOPES)[number];

/** An exception either removes one occurrence or overrides its fields. */
export const CALENDAR_EVENT_EXCEPTION_KINDS = [
  "cancelled",
  "modified",
] as const;
export type CalendarEventExceptionKind =
  (typeof CALENDAR_EVENT_EXCEPTION_KINDS)[number];

/**
 * Columns of an exception that `calendar_event_exception.updated` can name.
 * Title, description and location are user content: named, never stored.
 */
export const CALENDAR_EVENT_EXCEPTION_FIELDS = [
  "eventId",
  "originalStartAt",
  "originalStartDate",
  "kind",
  "title",
  "description",
  "location",
  "startAt",
  "endAt",
  "startDate",
  "endDate",
  "goalId",
  "lifeAreaId",
] as const;
export type CalendarEventExceptionField =
  (typeof CALENDAR_EVENT_EXCEPTION_FIELDS)[number];

/**
 * Fields an edit can change, in the order `calendar_event.updated` lists
 * them. Title, description and location are user content: the event names
 * them but never stores their values.
 */
export const CALENDAR_EVENT_EDITABLE_FIELDS = [
  "title",
  "description",
  "location",
  "allDay",
  "startAt",
  "endAt",
  "tz",
  "startDate",
  "endDate",
  "rrule",
  "goalId",
  "lifeAreaId",
] as const;
export type CalendarEventEditableField =
  (typeof CALENDAR_EVENT_EDITABLE_FIELDS)[number];

type CalendarEventBase = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  /** The RRULE value of a repeating series (ADR 0012); null for a one-off. */
  rrule: string | null;
  goalId: string | null;
  lifeAreaId: string | null;
  source: CalendarEventSource;
  createdAt: Date;
  updatedAt: Date;
};

/** UTC instants plus the IANA zone it was created in. May span midnight. */
export type TimedCalendarEvent = CalendarEventBase & {
  allDay: false;
  startAt: Date;
  endAt: Date;
  tz: string;
  startDate: null;
  endDate: null;
};

/** Local dates with an exclusive end; no zone, so a zone change never moves it. */
export type AllDayCalendarEvent = CalendarEventBase & {
  allDay: true;
  startAt: null;
  endAt: null;
  tz: null;
  startDate: LocalDate;
  endDate: LocalDate;
};

export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent;

type OccurrenceKeyFields<Key> = {
  /** The series row's ID for an occurrence of a repeating event; null for a one-off. */
  seriesId: string | null;
  /**
   * The occurrence's start as the rule generated it, before any exception
   * moved it: what scoped edits and deletes address it by. Null for a one-off.
   */
  originalStart: Key | null;
  /** True when an exception changed this occurrence. */
  modified: boolean;
};

/**
 * One event or occurrence as `eventsBetween` returns it. An occurrence
 * carries its series' ID (as `id` too) and rule, with the times, text and
 * links it actually has.
 */
export type CalendarEventOccurrence =
  | (TimedCalendarEvent & OccurrenceKeyFields<Date>)
  | (AllDayCalendarEvent & OccurrenceKeyFields<LocalDate>);

/** The stored timing columns of either shape (`calendar_events`). */
export type CalendarEventTiming =
  | Pick<
      TimedCalendarEvent,
      "allDay" | "startAt" | "endAt" | "tz" | "startDate" | "endDate"
    >
  | Pick<
      AllDayCalendarEvent,
      "allDay" | "startAt" | "endAt" | "tz" | "startDate" | "endDate"
    >;

/**
 * The stored columns for an event's times as the form sends them (ADR 0012):
 * - all-day: the form's end date is inclusive, so the stored exclusive end
 *   is the day after it;
 * - timed: each local date and time becomes the UTC instant of that
 *   wall-clock time in `tz` ("compatible" across DST gaps and overlaps).
 */
export function calendarEventTiming(
  input:
    | { allDay: true; startDate: LocalDate; endDate: LocalDate }
    | {
        allDay: false;
        startDate: LocalDate;
        startTime: string;
        endDate: LocalDate;
        endTime: string;
        tz: string;
      },
): CalendarEventTiming {
  if (input.allDay) {
    return {
      allDay: true,
      startAt: null,
      endAt: null,
      tz: null,
      startDate: input.startDate,
      endDate: addDays(input.endDate, 1),
    };
  }
  return {
    allDay: false,
    startAt: instantFromLocal(input.startDate, input.startTime, input.tz),
    endAt: instantFromLocal(input.endDate, input.endTime, input.tz),
    tz: input.tz,
    startDate: null,
    endDate: null,
  };
}
