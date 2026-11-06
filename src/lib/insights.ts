import { addDays, startOfWeek, type LocalDate, type WeekStart } from "./dates";

export const TASK_INSIGHT_KEYS = [
  "planned_vs_completed",
  "overdue_trend",
  "next_week_workload",
] as const;

export const INSIGHT_KEYS = [
  ...TASK_INSIGHT_KEYS,
  "goal_inactivity",
  "habit_consistency",
] as const;

export type TaskInsightKey = (typeof TASK_INSIGHT_KEYS)[number];
export type InsightKey = (typeof INSIGHT_KEYS)[number];
export type InsightPeriod = { start: LocalDate; end: LocalDate };

const PERIODS = {
  planned_vs_completed: { offsetWeeks: -1, days: 7 },
  overdue_trend: { offsetWeeks: -4, days: 28 },
  next_week_workload: { offsetWeeks: 1, days: 7 },
  goal_inactivity: { offsetWeeks: 0, days: 7 },
  habit_consistency: { offsetWeeks: -4, days: 28 },
} as const satisfies Record<InsightKey, { offsetWeeks: number; days: number }>;

export function insightPeriodFromStart(
  key: InsightKey,
  start: LocalDate,
): InsightPeriod {
  return { start, end: addDays(start, PERIODS[key].days) };
}

export function insightPeriod(
  key: InsightKey,
  today: LocalDate,
  weekStart: WeekStart,
): InsightPeriod {
  const start = addDays(
    startOfWeek(today, weekStart),
    7 * PERIODS[key].offsetWeeks,
  );
  return insightPeriodFromStart(key, start);
}

export function insightTaskHref(
  key: TaskInsightKey,
  today: LocalDate,
  weekStart: WeekStart,
) {
  const { start } = insightPeriod(key, today, weekStart);
  return `/review/insights/${key}?start=${start}`;
}
