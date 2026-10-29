import "server-only";

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import {
  addDays,
  startOfLocalDay,
  startOfWeek,
  type LocalDate,
  type WeekStart,
} from "@/lib/dates";
import { scheduleForWeek } from "@/lib/habits/cadence";
import {
  consistency,
  formatConsistency,
  weekProgress,
  type HabitWeekInput,
} from "@/lib/habits/consistency";
import { weekProgressFigure } from "@/lib/habits/track-range";
import type { TodayClock } from "@/lib/today";
import { AUDIT_EVENTS } from "@/server/audit/types";
import { db } from "@/server/db/client";
import {
  auditEvents,
  goals,
  habitLogs,
  habits,
  milestones,
  tasks,
} from "@/server/db/schema";
import { engineData, engineInput } from "@/server/modules/habits/queries";
import { toHabit } from "@/server/modules/habits/service";

import type { Metric } from "./metric";

// The weekly review's summary (chunk 7.1, ADR 0015). Each metric is computed
// from the records every time, never stored, and reads the audit log only for
// history that the state tables can't show (a plan moved out of the week, a
// deadline moved later). Event instants are placed in the user's zone, and a
// week's bounds are local dates in that zone. Every query is scoped to the
// user. The metrics take the reviewed week's first day as `periodStart`; its
// last day is the day before `addDays(periodStart, 7)`, the exclusive end.

/** The reviewed week. `end` is exclusive, the day after its last day. */
export type ReviewPeriod = { start: LocalDate; end: LocalDate };

export type PlannedVersusCompleted = {
  /** Tasks that had a plan date in the period at any point. */
  planned: number;
  /** Of those, the ones completed in the period. */
  completed: number;
};

/** One habit's figure for the period, worded as Track words it. */
export type HabitPeriodFigure = {
  id: string;
  title: string;
  status: "active" | "paused";
  figure: string;
};

export type WeeklySummary = {
  tasksCompleted: Metric<number>;
  plannedVersusCompleted: Metric<PlannedVersusCompleted>;
  rescheduled: Metric<number>;
  goalsWithoutActivity: Metric<number>;
  /** Null when the period doesn't start on this week's first day. */
  habits: Metric<HabitPeriodFigure[] | null>;
  deadlinesNextPeriod: Metric<number>;
};

type SummaryContext = {
  userId: string;
  period: ReviewPeriod;
  clock: TodayClock;
  timeZone: string;
  weekStart: WeekStart;
};

/** The reviewed week as a period, from its first day. */
export function reviewPeriod(start: LocalDate): ReviewPeriod {
  return { start, end: addDays(start, 7) };
}

/** Both bounds of the period as instants: `[from, until)` in the user's zone. */
function periodInstants({ period, timeZone }: SummaryContext) {
  return {
    from: startOfLocalDay(period.start, timeZone),
    until: startOfLocalDay(period.end, timeZone),
  };
}

function rangeOf({ period, timeZone, clock }: SummaryContext) {
  return {
    from: period.start,
    to: addDays(period.end, -1),
    timeZone,
    asOf: clock.now,
  };
}

async function hasAnyTask(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .limit(1);
  return row !== undefined;
}

/** Tasks completed in the period, by completion instant (`completed_at`). */
async function completedInPeriod(context: SummaryContext): Promise<string[]> {
  const { from, until } = periodInstants(context);
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, context.userId),
        eq(tasks.status, "completed"),
        gte(tasks.completedAt, from),
        lt(tasks.completedAt, until),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Tasks completed in the period. Cancelled tasks are not counted. No data:
 * the user has no tasks at all.
 */
export async function tasksCompletedMetric(
  context: SummaryContext,
  completed?: string[],
): Promise<Metric<number>> {
  const [ids, hasData] = await Promise.all([
    completed ?? completedInPeriod(context),
    hasAnyTask(context.userId),
  ]);
  return {
    value: ids.length,
    definition:
      "Tasks marked completed during this week, by the time they were completed in your time zone. Cancelled tasks are not counted.",
    range: rangeOf(context),
    hasData,
  };
}

/**
 * Tasks that had a plan date in the period at any point: from `task.created`
 * and `task.planned` events, so a plan moved out of the week still counts. Of
 * those, the ones completed in the period. No data: the user has no tasks.
 */
export async function plannedVersusCompletedMetric(
  context: SummaryContext,
  completed?: string[],
): Promise<Metric<PlannedVersusCompleted>> {
  const { userId, period } = context;
  const [planned, completedIds, hasData] = await Promise.all([
    db
      .selectDistinct({ id: auditEvents.entityId })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, userId),
          eq(auditEvents.entityType, "task"),
          inArray(auditEvents.eventType, ["task.created", "task.planned"]),
          sql`(${auditEvents.changes} -> 'plannedDate' ->> 'to') >= ${period.start}`,
          sql`(${auditEvents.changes} -> 'plannedDate' ->> 'to') < ${period.end}`,
        ),
      ),
    completed ?? completedInPeriod(context),
    hasAnyTask(userId),
  ]);
  const plannedIds = new Set(planned.map((row) => row.id));
  return {
    value: {
      planned: plannedIds.size,
      completed: completedIds.filter((id) => plannedIds.has(id)).length,
    },
    definition:
      "Planned: tasks that had a plan date in this week at some point, including a plan moved to another day later. Completed: the planned tasks completed during this week.",
    range: rangeOf(context),
    hasData,
  };
}

