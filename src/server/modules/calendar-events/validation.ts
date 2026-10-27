import { z } from "zod";

import {
  CALENDAR_EVENT_DESCRIPTION_MAX,
  CALENDAR_EVENT_LOCATION_MAX,
  CALENDAR_EVENT_SCOPES,
  CALENDAR_EVENT_TITLE_MAX,
  CALENDAR_RANGE_MAX_DAYS,
  calendarEventTiming,
} from "@/lib/calendar-events";
import { addDays, isLocalDate, type LocalDate } from "@/lib/dates";
import { canonicalTimeZone } from "@/lib/preferences";
import { fromRrule, rruleSchema, toRrule } from "@/lib/recurrence";
import type { ReminderOffset } from "@/lib/reminders";
import {
  reminderOffsetChangeSchema,
  reminderOffsetSchema,
} from "@/server/modules/reminders/validation";

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

/**
 * A repeat rule (ADR 0012), limited to the repeat builder's parts and
 * stored in canonical form. Blank or absent means a one-off event.
 */
export const rruleFieldSchema = z
  .string("Choose how often it repeats.")
  .trim()
  .nullish()
  .transform((value, context) => {
    if (!value) return null;
    const parsed = rruleSchema.safeParse(value);
    if (!parsed.success) {
      for (const { message } of parsed.error.issues) {
        context.addIssue({ code: "custom", message });
      }
      return z.NEVER;
    }
    return toRrule(parsed.data);
  });

type EventFields = z.output<z.ZodObject<typeof eventFields>> & {
  rrule?: string | null;
};

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

/**
 * Each shape's required fields, then the end after the start, and a repeat
 * that ends on a date ends on or after the start date.
 */
function checkEventTimes(event: EventFields, context: z.core.$RefinementCtx) {
  if (event.rrule && event.startDate) {
    const end = fromRrule(event.rrule).end;
    if (end.type === "until" && end.until < event.startDate) {
      issue(context, "rrule", "End the repeat on or after the start date.");
    }
  }
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

/**
 * A one-off event, or a repeating series when `rrule` is set. The reminder
 * is what the form sends (it pre-fills 10 minutes for a new event; ADR
 * 0013); absent means none. All-day events never remind.
 */
export const createCalendarEventSchema = z
  .strictObject({
    ...eventFields,
    rrule: rruleFieldSchema,
    reminderOffsetMinutes: reminderOffsetSchema,
  })
  .superRefine(checkEventTimes)
  .transform(({ rrule, reminderOffsetMinutes, ...event }) => ({
    ...toEventInput(event),
    rrule,
    reminderOffsetMinutes,
  }));
export type CreateCalendarEventInput = z.output<
  typeof createCalendarEventSchema
>;

/**
 * Replaces every editable field of a one-off event, like the create form;
 * setting `rrule` makes it a series. An absent reminder is kept. A series
 * is changed through `editCalendarEventOccurrenceSchema` instead.
 */
export const updateCalendarEventSchema = z
  .strictObject({
    id: idSchema,
    ...eventFields,
    rrule: rruleFieldSchema,
    reminderOffsetMinutes: reminderOffsetChangeSchema,
  })
  .superRefine(checkEventTimes)
  .transform(({ id, rrule, reminderOffsetMinutes, ...event }) => ({
    id,
    ...toEventInput(event),
    rrule,
    reminderOffsetMinutes,
  }));
export type UpdateCalendarEventInput = z.output<
  typeof updateCalendarEventSchema
>;

export const calendarEventIdSchema = z.strictObject({ id: idSchema });
export type CalendarEventIdInput = z.output<typeof calendarEventIdSchema>;

/**
 * An occurrence's key, as `eventsBetween` returns it: its original start,
 * an ISO 8601 instant for a timed series or a local date for an all-day one.
 */
const originalStartSchema = z
  .string("Choose an occurrence.")
  .transform((value, context): Date | LocalDate => {
    if (isLocalDate(value)) return value;
    if (z.iso.datetime({ offset: true }).safeParse(value).success) {
      return new Date(value);
    }
    context.addIssue({ code: "custom", message: "Choose an occurrence." });
    return z.NEVER;
  });

const occurrenceFields = { id: idSchema, originalStart: originalStartSchema };

/**
 * A change to one occurrence of a series, with the scope it applies to
 * (ADR 0012). The fields are the occurrence's new values as the event form
 * sends them. "this" changes only that occurrence, so it can't change the
 * rule or the reminder (one setting per series, ADR 0013); "following" and
 * "all" take the series' rule (null stops repeating) and may change the
 * reminder (absent keeps it).
 */
export const editCalendarEventOccurrenceSchema = z
  .discriminatedUnion(
    "scope",
    [
      z.strictObject({
        ...occurrenceFields,
        scope: z.literal("this"),
        ...eventFields,
      }),
      z.strictObject({
        ...occurrenceFields,
        scope: z.literal("following"),
        ...eventFields,
        rrule: rruleFieldSchema,
        reminderOffsetMinutes: reminderOffsetChangeSchema,
      }),
      z.strictObject({
        ...occurrenceFields,
        scope: z.literal("all"),
        ...eventFields,
        rrule: rruleFieldSchema,
        reminderOffsetMinutes: reminderOffsetChangeSchema,
      }),
    ],
    "Choose which events to change.",
  )
  .superRefine(checkEventTimes)
  .transform(({ id, originalStart, scope, ...fields }) => {
    const {
      rrule = null,
      reminderOffsetMinutes,
      ...event
    } = fields as EventFields & {
      reminderOffsetMinutes?: ReminderOffset | null;
    };
    return {
      id,
      originalStart,
      scope,
      rrule,
      reminderOffsetMinutes,
      ...toEventInput(event),
    };
  });
export type EditCalendarEventOccurrenceInput = z.output<
  typeof editCalendarEventOccurrenceSchema
>;

/** Deletes one occurrence, it and every later one, or the whole series. */
export const deleteCalendarEventOccurrenceSchema = z.strictObject({
  ...occurrenceFields,
  scope: z.enum(CALENDAR_EVENT_SCOPES, "Choose which events to delete."),
});
export type DeleteCalendarEventOccurrenceInput = z.output<
  typeof deleteCalendarEventOccurrenceSchema
>;

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
