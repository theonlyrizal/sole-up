import "server-only";

import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from "drizzle-orm";

import {
  type CalendarEvent,
  CALENDAR_EVENT_EDITABLE_FIELDS,
  type CalendarEventEditableField,
  type CalendarEventExceptionField,
  type CalendarEventExceptionKind,
  type CalendarEventOccurrence,
  type CalendarEventScope,
  calendarEventTiming,
} from "@/lib/calendar-events";
import { startOfLocalDay, type LocalDate } from "@/lib/dates";
import {
  countOccurrencesBefore,
  endRuleBefore,
  expandOccurrences,
  fromRrule,
  ruleWithCount,
  seriesStartDate,
} from "@/lib/recurrence";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { isForeignKeyViolation } from "@/server/db/errors";
import { calendarEventExceptions, calendarEvents } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import {
  asSeries,
  type CalendarEventRow,
  type Details,
  detailsOf,
  displayedValues,
  type ExceptionColumns,
  type ExceptionRow,
  generatedTimes,
  generatesOccurrence,
  modifiedColumns,
  cancelledColumns,
  type OccurrenceValues,
  originalDateOf,
  type OriginalStart,
  originalStartOf,
  type Reconciled,
  reconcileExceptions,
  sameOriginalStart,
  sameValues,
  type SeriesColumns,
  seriesAfterEdit,
  seriesColumnsOf,
  endsBeforeStart,
  timesOf,
  timingOf,
  type When,
} from "./series";
import type {
  CalendarEventIdInput,
  CreateCalendarEventInput,
  DeleteCalendarEventOccurrenceInput,
  EditCalendarEventOccurrenceInput,
  EventsBetweenInput,
  UpdateCalendarEventInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A record
// that is missing or belongs to someone else is the same NotFoundError.
// Each mutation writes its audit events in the same transaction, and an
// edit to the current values is a no-op with no event.
// Rules: ADR 0012 (shapes, links, recurrence, scopes, history). A series is
// one row with an RRULE; its occurrences are expanded at query time, and
// the occurrences that differ are rows in `calendar_event_exceptions`
// (see series.ts for how a scoped change carries them over).

const GOAL_KEYS = [
  "calendar_events_goal_id_user_id_fk",
  "calendar_event_exceptions_goal_id_user_id_fk",
];
const LIFE_AREA_KEYS = [
  "calendar_events_life_area_id_user_id_fk",
  "calendar_event_exceptions_life_area_id_user_id_fk",
];

const UNTIL_BEFORE_START = "End the repeat on or after the start date.";

/**
 * An exception a series change removed: its occurrence lost its own values
 * or came back. Returned so the UI can say what changed.
 */
export type DroppedException = {
  id: string;
  kind: CalendarEventExceptionKind;
  originalStart: OriginalStart;
};

export type OccurrenceEditResult = {
  /** The series the occurrence now belongs to (a new one after a split). */
  event: CalendarEvent;
  dropped: DroppedException[];
};

export function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  const base = {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    rrule: row.rrule,
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

/** A series' exceptions, oldest original start first. */
function exceptionsOf(tx: DbTransaction, userId: string, eventId: string) {
  return tx
    .select()
    .from(calendarEventExceptions)
    .where(
      and(
        eq(calendarEventExceptions.eventId, eventId),
        eq(calendarEventExceptions.userId, userId),
      ),
    )
    .orderBy(
      asc(calendarEventExceptions.originalStartAt),
      asc(calendarEventExceptions.originalStartDate),
    );
}

/**
 * Runs `write`, turning a goal or life area that is missing or another
 * user's (a composite foreign key refusing it) into a field error.
 */
async function guardLinks<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (cause) {
    if (GOAL_KEYS.some((key) => isForeignKeyViolation(cause, key))) {
      throw new ValidationError({ goalId: ["Choose one of your goals."] });
    }
    if (LIFE_AREA_KEYS.some((key) => isForeignKeyViolation(cause, key))) {
      throw new ValidationError({ lifeAreaId: ["Choose one of your areas."] });
    }
    throw cause;
  }
}

/** The columns an edit writes, from validated input. */
function editableColumns({
  when,
  ...input
}: CreateCalendarEventInput): SeriesColumns {
  return { ...input, ...calendarEventTiming(when) };
}

const iso = (instant: Date | null) => instant?.toISOString() ?? null;

/** Compares a column by value; instants by their time, not object identity. */
function sameColumn(left: unknown, right: unknown): boolean {
  if (left instanceof Date || right instanceof Date) {
    return iso(left as Date | null) === iso(right as Date | null);
  }
  return left === right;
}

async function insertEvent(
  tx: DbTransaction,
  userId: string,
  columns: SeriesColumns,
  split?: { fromId: string },
): Promise<CalendarEventRow> {
  const [row] = await tx
    .insert(calendarEvents)
    .values({ ...columns, userId })
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
      rrule: { from: null, to: row.rrule },
      goalId: { from: null, to: row.goalId },
      lifeAreaId: { from: null, to: row.lifeAreaId },
      source: { from: null, to: row.source },
      ...(split && { scope: "following" as const, splitFromId: split.fromId }),
    },
  });
  return row;
}

