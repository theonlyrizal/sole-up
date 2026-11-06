import Link from "next/link";
import type { ReactNode } from "react";

import {
  metricAsOfLabel,
  metricRangeLabel,
} from "@/components/home/metric-range";
import { cx, focusRing } from "@/components/ui/cx";
import { formatLocalDate, type LocalDate, type WeekStart } from "@/lib/dates";
import {
  formatDateSpan,
  trackHabitAnchor,
  trackHref,
} from "@/lib/habits/track-range";
import {
  INSIGHT_KEYS,
  insightPeriod,
  insightTaskHref,
  type InsightKey,
} from "@/lib/insights";
import type {
  GoalInactivity,
  HabitConsistencyTrend,
  NextWeekWorkload,
  OverdueWeek,
} from "@/server/modules/metrics/insights";
import type { Metric } from "@/server/modules/metrics/metric";
import type { PlannedVersusCompleted } from "@/server/modules/metrics/review";

import { DismissInsightButton } from "./dismiss-insight-button";

type InsightContext = {
  today: LocalDate;
  locale: string;
  weekStart: WeekStart;
  dismissed: ReadonlySet<InsightKey>;
};

type InsightsViewProps = InsightContext & {
  planned: Metric<PlannedVersusCompleted>;
  goals: Metric<GoalInactivity[]>;
  overdue: Metric<OverdueWeek[]>;
  habits: Metric<HabitConsistencyTrend[]>;
  workload: Metric<NextWeekWorkload>;
};

const linkStyle = cx("rounded-sm underline underline-offset-2", focusRing);

