import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Task } from "@/lib/tasks";
import { db } from "@/server/db/client";
import { goals, milestones, tasks } from "@/server/db/schema";
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

/** A goal a task can be put under, with its open milestones in order. */
export type TaskParentOption = {
  id: string;
  title: string;
  status: "active" | "paused";
  milestones: { id: string; title: string }[];
};

/**
 * Where quick add and the inbox can put a task: the user's active goals,
 * then paused ones, each with its open milestones. Completed, dropped and
 * archived goals, and closed milestones, are left out of the pickers; a task
 * can still be moved there from elsewhere.
 */
export async function listTaskParentOptions(
  userId: string,
): Promise<TaskParentOption[]> {
  const goalRows = await db
    .select({ id: goals.id, title: goals.title, status: goals.status })
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        inArray(goals.status, ["active", "paused"]),
      ),
    )
    .orderBy(
      sql`case when ${goals.status} = 'active' then 0 else 1 end`,
      asc(goals.createdAt),
      asc(goals.id),
    );
  if (goalRows.length === 0) return [];

  const milestoneRows = await db
    .select({
      id: milestones.id,
      goalId: milestones.goalId,
      title: milestones.title,
    })
    .from(milestones)
    .where(
      and(
        eq(milestones.userId, userId),
        eq(milestones.status, "open"),
        inArray(
          milestones.goalId,
          goalRows.map((goal) => goal.id),
        ),
      ),
    )
    .orderBy(asc(milestones.sortOrder));

  return goalRows.map((goal) => ({
    id: goal.id,
    title: goal.title,
    status: goal.status as TaskParentOption["status"],
    milestones: milestoneRows
      .filter((milestone) => milestone.goalId === goal.id)
      .map(({ id, title }) => ({ id, title })),
  }));
}
