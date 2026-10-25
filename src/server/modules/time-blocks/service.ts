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
  sql,
} from "drizzle-orm";

import { startOfLocalDay, type LocalDate } from "@/lib/dates";
import {
  countOccurrencesBefore,
  endRuleBefore,
  expandOccurrences,
  fromRrule,
  ruleWithCount,
  seriesStartDate,
} from "@/lib/recurrence";
import {
  type TimeBlock,
  TIME_BLOCK_EDITABLE_FIELDS,
  type TimeBlockEditableField,
  type TimeBlockExceptionField,
  type TimeBlockExceptionKind,
  type TimeBlockOccurrence,
  type TimeBlockScope,
  type TimeBlockStatus,
  timeBlockTiming,
} from "@/lib/time-blocks";
import type { TaskStatus } from "@/lib/tasks";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { isForeignKeyViolation } from "@/server/db/errors";
import {
  goals,
  milestones,
  tasks,
  timeBlockExceptions,
  timeBlocks,
  userPreferences,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import {
  asSeries,
  autoMarkTargets,
  cancelledColumns,
  displayedValues,
  endsBeforeStart,
  type ExceptionColumns,
  type ExceptionRow,
  generatedTimes,
  generatesOccurrence,
  modifiedColumns,
  type OccurrenceValues,
  originalDateOf,
  type Reconciled,
  reconcileExceptions,
  sameTimes,
  type SeriesColumns,
  seriesAfterEdit,
  seriesColumnsOf,
  type TimeBlockRow,
} from "./series";
import type {
  BlocksBetweenInput,
  CreateTimeBlockInput,
  DeleteTimeBlockOccurrenceInput,
  EditTimeBlockOccurrenceInput,
  SetTimeBlockStatusInput,
  TimeBlockIdInput,
  UpdateTimeBlockInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A record
// that is missing or belongs to someone else is the same NotFoundError.
// Each mutation writes its audit events in the same transaction, and a
// change to the current values is a no-op with no event.
// Rules: ADR 0012 (time blocks, recurrence, scopes, status and auto-mark).
// A series is one row with an RRULE; its occurrences are expanded at query
// time, and the occurrences that differ (moved, cancelled or marked) are
// rows in `time_block_exceptions` (see series.ts for how a scoped change
// carries them over).

const TASK_KEY = "time_blocks_task_id_user_id_fk";

const UNTIL_BEFORE_START = "End the repeat on or after the start date.";

/**
 * An exception a series change removed: its occurrence lost its own times
 * or status, or came back. Returned so the UI can say what changed.
 */
export type DroppedException = {
  id: string;
  kind: TimeBlockExceptionKind;
  originalStart: Date;
};

export type OccurrenceEditResult = {
  /** The series the occurrence now belongs to (a new one after a split). */
  block: TimeBlock;
  dropped: DroppedException[];
};

export function toTimeBlock(row: TimeBlockRow): TimeBlock {
  return {
    id: row.id,
    taskId: row.taskId,
    startAt: row.startAt,
    endAt: row.endAt,
    tz: row.tz,
    rrule: row.rrule,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Locks one of the user's blocks for the rest of the transaction. */
async function findForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
): Promise<TimeBlockRow> {
  const [row] = await tx
    .select()
    .from(timeBlocks)
    .where(and(eq(timeBlocks.id, id), eq(timeBlocks.userId, userId)))
    .for("update");
  if (!row) throw new NotFoundError();
  return row;
}

/** A series' exceptions, oldest original start first. */
function exceptionsOf(tx: DbTransaction, userId: string, blockId: string) {
  return tx
    .select()
    .from(timeBlockExceptions)
    .where(
      and(
        eq(timeBlockExceptions.blockId, blockId),
        eq(timeBlockExceptions.userId, userId),
      ),
    )
    .orderBy(asc(timeBlockExceptions.originalStartAt));
}

/**
 * Runs `write`, turning a task that is missing or another user's (the
 * composite foreign key refusing it) into a field error.
 */
async function guardTask<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (cause) {
    if (isForeignKeyViolation(cause, TASK_KEY)) {
      throw new ValidationError({ taskId: ["Choose one of your tasks."] });
    }
    throw cause;
  }
}

const iso = (instant: Date | null) => instant?.toISOString() ?? null;

/** Compares a column by value; instants by their time, not object identity. */
function sameColumn(left: unknown, right: unknown): boolean {
  if (left instanceof Date || right instanceof Date) {
    return iso(left as Date | null) === iso(right as Date | null);
  }
  return left === right;
}

async function insertBlock(
  tx: DbTransaction,
  userId: string,
  taskId: string,
  columns: SeriesColumns,
  split?: { fromId: string },
): Promise<TimeBlockRow> {
  const [row] = await tx
    .insert(timeBlocks)
    .values({ ...columns, userId, taskId })
    .returning();
  if (!row) throw new Error("Time block insert returned no row");

  await recordAudit(tx, {
    type: "time_block.created",
    userId,
    entityId: row.id,
    changes: {
      taskId: { from: null, to: row.taskId },
      startAt: { from: null, to: iso(row.startAt) },
      endAt: { from: null, to: iso(row.endAt) },
      tz: { from: null, to: row.tz },
      rrule: { from: null, to: row.rrule },
      status: { from: null, to: row.status },
      ...(split && { scope: "following" as const, splitFromId: split.fromId }),
    },
  });
  return row;
}

/**
 * Writes `next` over `current` and records which fields changed, with old
 * and new values. A scoped series change also records its scope, the
 * series it split into and how many exceptions it dropped. Returns
 * `current` when nothing changed.
 */
async function updateBlock(
  tx: DbTransaction,
  userId: string,
  current: TimeBlockRow,
  next: SeriesColumns,
  context: {
    scope?: "following" | "all";
    splitIntoId?: string;
    droppedExceptions?: number;
  } = {},
): Promise<TimeBlockRow> {
  const fields = TIME_BLOCK_EDITABLE_FIELDS.filter(
    (field) => !sameColumn(current[field], next[field]),
  );
  if (fields.length === 0) return current;

  const [updated] = await tx
    .update(timeBlocks)
    .set(next)
    .where(and(eq(timeBlocks.id, current.id), eq(timeBlocks.userId, userId)))
    .returning();
  if (!updated) throw new NotFoundError();

  const changed = (field: TimeBlockEditableField) => fields.includes(field);
  await recordAudit(tx, {
    type: "time_block.updated",
    userId,
    entityId: current.id,
    changes: {
      fields,
      ...(changed("startAt") && {
        startAt: { from: iso(current.startAt), to: iso(updated.startAt) },
      }),
      ...(changed("endAt") && {
        endAt: { from: iso(current.endAt), to: iso(updated.endAt) },
      }),
      ...(changed("tz") && { tz: { from: current.tz, to: updated.tz } }),
      ...(changed("rrule") && {
        rrule: { from: current.rrule, to: updated.rrule },
      }),
      ...(changed("status") && {
        status: { from: current.status, to: updated.status },
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

/** The columns a create or one-off edit writes, from validated input. */
function blockColumns(
  input: Pick<CreateTimeBlockInput, "when" | "rrule">,
): SeriesColumns {
  return {
    ...timeBlockTiming(input.when),
    rrule: input.rrule,
    status: "scheduled",
  };
}

/** Adds a one-off block for one of the user's tasks, or a series when `rrule` is set. */
export async function createTimeBlock(
  userId: string,
  input: CreateTimeBlockInput,
): Promise<TimeBlock> {
  const row = await guardTask(() =>
    db.transaction((tx) =>
      insertBlock(tx, userId, input.taskId, blockColumns(input)),
    ),
  );
  return toTimeBlock(row);
}

/** One of the user's blocks (a series row for a repeating one). */
export async function getTimeBlock(
  userId: string,
  { id }: TimeBlockIdInput,
): Promise<TimeBlock> {
  const [row] = await db
    .select()
    .from(timeBlocks)
    .where(and(eq(timeBlocks.id, id), eq(timeBlocks.userId, userId)));
  if (!row) throw new NotFoundError();
  return toTimeBlock(row);
}

/**
 * Replaces a one-off block's times; setting `rrule` makes it a series. Its
 * status then moves to the first occurrence (a series row stays
 * `scheduled`). A series changes only through `editTimeBlockOccurrence`.
 */
export async function updateTimeBlock(
  userId: string,
  { id, ...input }: UpdateTimeBlockInput,
): Promise<TimeBlock> {
  const row = await db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    if (current.rrule !== null) {
      throw new ConflictError(
        "Choose which blocks to change: this one, this and following, or all.",
      );
    }
    const next = { ...blockColumns(input), status: current.status };
    if (next.rrule === null) return updateBlock(tx, userId, current, next);

    assertRuleEnd(next);
    const updated = await updateBlock(tx, userId, current, {
      ...next,
      status: "scheduled",
    });
    if (current.status !== "scheduled") {
      await insertException(
        tx,
        userId,
        updated.id,
        modifiedColumns(updated.startAt, {
          ...generatedTimes(updated, updated.startAt),
          status: current.status,
        }),
      );
    }
    return updated;
  });
  return toTimeBlock(row);
}

/**
 * Hard-deletes a block and its exceptions (which cascade), and their audit
 * events, in the caller's transaction (ADR 0005, ADR 0006).
 */
async function deleteBlock(
  tx: DbTransaction,
  userId: string,
  id: string,
  exceptions: readonly Pick<ExceptionRow, "id">[],
): Promise<void> {
  const [deleted] = await tx
    .delete(timeBlocks)
    .where(and(eq(timeBlocks.id, id), eq(timeBlocks.userId, userId)))
    .returning({ id: timeBlocks.id });
  if (!deleted) throw new NotFoundError();

  await deleteExceptionAuditEvents(tx, userId, exceptions);
  await deleteAuditEventsForEntity(tx, {
    userId,
    entityType: "time_block",
    entityId: id,
  });
}

/**
 * Hard-deletes the block, or a whole series with its exceptions (the UI
 * confirms first), and their audit events in the same transaction.
 */
export async function deleteTimeBlock(
  userId: string,
  { id }: TimeBlockIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const exceptions = await exceptionsOf(tx, userId, id);
    await deleteBlock(tx, userId, id, exceptions);
  });
}

/**
 * Deletes every block of a task, their exceptions and all their audit
 * events, before the task itself is hard-deleted in the same transaction
 * (ADR 0012). The foreign key would cascade the rows anyway; doing it here
 * also removes the events, which have no foreign key.
 */
export async function deleteTimeBlocksForTaskInTx(
  tx: DbTransaction,
  userId: string,
  taskId: string,
): Promise<void> {
  const blocks = await tx
    .select({ id: timeBlocks.id })
    .from(timeBlocks)
    .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.taskId, taskId)))
    .orderBy(asc(timeBlocks.id))
    .for("update");
  if (blocks.length === 0) return;

  const blockIds = blocks.map(({ id }) => id);
  const exceptions = await tx
    .select({ id: timeBlockExceptions.id })
    .from(timeBlockExceptions)
    .where(
      and(
        eq(timeBlockExceptions.userId, userId),
        inArray(timeBlockExceptions.blockId, blockIds),
      ),
    );
  await tx
    .delete(timeBlocks)
    .where(
      and(eq(timeBlocks.userId, userId), inArray(timeBlocks.id, blockIds)),
    );

  await deleteExceptionAuditEvents(tx, userId, exceptions);
  for (const id of blockIds) {
    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "time_block",
      entityId: id,
    });
  }
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
      entityType: "time_block_exception",
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
  await tx.delete(timeBlockExceptions).where(
    and(
      eq(timeBlockExceptions.userId, userId),
      inArray(
        timeBlockExceptions.id,
        exceptions.map(({ id }) => id),
      ),
    ),
  );
  await deleteExceptionAuditEvents(tx, userId, exceptions);
}