/**
 * Writes `next` over `current` and records which fields changed, with old
 * and new values for the shape, times, dates, rule and links only. A
 * scoped series change also records its scope, the series it split into
 * and how many exceptions it dropped. Returns `current` when nothing
 * changed.
 */
async function updateEvent(
  tx: DbTransaction,
  userId: string,
  current: CalendarEventRow,
  next: SeriesColumns,
  context: {
    scope?: "following" | "all";
    splitIntoId?: string;
    droppedExceptions?: number;
  } = {},
): Promise<CalendarEventRow> {
  const fields = CALENDAR_EVENT_EDITABLE_FIELDS.filter(
    (field) => !sameColumn(current[field], next[field]),
  );
  if (fields.length === 0) return current;

  const [updated] = await tx
    .update(calendarEvents)
    .set(next)
    .where(
      and(eq(calendarEvents.id, current.id), eq(calendarEvents.userId, userId)),
    )
    .returning();
  if (!updated) throw new NotFoundError();

  const changed = (field: CalendarEventEditableField) => fields.includes(field);
  await recordAudit(tx, {
    type: "calendar_event.updated",
    userId,
    entityId: current.id,
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
      ...(changed("rrule") && {
        rrule: { from: current.rrule, to: updated.rrule },
      }),
      ...(changed("goalId") && {
        goalId: { from: current.goalId, to: updated.goalId },
      }),
      ...(changed("lifeAreaId") && {
        lifeAreaId: { from: current.lifeAreaId, to: updated.lifeAreaId },
      }),
      ...(context.scope && { scope: context.scope }),
      ...(context.splitIntoId && { splitIntoId: context.splitIntoId }),
      ...(context.droppedExceptions !== undefined &&
        context.droppedExceptions > 0 && {
          droppedExceptions: context.droppedExceptions,
        }),
    },
  });
  return updated;
}

/** Adds a one-off event, timed or all-day, or a series when `rrule` is set. */
export async function createCalendarEvent(
  userId: string,
  input: CreateCalendarEventInput,
): Promise<CalendarEvent> {
  const row = await guardLinks(() =>
    db.transaction((tx) => insertEvent(tx, userId, editableColumns(input))),
  );
  return toCalendarEvent(row);
}

/** One of the user's events (a series row for a repeating one). */
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
 * Replaces every editable field of a one-off event, including a switch
 * between timed and all-day; setting `rrule` makes it a series. A series
 * changes only through `editCalendarEventOccurrence`, which says which
 * occurrences the change applies to.
 */
export async function updateCalendarEvent(
  userId: string,
  { id, ...input }: UpdateCalendarEventInput,
): Promise<CalendarEvent> {
  const row = await guardLinks(() =>
    db.transaction(async (tx) => {
      const current = await findForUpdate(tx, userId, id);
      if (current.rrule !== null) {
        throw new ConflictError(
          "Choose which events to change: this one, this and following, or all.",
        );
      }
      return updateEvent(tx, userId, current, editableColumns(input));
    }),
  );
  return toCalendarEvent(row);
}

/**
 * Hard-deletes an event and its exceptions (which cascade), and their audit
 * events, in the caller's transaction (ADR 0005, ADR 0006).
 */
