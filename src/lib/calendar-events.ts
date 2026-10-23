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