/**
 * The deadline as an instant for comparing. A timed deadline is its instant; a
 * day deadline is due by the end of that day in the user's zone, so a timed
 * deadline on the same day is earlier than it, not later.
 */
function deadlineInstant(
  dueDate: LocalDate | null,
  dueAt: string | null,
  timeZone: string,
): Date | null {
  if (dueAt !== null) return new Date(dueAt);
  if (dueDate !== null) return startOfLocalDay(addDays(dueDate, 1), timeZone);
  return null;
}

/**
 * Whether one audit event moved an existing plan date or deadline later. A
 * first plan or deadline, a clear, and a move earlier don't count.
 */
function movedLater(
  event: { eventType: string; changes: unknown },
  timeZone: string,
): boolean {
  if (event.eventType === "task.planned") {
    const { plannedDate } = AUDIT_EVENTS["task.planned"].changes.parse(
      event.changes,
    );
    const { from, to } = plannedDate;
    return from !== null && to !== null && to > from;
  }
  const { dueDate, dueAt } = AUDIT_EVENTS["task.due_changed"].changes.parse(
    event.changes,
  );
  const before = deadlineInstant(dueDate.from, dueAt.from, timeZone);
  const after = deadlineInstant(dueDate.to, dueAt.to, timeZone);
  return before !== null && after !== null && after > before;
}

/**
 * Tasks whose plan date or deadline was moved later during the period,
 * counted once per task. No data: the user has no tasks.
 */
export async function rescheduledMetric(
  context: SummaryContext,
): Promise<Metric<number>> {
  const { userId, timeZone } = context;
  const { from, until } = periodInstants(context);
  const [events, hasData] = await Promise.all([
    db
      .select({
        entityId: auditEvents.entityId,
        eventType: auditEvents.eventType,
        changes: auditEvents.changes,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, userId),
          eq(auditEvents.entityType, "task"),
          inArray(auditEvents.eventType, ["task.planned", "task.due_changed"]),
          gte(auditEvents.occurredAt, from),
          lt(auditEvents.occurredAt, until),
        ),
      ),
    hasAnyTask(userId),
  ]);
  const moved = new Set(
    events
      .filter((event) => movedLater(event, timeZone))
      .map((event) => event.entityId),
  );
  return {
    value: moved.size,
    definition:
      "Tasks whose plan date or deadline was moved later during this week, counted once per task however many times it moved. Setting a date for the first time, or moving one earlier, is not counted.",
    range: rangeOf(context),
    hasData,
  };
}

/**
 * Whether an active goal had any activity in the period: an audit event in
 * the period on the goal, one of its milestones, or one of its current tasks
 * (directly or under a milestone), or a completed log of a habit linked to it.
 */
function goalHadActivity(context: SummaryContext) {
  const { from, until } = periodInstants(context);
  const { period } = context;
  const inPeriod = and(
    gte(auditEvents.occurredAt, from),
    lt(auditEvents.occurredAt, until),
  );
  return sql`(exists (
    select 1 from ${auditEvents}
    where ${auditEvents.userId} = ${goals.userId}
      and ${inPeriod}
      and (
        (${auditEvents.entityType} = 'goal' and ${auditEvents.entityId} = ${goals.id})
        or (${auditEvents.entityType} = 'milestone' and ${auditEvents.entityId} in (
          select ${milestones.id} from ${milestones}
          where ${milestones.goalId} = ${goals.id}
        ))
        or (${auditEvents.entityType} = 'task' and ${auditEvents.entityId} in (
          select ${tasks.id} from ${tasks}
          left join ${milestones}
            on ${milestones.id} = ${tasks.milestoneId}
            and ${milestones.userId} = ${tasks.userId}
          where coalesce(${tasks.goalId}, ${milestones.goalId}) = ${goals.id}
        ))
      )
  ) or exists (
    select 1 from ${habitLogs}
    join ${habits} on ${habits.id} = ${habitLogs.habitId}
      and ${habits.userId} = ${habitLogs.userId}
    where ${habits.goalId} = ${goals.id}
      and ${habitLogs.status} = 'completed'
      and ${habitLogs.localDate} >= ${period.start}
      and ${habitLogs.localDate} < ${period.end}
  ))`;
}

/**
 * Active goals created before the period ended, with no activity in the
 * period (see `goalHadActivity`). Paused, completed and dropped goals are not
 * counted. No data: the user has no active goal created before the period
 * ended.
 */
