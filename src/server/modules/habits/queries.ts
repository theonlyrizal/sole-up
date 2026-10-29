import "server-only";

import { and, asc, count, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";

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
import {
  consistency,
  formatConsistency,
  habitDays,
  weekProgress,
  type EngineLog,
  type EnginePause,
  type HabitDayState,
  type HabitRange,
  type HabitWeekInput,
} from "@/lib/habits/consistency";
import type { Habit, HabitMeasure } from "@/lib/habits/habit";
import { describeCadence, describeTarget } from "@/lib/habits/habit-form";
import {
  habitDayLabel,
  isLoggableDay,
  showsOnToday,
  stripRange,
  weekProgressLabel,
  type HabitLogValue,
} from "@/lib/habits/logging";
import { db } from "@/server/db/client";
import {
  goals,
  habitLogs,
  habitPauses,
  habits,
  habitSchedules,
} from "@/server/db/schema";
import { getUserPreferences } from "@/server/modules/preferences/service";

import { toHabit, toHabitLogValue, toHabitSchedule } from "./service";

// Read models for the Track pages (chunk 6.3), their history strips and
// Today's Habits section (chunk 6.4). Every query is scoped to the user.
// Every count comes from the 6.2 engine; nothing here recounts.

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

/** One day of a history strip, ready to show. */
export type HabitHistoryDay = {
  date: LocalDate;
  state: HabitDayState;
  /** 0 to 1; above 0 only when completed. */
  credit: number;
  log: HabitLogValue | null;
  /** The day of the month, "26". */
  dayOfMonth: string;
  /** "Monday, 26 October 2026". */
  dateLabel: string;
  /** "Missed", "5 of 8 glasses", "Not active · Done". */
  stateLabel: string;
  /** Whether the day can be opened to log or correct it. */
  loggable: boolean;
  /** Whether a new log is accepted (an active day up to today). */
  active: boolean;
  /** That week's per-day target for a quantity habit; null for check. */
  target: number | null;
};

/** A habit's last two weeks, with the figure for them. */
export type HabitHistory = {
  weeks: { from: LocalDate; label: string; days: HabitHistoryDay[] }[];
  /** "9 of 10 days · 1 skipped", or "Nothing expected in this range". */
  figure: string;
  definition: string;
  /** "1 of 3 so far this week", for a `times_per_week` habit only. */
  progressLabel: string | null;
};

export type TrackHabit = HabitListItem & { history: HabitHistory };

export type TrackView = {
  /** Active habits, then paused ones, oldest first within each. */
  habits: TrackHabit[];
  archivedCount: number;
  /** Every goal, live ones first (see `HabitGoalOption`). */
  goals: HabitGoalOption[];
  today: LocalDate;
  weekStart: WeekStart;
  locale: string;
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

type UserContext = Awaited<ReturnType<typeof userContext>>;

/** What the engine needs for one habit. */
type EngineData = {
  schedules: HabitSchedule[];
  pauses: EnginePause[];
  logs: EngineLog[];
};

/**
 * The schedules, pauses and the logs in `logRange` of some of the user's
 * habits, for the 6.2 engine, by habit ID.
 */
async function engineData(
  userId: string,
  ids: string[],
  logRange: HabitRange,
): Promise<Map<string, EngineData>> {
  const data = new Map<string, EngineData>(
    ids.map((id) => [id, { schedules: [], pauses: [], logs: [] }]),
  );
  if (ids.length === 0) return data;

  const [scheduleRows, pauseRows, logRows] = await Promise.all([
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
      .select()
      .from(habitPauses)
      .where(
        and(eq(habitPauses.userId, userId), inArray(habitPauses.habitId, ids)),
      ),
    db
      .select()
      .from(habitLogs)
      .where(
        and(
          eq(habitLogs.userId, userId),
          inArray(habitLogs.habitId, ids),
          gte(habitLogs.localDate, logRange.from),
          lte(habitLogs.localDate, logRange.to),
        ),
      ),
  ]);
  for (const row of scheduleRows) {
    data.get(row.habitId)?.schedules.push(toHabitSchedule(row));
  }
  for (const row of pauseRows) {
    data
      .get(row.habitId)
      ?.pauses.push({ startDate: row.startDate, endDate: row.endDate });
  }
  for (const row of logRows) {
    data
      .get(row.habitId)
      ?.logs.push({ localDate: row.localDate, ...toHabitLogValue(row) });
  }
  return data;
}

function engineInput(
  habit: Habit,
  data: EngineData | undefined,
  context: UserContext,
): HabitWeekInput {
  return {
    habit,
    schedules: data?.schedules ?? [],
    pauses: data?.pauses ?? [],
    logs: data?.logs ?? [],
    today: context.today,
    weekStart: context.weekStart,
  };
}

/** The last two weeks of a habit as the Track strip shows them. */
function habitHistory(
  habit: HabitListItem,
  input: HabitWeekInput,
  context: UserContext,
): HabitHistory {
  const range = stripRange(context.today, context.weekStart);
  const days = habitDays({ ...input, range });
  const weeks = [range.from, addDays(range.from, 7)].map((from) => {
    const to = addDays(from, 6);
    const target = scheduleForWeek(input.schedules, to)?.target ?? null;
    return {
      from,
      label: `Week of ${formatLocalDate(from, context.locale)}`,
      days: days
        .filter((day) => day.date >= from && day.date <= to)
        .map((day): HabitHistoryDay => ({
          date: day.date,
          state: day.state,
          credit: day.credit,
          log: day.log && { status: day.log.status, value: day.log.value },
          dayOfMonth: String(Number(day.date.slice(8))),
          dateLabel: formatLocalDate(day.date, context.locale, "full"),
          stateLabel: habitDayLabel(day, habit, target, context.locale),
          loggable: isLoggableDay(day, context.today),
          active: day.state !== "inactive" && day.date <= context.today,
          target,
        })),
    };
  });

  const result = consistency({ ...input, range });
  const cadence = habit.schedule.cadenceType;
  return {
    weeks,
    figure: formatConsistency(result, cadence, habit.measure),
    definition: result.definition,
    progressLabel:
      cadence === "times_per_week"
        ? weekProgressLabel(weekProgress(input))
        : null,
  };
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

  const items = await listItems(userId, habitRows, context);
  const data = await engineData(
    userId,
    items.map((item) => item.id),
    stripRange(context.today, context.weekStart),
  );
  return {
    habits: items.map((item) => ({
      ...item,
      history: habitHistory(
        item,
        engineInput(item, data.get(item.id), context),
        context,
      ),
    })),
    archivedCount: archived?.count ?? 0,
    goals: goalRows,
    today: context.today,
    weekStart: context.weekStart,
    locale: context.locale,
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

/** One habit on Today, with today's log. */
export type TodayHabit = {
  id: string;
  title: string;
  measure: HabitMeasure;
  unit: string | null;
  /** "Every day · 8 glasses a day". */
  scheduleLabel: string;
  /** This week's per-day target for a quantity habit; null for check. */
  target: number | null;
  /** Today's log, or null before it is logged. */
  log: HabitLogValue | null;
  /** "1 of 3 so far this week", for a `times_per_week` habit only. */
  progressLabel: string | null;
};

export type TodayHabits = {
  /** In the Track order: active, then paused, oldest first. */
  habits: TodayHabit[];
  /** Whether the user has any active habit, shown today or not. */
  hasActiveHabits: boolean;
};

/**
 * Today's Habits section (chunk 6.4): which habits show is `showsOnToday`,
 * and a `times_per_week` habit's progress is `weekProgress`.
 */
export async function getTodayHabits(
  userId: string,
  now: Date = new Date(),
): Promise<TodayHabits> {
  const context = await userContext(userId, now);
  const rows = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), ne(habits.status, "archived")))
    .orderBy(STATUS_ORDER, asc(habits.createdAt), asc(habits.id));

  const weekFrom = startOfWeek(context.today, context.weekStart);
  const weekTo = addDays(weekFrom, 6);
  const data = await engineData(
    userId,
    rows.map((row) => row.id),
    { from: weekFrom, to: weekTo },
  );

  const shown = rows.flatMap((row): TodayHabit[] => {
    const habit = toHabit(row);
    const input = engineInput(habit, data.get(row.id), context);
    if (!showsOnToday(habit.status, input)) return [];

    const schedule = scheduleForWeek(input.schedules, weekTo);
    if (!schedule) throw new Error("Habit has no schedule");
    const targetLabel =
      habit.unit !== null && schedule.target !== null
        ? describeTarget(schedule.target, habit.unit, context.locale)
        : null;
    const log = input.logs.find((entry) => entry.localDate === context.today);
    return [
      {
        id: habit.id,
        title: habit.title,
        measure: habit.measure,
        unit: habit.unit,
        scheduleLabel: [
          describeCadence(schedule, context.weekStart),
          targetLabel,
        ]
          .filter(Boolean)
          .join(" · "),
        target: schedule.target,
        log: log ? { status: log.status, value: log.value } : null,
        progressLabel:
          schedule.cadenceType === "times_per_week"
            ? weekProgressLabel(weekProgress(input))
            : null,
      },
    ];
  });

  return {
    habits: shown,
    hasActiveHabits: rows.some((row) => row.status === "active"),
  };
}