async function deleteEvent(
  tx: DbTransaction,
  userId: string,
  id: string,
  exceptions: readonly Pick<ExceptionRow, "id">[],
): Promise<void> {
  const [deleted] = await tx
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .returning({ id: calendarEvents.id });
  if (!deleted) throw new NotFoundError();

  await deleteExceptionAuditEvents(tx, userId, exceptions);
  await deleteAuditEventsForEntity(tx, {
    userId,
    entityType: "calendar_event",
    entityId: id,
  });
}

/**
 * Hard-deletes the event, or a whole series with its exceptions (the UI
 * confirms first), and their audit events in the same transaction.
 */
export async function deleteCalendarEvent(
  userId: string,
  { id }: CalendarEventIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const exceptions = await exceptionsOf(tx, userId, id);
    await deleteEvent(tx, userId, id, exceptions);
  });
}

// --- Exceptions ---------------------------------------------------------------

async function deleteExceptionAuditEvents(
  tx: DbTransaction,
  userId: string,
  exceptions: readonly Pick<ExceptionRow, "id">[],
): Promise<void> {
  for (const { id } of exceptions) {
    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "calendar_event_exception",
      entityId: id,
    });
  }
}

/** Hard-deletes exceptions and their audit events. */
async function deleteExceptions(
  tx: DbTransaction,
  userId: string,
  exceptions: readonly ExceptionRow[],
): Promise<void> {
  if (exceptions.length === 0) return;
  await tx.delete(calendarEventExceptions).where(
    and(
      eq(calendarEventExceptions.userId, userId),
      inArray(
        calendarEventExceptions.id,
        exceptions.map(({ id }) => id),
      ),
    ),
  );
  await deleteExceptionAuditEvents(tx, userId, exceptions);
}

async function insertException(
  tx: DbTransaction,
  userId: string,
  eventId: string,
  columns: ExceptionColumns,
): Promise<ExceptionRow> {
  const [row] = await tx
    .insert(calendarEventExceptions)
    .values({ ...columns, userId, eventId })
    .returning();
  if (!row) throw new Error("Calendar event exception insert returned no row");

  await recordAudit(tx, {
    type: "calendar_event_exception.created",
    userId,
    entityId: row.id,
    changes: {
      eventId: { from: null, to: row.eventId },
      originalStartAt: { from: null, to: iso(row.originalStartAt) },
      originalStartDate: { from: null, to: row.originalStartDate },
      kind: { from: null, to: row.kind },
      startAt: { from: null, to: iso(row.startAt) },
      endAt: { from: null, to: iso(row.endAt) },
      startDate: { from: null, to: row.startDate },
      endDate: { from: null, to: row.endDate },
      goalId: { from: null, to: row.goalId },
      lifeAreaId: { from: null, to: row.lifeAreaId },
    },
  });
  return row;
}

const EXCEPTION_FIELDS: CalendarEventExceptionField[] = [
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
];

function changedExceptionFields(
  current: ExceptionRow,
  next: ExceptionColumns & Pick<ExceptionRow, "eventId">,
): CalendarEventExceptionField[] {
  return EXCEPTION_FIELDS.filter(
    (field) => !sameColumn(current[field], next[field]),
  );
}

/**
 * Rewrites an exception, possibly onto another series or original start,
 * and records which fields changed, with old and new values for all but
 * the text. Deletes and re-inserts the row under the same ID, so a change
 * that moves several exceptions never collides on the unique original
 * start. Callers delete every row they rewrite before inserting any.
 */
async function reinsertException(
  tx: DbTransaction,
  userId: string,
  current: ExceptionRow,
  next: ExceptionColumns & Pick<ExceptionRow, "eventId">,
  scope: CalendarEventScope,
): Promise<void> {
  const fields = changedExceptionFields(current, next);
  const [row] = await tx
    .insert(calendarEventExceptions)
    .values({
      ...next,
      id: current.id,
      userId,
      createdAt: current.createdAt,
    })
    .returning();
  if (!row) throw new Error("Calendar event exception insert returned no row");
  await recordExceptionUpdate(tx, userId, current, row, fields, scope);
}

