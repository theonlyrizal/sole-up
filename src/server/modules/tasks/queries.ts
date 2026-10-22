import "server-only";

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import type { LocalDate } from "@/lib/dates";
import type { GoalStatus } from "@/lib/goals";
import type { LifeAreaStatus } from "@/lib/life-areas";
import type { MilestoneStatus } from "@/lib/milestones";
import {
  compareTasksBy,
  dateWindowBounds,
  dateWindowInstants,
  type TaskDateWindow,
  type TaskListFilters,
} from "@/lib/task-list";
import type { Task } from "@/lib/tasks";
import { db } from "@/server/db/client";
import { goals, lifeAreas, milestones, tasks } from "@/server/db/schema";
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

/** A task on the Plan page, with the goal and milestone it sits under. */
export type PlanTaskItem = Task & {
  /** The task's goal, or its milestone's goal. */
  goal: { id: string; title: string; status: GoalStatus } | null;
  milestone: { id: string; title: string; status: MilestoneStatus } | null;
};

function plannedCondition(
  window: TaskDateWindow,
  today: LocalDate,
): SQL | undefined {
  if (window === "none") return isNull(tasks.plannedDate);
  const { from, to } = dateWindowBounds(window, today);
  return and(
    from ? gte(tasks.plannedDate, from) : undefined,
    to ? lte(tasks.plannedDate, to) : undefined,
  );
}

/**
 * An all-day deadline matches on its date; a timed one when its instant
 * falls inside the window's local days in the user's zone.
 */
function dueCondition(
  window: TaskDateWindow,
  today: LocalDate,
  timeZone: string,
): SQL | undefined {
  if (window === "none") return and(isNull(tasks.dueDate), isNull(tasks.dueAt));
  const { from, to } = dateWindowBounds(window, today);
  const { start, end } = dateWindowInstants(window, today, timeZone);
  return or(
    and(
      sql`${tasks.dueDate} is not null`,
      from ? gte(tasks.dueDate, from) : undefined,
      to ? lte(tasks.dueDate, to) : undefined,
    ),
    and(
      sql`${tasks.dueAt} is not null`,
      start ? gte(tasks.dueAt, start) : undefined,
      end ? lt(tasks.dueAt, end) : undefined,
    ),
  );
}

/**
 * The Plan page's list: the user's tasks matching `filters`, in the chosen
 * order. Open tasks only unless closed ones are shown. `today` and
 * `timeZone` are the user's, for the date windows and for ordering timed
 * against all-day deadlines.
 */
export async function listPlanTasks(
  userId: string,
  filters: TaskListFilters,
  { today, timeZone }: { today: LocalDate; timeZone: string },
): Promise<PlanTaskItem[]> {
  const statusCondition = filters.showClosed
    ? filters.status
      ? eq(tasks.status, filters.status)
      : undefined
    : eq(tasks.status, "open");

  const goalCondition =
    filters.goal === "none"
      ? and(isNull(tasks.goalId), isNull(tasks.milestoneId))
      : filters.goal
        ? or(
            eq(tasks.goalId, filters.goal),
            eq(milestones.goalId, filters.goal),
          )
        : undefined;

  const priorityCondition =
    filters.priority === "none"
      ? isNull(tasks.priority)
      : filters.priority
        ? eq(tasks.priority, filters.priority)
        : undefined;

  const rows = await db
    .select({
      task: tasks,
      goal: { id: goals.id, title: goals.title, status: goals.status },
      milestone: {
        id: milestones.id,
        title: milestones.title,
        status: milestones.status,
      },
    })
    .from(tasks)
    .leftJoin(
      milestones,
      and(
        eq(milestones.id, tasks.milestoneId),
        eq(milestones.userId, tasks.userId),
      ),
    )
    .leftJoin(
      goals,
      and(
        eq(goals.id, sql`coalesce(${tasks.goalId}, ${milestones.goalId})`),
        eq(goals.userId, tasks.userId),
      ),
    )
    .where(
      and(
        eq(tasks.userId, userId),
        statusCondition,
        goalCondition,
        filters.area ? eq(goals.lifeAreaId, filters.area) : undefined,
        priorityCondition,
        filters.planned ? plannedCondition(filters.planned, today) : undefined,
        filters.due ? dueCondition(filters.due, today, timeZone) : undefined,
      ),
    );

  return rows
    .map(({ task, goal, milestone }) => ({
      ...toTask(task),
      goal,
      milestone,
    }))
    .sort(compareTasksBy(filters.sort, timeZone));
}

/** What the Plan page's goal and life-area filters offer. */
export type TaskFilterOptions = {
  goals: { id: string; title: string; status: GoalStatus }[];
  areas: { id: string; name: string; status: LifeAreaStatus }[];
};

const GOAL_STATUS_ORDER = sql`case ${goals.status}
  when 'active' then 0 when 'paused' then 1 when 'completed' then 2
  when 'dropped' then 3 else 4 end`;

/**
 * Every goal (live ones first) and every life area (active first), so a
 * task under a finished goal can still be found.
 */
export async function listTaskFilterOptions(
  userId: string,
): Promise<TaskFilterOptions> {
  const [goalRows, areaRows] = await Promise.all([
    db
      .select({ id: goals.id, title: goals.title, status: goals.status })
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(GOAL_STATUS_ORDER, asc(goals.createdAt), asc(goals.id)),
    db
      .select({
        id: lifeAreas.id,
        name: lifeAreas.name,
        status: lifeAreas.status,
      })
      .from(lifeAreas)
      .where(eq(lifeAreas.userId, userId))
      .orderBy(
        sql`case when ${lifeAreas.status} = 'active' then 0 else 1 end`,
        asc(lifeAreas.sortOrder),
        asc(lifeAreas.createdAt),
      ),
  ]);
  return { goals: goalRows, areas: areaRows };
}
