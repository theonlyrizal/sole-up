import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { Task } from "@/lib/tasks";
import { db } from "@/server/db/client";
import { milestones, tasks } from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";

import { toTask } from "./service";

// Read models for tasks. Every query is scoped to the user.

/**
 * The goal a task belongs to: its own goal, or its milestone's goal (ADR
 * 0004), or null for a task with no parent. A missing or foreign task is a
 * NotFoundError, so null always means "no goal".
 */
export async function goalOf(
  userId: string,
  taskId: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      goalId: sql<
        string | null
      >`coalesce(${tasks.goalId}, ${milestones.goalId})`,
    })
    .from(tasks)
    .leftJoin(
      milestones,
      and(
        eq(milestones.id, tasks.milestoneId),
        eq(milestones.userId, tasks.userId),
      ),
    )
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  if (!row) throw new NotFoundError();
  return row.goalId;
}

/**
 * The inbox (ADR 0011): open tasks with no parent and no planned date. A
 * deadline alone keeps a task here. Oldest position first.
 */
export async function listInboxTasks(userId: string): Promise<Task[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, "open"),
        isNull(tasks.goalId),
        isNull(tasks.milestoneId),
        isNull(tasks.plannedDate),
      ),
    )
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id));
  return rows.map(toTask);
}