async function insertException(
  tx: DbTransaction,
  userId: string,
  blockId: string,
  columns: ExceptionColumns,
  automatic = false,
): Promise<ExceptionRow> {
  const [row] = await tx
    .insert(timeBlockExceptions)
    .values({ ...columns, userId, blockId })
    .returning();
  if (!row) throw new Error("Time block exception insert returned no row");

  await recordAudit(tx, {
    type: "time_block_exception.created",
    userId,
    entityId: row.id,
    changes: {
      blockId: { from: null, to: row.blockId },
      originalStartAt: { from: null, to: iso(row.originalStartAt) },
      kind: { from: null, to: row.kind },
      startAt: { from: null, to: iso(row.startAt) },
      endAt: { from: null, to: iso(row.endAt) },
      status: { from: null, to: row.status },
      ...(automatic && { automatic: true as const }),
    },
  });
  return row;
}

const EXCEPTION_FIELDS: TimeBlockExceptionField[] = [
  "blockId",
  "originalStartAt",
  "kind",
  "startAt",
  "endAt",
  "status",
];

function changedExceptionFields(
  current: ExceptionRow,
  next: ExceptionColumns & Pick<ExceptionRow, "blockId">,
): TimeBlockExceptionField[] {
  return EXCEPTION_FIELDS.filter(
    (field) => !sameColumn(current[field], next[field]),
  );
}

