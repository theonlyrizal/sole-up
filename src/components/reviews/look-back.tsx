import { MetricCard } from "@/components/data/metric-card";
import { SplitStat } from "@/components/data/split-stat";
import { StatNumber } from "@/components/data/stat-number";
import { ListGroup, ListItem } from "@/components/ui/list";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import type { LocalDate } from "@/lib/dates";
import type { WeeklySummary } from "@/server/modules/metrics/review";

export function LookBack({
  summary,
  today,
  locale,
}: {
  summary: WeeklySummary;
  today: LocalDate;
  locale: string;
}) {
  const {
    tasksCompleted,
    plannedVersusCompleted,
    rescheduled,
    goalsWithoutActivity,
    habits,
    deadlinesNextPeriod,
  } = summary;
  const { planned, completed } = plannedVersusCompleted.value;
  const context = {
    todayDate: today,
    locale,
    headingLevel: 3 as const,
    rangeInHeader: true,
  };
  return (
    <ul
      aria-label="Summary of the week"
      className="grid min-w-0 gap-3 large:grid-cols-2"
    >
      <li className="grid min-w-0">
        <MetricCard
          id="review-completed"
          title="Tasks completed"
          metric={tasksCompleted}
          empty={{ description: "There is no task history to count." }}
          {...context}
        >
          <StatNumber
            value={tasksCompleted.value}
            unit={tasksCompleted.value === 1 ? "task" : "tasks"}
          />
        </MetricCard>
      </li>
      <li className="grid min-w-0">
        <MetricCard
          id="review-planned"
          title="Planned vs completed"
          metric={plannedVersusCompleted}
          empty={{ description: "There is no task history to count." }}
          {...context}
        >
          <SplitStat
            figures={[
              { value: planned, label: "Planned" },
              { value: completed, label: "Completed" },
            ]}
          />
        </MetricCard>
      </li>
      <li className="grid min-w-0">
        <MetricCard
          id="review-rescheduled"
          title="Rescheduled"
          metric={rescheduled}
          empty={{ description: "There is no task history to count." }}
          {...context}
        >
          <StatNumber
            value={rescheduled.value}
            unit={rescheduled.value === 1 ? "task" : "tasks"}
          />
        </MetricCard>
      </li>
      <li className="grid min-w-0">
        <MetricCard
          id="review-goals"
          title="Goals without activity"
          metric={goalsWithoutActivity}
          empty={{ description: "There are no active goals to count." }}
          {...context}
        >
          <StatNumber
            value={goalsWithoutActivity.value}
            unit={goalsWithoutActivity.value === 1 ? "goal" : "goals"}
          />
        </MetricCard>
      </li>
      <li className="grid min-w-0">
        <MetricCard
          id="review-habits"
          title="Habits"
          metric={habits}
          empty={{
            description:
              habits.value === null
                ? "Not available for this week."
                : "No habit was part of this week.",
          }}
          {...context}
        >
          <ListGroup label="Habit figures">
            {habits.value?.map((habit) => (
              <ListItem
                key={habit.id}
                className="px-0!"
                wrapActions
                wrapSupporting
                leading={
                  <ShapeAvatar
                    id={habit.id}
                    entityType="habit"
                    label={habit.title}
                    size={40}
                  />
                }
                headline={habit.title}
                supporting={habit.status === "paused" ? "Paused" : undefined}
                trailing={
                  <span className="text-label-large text-on-surface-variant">
                    {habit.figure}
                  </span>
                }
              />
            ))}
          </ListGroup>
        </MetricCard>
      </li>
      <li className="grid min-w-0">
        <MetricCard
          id="review-deadlines"
          title="Deadlines the following week"
          metric={deadlinesNextPeriod}
          empty={{ description: "There are no task deadlines to count." }}
          {...context}
        >
          <StatNumber
            value={deadlinesNextPeriod.value}
            unit={deadlinesNextPeriod.value === 1 ? "deadline" : "deadlines"}
          />
        </MetricCard>
      </li>
    </ul>
  );
}
