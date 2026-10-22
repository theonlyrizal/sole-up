import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { instantFromLocal, type LocalDate } from "@/lib/dates";
import {
  type Task,
  TASK_EDITABLE_FIELDS,
  TASK_STATUS_EVENTS,
  timestampsAfterTaskStatusChange,
} from "@/lib/tasks";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { isForeignKeyViolation } from "@/server/db/errors";
import { tasks } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";

import type {
  ChangeTaskStatusInput,
  CreateTaskInput,
  MoveTaskInput,
  MoveTasksInput,
  PlanTaskInput,
  PlanTasksInput,
  RescheduleTaskDueInput,
  ScheduleTaskInput,
  TaskIdInput,
  UpdateTaskInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A record
// that is missing or belongs to someone else is the same NotFoundError.
// Each mutation writes its audit event in the same transaction, and a change
// to the current value is a no-op with no event.
// Rules: ADR 0004 (parent and dates) and ADR 0011 (status, inbox, priority,
// estimates), with the pure parts in src/lib/tasks.ts.

const GOAL_KEY = "tasks_goal_id_user_id_fk";
const MILESTONE_KEY = "tasks_milestone_id_user_id_fk";

type TaskRow = typeof tasks.$inferSelect;

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    goalId: row.goalId,
    milestoneId: row.milestoneId,
    title: row.title,
    notes: row.notes,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    dueAt: row.dueAt,
    dueTz: row.dueTz,
    plannedDate: row.plannedDate,
    estimatedMinutes: row.estimatedMinutes,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

/** Locks one of the user's tasks for the rest of the transaction. */
async function findForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
): Promise<TaskRow> {
  const [row] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .for("update");
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * Runs `write`, turning a goal or milestone that is missing or another
 * user's (a composite foreign key refusing it) into a field error.
 */
async function guardParent<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (cause) {
    if (isForeignKeyViolation(cause, GOAL_KEY)) {
      throw new ValidationError({ goalId: ["Choose one of your goals."] });
    }
    if (isForeignKeyViolation(cause, MILESTONE_KEY)) {
      throw new ValidationError({
        milestoneId: ["Choose one of your milestones."],
      });
    }
    throw cause;
  }
}

type DueColumns = Pick<TaskRow, "dueDate" | "dueAt" | "dueTz">;

/**
 * The stored deadline for validated form fields: a timed deadline becomes
 * the UTC instant of that wall-clock time in its zone (ADR 0004).
 */
function dueColumns(due: {
  dueDate: LocalDate | null;
  dueTime: string | null;
  dueTz: string | null;
}): DueColumns {
  if (due.dueDate && due.dueTime && due.dueTz) {
    return {
      dueDate: null,
      dueAt: instantFromLocal(due.dueDate, due.dueTime, due.dueTz),
      dueTz: due.dueTz,
    };
  }
  return { dueDate: due.dueDate, dueAt: null, dueTz: null };
}

const iso = (instant: Date | null) => instant?.toISOString() ?? null;

function sameDue(a: DueColumns, b: DueColumns): boolean {
  return (
    a.dueDate === b.dueDate &&
    a.dueTz === b.dueTz &&
    iso(a.dueAt) === iso(b.dueAt)
  );
}

/** Adds a task after the user's others; with no parent and no plan it is in the inbox. */
export async function createTask(
  userId: string,
  { dueTime, ...input }: CreateTaskInput,
): Promise<Task> {
  const row = await guardParent(() =>
    db.transaction(async (tx) => {
      // Two concurrent creates may share a position; order then falls back
      // to creation time. Nothing relies on positions being unique.
      const [position] = await tx
        .select({
          next: sql<number>`coalesce(max(${tasks.sortOrder}) + 1, 0)::int`,
        })
        .from(tasks)
        .where(eq(tasks.userId, userId));

      const [row] = await tx
        .insert(tasks)
        .values({
          ...input,
          ...dueColumns({ ...input, dueTime }),
          userId,
          sortOrder: position?.next ?? 0,
        })
        .returning();
      if (!row) throw new Error("Task insert returned no row");

      await recordAudit(tx, {
        type: "task.created",
        userId,
        entityId: row.id,
        changes: {
          status: { from: null, to: row.status },
          goalId: { from: null, to: row.goalId },
          milestoneId: { from: null, to: row.milestoneId },
          priority: { from: null, to: row.priority },
          estimatedMinutes: { from: null, to: row.estimatedMinutes },
          plannedDate: { from: null, to: row.plannedDate },
          dueDate: { from: null, to: row.dueDate },
          dueAt: { from: null, to: iso(row.dueAt) },
          dueTz: { from: null, to: row.dueTz },
        },
      });
      return row;
    }),
  );
  return toTask(row);
}

