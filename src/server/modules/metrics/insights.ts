import "server-only";

import { and, asc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";

import {
  addDays,
  daysBetween,
  localDateOf,
  startOfLocalDay,
  type LocalDate,
  type WeekStart,
} from "@/lib/dates";
import { consistency, type HabitConsistency } from "@/lib/habits/consistency";
import { weekStartsOf } from "@/lib/habits/track-range";
import {
  insightPeriod,
  type InsightPeriod,
  type TaskInsightKey,
} from "@/lib/insights";
import type { TodayClock } from "@/lib/today";
import type { AuditEvents } from "@/server/audit/types";
import { db } from "@/server/db/client";
import {
  auditEvents,
  goals,
  habits,
  milestones,
  tasks,
} from "@/server/db/schema";
import { engineData, engineInput } from "@/server/modules/habits/queries";
import { toHabit } from "@/server/modules/habits/service";

import type { Metric } from "./metric";
import { plannedTaskIds } from "./review";

type InsightContext = {
  userId: string;
  clock: TodayClock;
  timeZone: string;
};

type WeeklyInsightContext = InsightContext & { weekStart: WeekStart };

const MEANINGFUL_ACTIONS = {
  goal: ["goal.created", "goal.updated", "goal.status_changed"],
  milestone: [
    "milestone.created",
    "milestone.updated",
    "milestone.status_changed",
  ],
  task: ["task.created", "task.completed", "task.reopened"],
  habit: ["habit.logged", "habit.log_changed"],
} as const satisfies Record<string, readonly (keyof AuditEvents)[]>;

export type GoalInactivity = {
  id: string;
  title: string;
  lastActionDate: LocalDate;
  daysInactive: number;
};

export async function goalInactivityMetric({
  userId,
  clock,
  timeZone,
}: InsightContext): Promise<Metric<GoalInactivity[]>> {
  const { rows } = await db.execute<{
    id: string;
    title: string;
    lastActionSeconds: number;
  }>(
    sql`
      select ${goals.id}, ${goals.title}, extract(epoch from coalesce((
        select max(${auditEvents.occurredAt})
        from ${auditEvents}
        where ${auditEvents.userId} = ${goals.userId}
          and ${auditEvents.occurredAt} >= ${goals.createdAt}
          and ${lte(auditEvents.occurredAt, clock.now)}
          and (
            (${auditEvents.entityType} = 'goal'
              and ${inArray(auditEvents.eventType, MEANINGFUL_ACTIONS.goal)}
              and ${auditEvents.entityId} = ${goals.id})
            or (${auditEvents.entityType} = 'milestone'
              and ${inArray(auditEvents.eventType, MEANINGFUL_ACTIONS.milestone)}
              and ${auditEvents.entityId} in (
                select ${milestones.id} from ${milestones}
                where ${milestones.userId} = ${goals.userId}
                  and ${milestones.goalId} = ${goals.id}
              ))
            or (${auditEvents.entityType} = 'task'
              and ${inArray(auditEvents.eventType, MEANINGFUL_ACTIONS.task)}
              and ${auditEvents.entityId} in (
                select ${tasks.id} from ${tasks}
                left join ${milestones} on ${milestones.id} = ${tasks.milestoneId}
                  and ${milestones.userId} = ${tasks.userId}
                where ${tasks.userId} = ${goals.userId}
                  and coalesce(${tasks.goalId}, ${milestones.goalId}) = ${goals.id}
              ))
            or (${auditEvents.entityType} = 'habit'
              and ${inArray(auditEvents.eventType, MEANINGFUL_ACTIONS.habit)}
              and ${auditEvents.changes} -> 'status' ->> 'to' = 'completed'
              and (${auditEvents.changes} -> 'status' ->> 'from') is distinct from 'completed'
              and ${auditEvents.entityId} in (
                select ${habits.id} from ${habits}
                where ${habits.userId} = ${goals.userId}
                  and ${habits.goalId} = ${goals.id}
              ))
          )
      ), ${goals.createdAt}))::float8 as "lastActionSeconds"
      from ${goals}
      where ${goals.userId} = ${userId}
        and ${goals.status} = 'active'
        and ${lte(goals.createdAt, clock.now)}
      order by ${goals.createdAt}, ${goals.id}
    `,
  );

  const value = rows.map(({ id, title, lastActionSeconds }) => {
    const lastActionDate = localDateOf(
      new Date(lastActionSeconds * 1000),
      timeZone,
    );
    return {
      id,
      title,
      lastActionDate,
      daysInactive: daysBetween(lastActionDate, clock.today),
    };
  });
  return {
    value,
    definition:
      "Local calendar days since each active goal's last meaningful action on the goal or its linked work. The goal's creation date is the starting point if no qualifying event is recorded.",
    range: { from: null, to: clock.today, timeZone, asOf: clock.now },
    hasData: value.length > 0,
  };
}

function completedWeekRange({ clock, weekStart }: WeeklyInsightContext) {
  const { start, end } = insightPeriod("overdue_trend", clock.today, weekStart);
  return { from: start, to: addDays(end, -1) };
}

export type OverdueWeek = { from: LocalDate; to: LocalDate; overdue: number };

export async function overdueTrendMetric(
  context: WeeklyInsightContext,
): Promise<Metric<OverdueWeek[]>> {
  const { userId, clock, timeZone } = context;
  const range = completedWeekRange(context);
  const { rows } = await db.execute<{
    from: LocalDate;
    to: LocalDate;
    overdue: number;
    hasDeadline: boolean;
  }>(sql`
    select week_start::text as "from", (cutoff_date - 1)::text as "to",
      count(*) filter (where ${OVERDUE_SNAPSHOT})::int as overdue,
      count(*) filter (where due_date is not null or due_at is not null) > 0
        as "hasDeadline"
    from (${taskSnapshots(userId, { start: range.from, end: addDays(range.to, 1) }, timeZone)}) as snapshots
    group by week_start, cutoff_date
    order by week_start
  `);
  return {
    value: rows.map(({ from, to, overdue }) => ({ from, to, overdue })),
    definition:
      "Open tasks whose deadlines had passed at the close of each of the last four completed weeks. Each week is a separate count, so an overdue task can appear in several weeks.",
    range: { ...range, timeZone, asOf: clock.now },
    hasData: rows.some((row) => row.hasDeadline),
  };
}

const OVERDUE_SNAPSHOT = sql`status = 'open' and
  (due_date < cutoff_date or due_at < cutoff)`;

function taskSnapshots(
  userId: string,
  period: InsightPeriod,
  timeZone: string,
) {
  const weeks = weekStartsOf({
    from: period.start,
    to: addDays(period.end, -1),
  }).map((from) => {
    const cutoffDate = addDays(from, 7);
    const cutoff = startOfLocalDay(cutoffDate, timeZone);
    return sql`(${from}::date, ${cutoffDate}::date, ${cutoff.toISOString()}::timestamptz)`;
  });
  // The first change at or after the boundary gives the state just before
  // it. Without a later change, use the surviving task row's current state.
  // A recorded null old deadline means there really was no deadline.
  return sql`
      select ${tasks.id} as id, week_start, cutoff_date, cutoff,
        coalesce(status_change.changes -> 'status' ->> 'from', ${tasks.status}) as status,
        case when due_change.changes is null then ${tasks.dueDate}
          else (due_change.changes -> 'dueDate' ->> 'from')::date end as due_date,
        case when due_change.changes is null then ${tasks.dueAt}
          else (due_change.changes -> 'dueAt' ->> 'from')::timestamptz end as due_at
      from (values ${sql.join(weeks, sql`, `)}) as weeks(week_start, cutoff_date, cutoff)
      left join ${tasks} on ${tasks.userId} = ${userId} and ${tasks.createdAt} < cutoff
      left join lateral (
        select ${auditEvents.changes} from ${auditEvents}
        where ${auditEvents.userId} = ${tasks.userId}
          and ${auditEvents.entityId} = ${tasks.id}
          and ${auditEvents.entityType} = 'task'
          and ${auditEvents.eventType} in ('task.completed', 'task.reopened', 'task.cancelled')
          and ${auditEvents.occurredAt} >= cutoff
        order by ${auditEvents.occurredAt}, ${auditEvents.id}
        limit 1
      ) as status_change on true
      left join lateral (
        select ${auditEvents.changes} from ${auditEvents}
        where ${auditEvents.userId} = ${tasks.userId}
          and ${auditEvents.entityId} = ${tasks.id}
          and ${auditEvents.entityType} = 'task'
          and ${auditEvents.eventType} = 'task.due_changed'
          and ${auditEvents.occurredAt} >= cutoff
        order by ${auditEvents.occurredAt}, ${auditEvents.id}
        limit 1
      ) as due_change on true
  `;
}

export type HabitConsistencyTrend = {
  id: string;
  title: string;
  weeks: ({ from: LocalDate; to: LocalDate } & HabitConsistency)[];
};

export async function habitConsistencyTrendMetric(
  context: WeeklyInsightContext,
): Promise<Metric<HabitConsistencyTrend[]>> {
  const { userId, clock, timeZone, weekStart } = context;
  const range = completedWeekRange(context);
  const weeks = weekStartsOf(range).map((from) => ({
    from,
    to: addDays(from, 6),
  }));
  const rows = await db
    .select()
    .from(habits)
    .where(
      and(
        eq(habits.userId, userId),
        inArray(habits.status, ["active", "paused"]),
        lte(habits.startDate, range.to),
      ),
    )
    .orderBy(asc(habits.createdAt), asc(habits.id));
  const data = await engineData(
    userId,
    rows.map((row) => row.id),
    range,
  );
  const value = rows.map((row) => {
    const input = engineInput(toHabit(row), data.get(row.id), {
      today: clock.today,
      weekStart,
    });
    return {
      id: row.id,
      title: row.title,
      weeks: weeks.map((week) => ({
        ...week,
        ...consistency({ ...input, range: week }),
      })),
    };
  });
  return {
    value,
    definition:
      "Each active or paused habit's completed credit and expected amount for each of the last four completed weeks, using the schedule and logs for that week.",
    range: { ...range, timeZone, asOf: clock.now },
    hasData: value.some(({ weeks }) =>
      weeks.some(({ expected, skipped }) => expected > 0 || skipped > 0),
    ),
  };
}

export type NextWeekWorkload = {
  estimatedMinutes: number;
  estimatedTasks: number;
  unestimatedTasks: number;
};

export async function nextWeekWorkloadMetric({
  userId,
  clock,
  timeZone,
  weekStart,
}: WeeklyInsightContext): Promise<Metric<NextWeekWorkload>> {
  const period = insightPeriod("next_week_workload", clock.today, weekStart);
  const from = period.start;
  const to = addDays(period.end, -1);
  const [value] = await db
    .select({
      estimatedMinutes:
        sql`coalesce(sum(${tasks.estimatedMinutes}), 0)`.mapWith(Number),
      estimatedTasks: sql<number>`count(${tasks.estimatedMinutes})::int`,
      unestimatedTasks: sql<number>`(count(*) - count(${tasks.estimatedMinutes}))::int`,
    })
    .from(tasks)
    .where(workloadTaskCondition(userId, period, timeZone));
  return {
    value,
    definition:
      "Estimated minutes for open tasks planned or due next week, counting each task once. Tasks without an estimate are counted separately.",
    range: { from, to, timeZone, asOf: clock.now },
    hasData: value.estimatedTasks + value.unestimatedTasks > 0,
  };
}

function workloadTaskCondition(
  userId: string,
  { start, end }: InsightPeriod,
  timeZone: string,
) {
  return and(
    eq(tasks.userId, userId),
    eq(tasks.status, "open"),
    or(
      and(gte(tasks.plannedDate, start), lt(tasks.plannedDate, end)),
      and(gte(tasks.dueDate, start), lt(tasks.dueDate, end)),
      and(
        gte(tasks.dueAt, startOfLocalDay(start, timeZone)),
        lt(tasks.dueAt, startOfLocalDay(end, timeZone)),
      ),
    ),
  );
}

export function insightTaskIds(
  userId: string,
  key: TaskInsightKey,
  period: InsightPeriod,
  timeZone: string,
) {
  switch (key) {
    case "planned_vs_completed":
      return plannedTaskIds(userId, period);
    case "overdue_trend":
      return sql`
        select distinct id
        from (${taskSnapshots(userId, period, timeZone)}) as snapshots
        where ${OVERDUE_SNAPSHOT}
      `;
    case "next_week_workload":
      return db
        .select({ id: tasks.id })
        .from(tasks)
        .where(workloadTaskCondition(userId, period, timeZone));
  }
}