type ExceptionContext = { scope?: TimeBlockScope; automatic?: boolean };

async function recordExceptionUpdate(
  tx: DbTransaction,
  userId: string,
  current: ExceptionRow,
  updated: ExceptionRow,
  fields: TimeBlockExceptionField[],
  { scope, automatic }: ExceptionContext,
): Promise<void> {
  const changed = (field: TimeBlockExceptionField) => fields.includes(field);
  const instantChange = (field: "originalStartAt" | "startAt" | "endAt") =>
    changed(field) && {
      [field]: { from: iso(current[field]), to: iso(updated[field]) },
    };
  await recordAudit(tx, {
    type: "time_block_exception.updated",
    userId,
    entityId: current.id,
    changes: {
      fields,
      ...(scope && { scope }),
      ...(changed("blockId") && {
        blockId: { from: current.blockId, to: updated.blockId },
      }),
      ...instantChange("originalStartAt"),
      ...(changed("kind") && {
        kind: { from: current.kind, to: updated.kind },
      }),
      ...instantChange("startAt"),
      ...instantChange("endAt"),
      ...(changed("status") && {
        status: { from: current.status, to: updated.status },
      }),
      ...(automatic && { automatic: true as const }),
    },
  });
}

/**
 * Rewrites an exception, possibly onto another series or original start.
 * Deletes and re-inserts the row under the same ID, so a change that moves
 * several exceptions never collides on the unique original start. Callers
 * delete every row they rewrite before inserting any.
 */