/**
 * Edits title, notes, priority and estimate. Records which fields changed,
 * with old and new values for priority and estimate only.
 */
export async function updateTask(
  userId: string,
  { id, ...input }: UpdateTaskInput,
): Promise<Task> {
  const row = await db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    const fields = TASK_EDITABLE_FIELDS.filter(
      (field) => current[field] !== input[field],
    );
    if (fields.length === 0) return current;

    const [updated] = await tx
      .update(tasks)
      .set(input)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "task.updated",
      userId,
      entityId: id,
      changes: {
        fields,
        ...(fields.includes("priority") && {
          priority: { from: current.priority, to: updated.priority },
        }),
        ...(fields.includes("estimatedMinutes") && {
          estimatedMinutes: {
            from: current.estimatedMinutes,
            to: updated.estimatedMinutes,
          },
        }),
      },
    });
    return updated;
  });
  return toTask(row);
}

/**
 * Complete, reopen or cancel: any status to any other (ADR 0011). Sets the
 * timestamp of the status entered and clears the one left. The same status
 * again is a no-op with no event. Never changes the task's goal or milestone.
 */
export async function changeTaskStatus(
  userId: string,
  { id, status }: ChangeTaskStatusInput,
): Promise<Task> {
  return db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    if (current.status === status) return toTask(current);

    // now() is the transaction's start, the same instant as the event.
    const [updated] = await tx
      .update(tasks)
      .set({ status, ...timestampsAfterTaskStatusChange(status, sql`now()`) })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: TASK_STATUS_EVENTS[status],
      userId,
      entityId: id,
      changes: { status: { from: current.status, to: status } },
    });
    return toTask(updated);
  });
}

/** Plans one locked task; the same date again is a no-op with no event. */
async function planInTx(
  tx: DbTransaction,
  userId: string,
  id: string,
  plannedDate: LocalDate | null,
): Promise<TaskRow> {
  const current = await findForUpdate(tx, userId, id);
  if (current.plannedDate === plannedDate) return current;

  const [updated] = await tx
    .update(tasks)
    .set({ plannedDate })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  if (!updated) throw new NotFoundError();

  await recordAudit(tx, {
    type: "task.planned",
    userId,
    entityId: id,
    changes: { plannedDate: { from: current.plannedDate, to: plannedDate } },
  });
  return updated;
}

/**
 * Plans the task for a local date, or unplans it with null. Any date is
 * allowed, past ones included (backfill). Nothing else ever changes a
 * planned date (ADR 0011).
 */
export async function planTask(
  userId: string,
  { id, plannedDate }: PlanTaskInput,
): Promise<Task> {
  const row = await db.transaction((tx) =>
    planInTx(tx, userId, id, plannedDate),
  );
  return toTask(row);
}

/**
 * Plans several tasks for the same date, all or none: one missing or
 * foreign task fails the lot. Each changed task gets its own event.
 */
export async function planTasks(
  userId: string,
  { ids, plannedDate }: PlanTasksInput,
): Promise<Task[]> {
  const rows = await db.transaction(async (tx) => {
    const planned: TaskRow[] = [];
    for (const id of ids) {
      planned.push(await planInTx(tx, userId, id, plannedDate));
    }
    return planned;
  });
  return rows.map(toTask);
}

