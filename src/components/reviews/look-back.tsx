import {
  metricAsOfLabel,
  metricRangeLabel,
} from "@/components/home/metric-range";
import type { LocalDate } from "@/lib/dates";
import type { Metric } from "@/server/modules/metrics/metric";
import type { WeeklySummary } from "@/server/modules/metrics/review";

// Look back (chunk 7.3): the week's summary from 7.1, each figure with its
// definition and the days it covers. Computed when the page loads, never
// stored. A metric with nothing to look at says "Nothing yet" rather than
// a zero, and there is no overall score.

type LookBackProps = {
  summary: WeeklySummary;
  today: LocalDate;
  locale: string;
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export function LookBack({ summary, today, locale }: LookBackProps) {
  const {
    tasksCompleted,
    plannedVersusCompleted,
    rescheduled,
    goalsWithoutActivity,
    habits,
    deadlinesNextPeriod,
  } = summary;
  const planned = plannedVersusCompleted.value;
  const context = { today, locale };
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Summary of the week" className="flex flex-col gap-3">
        <SummaryItem
          title="Tasks completed"
          metric={tasksCompleted}
          {...context}
        >
          {plural(tasksCompleted.value, "task", "tasks")}
        </SummaryItem>
        <SummaryItem
          title="Planned versus completed"
          metric={plannedVersusCompleted}
          {...context}
        >
          {planned.completed} of{" "}
          {plural(planned.planned, "planned task", "planned tasks")} completed
        </SummaryItem>
        <SummaryItem title="Rescheduled" metric={rescheduled} {...context}>
          {plural(rescheduled.value, "task", "tasks")}
        </SummaryItem>
        <SummaryItem
          title="Goals with no activity"
          metric={goalsWithoutActivity}
          {...context}
        >
          {plural(goalsWithoutActivity.value, "goal", "goals")}
        </SummaryItem>
        <SummaryItem
          title="Habits"
          metric={habits}
          // A week that doesn't start on the week start can't be counted;
          // its definition says so, with no figures.
          nothing={
            habits.value === null ? "Not available for this week" : undefined
          }
          {...context}
        >
          {habits.value && habits.value.length > 0 ? (
            <ul className="flex flex-col gap-1 text-base font-normal">
              {habits.value.map((habit) => (
                <li key={habit.id}>
                  <span className="font-medium">{habit.title}</span>
                  {habit.status === "paused" && " (paused)"}: {habit.figure}
                </li>
              ))}
            </ul>
          ) : (
            "No habit was part of this week"
          )}
        </SummaryItem>
        <SummaryItem
          title="Deadlines the following week"
          metric={deadlinesNextPeriod}
          {...context}
        >
          {plural(deadlinesNextPeriod.value, "deadline", "deadlines")}
        </SummaryItem>
      </ul>
      <p className="text-sm text-muted">
        As of{" "}
        <time dateTime={tasksCompleted.range.asOf.toISOString()}>
          {metricAsOfLabel(tasksCompleted.range, locale)}
        </time>
        . These are worked out from your records each time you look.
      </p>
    </div>
  );
}

function SummaryItem({
  title,
  metric,
  nothing,
  today,
  locale,
  children,
}: {
  title: string;
  metric: Metric<unknown>;
  /** Shown instead of the value; "Nothing yet" when the metric has no data. */
  nothing?: string;
  today: LocalDate;
  locale: string;
  children: React.ReactNode;
}) {
  const empty = nothing ?? (metric.hasData ? null : "Nothing yet");
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-muted">{title}</h3>
      <div className="text-lg font-semibold">{empty ?? children}</div>
      <p className="text-sm text-muted">{metric.definition}</p>
      <p className="text-sm text-muted">
        Range: {metricRangeLabel(metric.range, today, locale)}
      </p>
    </li>
  );
}