async function recordExceptionUpdate(
  tx: DbTransaction,
  userId: string,
  current: ExceptionRow,
  updated: ExceptionRow,
  fields: CalendarEventExceptionField[],
  scope: CalendarEventScope,
): Promise<void> {
  const changed = (field: CalendarEventExceptionField) =>
    fields.includes(field);
  const change = <K extends keyof ExceptionRow>(field: K) =>
    changed(field as CalendarEventExceptionField) && {
      [field]: { from: current[field], to: updated[field] },
    };
  const instantChange = (field: "originalStartAt" | "startAt" | "endAt") =>
    changed(field) && {
      [field]: { from: iso(current[field]), to: iso(updated[field]) },
    };
  await recordAudit(tx, {
    type: "calendar_event_exception.updated",
    userId,
    entityId: current.id,
    changes: {
      fields,
      scope,
      ...change("eventId"),
      ...instantChange("originalStartAt"),
      ...change("originalStartDate"),
      ...change("kind"),
      ...instantChange("startAt"),
      ...instantChange("endAt"),
      ...change("startDate"),
      ...change("endDate"),
      ...change("goalId"),
      ...change("lifeAreaId"),
    },
  });
}

/** Sets an existing exception's columns in place ("this" scope). */
async function updateException(
  tx: DbTransaction,
  userId: string,
  current: ExceptionRow,
  next: ExceptionColumns,
): Promise<void> {
  const fields = changedExceptionFields(current, {
    ...next,
    eventId: current.eventId,
  });
  if (fields.length === 0) return;
  const [updated] = await tx
    .update(calendarEventExceptions)
    .set(next)
    .where(
      and(
        eq(calendarEventExceptions.id, current.id),
        eq(calendarEventExceptions.userId, userId),
      ),
    )
    .returning();
  if (!updated) throw new NotFoundError();
  await recordExceptionUpdate(tx, userId, current, updated, fields, "this");
}

function toDropped(row: ExceptionRow): DroppedException {
  return { id: row.id, kind: row.kind, originalStart: originalStartOf(row) };
}

/**
 * Writes the outcome of `reconcileExceptions` for series `eventId`: deletes
 * the dropped, stale and folded exceptions with their audit events, and
 * rewrites the kept ones that changed.
 */
async function writeReconciled(
  tx: DbTransaction,
  userId: string,
  eventId: string,
  reconciled: Reconciled,
  scope: "following" | "all",
): Promise<DroppedException[]> {
  const removed = [...reconciled.dropped, ...reconciled.stale];
  if (reconciled.folded) removed.push(reconciled.folded.row);
  await deleteExceptions(tx, userId, removed);

  const rewrites = reconciled.kept
    .map(({ row, next }) => ({ row, next: { ...next, eventId } }))
    .filter(({ row, next }) => changedExceptionFields(row, next).length > 0);
  if (rewrites.length > 0) {
    await tx.delete(calendarEventExceptions).where(
      and(
        eq(calendarEventExceptions.userId, userId),
        inArray(
          calendarEventExceptions.id,
          rewrites.map(({ row }) => row.id),
        ),
      ),
    );
    for (const { row, next } of rewrites) {
      await reinsertException(tx, userId, row, next, scope);
    }
  }
  return reconciled.dropped.map(toDropped);
}

// --- Scoped changes to a series ----------------------------------------------

type Occurrence = {
  series: CalendarEventRow & { rrule: string };
  exceptions: ExceptionRow[];
  exception: ExceptionRow | undefined;
  displayed: OccurrenceValues;
  /** The occurrence's original local date, in the series' zone. */
  date: LocalDate;
  /** True when it is the series' first occurrence. */
  isFirst: boolean;
};

/**
 * Locks one of the user's series and finds the occurrence starting at
 * `originalStart`. An occurrence the rule doesn't generate, or one that was
 * cancelled, is not found.
 */
async function findOccurrence(
  tx: DbTransaction,
  userId: string,
  id: string,
  originalStart: OriginalStart,
): Promise<Occurrence> {
  const series = await findForUpdate(tx, userId, id);
  if (series.rrule === null) {
    throw new ConflictError("This event doesn't repeat.");
  }
  if (!generatesOccurrence(series, originalStart)) throw new NotFoundError();

  const exceptions = await exceptionsOf(tx, userId, id);
  const exception = exceptions.find((row) =>
    sameOriginalStart(originalStartOf(row), originalStart),
  );
  const displayed = displayedValues(series, originalStart, exception);
  if (!displayed) throw new NotFoundError();

  const date = originalDateOf(series, originalStart);
  return {
    series: { ...series, rrule: series.rrule },
    exceptions,
    exception,
    displayed,
    date,
    isFirst: date <= seriesStartDate(asSeries(series)),
  };
}