export async function goalsWithoutActivityMetric(
  context: SummaryContext,
): Promise<Metric<number>> {
  const { until } = periodInstants(context);
  const [row] = await db
    .select({
      candidates: sql<number>`count(*)::int`,
      withoutActivity: sql<number>`count(*) filter (where not ${goalHadActivity(context)})::int`,
    })
    .from(goals)
    .where(
      and(
        eq(goals.userId, context.userId),
        eq(goals.status, "active"),
        lt(goals.createdAt, until),
      ),
    );
  const counts = row ?? { candidates: 0, withoutActivity: 0 };
  return {
    value: counts.withoutActivity,
    definition:
      "Active goals created before this week ended with no recorded change this week to the goal, its milestones or its tasks, and no completed log this week for a habit linked to them. Paused, completed and dropped goals are not counted.",
    range: rangeOf(context),
    hasData: counts.candidates > 0,
  };
}

/**
 * Each active or paused habit's figure for the period. The current week reads
 * as Track's "This week" (progress so far); a past week as its consistency.
 * Only whole weeks starting on the current week start can be counted, so for
 * any other period the value is null. No data: the user has no active or
 * paused habit at all (a habit that began after the period is data, with
 * nothing to show for the period).
 */
export async function habitsPeriodMetric(
  context: SummaryContext,
): Promise<Metric<HabitPeriodFigure[] | null>> {
  const { userId, period, clock, weekStart } = context;
  const definition =
    "Each active or paused habit for this week: what was done of what was expected so far, and for a past week, the whole week. Skipped days are left out. Track has each habit's full definition.";
  const range = { from: period.start, to: addDays(period.end, -1) };

  if (startOfWeek(period.start, weekStart) !== period.start) {
    return {
      value: null,
      definition:
        "Habits are counted for whole weeks that start on your week start. This period doesn't, so no habit figures are shown.",
      range: rangeOf(context),
      hasData: false,
    };
  }

  const rows = await db
    .select()
    .from(habits)
    .where(
      and(
        eq(habits.userId, userId),
        inArray(habits.status, ["active", "paused"]),
      ),
    )
    .orderBy(asc(habits.createdAt), asc(habits.id));
  const data = await engineData(
    userId,
    rows.map((row) => row.id),
    range,
  );
  const isCurrentWeek = startOfWeek(clock.today, weekStart) === period.start;

  const value: HabitPeriodFigure[] = [];
  for (const row of rows) {
    const habit = toHabit(row);
    // A habit that began on or after the period's end was not part of it.
    if (habit.startDate >= period.end) continue;
    const input: HabitWeekInput = engineInput(habit, data.get(row.id), {
      today: clock.today,
      weekStart,
    });
    const schedule = scheduleForWeek(input.schedules, range.to);
    if (!schedule) throw new Error("Habit has no schedule");
    const figure = isCurrentWeek
      ? weekProgressFigure(
          weekProgress(input),
          schedule.cadenceType,
          habit.measure,
        )
      : formatConsistency(
          consistency({ ...input, range }),
          schedule.cadenceType,
          habit.measure,
        );
    value.push({
      id: habit.id,
      title: habit.title,
      status: habit.status === "paused" ? "paused" : "active",
      figure,
    });
  }
  return {
    value,
    definition,
    range: rangeOf(context),
    hasData: rows.length > 0,
  };
}

/**
 * Open tasks with a deadline in the 7 days after the period ends. A timed
 * deadline counts on its local day in the user's zone. No data: the user has
 * no open task with a deadline.
 */
export async function deadlinesNextPeriodMetric(
  context: SummaryContext,
): Promise<Metric<number>> {
  const { userId, period, timeZone } = context;
  const from = period.end;
  const to = addDays(period.end, 6);
  const start = startOfLocalDay(from, timeZone);
  const end = startOfLocalDay(addDays(to, 1), timeZone);

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
      "Open tasks with a deadline in the 7 days after this week ends, in your time zone.",
    range: { from, to, timeZone, asOf: context.clock.now },
    hasData: counts.withDeadline > 0,
  };
}

/**
 * The look-back summary for one reviewed week (chunk 7.1). Computed live on
 * each call, never stored (ADR 0015). `periodStart` is the week's first day
 * (any day is accepted; a non-week-aligned one is reported by the habits
 * metric). Each metric carries its own definition, range and `hasData`.
 */
export async function weeklySummary(
  userId: string,
  input: {
    periodStart: LocalDate;
    clock: TodayClock;
    timeZone: string;
    weekStart: WeekStart;
  },
): Promise<WeeklySummary> {
  const context: SummaryContext = {
    userId,
    period: reviewPeriod(input.periodStart),
    clock: input.clock,
    timeZone: input.timeZone,
    weekStart: input.weekStart,
  };
  // Completed tasks are read once and shared by the two metrics that use them.
  const completed = await completedInPeriod(context);
  const [
    tasksCompleted,
    plannedVersusCompleted,
    rescheduled,
    goalsWithout,
    habitsMetric,
    deadlines,
  ] = await Promise.all([
    tasksCompletedMetric(context, completed),
    plannedVersusCompletedMetric(context, completed),
    rescheduledMetric(context),
    goalsWithoutActivityMetric(context),
    habitsPeriodMetric(context),
    deadlinesNextPeriodMetric(context),
  ]);
  return {
    tasksCompleted,
    plannedVersusCompleted,
    rescheduled,
    goalsWithoutActivity: goalsWithout,
    habits: habitsMetric,
    deadlinesNextPeriod: deadlines,
  };
}
