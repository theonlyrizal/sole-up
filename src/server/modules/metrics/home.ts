import "server-only";

import { and, asc, eq, gte, isNotNull, lt, lte, or, sql } from "drizzle-orm";

import { addDays } from "@/lib/dates";
import {
  NEXT_COMMITMENT_DAYS,
  nextCommitmentOf,
  type ScheduleEntry,
} from "@/lib/schedule";
import { dateWindowBounds, dateWindowInstants } from "@/lib/task-list";
import type { TodayClock } from "@/lib/today";
import { db } from "@/server/db/client";
import {
  calendarEvents,
  goals,
  milestones,
  tasks,
  timeBlocks,
} from "@/server/db/schema";
import { eventsBetween } from "@/server/modules/calendar-events/service";
import { listTodayTasks } from "@/server/modules/tasks/queries";
import { blocksBetween } from "@/server/modules/time-blocks/service";

import type { Metric } from "./metric";

// The metrics Home needs (chunk 3.1). Each reuses the rule of the view it
// summarises, so a Home number always matches the list it links to. Every
// query is scoped to the user. `clock` comes from `todayClock(userZone,
// now)` and `timeZone` is the user's saved zone.

/** Today's counts by section, as the Today view sorts them (ADR 0011). */
export type TodayTaskCounts = {
  planned: number;
  due: number;
  decide: number;
};

async function hasOpenTasks(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "open")))
    .limit(1);
  return row !== undefined;
}

/**
 * Open tasks planned for today, due today, and needing a decision. Each
 * task counts once, in the section the Today view shows it under, so the
 * counts match `/plan/today`. No data: the user has no open tasks.
 */
export async function todayTaskCounts(
  userId: string,
  clock: TodayClock,
  timeZone: string,
): Promise<Metric<TodayTaskCounts>> {
  const [sections, hasData] = await Promise.all([
    listTodayTasks(userId, clock, timeZone),
    hasOpenTasks(userId),
  ]);
  return {
    value: {
      planned: sections.planned.length,
      due: sections.due.length,
      decide: sections.decide.length,
    },
    definition:
      "Open tasks planned for today, open tasks due by the end of today, and open tasks whose deadline has passed (any earlier day, or earlier today). A task planned for today counts only as planned.",
    range: { from: clock.today, to: clock.today, timeZone, asOf: clock.now },
    hasData,
  };
}

/**
 * True for a goal row with a next action: an open task under it (directly or
 * under any of its milestones) with a planned date or a deadline. This is
 * `nextActionOf` (chunk 2.7) as SQL: any dated open task, passed dates
 * included, is a next action, whatever the zone.
 */
function goalHasNextAction() {
  return sql`exists (
    select 1 from ${tasks}
    left join ${milestones}
      on ${milestones.id} = ${tasks.milestoneId}
      and ${milestones.userId} = ${tasks.userId}
    where ${tasks.userId} = ${goals.userId}
      and coalesce(${tasks.goalId}, ${milestones.goalId}) = ${goals.id}
      and ${tasks.status} = 'open'
      and (${tasks.plannedDate} is not null or ${tasks.dueDate} is not null or ${tasks.dueAt} is not null)
  )`;
}

/**
 * Active goals with no next action (see `goalHasNextAction`). Paused and
 * finished goals are left out. No data: the user has no active goals.
 */
export async function goalsWithoutNextAction(
  userId: string,
  clock: TodayClock,
  timeZone: string,
): Promise<Metric<number>> {
  const hasNextAction = goalHasNextAction();
  const [row] = await db
    .select({
      activeGoals: sql<number>`count(*)::int`,
      withoutNextAction: sql<number>`count(*) filter (where not ${hasNextAction})::int`,
    })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.status, "active")));
  const { activeGoals, withoutNextAction } = row ?? {
    activeGoals: 0,
    withoutNextAction: 0,
  };
  return {
    value: withoutNextAction,
    definition:
      "Active goals with no open task that has a planned date or a deadline, directly under the goal or under one of its milestones. Paused, completed and dropped goals are not counted.",
    range: { from: null, to: null, timeZone, asOf: clock.now },
    hasData: activeGoals > 0,
  };
}