type EditInput = Details & { when: When; rrule: string | null };

/**
 * Changes occurrences of a series (ADR 0012), from the occurrence starting
 * at `originalStart`, with the values the form sent for it:
 * - "this": that occurrence only, as a modified exception. Its times keep
 *   the series' shape and zone.
 * - "following": that occurrence and every later one become a new series,
 *   and the old one ends the day before. From the first occurrence, this
 *   is "all". A rule that ends after a count keeps the count left.
 * - "all": the whole series, applying only the fields the user changed.
 * Exceptions are carried over as series.ts describes; the ones a change
 * removes come back in `dropped`.
 */
export async function editCalendarEventOccurrence(
  userId: string,
  {
    id,
    originalStart,
    scope,
    rrule,
    when,
    ...details
  }: EditCalendarEventOccurrenceInput,
): Promise<OccurrenceEditResult> {
  return guardLinks(() =>
    db.transaction(async (tx) => {
      const occurrence = await findOccurrence(tx, userId, id, originalStart);
      const input = { ...details, when, rrule };
      if (scope === "this") {
        return editThisOccurrence(tx, userId, occurrence, originalStart, input);
      }
      if (scope === "following" && !occurrence.isFirst) {
        return splitSeries(tx, userId, occurrence, originalStart, input);
      }
      return editAllOccurrences(tx, userId, occurrence, originalStart, input);
    }),
  );
}

async function editThisOccurrence(
  tx: DbTransaction,
  userId: string,
  { series, exception, displayed }: Occurrence,
  originalStart: OriginalStart,
  input: EditInput,
): Promise<OccurrenceEditResult> {
  const timing = calendarEventTiming(input.when);
  if (timing.allDay !== series.allDay) {
    throw new ValidationError({
      allDay: [
        "To switch between all-day and timed, change this and following events or all events.",
      ],
    });
  }
  if (!timing.allDay && timing.tz !== series.tz) {
    throw new ValidationError({
      tz: [
        "To change the time zone, change this and following events or all events.",
      ],
    });
  }

  const values = { ...detailsOf(input), times: timesOf(timing) };
  if (!sameValues(values, displayed)) {
    const columns = modifiedColumns(originalStart, values);
    if (exception) await updateException(tx, userId, exception, columns);
    else await insertException(tx, userId, series.id, columns);
  }
  return { event: toCalendarEvent(series), dropped: [] };
}

/** True when the form sent what the occurrence shows and the same rule. */
function isNoOp(occurrence: Occurrence, input: EditInput): boolean {
  const { when, rrule, ...details } = input;
  const timing = calendarEventTiming(when);
  return (
    rrule === occurrence.series.rrule &&
    sameValues({ ...details, times: timesOf(timing) }, occurrence.displayed) &&
    (timing.allDay || timing.tz === occurrence.series.tz)
  );
}

function assertRuleEnd(next: SeriesColumns) {
  if (endsBeforeStart(next)) {
    throw new ValidationError({ rrule: [UNTIL_BEFORE_START] });
  }
}

/** The series columns with the folded first occurrence's values, if any. */
function withFolded(
  next: SeriesColumns,
  reconciled: Reconciled,
): SeriesColumns {
  if (!reconciled.folded) return next;
  const { times, ...details } = reconciled.folded.values;
  return { ...next, ...details, ...timingOf(times, next.tz) };
}

async function editAllOccurrences(
  tx: DbTransaction,
  userId: string,
  occurrence: Occurrence,
  originalStart: OriginalStart,
  input: EditInput,
): Promise<OccurrenceEditResult> {
  const { series, exceptions, displayed } = occurrence;
  if (isNoOp(occurrence, input)) {
    return { event: toCalendarEvent(series), dropped: [] };
  }

  const edit = seriesAfterEdit(seriesColumnsOf(series), displayed, input);
  assertRuleEnd(edit.next);
  const reconciled = reconcileExceptions({
    from: series,
    to: edit.next,
    shift: edit.shift,
    exceptions,
    edit: {
      key: originalStart,
      changed: edit.changed,
      input: detailsOf(input),
      times: edit.times,
    },
  });

  const dropped = await writeReconciled(
    tx,
    userId,
    series.id,
    reconciled,
    "all",
  );
  const updated = await updateEvent(
    tx,
    userId,
    series,
    withFolded(edit.next, reconciled),
    { scope: "all", droppedExceptions: dropped.length },
  );
  return { event: toCalendarEvent(updated), dropped };
}

