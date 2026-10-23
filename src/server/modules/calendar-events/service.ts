import "server-only";

import { and, asc, eq, gt, lt, or } from "drizzle-orm";

import {
  type CalendarEvent,
  CALENDAR_EVENT_EDITABLE_FIELDS,
  type CalendarEventEditableField,
  calendarEventTiming,
} from "@/lib/calendar-events";
import { startOfLocalDay } from "@/lib/dates";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { isForeignKeyViolation } from "@/server/db/errors";
import { calendarEvents } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";

import type {
  CalendarEventIdInput,
  CreateCalendarEventInput,
  EventsBetweenInput,
  UpdateCalendarEventInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A record
// that is missing or belongs to someone else is the same NotFoundError.
// Each mutation writes its audit event in the same transaction, and an edit
// to the current values is a no-op with no event.
// Rules: ADR 0012 (shapes, links, history). One-off events only; recurrence
// arrives in 4.3.

const GOAL_KEY = "calendar_events_goal_id_user_id_fk";
const LIFE_AREA_KEY = "calendar_events_life_area_id_user_id_fk";

type CalendarEventRow = typeof calendarEvents.$inferSelect;

export function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  const base = {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    goalId: row.goalId,
    lifeAreaId: row.lifeAreaId,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  // The shape CHECK guarantees the columns of the row's shape are set.
  if (row.allDay) {
    return {
      ...base,
      allDay: true,
      startAt: null,
      endAt: null,
      tz: null,
      startDate: row.startDate!,
      endDate: row.endDate!,
    };
  }
  return {
    ...base,
    allDay: false,
    startAt: row.startAt!,
    endAt: row.endAt!,
    tz: row.tz!,
    startDate: null,
    endDate: null,
  };
}

/** Locks one of the user's events for the rest of the transaction. */
async function findForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
): Promise<CalendarEventRow> {
  const [row] = await tx
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .for("update");
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * Runs `write`, turning a goal or life area that is missing or another
 * user's (a composite foreign key refusing it) into a field error.
 */
async function guardLinks<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (cause) {
    if (isForeignKeyViolation(cause, GOAL_KEY)) {
      throw new ValidationError({ goalId: ["Choose one of your goals."] });
    }
    if (isForeignKeyViolation(cause, LIFE_AREA_KEY)) {
      throw new ValidationError({ lifeAreaId: ["Choose one of your areas."] });
    }
    throw cause;
  }
}

/** The columns an edit writes, from validated input. */
function editableColumns({
  when,
  ...input
}: CreateCalendarEventInput): Pick<
  CalendarEventRow,
  CalendarEventEditableField
> {
  return { ...input, ...calendarEventTiming(when) };
}

const iso = (instant: Date | null) => instant?.toISOString() ?? null;

/** Compares a field by value; instants by their time, not object identity. */
function sameValue(
  a: CalendarEventRow,
  b: Pick<CalendarEventRow, CalendarEventEditableField>,
  field: CalendarEventEditableField,
): boolean {
  const left = a[field];
  const right = b[field];
  if (left instanceof Date || right instanceof Date) {
    return iso(left as Date | null) === iso(right as Date | null);
  }
  return left === right;
}

/** Adds a one-off event, timed or all-day. */
export async function createCalendarEvent(
  userId: string,
  input: CreateCalendarEventInput,
): Promise<CalendarEvent> {
  const row = await guardLinks(() =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(calendarEvents)
        .values({ ...editableColumns(input), userId })
        .returning();
      if (!row) throw new Error("Calendar event insert returned no row");

      await recordAudit(tx, {
        type: "calendar_event.created",
        userId,
        entityId: row.id,
        changes: {
          allDay: { from: null, to: row.allDay },
          startAt: { from: null, to: iso(row.startAt) },
          endAt: { from: null, to: iso(row.endAt) },
          tz: { from: null, to: row.tz },
          startDate: { from: null, to: row.startDate },
          endDate: { from: null, to: row.endDate },
          goalId: { from: null, to: row.goalId },
          lifeAreaId: { from: null, to: row.lifeAreaId },
          source: { from: null, to: row.source },
        },
      });
      return row;
    }),
  );
  return toCalendarEvent(row);
}