/** Reschedules one locked task's deadline; the same one again is a no-op. */
async function dueInTx(
  tx: DbTransaction,
  userId: string,
  id: string,
  next: DueColumns,
): Promise<TaskRow> {
  const current = await findForUpdate(tx, userId, id);
  if (sameDue(current, next)) return current;

  const [updated] = await tx
    .update(tasks)
    .set(next)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  if (!updated) throw new NotFoundError();

  await recordAudit(tx, {
    type: "task.due_changed",
    userId,
    entityId: id,
    changes: {
      dueDate: { from: current.dueDate, to: updated.dueDate },
      dueAt: { from: iso(current.dueAt), to: iso(updated.dueAt) },
      dueTz: { from: current.dueTz, to: updated.dueTz },
    },
  });
  return updated;
}

/** Sets, changes or clears the deadline, all-day or timed. */
export async function rescheduleTaskDue(
  userId: string,
  { id, ...due }: RescheduleTaskDueInput,
): Promise<Task> {
  const row = await db.transaction((tx) =>
    dueInTx(tx, userId, id, dueColumns(due)),
  );
  return toTask(row);
}

type Parent = { goalId: string | null; milestoneId: string | null };

/** Moves one locked task; the same parent again is a no-op with no event. */
async function moveInTx(
  tx: DbTransaction,
  userId: string,
  id: string,
  { goalId, milestoneId }: Parent,
): Promise<TaskRow> {
  const current = await findForUpdate(tx, userId, id);
  if (current.goalId === goalId && current.milestoneId === milestoneId) {
    return current;
  }

  const [updated] = await tx
    .update(tasks)
    .set({ goalId, milestoneId })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  if (!updated) throw new NotFoundError();

  await recordAudit(tx, {
    type: "task.moved",
    userId,
    entityId: id,
    changes: {
      goalId: { from: current.goalId, to: goalId },
      milestoneId: { from: current.milestoneId, to: milestoneId },
    },
  });
  return updated;
}

/**
 * Moves the task under one of the user's goals or milestones, or to no
 * parent. Another user's (or a missing) parent is a field error.
 */
export async function moveTask(
  userId: string,
  { id, ...parent }: MoveTaskInput,
): Promise<Task> {
  const row = await guardParent(() =>
    db.transaction((tx) => moveInTx(tx, userId, id, parent)),
  );
  return toTask(row);
}

/**
 * Moves several tasks under the same parent, all or none: one missing or
 * foreign task, or a foreign parent, fails the lot.
 */
export async function moveTasks(
  userId: string,
  { ids, ...parent }: MoveTasksInput,
): Promise<Task[]> {
  const rows = await guardParent(() =>
    db.transaction(async (tx) => {
      const moved: TaskRow[] = [];
      for (const id of ids) {
        moved.push(await moveInTx(tx, userId, id, parent));
      }
      return moved;
    }),
  );
  return rows.map(toTask);
}

/**
 * The Plan page's inline edit: planned date, deadline and parent together,
 * all or none. Each part that changed records its own event (`task.planned`,
 * `task.due_changed`, `task.moved`), as if set one at a time.
 */
export async function scheduleTask(
  userId: string,
  {
    id,
    plannedDate,
    dueDate,
    dueTime,
    dueTz,
    goalId,
    milestoneId,
  }: ScheduleTaskInput,
): Promise<Task> {
  const row = await guardParent(() =>
    db.transaction(async (tx) => {
      await planInTx(tx, userId, id, plannedDate);
      await dueInTx(tx, userId, id, dueColumns({ dueDate, dueTime, dueTz }));
      return moveInTx(tx, userId, id, { goalId, milestoneId });
    }),
  );
  return toTask(row);
}

/** Hard delete (ADR 0006). Removes the task's audit events with it. */
export async function deleteTask(
  userId: string,
  { id }: TaskIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning({ id: tasks.id });
    if (!deleted) throw new NotFoundError();

    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "task",
      entityId: id,
    });
  });
}