async function reinsertException(
  tx: DbTransaction,
  userId: string,
  current: ExceptionRow,
  next: ExceptionColumns & Pick<ExceptionRow, "blockId">,
  scope: TimeBlockScope,
): Promise<void> {
  const fields = changedExceptionFields(current, next);
  const [row] = await tx
    .insert(timeBlockExceptions)
    .values({
      ...next,
      id: current.id,
      userId,
      createdAt: current.createdAt,
    })
    .returning();
  if (!row) throw new Error("Time block exception insert returned no row");
  await recordExceptionUpdate(tx, userId, current, row, fields, { scope });
}

/** Sets an existing exception's columns in place. */
async function updateException(
  tx: DbTransaction,
  userId: string,
  current: ExceptionRow,
  next: ExceptionColumns,
  context: ExceptionContext,
): Promise<void> {
  const fields = changedExceptionFields(current, {
    ...next,
    blockId: current.blockId,
  });
  if (fields.length === 0) return;
  const [updated] = await tx
    .update(timeBlockExceptions)
    .set(next)
    .where(
      and(
        eq(timeBlockExceptions.id, current.id),
        eq(timeBlockExceptions.userId, userId),
      ),
    )
    .returning();
  if (!updated) throw new NotFoundError();
  await recordExceptionUpdate(tx, userId, current, updated, fields, context);
}

function toDropped(row: ExceptionRow): DroppedException {
  return { id: row.id, kind: row.kind, originalStart: row.originalStartAt };
}

/**
 * Writes the outcome of `reconcileExceptions` for series `blockId`: deletes
 * the dropped, stale and folded exceptions with their audit events, and
 * rewrites the kept ones that changed.
 */