async function splitSeries(
  tx: DbTransaction,
  userId: string,
  occurrence: Occurrence,
  originalStart: OriginalStart,
  input: EditInput,
): Promise<OccurrenceEditResult> {
  const { series, exceptions, displayed, date } = occurrence;
  if (isNoOp(occurrence, input)) {
    return { event: toCalendarEvent(series), dropped: [] };
  }

  // Keeping the rule keeps the occurrences it had left.
  let rrule = input.rrule;
  if (rrule !== null && rrule === series.rrule) {
    const end = fromRrule(rrule).end;
    if (end.type === "count") {
      rrule = ruleWithCount(
        rrule,
        end.count - countOccurrencesBefore(asSeries(series), date),
      );
    }
  }

  // The rest of the series, as if it had started at this occurrence.
  const base: SeriesColumns = {
    ...seriesColumnsOf(series),
    ...timingOf(generatedTimes(series, originalStart), series.tz),
  };
  const edit = seriesAfterEdit(base, displayed, { ...input, rrule });
  assertRuleEnd(edit.next);
  const reconciled = reconcileExceptions({
    from: series,
    to: edit.next,
    shift: edit.shift,
    exceptions: exceptions.filter(
      (row) => originalDateOf(series, originalStartOf(row)) >= date,
    ),
    edit: {
      key: originalStart,
      changed: edit.changed,
      input: detailsOf(input),
      times: edit.times,
    },
  });

  const created = await insertEvent(
    tx,
    userId,
    withFolded(edit.next, reconciled),
    { fromId: series.id },
  );
  const dropped = await writeReconciled(
    tx,
    userId,
    created.id,
    reconciled,
    "following",
  );
  await updateEvent(
    tx,
    userId,
    series,
    { ...seriesColumnsOf(series), rrule: endRuleBefore(series.rrule, date) },
    {
      scope: "following",
      splitIntoId: created.id,
      droppedExceptions: dropped.length,
    },
  );
  return { event: toCalendarEvent(created), dropped };
}

/**
 * Deletes occurrences of a series (ADR 0012), from the occurrence starting
 * at `originalStart`:
 * - "this": cancels that occurrence (a cancelled exception);
 * - "following": ends the series the day before, removing the later
 *   exceptions; from the first occurrence, deletes the whole series;
 * - "all": deletes the series and its exceptions, as `deleteCalendarEvent`.
 * Returns the exceptions removed with the occurrences.
 */
export async function deleteCalendarEventOccurrence(
  userId: string,
  { id, originalStart, scope }: DeleteCalendarEventOccurrenceInput,
): Promise<{ dropped: DroppedException[] }> {
  return db.transaction(async (tx) => {
    const { series, exceptions, exception, date, isFirst } =
      await findOccurrence(tx, userId, id, originalStart);

    if (scope === "this") {
      const columns = cancelledColumns(originalStart);
      if (exception) await updateException(tx, userId, exception, columns);
      else await insertException(tx, userId, series.id, columns);
      return { dropped: [] };
    }

    if (scope === "all" || isFirst) {
      await deleteEvent(tx, userId, series.id, exceptions);
      return { dropped: exceptions.map(toDropped) };
    }

    const later = exceptions.filter(
      (row) => originalDateOf(series, originalStartOf(row)) >= date,
    );
    await deleteExceptions(tx, userId, later);
    const dropped = later
      .filter((row) => generatesOccurrence(series, originalStartOf(row)))
      .map(toDropped);
    await updateEvent(
      tx,
      userId,
      series,
      { ...seriesColumnsOf(series), rrule: endRuleBefore(series.rrule, date) },
      { scope: "following", droppedExceptions: dropped.length },
    );
    return { dropped };
  });
}

// --- Reading a range ---------------------------------------------------------

type OccurrencePatch = Details;