/** One of the user's events. */
export async function getCalendarEvent(
  userId: string,
  { id }: CalendarEventIdInput,
): Promise<CalendarEvent> {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));
  if (!row) throw new NotFoundError();
  return toCalendarEvent(row);
}

/**
 * Replaces every editable field, including a switch between timed and
 * all-day. Records which fields changed, with old and new values for the
 * shape, times, dates and links only.
 */
export async function updateCalendarEvent(
  userId: string,
  { id, ...input }: UpdateCalendarEventInput,
): Promise<CalendarEvent> {
  const row = await guardLinks(() =>
    db.transaction(async (tx) => {
      const current = await findForUpdate(tx, userId, id);
      const next = editableColumns(input);
      const fields = CALENDAR_EVENT_EDITABLE_FIELDS.filter(
        (field) => !sameValue(current, next, field),
      );
      if (fields.length === 0) return current;

      const [updated] = await tx
        .update(calendarEvents)
        .set(next)
        .where(
          and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)),
        )
        .returning();
      if (!updated) throw new NotFoundError();

      const changed = (field: CalendarEventEditableField) =>
        fields.includes(field);
      await recordAudit(tx, {
        type: "calendar_event.updated",
        userId,
        entityId: id,
        changes: {
          fields,
          ...(changed("allDay") && {
            allDay: { from: current.allDay, to: updated.allDay },
          }),
          ...(changed("startAt") && {
            startAt: { from: iso(current.startAt), to: iso(updated.startAt) },
          }),
          ...(changed("endAt") && {
            endAt: { from: iso(current.endAt), to: iso(updated.endAt) },
          }),
          ...(changed("tz") && { tz: { from: current.tz, to: updated.tz } }),
          ...(changed("startDate") && {
            startDate: { from: current.startDate, to: updated.startDate },
          }),
          ...(changed("endDate") && {
            endDate: { from: current.endDate, to: updated.endDate },
          }),
          ...(changed("goalId") && {
            goalId: { from: current.goalId, to: updated.goalId },
          }),
          ...(changed("lifeAreaId") && {
            lifeAreaId: { from: current.lifeAreaId, to: updated.lifeAreaId },
          }),
        },
      });
      return updated;
    }),
  );
  return toCalendarEvent(row);
}

/**
 * Hard-deletes the event (the UI confirms first) and its audit events in the
 * same transaction (ADR 0005, ADR 0006).
 */
export async function deleteCalendarEvent(
  userId: string,
  { id }: CalendarEventIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
      .returning({ id: calendarEvents.id });
    if (!deleted) throw new NotFoundError();

    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "calendar_event",
      entityId: id,
    });
  });
}

/**
 * The user's events overlapping the local days `localStart` up to (not
 * including) `localEnd` in `tz`:
 * - timed events by instant overlap with that range's start and end
 *   instants, so one that ends exactly when the range starts, or starts
 *   exactly when it ends, is not included;
 * - all-day events by local-date overlap, with their exclusive end, so they
 *   never shift with `tz`.
 * Ordered by start (an all-day event starts at its first day's local
 * midnight in `tz`), all-day first on a tie, then by ID.
 */
export async function eventsBetween(
  userId: string,
  { localStart, localEnd, tz }: EventsBetweenInput,
): Promise<CalendarEvent[]> {
  const rangeStart = startOfLocalDay(localStart, tz);
  const rangeEnd = startOfLocalDay(localEnd, tz);

  const rows = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        or(
          and(
            eq(calendarEvents.allDay, false),
            lt(calendarEvents.startAt, rangeEnd),
            gt(calendarEvents.endAt, rangeStart),
          ),
          and(
            eq(calendarEvents.allDay, true),
            lt(calendarEvents.startDate, localEnd),
            gt(calendarEvents.endDate, localStart),
          ),
        ),
      ),
    )
    .orderBy(asc(calendarEvents.id));

  const startOf = (event: CalendarEvent) =>
    event.allDay
      ? startOfLocalDay(event.startDate, tz).getTime()
      : event.startAt.getTime();
  return rows
    .map(toCalendarEvent)
    .sort(
      (a, b) =>
        startOf(a) - startOf(b) ||
        Number(b.allDay) - Number(a.allDay) ||
        a.id.localeCompare(b.id),
    );
}
