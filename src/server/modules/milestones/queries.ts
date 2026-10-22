import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Milestone, MilestoneProgress } from "@/lib/milestones";
import { db } from "@/server/db/client";
import { milestones } from "@/server/db/schema";

import { toMilestone } from "./service";

/** Every milestone of one of the user's goals, in list order (any status). */
export async function listMilestones(
  userId: string,
  goalId: string,
): Promise<Milestone[]> {
  const rows = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.goalId, goalId), eq(milestones.userId, userId)))
    .orderBy(asc(milestones.sortOrder));
  return rows.map(toMilestone);
}

/**
 * Progress for each of the user's goals in `goalIds` (ADR 0010): completed
 * milestones out of non-dropped ones. Computed on read, never stored. A goal
 * with no milestones, or another user's goal, is absent from the map; a goal
 * whose milestones are all dropped has `countable: 0`. Callers show nothing
 * when `countable` is 0.
 */
export async function getMilestoneProgress(
  userId: string,
  goalIds: readonly string[],
): Promise<Map<string, MilestoneProgress>> {
  if (goalIds.length === 0) return new Map();

  const rows = await db
    .select({
      goalId: milestones.goalId,
      completed: sql<number>`count(*) filter (where ${milestones.status} = 'completed')::int`,
      countable: sql<number>`count(*) filter (where ${milestones.status} <> 'dropped')::int`,
    })
    .from(milestones)
    .where(
      and(
        eq(milestones.userId, userId),
        inArray(milestones.goalId, [...goalIds]),
      ),
    )
    .groupBy(milestones.goalId);

  return new Map(
    rows.map(({ goalId, completed, countable }) => [
      goalId,
      { completed, countable },
    ]),
  );
}
