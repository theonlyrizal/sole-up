import { z } from "zod";

import {
  CALENDAR_EVENT_DESCRIPTION_MAX,
  CALENDAR_EVENT_LOCATION_MAX,
  CALENDAR_EVENT_TITLE_MAX,
  CALENDAR_RANGE_MAX_DAYS,
  calendarEventTiming,
} from "@/lib/calendar-events";
import { addDays, isLocalDate, type LocalDate } from "@/lib/dates";
import { canonicalTimeZone } from "@/lib/preferences";

const idSchema = z.uuid("Choose an event.");

const titleSchema = z
  .string({ error: "Give the event a title." })
  .trim()
  .min(1, "Give the event a title.")
  .max(
    CALENDAR_EVENT_TITLE_MAX,
    `Keep the title to ${CALENDAR_EVENT_TITLE_MAX} characters or fewer.`,
  );

/** Optional text: blank becomes null. */
const optionalTextSchema = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep the ${label} to ${max} characters or fewer.`)
    .nullish()
    .transform((value) => value || null);

/** Optional local date, "YYYY-MM-DD". Blank becomes null. */
const localDateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isLocalDate(value), "Enter a valid date.")
  .nullish()
  .transform((value) => value || null);

/** Optional wall-clock time, "HH:MM". Blank becomes null. */
const localTimeSchema = z
  .string()
  .trim()
  .regex(/^(?:$|(?:[01]\d|2[0-3]):[0-5]\d)$/, "Enter a valid time.")
  .nullish()
  .transform((value) => value || null);

/** Optional IANA zone, stored in its canonical form. Blank becomes null. */
const timeZoneSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value, context) => {
    if (!value) return null;
    const zone = canonicalTimeZone(value);
    if (!zone) {
      context.addIssue({ code: "custom", message: "Choose a time zone." });
      return z.NEVER;
    }
    return zone;
  });

const linkIdSchema = (message: string) =>
  z
    .uuid(message)
    .nullish()
    .transform((value) => value ?? null);

/**
 * An event as the form sends it. `allDay` picks the shape (ADR 0012):
 * - all-day: a start and an **inclusive** end date (the service stores the
 *   exclusive end); times and zone are ignored;
 * - timed: start and end dates and times in `tz`, which may span midnight.
 */
const eventFields = {
  title: titleSchema,
  description: optionalTextSchema(
    CALENDAR_EVENT_DESCRIPTION_MAX,
    "description",
  ),
  location: optionalTextSchema(CALENDAR_EVENT_LOCATION_MAX, "location"),
  allDay: z.boolean({ error: "Choose all-day or timed." }),
  startDate: localDateSchema,
  startTime: localTimeSchema,
  endDate: localDateSchema,
  endTime: localTimeSchema,
  tz: timeZoneSchema,
  goalId: linkIdSchema("Choose one of your goals."),
  lifeAreaId: linkIdSchema("Choose one of your areas."),
};

type EventFields = z.output<z.ZodObject<typeof eventFields>>;

/** The times in the shape `calendarEventTiming` takes, or null if incomplete. */
function whenOf(event: EventFields) {
  const { startDate, endDate, startTime, endTime, tz } = event;
  if (!startDate || !endDate) return null;
  if (event.allDay) return { allDay: true as const, startDate, endDate };
  if (!startTime || !endTime || !tz) return null;
  return {
    allDay: false as const,
    startDate,
    startTime,
    endDate,
    endTime,
    tz,
  };
}

function issue(context: z.core.$RefinementCtx, path: string, message: string) {
  context.addIssue({ code: "custom", path: [path], message });
}

/** Each shape's required fields, then the end after the start. */
function checkEventTimes(event: EventFields, context: z.core.$RefinementCtx) {
  if (!event.startDate) issue(context, "startDate", "Pick a start date.");
  if (!event.endDate) issue(context, "endDate", "Pick an end date.");
  if (!event.allDay) {
    if (!event.startTime) issue(context, "startTime", "Enter a start time.");
    if (!event.endTime) issue(context, "endTime", "Enter an end time.");
    if (!event.tz) issue(context, "tz", "Choose a time zone.");
  }

  const when = whenOf(event);
  if (!when) return;
  const timing = calendarEventTiming(when);
  if (timing.allDay) {
    if (timing.endDate <= timing.startDate) {
      issue(context, "endDate", "End on or after the start date.");
    }
  } else if (timing.endAt <= timing.startAt) {
    issue(context, "endTime", "End after the start.");
  }
}

/** Text and links as they are, and the times as one `when`. */
function toEventInput(event: EventFields) {
  const when = whenOf(event);
  // checkEventTimes has already rejected incomplete times.
  if (!when) throw new Error("Event times passed validation incomplete");
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    goalId: event.goalId,
    lifeAreaId: event.lifeAreaId,
    when,
  };
}

export const createCalendarEventSchema = z
  .strictObject(eventFields)
  .superRefine(checkEventTimes)
  .transform(toEventInput);
export type CreateCalendarEventInput = z.output<
  typeof createCalendarEventSchema
>;

/** Replaces every editable field, like the create form. */
export const updateCalendarEventSchema = z
  .strictObject({ id: idSchema, ...eventFields })
  .superRefine(checkEventTimes)
  .transform(({ id, ...event }) => ({ id, ...toEventInput(event) }));
export type UpdateCalendarEventInput = z.output<
  typeof updateCalendarEventSchema
>;

export const calendarEventIdSchema = z.strictObject({ id: idSchema });
export type CalendarEventIdInput = z.output<typeof calendarEventIdSchema>;

const requiredDateSchema = (message: string) =>
  z
    .string({ error: message })
    .refine((value): value is LocalDate => isLocalDate(value), message);

/**
 * A range of whole local days in `tz`, `localEnd` exclusive (as FullCalendar
 * asks), at most CALENDAR_RANGE_MAX_DAYS long.
 */
export const eventsBetweenSchema = z
  .strictObject({
    localStart: requiredDateSchema("Enter a valid start date."),
    localEnd: requiredDateSchema("Enter a valid end date."),
    tz: z
      .string({ error: "Choose a time zone." })
      .transform((value, context) => {
        const zone = canonicalTimeZone(value);
        if (!zone) {
          context.addIssue({ code: "custom", message: "Choose a time zone." });
          return z.NEVER;
        }
        return zone;
      }),
  })
  .superRefine((range, context) => {
    if (range.localEnd <= range.localStart) {
      issue(context, "localEnd", "End after the start date.");
    } else if (
      range.localEnd > addDays(range.localStart, CALENDAR_RANGE_MAX_DAYS)
    ) {
      issue(
        context,
        "localEnd",
        `Choose a range of ${CALENDAR_RANGE_MAX_DAYS} days or fewer.`,
      );
    }
  });
export type EventsBetweenInput = z.output<typeof eventsBetweenSchema>;
