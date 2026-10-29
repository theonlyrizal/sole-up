import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { addDays, todayFor, type LocalDate, type WeekStart } from "@/lib/dates";
import type { GoalStatus } from "@/lib/goals";
import { defaultReviewWeek, nextReviewWeek } from "@/lib/review-flow";
import { DEFAULT_TASK_LIST_FILTERS } from "@/lib/task-list";
import type { TaskStatus } from "@/lib/tasks";
import { todayClock } from "@/lib/today";
import {
  isReviewOpen,
  openPeriodStarts,
  reviewClosesOn,
  REVIEW_PERIOD_DAYS,
  type WeeklyReview,
} from "@/lib/weekly-reviews";
import { db } from "@/server/db/client";
import {
  goals,
  milestones,
  tasks,
  weeklyReviewPriorities,
  weeklyReviews,
} from "@/server/db/schema";
import { getUserPreferences } from "@/server/modules/preferences/service";
import {
  listPlanTasks,
  listTodayTasks,
  type PlanTaskItem,
} from "@/server/modules/tasks/queries";

import { toWeeklyReview } from "./service";

// Read models for the review flow (chunk 7.3). Every query is scoped to the
// user. Priorities are read with their goal's or task's current title and
// status, so a renamed or completed one shows as it is now.

/** One priority as the flow shows it. */
export type ReviewPriorityItem =
  | { kind: "goal"; id: string; title: string; status: GoalStatus }
  | {
      kind: "task";
      id: string;
      title: string;
      status: TaskStatus;
      goalTitle: string | null;
    };

export type ReviewDetail = WeeklyReview & {
  priorities: ReviewPriorityItem[];
  /** The first day the review is read-only. */
  closesOn: LocalDate;
};

/** What the review page needs to know before it picks a step to render. */
export type ReviewPage = {
  today: LocalDate;
  timeZone: string;
  weekStart: WeekStart;
  locale: string;
  thisWeek: LocalDate;
  lastWeek: LocalDate;
  /** The reviewed week: `[periodStart, periodEnd)`. */
  periodStart: LocalDate;
  periodEnd: LocalDate;
  /** Null until the review of an open week is started. */
  review: ReviewDetail | null;
  open: boolean;
  /** The other open week to offer, or null for any other period. */
  otherWeek: LocalDate | null;
};

async function prioritiesOf(
  userId: string,
  reviewId: string,
): Promise<ReviewPriorityItem[]> {
  const rows = await db
    .select({
      goalId: weeklyReviewPriorities.goalId,
      taskId: weeklyReviewPriorities.taskId,
    })
    .from(weeklyReviewPriorities)
    .where(
      and(
        eq(weeklyReviewPriorities.reviewId, reviewId),
        eq(weeklyReviewPriorities.userId, userId),
      ),
    )
    .orderBy(asc(weeklyReviewPriorities.sortOrder));

  const goalIds = rows.flatMap((row) => (row.goalId ? [row.goalId] : []));
  const taskIds = rows.flatMap((row) => (row.taskId ? [row.taskId] : []));
  const [goalRows, taskRows] = await Promise.all([
    goalIds.length
      ? db
          .select({ id: goals.id, title: goals.title, status: goals.status })
          .from(goals)
          .where(and(eq(goals.userId, userId), inArray(goals.id, goalIds)))
      : [],
    taskIds.length ? tasksById(userId, taskIds) : [],
  ]);
  const goalById = new Map(goalRows.map((goal) => [goal.id, goal]));
  const taskById = new Map(taskRows.map((task) => [task.id, task]));

  // The foreign keys cascade, so every linked goal and task exists.
  return rows.map(({ goalId, taskId }): ReviewPriorityItem => {
    if (goalId) {
      const goal = goalById.get(goalId)!;
      return { kind: "goal", ...goal };
    }
    const task = taskById.get(taskId!)!;
    return { kind: "task", ...task };
  });
}

/** The user's tasks with these IDs, any status, with their goal's title. */
async function tasksById(userId: string, ids: string[]) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      goalTitle: goals.title,
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
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)));
}

/** The user's review of the week starting `periodStart`, if there is one. */
export async function getReviewForWeek(
  userId: string,
  periodStart: LocalDate,
): Promise<ReviewDetail | null> {
  const [row] = await db
    .select()
    .from(weeklyReviews)
    .where(
      and(
        eq(weeklyReviews.userId, userId),
        eq(weeklyReviews.periodStart, periodStart),
      ),
    );
  if (!row) return null;
  const review = toWeeklyReview(row);
  return {
    ...review,
    priorities: await prioritiesOf(userId, review.id),
    closesOn: reviewClosesOn(review.periodEnd),
  };
}

/**
 * Which week the review page shows, and its review. `week` (from the URL)
 * is honoured when it is this week, last week, or a week the user has a
 * review of (open or closed); anything else falls back to the default week
 * (ADR 0015: last week unless its review is finished).
 */
