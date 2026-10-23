import "server-only";

import { and, eq, sql } from "drizzle-orm";

import {
  canChangeGoalStatus,
  completedAtAfterStatusChange,
  GOAL_EDITABLE_FIELDS,
  type Goal,
} from "@/lib/goals";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { isForeignKeyViolation } from "@/server/db/errors";
import { goals } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { deleteMilestoneEventsForGoal } from "@/server/modules/milestones/service";
import { detachTasksInTx } from "@/server/modules/tasks/service";

import type {
  ChangeGoalStatusInput,
  CreateGoalInput,
  GoalIdInput,
  UpdateGoalInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A record
// that is missing or belongs to someone else is the same NotFoundError.
// Each mutation writes its audit event in the same transaction.
// Status rules: ADR 0010, implemented in src/lib/goals.ts.

const LIFE_AREA_KEY = "goals_life_area_id_user_id_fk";

type GoalRow = typeof goals.$inferSelect;

export function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    lifeAreaId: row.lifeAreaId,
    title: row.title,
    description: row.description,
    reason: row.reason,
    status: row.status,
    priority: row.priority,
    startDate: row.startDate,
    targetDate: row.targetDate,
    completedAt: row.completedAt,
    statusChangedAt: row.statusChangedAt,
  };
}

/** Locks one of the user's goals for the rest of the transaction. */
async function findForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
): Promise<GoalRow> {
  const [row] = await tx
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .for("update");
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * Runs `write`, turning a life area that is missing or another user's
 * (the composite foreign key refusing it) into a field error.
 */
async function guardLifeArea<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (cause) {
    if (isForeignKeyViolation(cause, LIFE_AREA_KEY)) {
      throw new ValidationError({ lifeAreaId: ["Choose one of your areas."] });
    }
    throw cause;
  }
}

export async function createGoal(
  userId: string,
  input: CreateGoalInput,
): Promise<Goal> {
  const row = await guardLifeArea(() =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(goals)
        .values({ ...input, userId })
        .returning();
      if (!row) throw new Error("Goal insert returned no row");

      await recordAudit(tx, {
        type: "goal.created",
        userId,
        entityId: row.id,
        changes: {
          status: { from: null, to: row.status },
          lifeAreaId: { from: null, to: row.lifeAreaId },
          priority: { from: null, to: row.priority },
          startDate: { from: null, to: row.startDate },
          targetDate: { from: null, to: row.targetDate },
        },
      });
      return row;
    }),
  );
  return toGoal(row);
}

/**
 * Edits every field but status. Records which fields changed, with old and
 * new values for the structured ones only.
 */
export async function updateGoal(
  userId: string,
  { id, ...input }: UpdateGoalInput,
): Promise<Goal> {
  const row = await guardLifeArea(() =>
    db.transaction(async (tx) => {
      const current = await findForUpdate(tx, userId, id);
      const fields = GOAL_EDITABLE_FIELDS.filter(
        (field) => current[field] !== input[field],
      );
      if (fields.length === 0) return current;

      const [updated] = await tx
        .update(goals)
        .set(input)
        .where(and(eq(goals.id, id), eq(goals.userId, userId)))
        .returning();
      if (!updated) throw new NotFoundError();

      const change = <
        K extends "lifeAreaId" | "priority" | "startDate" | "targetDate",
      >(
        field: K,
      ) =>
        fields.includes(field) && {
          [field]: { from: current[field], to: updated[field] },
        };

      await recordAudit(tx, {
        type: "goal.updated",
        userId,
        entityId: id,
        changes: {
          fields,
          ...change("lifeAreaId"),
          ...change("priority"),
          ...change("startDate"),
          ...change("targetDate"),
        },
      });
      return updated;
    }),
  );
  return toGoal(row);
}

/**
 * Moves a goal to another status (ADR 0010). The same status again is a
 * no-op with no audit event; a move the rules forbid is a ConflictError
 * and changes nothing.
 */
export async function changeGoalStatus(
  userId: string,
  { id, status }: ChangeGoalStatusInput,
): Promise<Goal> {
  return db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    if (current.status === status) return toGoal(current);
    if (!canChangeGoalStatus(current.status, status)) {
      throw new ConflictError(
        "Restore this goal to active before changing its status.",
      );
    }

    // now() is the transaction's start, the same instant as the event.
    const now = sql`now()`;
    const [updated] = await tx
      .update(goals)
      .set({
        status,
        statusChangedAt: now,
        completedAt: completedAtAfterStatusChange<Date | typeof now>(
          current.status,
          status,
          current.completedAt,
          now,
        ),
      })
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "goal.status_changed",
      userId,
      entityId: id,
      changes: { status: { from: current.status, to: status } },
    });
    return toGoal(updated);
  });
}

/**
 * Hard delete (ADR 0006). Its tasks, direct and under its milestones, move
 * to no parent with a `task.moved` event each and are kept; the database
 * cascades the goal's milestones; the goal's and its milestones' audit
 * events are removed here.
 */
export async function deleteGoal(
  userId: string,
  { id }: GoalIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Goal first, then its tasks: the lock order milestones use too.
    await findForUpdate(tx, userId, id);
    await detachTasksInTx(tx, userId, { goalId: id });
    await deleteMilestoneEventsForGoal(tx, userId, id);
    const [deleted] = await tx
      .delete(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
      .returning({ id: goals.id });
    if (!deleted) throw new NotFoundError();

    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "goal",
      entityId: id,
    });
  });
}