export function InsightsView({
  planned,
  goals,
  overdue,
  habits,
  workload,
  today,
  locale,
  weekStart,
  dismissed,
}: InsightsViewProps) {
  const context = { today, locale, weekStart, dismissed };
  const number = new Intl.NumberFormat(locale);
  const credit = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const { estimatedMinutes, estimatedTasks, unestimatedTasks } = workload.value;
  const inactiveFirst = goals.value.toSorted(
    (a, b) => b.daysInactive - a.daysInactive,
  );

  return (
    <>
      {dismissed.size === INSIGHT_KEYS.length ? (
        <p>All insights are dismissed for their current periods.</p>
      ) : (
        <ul aria-label="Insights" className="flex flex-col gap-4">
          <Insight
            insightKey="planned_vs_completed"
            title="Planned versus completed"
            metric={planned}
            empty="No task history yet."
            action={{
              href: insightTaskHref("planned_vs_completed", today, weekStart),
              label: "Review tasks planned for this week",
            }}
            {...context}
          >
            <p className="text-lg font-semibold">
              {planned.value.planned > 0
                ? `${number.format(planned.value.completed)} of ${number.format(planned.value.planned)} planned tasks completed`
                : "No tasks were planned for that week."}
            </p>
          </Insight>
          <Insight
            insightKey="goal_inactivity"
            title="Goal inactivity"
            metric={goals}
            empty="No active goals yet."
            action={{ href: "/goals", label: "Review your active goals" }}
            {...context}
          >
            <ul className="divide-y divide-border">
              {inactiveFirst.map((goal) => (
                <li key={goal.id} className="flex flex-col gap-1 py-2">
                  <Link
                    href={`/goals/${goal.id}`}
                    className={cx(
                      "self-start font-medium wrap-anywhere",
                      linkStyle,
                    )}
                  >
                    {goal.title}
                  </Link>
                  <p className="text-sm text-muted">
                    {goal.daysInactive === 0
                      ? "Last action today"
                      : `${number.format(goal.daysInactive)} ${goal.daysInactive === 1 ? "day" : "days"} since the last action`}
                    {" · "}
                    <time dateTime={goal.lastActionDate}>
                      {formatLocalDate(goal.lastActionDate, locale)}
                    </time>
                  </p>
                </li>
              ))}
            </ul>
          </Insight>
          <Insight
            insightKey="overdue_trend"
            title="Overdue task trend"
            metric={overdue}
            empty="No task deadlines in these weekly snapshots."
            action={{
              href: insightTaskHref("overdue_trend", today, weekStart),
              label: "Review tasks counted as overdue",
            }}
            {...context}
          >
            <WeekTable valueLabel="Overdue tasks">
              {overdue.value.map((week) => (
                <WeekRow key={week.from} label={formatDateSpan(week, locale)}>
                  {number.format(week.overdue)}
                </WeekRow>
              ))}
            </WeekTable>
            <p className="text-sm text-muted">
              These counts use recorded history for tasks that still exist.
            </p>
          </Insight>
          <Insight
            insightKey="habit_consistency"
            title="Habit consistency trend"
            metric={habits}
            empty="No expected or skipped habit activity in these weeks."
            action={{
              href: trackHref("12w"),
              label: "Review habit history in Track",
            }}
            {...context}
          >
            <p className="text-sm text-muted">
              Skips are left out of the expected count. Quantity habits can earn
              partial credit.
            </p>
            <ul className="flex flex-col gap-4">
              {habits.value.map((habit) => (
                <li key={habit.id} className="flex flex-col gap-1">
                  <Link
                    href={`${trackHref("12w")}#${trackHabitAnchor(habit.id)}`}
                    className={cx(
                      "self-start font-medium wrap-anywhere",
                      linkStyle,
                    )}
                  >
                    {habit.title}
                  </Link>
                  <WeekTable valueLabel="Completed of expected">
                    {habit.weeks.map((week) => (
                      <WeekRow
                        key={week.from}
                        label={formatDateSpan(week, locale)}
                      >
                        {week.expected === 0
                          ? "None expected"
                          : `${credit.format(week.completed)} of ${number.format(week.expected)}`}
                        {week.skipped > 0 &&
                          ` · ${number.format(week.skipped)} skipped`}
                      </WeekRow>
                    ))}
                  </WeekTable>
                </li>
              ))}
            </ul>
          </Insight>
          <Insight
            insightKey="next_week_workload"
            title="Next-week workload"
            metric={workload}
            empty="No open tasks planned or due next week."
            action={{
              href: insightTaskHref("next_week_workload", today, weekStart),
              label: "Review tasks in next week’s workload",
            }}
            {...context}
          >
            <p className="text-lg font-semibold">
              {estimatedTasks > 0
                ? `${number.format(estimatedMinutes)} estimated minutes`
                : "No estimates yet"}
            </p>
            <p>
              {number.format(estimatedTasks)} with estimates ·{" "}
              {number.format(unestimatedTasks)} without estimates
            </p>
          </Insight>
        </ul>
      )}
      <p className="text-sm text-muted">
        Calculated{" "}
        <time dateTime={planned.range.asOf.toISOString()}>
          {formatLocalDate(today, locale)} at{" "}
          {metricAsOfLabel(planned.range, locale)}
        </time>{" "}
        in your time zone.
      </p>
    </>
  );
}

function Insight({
  insightKey,
  title,
  metric,
  empty,
  action,
  today,
  locale,
  weekStart,
  dismissed,
  children,
}: InsightContext & {
  insightKey: InsightKey;
  title: string;
  metric: Metric<unknown>;
  empty: string;
  action: { href: string; label: string };
  children: ReactNode;
}) {
  if (dismissed.has(insightKey)) return null;
  const { start } = insightPeriod(insightKey, today, weekStart);

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted">
          {metricRangeLabel(metric.range, today, locale)}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {metric.hasData ? children : <p>{empty}</p>}
      </div>
      <p className="text-sm text-pretty text-muted">{metric.definition}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={action.href}
          className={cx("text-sm font-medium", linkStyle)}
        >
          {action.label}
        </Link>
        <DismissInsightButton
          insightKey={insightKey}
          start={start}
          title={title}
        />
      </div>
    </li>
  );
}

function WeekTable({
  valueLabel,
  children,
}: {
  valueLabel: string;
  children: ReactNode;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border text-muted">
        <tr>
          <th scope="col" className="py-2 pe-3 text-start font-medium">
            Week
          </th>
          <th scope="col" className="py-2 text-end font-medium">
            {valueLabel}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">{children}</tbody>
    </table>
  );
}

function WeekRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row" className="py-2 pe-3 text-start font-normal">
        {label}
      </th>
      <td className="py-2 text-end tabular-nums">{children}</td>
    </tr>
  );
}