async function writeReconciled(
  tx: DbTransaction,
  userId: string,
  blockId: string,
  reconciled: Reconciled,
  scope: "following" | "all",
): Promise<DroppedException[]> {
  const removed = [...reconciled.dropped, ...reconciled.stale];
  if (reconciled.folded) removed.push(reconciled.folded.row);
  await deleteExceptions(tx, userId, removed);

  const rewrites = reconciled.kept
    .map(({ row, next }) => ({ row, next: { ...next, blockId } }))
    .filter(({ row, next }) => changedExceptionFields(row, next).length > 0);
  if (rewrites.length > 0) {
    await tx.delete(timeBlockExceptions).where(
      and(
        eq(timeBlockExceptions.userId, userId),
        inArray(
          timeBlockExceptions.id,
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

// --- Status ------------------------------------------------------------------

/** Sets a one-off block's status; the same status again is a no-op. */
async function setBlockStatus(
  tx: DbTransaction,
  userId: string,
  row: TimeBlockRow,
  status: TimeBlockStatus,
  automatic: boolean,
): Promise<void> {
  if (row.status === status) return;
  const [updated] = await tx
    .update(timeBlocks)
    .set({ status })
    .where(and(eq(timeBlocks.id, row.id), eq(timeBlocks.userId, userId)))
    .returning({ id: timeBlocks.id });
  if (!updated) throw new NotFoundError();

  await recordAudit(tx, {
    type: "time_block.status_changed",
    userId,
    entityId: row.id,
    changes: {
      status: { from: row.status, to: status },
      ...(automatic && { automatic: true as const }),
    },
  });
}

/**
 * Sets one occurrence's status in its exception, writing a modified
 * exception with the times it shows when it has none. The same status
 * again is a no-op.
 */
async function setOccurrenceStatus(
  tx: DbTransaction,
  userId: string,
  occurrence: {
    seriesId: string;
    originalStart: Date;
    displayed: OccurrenceValues;
    exception: ExceptionRow | undefined;
  },
  status: TimeBlockStatus,
  automatic: boolean,
): Promise<void> {
  const { seriesId, originalStart, displayed, exception } = occurrence;
  if (displayed.status === status) return;
  const columns = modifiedColumns(originalStart, { ...displayed, status });
  if (exception) {
    await updateException(tx, userId, exception, columns, { automatic });
  } else {
    await insertException(tx, userId, seriesId, columns, automatic);
  }
}

/**
 * Marks a block `done` or `skipped`, or back to `scheduled`: a one-off
 * block (no `originalStart`), or one occurrence of a series. Never changes
 * the task (ADR 0012: completing it is a separate action).
 */
export async function setTimeBlockStatus(
  userId: string,
  { id, originalStart, status }: SetTimeBlockStatusInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (originalStart === undefined) {
      const row = await findForUpdate(tx, userId, id);
      if (row.rrule !== null) {
        throw new ConflictError("Choose which occurrence to mark.");
      }
      await setBlockStatus(tx, userId, row, status, false);
      return;
    }
    const { series, exception, displayed } = await findOccurrence(
      tx,
      userId,
      id,
      originalStart,
    );
    await setOccurrenceStatus(
      tx,
      userId,
      { seriesId: series.id, originalStart, displayed, exception },
      status,
      false,
    );
  });
}

/**
 * Auto-mark (ADR 0012), called by the task service in the same transaction
 * as completing the task at `completedAt`: started one-off blocks that are
 * still `scheduled` become `done`, and so do still-`scheduled` occurrences
 * of repeating blocks that started on the user's local day of completion.
 * Each writes its own event marked `automatic`. Skipped and future blocks,
 * earlier occurrences and the series themselves are left alone.
 */
export async function autoMarkTimeBlocksInTx(
  tx: DbTransaction,
  userId: string,
  taskId: string,
  completedAt: Date,
): Promise<void> {
  const blocks = await tx
    .select()
    .from(timeBlocks)
    .where(and(eq(timeBlocks.userId, userId), eq(timeBlocks.taskId, taskId)))
    .orderBy(asc(timeBlocks.startAt), asc(timeBlocks.id))
    .for("update");
  if (blocks.length === 0) return;

  const seriesIds = blocks.filter((row) => row.rrule).map((row) => row.id);
  const exceptions =
    seriesIds.length === 0
      ? []
      : await tx
          .select()
          .from(timeBlockExceptions)
          .where(
            and(
              eq(timeBlockExceptions.userId, userId),
              inArray(timeBlockExceptions.blockId, seriesIds),
            ),
          );
  const [preferences] = await tx
    .select({ timezone: userPreferences.timezone })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  const targets = autoMarkTargets(
    blocks,
    exceptions,
    completedAt,
    preferences?.timezone ?? null,
  );
  for (const target of targets) {
    if (target.kind === "block") {
      await setBlockStatus(tx, userId, target.row, "done", true);
    } else {
      await setOccurrenceStatus(
        tx,
        userId,
        {
          seriesId: target.series.id,
          originalStart: target.originalStartAt,
          displayed: { ...target.times, status: "scheduled" },
          exception: target.exception,
        },
        "done",
        true,
      );
    }
  }
}

// --- Scoped changes to a series ----------------------------------------------

type Occurrence = {
  series: TimeBlockRow & { rrule: string };
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
  originalStart: Date,
): Promise<Occurrence> {
  const series = await findForUpdate(tx, userId, id);
  if (series.rrule === null) {
    throw new ConflictError("This block doesn't repeat.");
  }
  if (!generatesOccurrence(series, originalStart)) throw new NotFoundError();

  const exceptions = await exceptionsOf(tx, userId, id);
  const exception = exceptions.find(
    (row) => row.originalStartAt.getTime() === originalStart.getTime(),
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

type EditInput = Pick<EditTimeBlockOccurrenceInput, "when" | "rrule">;

/**
 * Changes occurrences of a series (ADR 0012), from the occurrence starting
 * at `originalStart`, with the times the form sent for it:
 * - "this": that occurrence only, as a modified exception keeping its
 *   status. Its times keep the series' zone.
 * - "following": that occurrence and every later one become a new series,
 *   and the old one ends the day before. From the first occurrence, this
 *   is "all". A rule that ends after a count keeps the count left.
 * - "all": the whole series.
 * Exceptions are carried over as series.ts describes; the ones a change
 * removes come back in `dropped`.
 */
export async function editTimeBlockOccurrence(
  userId: string,
  input: EditTimeBlockOccurrenceInput,
): Promise<OccurrenceEditResult> {
  return db.transaction((tx) => editOccurrenceInTx(tx, userId, input));
}

async function editOccurrenceInTx(
  tx: DbTransaction,
  userId: string,
  { id, originalStart, scope, rrule, when }: EditTimeBlockOccurrenceInput,
): Promise<OccurrenceEditResult> {
  const occurrence = await findOccurrence(tx, userId, id, originalStart);
  const input = { when, rrule };
  if (scope === "this") {
    return editThisOccurrence(tx, userId, occurrence, originalStart, input);
  }
  if (scope === "following" && !occurrence.isFirst) {
    return splitSeries(tx, userId, occurrence, originalStart, input);
  }
  return editAllOccurrences(tx, userId, occurrence, originalStart, input);
}

async function editThisOccurrence(
  tx: DbTransaction,
  userId: string,
  { series, exception, displayed }: Occurrence,
  originalStart: Date,
  input: EditInput,
): Promise<OccurrenceEditResult> {
  const timing = timeBlockTiming(input.when);
  if (timing.tz !== series.tz) {
    throw new ValidationError({
      tz: [
        "To change the time zone, change this and following blocks or all blocks.",
      ],
    });
  }
  if (!sameTimes(timing, displayed)) {
    const columns = modifiedColumns(originalStart, {
      startAt: timing.startAt,
      endAt: timing.endAt,
      status: displayed.status,
    });
    if (exception) {
      await updateException(tx, userId, exception, columns, { scope: "this" });
    } else {
      await insertException(tx, userId, series.id, columns);
    }
  }
  return { block: toTimeBlock(series), dropped: [] };
}

/** True when the form sent what the occurrence shows and the same rule. */
function isNoOp(occurrence: Occurrence, input: EditInput): boolean {
  const timing = timeBlockTiming(input.when);
  return (
    input.rrule === occurrence.series.rrule &&
    sameTimes(timing, occurrence.displayed) &&
    timing.tz === occurrence.series.tz
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
  return { ...next, ...reconciled.folded.values };
}

async function editAllOccurrences(
  tx: DbTransaction,
  userId: string,
  occurrence: Occurrence,
  originalStart: Date,
  input: EditInput,
): Promise<OccurrenceEditResult> {
  const { series, exceptions, displayed } = occurrence;
  if (isNoOp(occurrence, input)) {
    return { block: toTimeBlock(series), dropped: [] };
  }

  const edit = seriesAfterEdit(seriesColumnsOf(series), displayed, input);
  assertRuleEnd(edit.next);
  const reconciled = reconcileExceptions({
    from: series,
    to: edit.next,
    shift: edit.shift,
    exceptions,
    edit: { key: originalStart, times: edit.times },
  });

  const dropped = await writeReconciled(
    tx,
    userId,
    series.id,
    reconciled,
    "all",
  );
  const updated = await updateBlock(
    tx,
    userId,
    series,
    withFolded(edit.next, reconciled),
    { scope: "all", droppedExceptions: dropped.length },
  );
  return { block: toTimeBlock(updated), dropped };
}

async function splitSeries(
  tx: DbTransaction,
  userId: string,
  occurrence: Occurrence,
  originalStart: Date,
  input: EditInput,
): Promise<OccurrenceEditResult> {
  const { series, exceptions, displayed, date } = occurrence;
  if (isNoOp(occurrence, input)) {
    return { block: toTimeBlock(series), dropped: [] };
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
    ...generatedTimes(series, originalStart),
  };
  const edit = seriesAfterEdit(base, displayed, { ...input, rrule });
  assertRuleEnd(edit.next);
  const reconciled = reconcileExceptions({
    from: series,
    to: edit.next,
    shift: edit.shift,
    exceptions: exceptions.filter(
      (row) => originalDateOf(series, row.originalStartAt) >= date,
    ),
    edit: { key: originalStart, times: edit.times },
  });

  const created = await insertBlock(
    tx,
    userId,
    series.taskId,
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
  await updateBlock(
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
  return { block: toTimeBlock(created), dropped };
}

/**
 * Deletes occurrences of a series (ADR 0012), from the occurrence starting
 * at `originalStart`:
 * - "this": cancels that occurrence (a cancelled exception);
 * - "following": ends the series the day before, removing the later
 *   exceptions; from the first occurrence, deletes the whole series. This
 *   is "End series here" for a completed task's future occurrences;
 * - "all": deletes the series and its exceptions, as `deleteTimeBlock`.
 * Returns the exceptions removed with the occurrences.
 */
export async function deleteTimeBlockOccurrence(
  userId: string,
  input: DeleteTimeBlockOccurrenceInput,
): Promise<{ dropped: DroppedException[] }> {
  return db.transaction((tx) => deleteOccurrenceInTx(tx, userId, input));
}

async function deleteOccurrenceInTx(
  tx: DbTransaction,
  userId: string,
  { id, originalStart, scope }: DeleteTimeBlockOccurrenceInput,
): Promise<{ dropped: DroppedException[] }> {
  const { series, exceptions, exception, date, isFirst } = await findOccurrence(
    tx,
    userId,
    id,
    originalStart,
  );

  if (scope === "this") {
    const columns = cancelledColumns(originalStart);
    if (exception) {
      await updateException(tx, userId, exception, columns, { scope: "this" });
    } else {
      await insertException(tx, userId, series.id, columns);
    }
    return { dropped: [] };
  }

  if (scope === "all" || isFirst) {
    await deleteBlock(tx, userId, series.id, exceptions);
    return { dropped: exceptions.map(toDropped) };
  }

  const later = exceptions.filter(
    (row) => originalDateOf(series, row.originalStartAt) >= date,
  );
  await deleteExceptions(tx, userId, later);
  const dropped = later
    .filter((row) => generatesOccurrence(series, row.originalStartAt))
    .map(toDropped);
  await updateBlock(
    tx,
    userId,
    series,
    { ...seriesColumnsOf(series), rrule: endRuleBefore(series.rrule, date) },
    { scope: "following", droppedExceptions: dropped.length },
  );
  return { dropped };
}

// --- Reading a range ---------------------------------------------------------

/**
 * The user's blocks and occurrences overlapping the local days
 * `localStart` up to (not including) `localEnd` in `tz`, by instant
 * overlap (touching an edge is not overlap), with series expanded into
 * their occurrences and each one's status. Each carries its task's title
 * and status and its lane: the task's goal (direct, or its milestone's, as
 * `goalOf` reads it) and that goal's life area. Ordered by start, then ID
 * and original start.
 */
export async function blocksBetween(
  userId: string,
  { localStart, localEnd, tz }: BlocksBetweenInput,
): Promise<TimeBlockOccurrence[]> {
  const rangeStart = startOfLocalDay(localStart, tz);
  const rangeEnd = startOfLocalDay(localEnd, tz);
  const taskGoalId = sql<
    string | null
  >`coalesce(${tasks.goalId}, ${milestones.goalId})`;

  const rows = await db
    .select({
      block: timeBlocks,
      taskTitle: tasks.title,
      taskStatus: sql<TaskStatus>`${tasks.status}`,
      goalId: taskGoalId,
      lifeAreaId: goals.lifeAreaId,
    })
    .from(timeBlocks)
    .innerJoin(
      tasks,
      and(eq(tasks.id, timeBlocks.taskId), eq(tasks.userId, timeBlocks.userId)),
    )
    .leftJoin(
      milestones,
      and(
        eq(milestones.id, tasks.milestoneId),
        eq(milestones.userId, tasks.userId),
      ),
    )
    .leftJoin(goals, and(eq(goals.id, taskGoalId), eq(goals.userId, userId)))
    .where(
      and(
        eq(timeBlocks.userId, userId),
        or(
          and(
            isNull(timeBlocks.rrule),
            lt(timeBlocks.startAt, rangeEnd),
            gt(timeBlocks.endAt, rangeStart),
          ),
          // A series that has started by the range's end, or has an
          // occurrence moved into or before the range.
          and(
            isNotNull(timeBlocks.rrule),
            or(
              lt(timeBlocks.startAt, rangeEnd),
              exists(
                db
                  .select({ id: timeBlockExceptions.id })
                  .from(timeBlockExceptions)
                  .where(
                    and(
                      eq(timeBlockExceptions.blockId, timeBlocks.id),
                      eq(timeBlockExceptions.userId, userId),
                      lt(timeBlockExceptions.startAt, rangeEnd),
                    ),
                  ),
              ),
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(timeBlocks.id));

  const seriesIds = rows
    .filter(({ block }) => block.rrule)
    .map(({ block }) => block.id);
  const exceptions =
    seriesIds.length === 0
      ? []
      : await db
          .select()
          .from(timeBlockExceptions)
          .where(
            and(
              eq(timeBlockExceptions.userId, userId),
              inArray(timeBlockExceptions.blockId, seriesIds),
            ),
          );

  const range = { localStart, localEnd, tz };
  const occurrences = rows.flatMap(
    ({ block, ...task }): TimeBlockOccurrence[] => {
      const base = { ...toTimeBlock(block), ...task };
      if (!block.rrule) {
        return [
          { ...base, seriesId: null, originalStart: null, modified: false },
        ];
      }
      const own = exceptions.filter(
        (exception) => exception.blockId === block.id,
      );
      return expandOccurrences<TimeBlockStatus>(
        { ...asSeries(block), rrule: block.rrule },
        range,
        own.map((exception) =>
          exception.kind === "cancelled"
            ? { kind: "cancelled", originalStartAt: exception.originalStartAt }
            : {
                kind: "modified",
                originalStartAt: exception.originalStartAt,
                startAt: exception.startAt!,
                endAt: exception.endAt!,
                patch: exception.status!,
              },
        ),
      ).map((occurrence) => ({
        ...base,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        status: occurrence.patch ?? "scheduled",
        seriesId: block.id,
        originalStart: occurrence.originalStartAt,
        modified: occurrence.modified,
      }));
    },
  );

  return occurrences.sort(
    (a, b) =>
      a.startAt.getTime() - b.startAt.getTime() ||
      a.id.localeCompare(b.id) ||
      (a.originalStart?.getTime() ?? 0) - (b.originalStart?.getTime() ?? 0),
  );
}