export async function getReviewPage(
  userId: string,
  week: LocalDate | null,
  now: Date = new Date(),
): Promise<ReviewPage> {
  const preferences = await getUserPreferences(userId);
  const timeZone = preferences.timezone ?? "UTC";
  const today = todayFor(timeZone, now);
  const { thisWeek, lastWeek } = openPeriodStarts(today, preferences.weekStart);

  let review: ReviewDetail | null = null;
  let periodStart: LocalDate;
  if (week === thisWeek || week === lastWeek) {
    periodStart = week;
    review = await getReviewForWeek(userId, week);
  } else {
    review = week ? await getReviewForWeek(userId, week) : null;
    if (review) {
      periodStart = review.periodStart;
    } else {
      const last = await getReviewForWeek(userId, lastWeek);
      periodStart = defaultReviewWeek(
        { thisWeek, lastWeek },
        last?.completedAt != null,
      );
      review =
        periodStart === lastWeek
          ? last
          : await getReviewForWeek(userId, thisWeek);
    }
  }
  const periodEnd =
    review?.periodEnd ?? addDays(periodStart, REVIEW_PERIOD_DAYS);

  return {
    today,
    timeZone,
    weekStart: preferences.weekStart,
    locale: preferences.locale,
    thisWeek,
    lastWeek,
    periodStart,
    periodEnd,
    review,
    open: isReviewOpen(periodEnd, today),
    otherWeek:
      periodStart === thisWeek
        ? lastWeek
        : periodStart === lastWeek
          ? thisWeek
          : null,
  };
}

/** A goal the Adjust step can pause, resume or drop. */
export type AdjustGoal = {
  id: string;
  title: string;
  status: "active" | "paused";
};

/** A task the Adjust step can plan for next week. */
export type PlannableTask = {
  id: string;
  title: string;
  goalTitle: string | null;
};

/** A stalled task, and whether its deadline or its plan date has passed. */
export type StalledTask = { task: PlanTaskItem; passed: "deadline" | "plan" };

export type AdjustStep = {
  /** Active goals, then paused ones, oldest first. */
  goals: AdjustGoal[];
  /**
   * Open tasks whose deadline has passed, or that were planned for an
   * earlier day: Today's "Needs a decision" and "Earlier, not done".
   */
  stalled: StalledTask[];
  /** The week after the reviewed one, and the days left to plan in it. */
  nextWeek: { start: LocalDate; end: LocalDate; days: LocalDate[] };
  /** Open tasks planned for a day of next week, by day. */
  plannedNextWeek: PlanTaskItem[];
  /** Every other open task, for "Plan for next week". */
  plannable: PlannableTask[];
};

/** The Adjust step's goals and tasks, as they are at `now`. */
export async function getAdjustStep(
  userId: string,
  { periodEnd, timeZone }: { periodEnd: LocalDate; timeZone: string },
  now: Date = new Date(),
): Promise<AdjustStep> {
  const clock = todayClock(timeZone, now);
  const nextWeek = nextReviewWeek(periodEnd, clock.today);
  const [goalRows, today, open] = await Promise.all([
    db
      .select({ id: goals.id, title: goals.title, status: goals.status })
      .from(goals)
      .where(
        and(
          eq(goals.userId, userId),
          inArray(goals.status, ["active", "paused"]),
        ),
      )
      .orderBy(asc(goals.status), asc(goals.createdAt), asc(goals.id)),
    listTodayTasks(userId, clock, timeZone),
    listPlanTasks(userId, DEFAULT_TASK_LIST_FILTERS, {
      today: clock.today,
      timeZone,
    }),
  ]);

  const isNextWeek = (task: PlanTaskItem) =>
    task.plannedDate !== null &&
    task.plannedDate >= nextWeek.start &&
    task.plannedDate < nextWeek.end;
  return {
    goals: goalRows.map((goal) => ({
      ...goal,
      status: goal.status === "paused" ? "paused" : "active",
    })),
    stalled: [
      ...today.decide.map((task) => ({ task, passed: "deadline" as const })),
      ...today.earlier.map((task) => ({ task, passed: "plan" as const })),
    ],
    nextWeek,
    plannedNextWeek: open
      .filter(isNextWeek)
      .sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!)),
    plannable: open
      .filter((task) => !isNextWeek(task))
      .map((task) => ({
        id: task.id,
        title: task.title,
        goalTitle: task.goal?.title ?? null,
      })),
  };
}

export type PriorityOptions = {
  /** Active and paused goals, active first. */
  goals: { id: string; title: string; status: GoalStatus }[];
  /** Open tasks. */
  tasks: PlannableTask[];
};

/** The goals and tasks the Priorities step can add (ADR 0015). */
export async function getPriorityOptions(
  userId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<PriorityOptions> {
  const [goalRows, open] = await Promise.all([
    db
      .select({ id: goals.id, title: goals.title, status: goals.status })
      .from(goals)
      .where(
        and(
          eq(goals.userId, userId),
          inArray(goals.status, ["active", "paused"]),
        ),
      )
      .orderBy(asc(goals.status), asc(goals.createdAt), asc(goals.id)),
    listPlanTasks(userId, DEFAULT_TASK_LIST_FILTERS, {
      today: todayFor(timeZone, now),
      timeZone,
    }),
  ]);
  return {
    goals: goalRows,
    tasks: open.map((task) => ({
      id: task.id,
      title: task.title,
      goalTitle: task.goal?.title ?? null,
    })),
  };
}
