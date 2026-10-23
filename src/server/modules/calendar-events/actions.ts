"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import * as service from "./service";
import {
  calendarEventIdSchema,
  createCalendarEventSchema,
  deleteCalendarEventOccurrenceSchema,
  editCalendarEventOccurrenceSchema,
  updateCalendarEventSchema,
} from "./validation";

// Auth → validate → service (scoped to the user) → refresh the page's
// server-rendered data. Previews change nothing, so they don't refresh.

export const createCalendarEvent = authedAction(
  createCalendarEventSchema,
  async (input, { userId }) => {
    const event = await service.createCalendarEvent(userId, input);
    refresh();
    return event;
  },
);

/** A one-off event; a series goes through `editCalendarEventOccurrence`. */
export const updateCalendarEvent = authedAction(
  updateCalendarEventSchema,
  async (input, { userId }) => {
    const event = await service.updateCalendarEvent(userId, input);
    refresh();
    return event;
  },
);

/** A one-off event, or a whole series (the UI confirms first). */
export const deleteCalendarEvent = authedAction(
  calendarEventIdSchema,
  async (input, { userId }) => {
    await service.deleteCalendarEvent(userId, input);
    refresh();
  },
);

/** Changes one occurrence, it and the later ones, or the whole series. */
export const editCalendarEventOccurrence = authedAction(
  editCalendarEventOccurrenceSchema,
  async (input, { userId }) => {
    const result = await service.editCalendarEventOccurrence(userId, input);
    refresh();
    return result;
  },
);

export const deleteCalendarEventOccurrence = authedAction(
  deleteCalendarEventOccurrenceSchema,
  async (input, { userId }) => {
    const result = await service.deleteCalendarEventOccurrence(userId, input);
    refresh();
    return result;
  },
);

/** What an occurrence edit would drop, for the scope prompt. Changes nothing. */
export const previewCalendarEventOccurrenceEdit = authedAction(
  editCalendarEventOccurrenceSchema,
  (input, { userId }) =>
    service.previewCalendarEventOccurrenceEdit(userId, input),
);

/** What an occurrence delete would drop, for the scope prompt. Changes nothing. */
export const previewCalendarEventOccurrenceDelete = authedAction(
  deleteCalendarEventOccurrenceSchema,
  (input, { userId }) =>
    service.previewCalendarEventOccurrenceDelete(userId, input),
);