/**
 * The user's events and occurrences overlapping the local days
 * `localStart` up to (not including) `localEnd` in `tz`:
 * - timed ones by instant overlap with that range's start and end
 *   instants, so one that ends exactly when the range starts, or starts
 *   exactly when it ends, is not included;
 * - all-day ones by local-date overlap, with their exclusive end, so they
 *   never shift with `tz`;
 * - a series is expanded into its occurrences (src/lib/recurrence.ts), with
 *   cancelled ones removed and modified ones showing their own values.
 * Ordered by start (an all-day one starts at its first day's local
 * midnight in `tz`), all-day first on a tie, then by ID and original start.
 */
export async function eventsBetween(
  userId: string,
  { localStart, localEnd, tz }: EventsBetweenInput,
): Promise<CalendarEventOccurrence[]> {
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
            isNull(calendarEvents.rrule),
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
          // A series that has started by the range's end, or has an
          // occurrence moved into or before the range.
          and(
            isNotNull(calendarEvents.rrule),
            or(
              lt(calendarEvents.startAt, rangeEnd),
              lt(calendarEvents.startDate, localEnd),
              exists(
                db
                  .select({ id: calendarEventExceptions.id })
                  .from(calendarEventExceptions)
                  .where(
                    and(
                      eq(calendarEventExceptions.eventId, calendarEvents.id),
                      eq(calendarEventExceptions.userId, userId),
                      or(
                        lt(calendarEventExceptions.startAt, rangeEnd),
                        lt(calendarEventExceptions.startDate, localEnd),
                      ),
                    ),
                  ),
              ),
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(calendarEvents.id));

  const seriesIds = rows.filter((row) => row.rrule).map((row) => row.id);
  const exceptions =
    seriesIds.length === 0
      ? []
      : await db
          .select()
          .from(calendarEventExceptions)
          .where(
            and(
              eq(calendarEventExceptions.userId, userId),
              inArray(calendarEventExceptions.eventId, seriesIds),
            ),
          );

  const range = { localStart, localEnd, tz };
  const occurrences = rows.flatMap((row): CalendarEventOccurrence[] => {
    const event = toCalendarEvent(row);
    if (!row.rrule) {
      return [
        { ...event, seriesId: null, originalStart: null, modified: false },
      ];
    }
    const own = exceptions.filter((exception) => exception.eventId === row.id);
    const patchOf = (exception: ExceptionRow): OccurrencePatch =>
      detailsOf({ ...exception, title: exception.title! });

    if (event.allDay) {
      return expandOccurrences<OccurrencePatch>(
        { ...event, rrule: row.rrule },
        range,
        own.map((exception) =>
          exception.kind === "cancelled"
            ? {
                kind: "cancelled",
                originalStartDate: exception.originalStartDate!,
              }
            : {
                kind: "modified",
                originalStartDate: exception.originalStartDate!,
                startDate: exception.startDate!,
                endDate: exception.endDate!,
                patch: patchOf(exception),
              },
        ),
      ).map((occurrence) => ({
        ...event,
        ...occurrence.patch,
        startDate: occurrence.startDate,
        endDate: occurrence.endDate,
        seriesId: row.id,
        originalStart: occurrence.originalStartDate,
        modified: occurrence.modified,
      }));
    }
    return expandOccurrences<OccurrencePatch>(
      { ...event, rrule: row.rrule },
      range,
      own.map((exception) =>
        exception.kind === "cancelled"
          ? { kind: "cancelled", originalStartAt: exception.originalStartAt! }
          : {
              kind: "modified",
              originalStartAt: exception.originalStartAt!,
              startAt: exception.startAt!,
              endAt: exception.endAt!,
              patch: patchOf(exception),
            },
      ),
    ).map((occurrence) => ({
      ...event,
      ...occurrence.patch,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      seriesId: row.id,
      originalStart: occurrence.originalStartAt,
      modified: occurrence.modified,
    }));
  });

  const startOf = (event: CalendarEventOccurrence) =>
    event.allDay
      ? startOfLocalDay(event.startDate, tz).getTime()
      : event.startAt.getTime();
  const originalOf = (event: CalendarEventOccurrence) =>
    event.originalStart instanceof Date
      ? event.originalStart.toISOString()
      : (event.originalStart ?? "");
  return occurrences.sort(
    (a, b) =>
      startOf(a) - startOf(b) ||
      Number(b.allDay) - Number(a.allDay) ||
      a.id.localeCompare(b.id) ||
      originalOf(a).localeCompare(originalOf(b)),
  );
}
