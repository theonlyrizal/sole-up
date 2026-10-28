import "server-only";

import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";

import {
  addDays,
  formatLocalDate,
  localDateOf,
  startOfWeek,
  todayFor,
  type LocalDate,
  type WeekStart,
} from "@/lib/dates";
import type { GoalStatus } from "@/lib/goals";
import { scheduleForWeek, type HabitSchedule } from "@/lib/habits/cadence";
import type { Habit } from "@/lib/habits/habit";
import { describeCadence, describeTarget } from "@/lib/habits/habit-form";
import { db } from "@/server/db/client";
import { goals, habitLogs, habits, habitSchedules } from "@/server/db/schema";
import { getUserPreferences } from "@/server/modules/preferences/service";

import { toHabit, toHabitSchedule } from "./service";

// Read models for the Track pages (chunk 6.3). Every query is scoped to the
// user. Consistency figures are 6.5's, from the 6.2 engine.

/** A habit as Track lists it, with this week's schedule and its labels. */
export type HabitListItem = Habit & {
  /** The schedule in effect this week, which the edit form starts from. */
  schedule: HabitSchedule;
  cadenceLabel: string;
  /** "8 glasses a day" for a quantity habit; null for a check habit. */
  targetLabel: string | null;
  goal: { id: string; title: string } | null;
  startDateLabel: string;
  endDateLabel: string | null;
  /** Every log of the habit, for the delete confirmation. */
  logCount: number;
};

/** A goal a habit can link to. The form offers active and paused ones. */
export type HabitGoalOption = { id: string; title: string; status: GoalStatus };

export type TrackView = {
  /** Active habits, then paused ones, oldest first within each. */
  habits: HabitListItem[];
  archivedCount: number;
  /** Every goal, live ones first (see `HabitGoalOption`). */
  goals: HabitGoalOption[];
  today: LocalDate;
  weekStart: WeekStart;
  /** "26 Oct 2026": where a schedule edit takes effect. */
  thisWeekStartLabel: string;
};

/** An archived habit, for the archive page. */
export type ArchivedHabitItem = HabitListItem & { archivedAtLabel: string };

const STATUS_ORDER = sql`case ${habits.status}
  when 'active' then 0 when 'paused' then 1 else 2 end`;

const GOAL_STATUS_ORDER = sql`case ${goals.status}
  when 'active' then 0 when 'paused' then 1 when 'completed' then 2
  when 'dropped' then 3 else 4 end`;

/**
 * Builds the list items for some of the user's habits: this week's
 * schedule, the goal's title and the number of logs.
 */
async function listItems(
  userId: string,
  rows: (typeof habits.$inferSelect)[],
  context: { today: LocalDate; weekStart: WeekStart; locale: string },
): Promise<HabitListItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const goalIds = rows.flatMap((row) => (row.goalId ? [row.goalId] : []));

  const [scheduleRows, logCounts, goalRows] = await Promise.all([
    db
      .select()
      .from(habitSchedules)
      .where(
        and(
          eq(habitSchedules.userId, userId),
          inArray(habitSchedules.habitId, ids),
        ),
      ),
    db
      .select({ habitId: habitLogs.habitId, count: count() })
      .from(habitLogs)
      .where(and(eq(habitLogs.userId, userId), inArray(habitLogs.habitId, ids)))
      .groupBy(habitLogs.habitId),
    goalIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: goals.id, title: goals.title })
          .from(goals)
          .where(and(eq(goals.userId, userId), inArray(goals.id, goalIds))),
  ]);

  const weekLastDay = addDays(startOfWeek(context.today, context.weekStart), 6);
  const format = (date: LocalDate) => formatLocalDate(date, context.locale);

  return rows.map((row): HabitListItem => {
    const habit = toHabit(row);
    const scheduleRow = scheduleForWeek(
      scheduleRows.filter((schedule) => schedule.habitId === row.id),
      weekLastDay,
    );
    if (!scheduleRow) throw new Error("Habit has no schedule");
    const schedule = toHabitSchedule(scheduleRow);
    return {
      ...habit,
      schedule,
      cadenceLabel: describeCadence(schedule, context.weekStart),
      targetLabel:
        habit.unit !== null && schedule.target !== null
          ? describeTarget(schedule.target, habit.unit, context.locale)
          : null,
      goal: goalRows.find((goal) => goal.id === row.goalId) ?? null,
      startDateLabel: format(habit.startDate),
      endDateLabel: habit.endDate && format(habit.endDate),
      logCount: logCounts.find((entry) => entry.habitId === row.id)?.count ?? 0,
    };
  });
}

/** The user's today, week start, locale and zone. */
async function userContext(userId: string, now: Date) {
  const preferences = await getUserPreferences(userId);
  const timeZone = preferences.timezone ?? "UTC";
  return {
    today: todayFor(timeZone, now),
    weekStart: preferences.weekStart,
    locale: preferences.locale,
    timeZone,
  };
}

/** The Track page: active and paused habits, and what the form needs. */
export async function getTrackView(
  userId: string,
  now: Date = new Date(),
): Promise<TrackView> {
  const context = await userContext(userId, now);
  const [habitRows, [archived], goalRows] = await Promise.all([
    db
      .select()
      .from(habits)
      .where(and(eq(habits.userId, userId), ne(habits.status, "archived")))
      .orderBy(STATUS_ORDER, asc(habits.createdAt), asc(habits.id)),
    db
      .select({ count: count() })
      .from(habits)
      .where(and(eq(habits.userId, userId), eq(habits.status, "archived"))),
    db
      .select({ id: goals.id, title: goals.title, status: goals.status })
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(GOAL_STATUS_ORDER, asc(goals.createdAt), asc(goals.id)),
  ]);

  return {
    habits: await listItems(userId, habitRows, context),
    archivedCount: archived?.count ?? 0,
    goals: goalRows,
    today: context.today,
    weekStart: context.weekStart,
    thisWeekStartLabel: formatLocalDate(
      startOfWeek(context.today, context.weekStart),
      context.locale,
    ),
  };
}

/** Archived habits, most recently archived first. */
export async function getArchivedHabits(
  userId: string,
  now: Date = new Date(),
): Promise<ArchivedHabitItem[]> {
  const context = await userContext(userId, now);
  const rows = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.status, "archived")))
    .orderBy(sql`${habits.statusChangedAt} desc`, asc(habits.id));
  const items = await listItems(userId, rows, context);
  return items.map((item) => ({
    ...item,
    archivedAtLabel: formatLocalDate(
      localDateOf(item.statusChangedAt, context.timeZone),
      context.locale,
    ),
  }));
}