/** A goal counted by `goalsWithoutNextAction`, for Home to name. */
export type GoalWithoutNextAction = { id: string; title: string };

/**
 * The goals `goalsWithoutNextAction` counts, in the Goals list's order
 * (oldest first), so Home can name each one and link to it.
 */
export async function listGoalsWithoutNextAction(
  userId: string,
): Promise<GoalWithoutNextAction[]> {
  return db
    .select({ id: goals.id, title: goals.title })
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        eq(goals.status, "active"),
        sql`not ${goalHasNextAction()}`,
      ),
    )
    .orderBy(asc(goals.createdAt), asc(goals.id));
}

/**
 * Open tasks with a deadline in the next 7 days: tomorrow through today + 7,
 * the Plan page's "Next 7 days" due filter (`/plan?due=next7`). Today's
 * deadlines are on Today instead. A timed deadline counts on its local day
 * in the user's zone. No data: the user has no open task with a deadline.
 */
export async function deadlinesNextSevenDays(
  userId: string,
  clock: TodayClock,
  timeZone: string,
): Promise<Metric<number>> {
  const { from, to } = dateWindowBounds("next7", clock.today);
  const { start, end } = dateWindowInstants("next7", clock.today, timeZone);
  // Both bounds are set for "next7"; the guard satisfies the types.
  if (!from || !to || !start || !end) throw new Error("Unbounded window");

  const inWindow = or(
    and(gte(tasks.dueDate, from), lte(tasks.dueDate, to)),
    and(gte(tasks.dueAt, start), lt(tasks.dueAt, end)),
  );
  const [row] = await db
    .select({
      withDeadline: sql<number>`count(*)::int`,
      inWindow: sql<number>`count(*) filter (where ${inWindow})::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, "open"),
        or(isNotNull(tasks.dueDate), isNotNull(tasks.dueAt)),
      ),
    );
  const counts = row ?? { withDeadline: 0, inWindow: 0 };
  return {
    value: counts.inWindow,
    definition:
      "Open tasks with a deadline from tomorrow through the next 7 days. Today's deadlines are on Today.",
    range: { from, to, timeZone, asOf: clock.now },
    hasData: counts.withDeadline > 0,
  };
}

async function hasCalendarItems(userId: string): Promise<boolean> {
  const [events, blocks] = await Promise.all([
    db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(eq(calendarEvents.userId, userId))
      .limit(1),
    db
      .select({ id: timeBlocks.id })
      .from(timeBlocks)
      .where(eq(timeBlocks.userId, userId))
      .limit(1),
  ]);
  return events.length > 0 || blocks.length > 0;
}

/**
 * The next commitment (chunk 4.9): the first event or time block, from
 * today through the next 30 days, that hasn't ended (`nextCommitmentOf`).
 * One under way counts; blocks marked done or skipped, or for a closed
 * task, don't. Null when nothing is coming up in the range. No data: the
 * user has no events or time blocks at all.
 */
export async function nextCommitment(
  userId: string,
  clock: TodayClock,
  timeZone: string,
): Promise<Metric<ScheduleEntry | null>> {
  const days = {
    localStart: clock.today,
    localEnd: addDays(clock.today, NEXT_COMMITMENT_DAYS),
    tz: timeZone,
  };
  const [events, blocks, hasData] = await Promise.all([
    eventsBetween(userId, days),
    blocksBetween(userId, days),
    hasCalendarItems(userId),
  ]);
  return {
    value: nextCommitmentOf(events, blocks, clock.now, timeZone),
    definition:
      "The first event or time block that hasn't ended yet, including one already under way. Time blocks marked done or skipped, and blocks for completed or cancelled tasks, are left out.",
    range: {
      from: clock.today,
      to: addDays(days.localEnd, -1),
      timeZone,
      asOf: clock.now,
    },
    hasData,
  };
}
