import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";

import {
  completedAtAfterMilestoneStatusChange,
  MILESTONE_EDITABLE_FIELDS,
  type Milestone,
} from "@/lib/milestones";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { goals, milestones } from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";

import type {
  ChangeMilestoneStatusInput,
  CreateMilestoneInput,
  MilestoneIdInput,
  ReorderMilestonesInput,
  UpdateMilestoneInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A record
// that is missing or belongs to someone else is the same NotFoundError.
// Each mutation writes its audit event in the same transaction.
//
// A goal's milestones are ordered 0..n-1 with no gaps. Anything that changes
// that list (create, reorder, delete) first locks the goal row, so two
// writers can't hand out the same position. Locks are always taken goal
// first, then milestones.

type MilestoneRow = typeof milestones.$inferSelect;

export function toMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    goalId: row.goalId,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    sortOrder: row.sortOrder,
  };
}

/** Locks one of the user's goals, serializing changes to its list. */
async function lockGoal(
  tx: DbTransaction,
  userId: string,
  goalId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .for("update");
  if (!row) throw new NotFoundError();
}

/** Locks one of the user's milestones for the rest of the transaction. */
async function findForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
): Promise<MilestoneRow> {
  const [row] = await tx
    .select()
    .from(milestones)
    .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
    .for("update");
  if (!row) throw new NotFoundError();
  return row;
}

/** Adds a milestone at the end of its goal's list. */
export async function createMilestone(
  userId: string,
  input: CreateMilestoneInput,
): Promise<Milestone> {
  const row = await db.transaction(async (tx) => {
    await lockGoal(tx, userId, input.goalId);
    const [position] = await tx
      .select({ next: sql<number>`count(*)::int` })
      .from(milestones)
      .where(
        and(eq(milestones.goalId, input.goalId), eq(milestones.userId, userId)),
      );

    const [row] = await tx
      .insert(milestones)
      .values({ ...input, userId, sortOrder: position?.next ?? 0 })
      .returning();
    if (!row) throw new Error("Milestone insert returned no row");

    await recordAudit(tx, {
      type: "milestone.created",
      userId,
      entityId: row.id,
      changes: {
        goalId: { from: null, to: row.goalId },
        status: { from: null, to: row.status },
        sortOrder: { from: null, to: row.sortOrder },
        dueDate: { from: null, to: row.dueDate },
      },
    });
    return row;
  });
  return toMilestone(row);
}

/**
 * Edits title, description and due date. Records which fields changed,
 * with old and new values for the due date only.
 */
export async function updateMilestone(
  userId: string,
  { id, ...input }: UpdateMilestoneInput,
): Promise<Milestone> {
  const row = await db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    const fields = MILESTONE_EDITABLE_FIELDS.filter(
      (field) => current[field] !== input[field],
    );
    if (fields.length === 0) return current;

    const [updated] = await tx
      .update(milestones)
      .set(input)
      .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "milestone.updated",
      userId,
      entityId: id,
      changes: {
        fields,
        ...(fields.includes("dueDate") && {
          dueDate: { from: current.dueDate, to: updated.dueDate },
        }),
      },
    });
    return updated;
  });
  return toMilestone(row);
}

/**
 * Puts a goal's milestones in the given order, numbered 0..n-1. `ids` must
 * be exactly the goal's milestones (any status); otherwise the list is
 * stale (another tab changed it) and nothing moves. Only moved milestones
 * get an event.
 */
export async function reorderMilestones(
  userId: string,
  { goalId, ids }: ReorderMilestonesInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockGoal(tx, userId, goalId);
    const rows = await tx
      .select({ id: milestones.id, sortOrder: milestones.sortOrder })
      .from(milestones)
      .where(and(eq(milestones.goalId, goalId), eq(milestones.userId, userId)))
      .for("update");

    const current = new Map(rows.map((row) => [row.id, row.sortOrder]));
    if (ids.length !== current.size || !ids.every((id) => current.has(id))) {
      throw new ConflictError(
        "This goal's milestones changed since this page loaded. Reload and try again.",
      );
    }

    for (const [sortOrder, id] of ids.entries()) {
      const from = current.get(id)!;
      if (from === sortOrder) continue;
      await tx
        .update(milestones)
        .set({ sortOrder })
        .where(and(eq(milestones.id, id), eq(milestones.userId, userId)));
      await recordAudit(tx, {
        type: "milestone.reordered",
        userId,
        entityId: id,
        changes: { sortOrder: { from, to: sortOrder } },
      });
    }
  });
}

/**
 * Moves a milestone between open, completed and dropped: complete, reopen,
 * drop and undrop. Completing sets `completed_at`; any move out of
 * completed clears it. The same status again is a no-op with no event.
 * Never changes the goal, even when the last milestone completes (ADR 0010).
 */
export async function changeMilestoneStatus(
  userId: string,
  { id, status }: ChangeMilestoneStatusInput,
): Promise<Milestone> {
  return db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    if (current.status === status) return toMilestone(current);

    // now() is the transaction's start, the same instant as the event.
    const [updated] = await tx
      .update(milestones)
      .set({
        status,
        completedAt: completedAtAfterMilestoneStatusChange(status, sql`now()`),
      })
      .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "milestone.status_changed",
      userId,
      entityId: id,
      changes: { status: { from: current.status, to: status } },
    });
    return toMilestone(updated);
  });
}

/**
 * Hard delete (ADR 0006). Removes the milestone's audit events with it and
 * closes the gap it leaves, so the goal's order stays dense.
 */
export async function deleteMilestone(
  userId: string,
  { id }: MilestoneIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ goalId: milestones.goalId })
      .from(milestones)
      .where(and(eq(milestones.id, id), eq(milestones.userId, userId)));
    if (!target) throw new NotFoundError();
    await lockGoal(tx, userId, target.goalId);

    const [deleted] = await tx
      .delete(milestones)
      .where(and(eq(milestones.id, id), eq(milestones.userId, userId)))
      .returning({ sortOrder: milestones.sortOrder });
    if (!deleted) throw new NotFoundError();

    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "milestone",
      entityId: id,
    });

    const shifted = await tx
      .update(milestones)
      .set({ sortOrder: sql`${milestones.sortOrder} - 1` })
      .where(
        and(
          eq(milestones.goalId, target.goalId),
          eq(milestones.userId, userId),
          gt(milestones.sortOrder, deleted.sortOrder),
        ),
      )
      .returning({ id: milestones.id, sortOrder: milestones.sortOrder });
    for (const row of shifted.sort((a, b) => a.sortOrder - b.sortOrder)) {
      await recordAudit(tx, {
        type: "milestone.reordered",
        userId,
        entityId: row.id,
        changes: { sortOrder: { from: row.sortOrder + 1, to: row.sortOrder } },
      });
    }
  });
}

/**
 * Removes the audit events of every milestone under a goal. The goal's
 * delete calls this in its transaction, before the database cascades the
 * milestones themselves.
 */
export async function deleteMilestoneEventsForGoal(
  tx: DbTransaction,
  userId: string,
  goalId: string,
): Promise<void> {
  const rows = await tx
    .select({ id: milestones.id })
    .from(milestones)
    .where(and(eq(milestones.goalId, goalId), eq(milestones.userId, userId)));
  for (const { id } of rows) {
    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "milestone",
      entityId: id,
    });
  }
}
