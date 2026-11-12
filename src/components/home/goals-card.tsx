import { MetricCard, type MetricContext } from "@/components/data/metric-card";
import { StatNumber } from "@/components/data/stat-number";
import { Icon } from "@/components/icons/icon";
import { Disclosure } from "@/components/ui/disclosure";
import { ListGroup, ListItem } from "@/components/ui/list";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import type { GoalWithoutNextAction } from "@/server/modules/metrics/home";
import type { Metric } from "@/server/modules/metrics/metric";

const listId = "goals-without-next-action";
const title = "Goals without a next action";

function GoalList({
  goals,
  label,
}: {
  goals: GoalWithoutNextAction[];
  label: string;
}) {
  return (
    <ListGroup label={label} className="gap-0 divide-y divide-outline-variant">
      {goals.map((goal) => (
        <ListItem
          key={goal.id}
          headline={goal.title}
          href={`/goals/${goal.id}`}
          leading={
            <ShapeAvatar
              id={goal.id}
              entityType="goal"
              label={goal.title}
              size={40}
            />
          }
          trailing={<Icon name="chevron_right" size={20} />}
        />
      ))}
    </ListGroup>
  );
}

export function GoalsCard({
  metric,
  goalList,
  ...context
}: MetricContext & {
  metric: Metric<number>;
  goalList: GoalWithoutNextAction[];
}) {
  return (
    <MetricCard
      id="home-goals"
      title={title}
      icon="flag"
      metric={metric}
      empty={{
        description:
          "Once you have an active goal, this shows the ones with no dated task yet.",
        link: { href: "/goals", label: "Add a goal" },
      }}
      {...context}
    >
      <StatNumber
        value={metric.value}
        unit={metric.value === 1 ? "goal" : "goals"}
        href={`#${listId}`}
      />
      <div id={listId} className="scroll-mt-20">
        {goalList.length ? (
          <>
            <GoalList goals={goalList.slice(0, 3)} label={title} />
            {goalList.length > 3 && (
              <Disclosure title={`View all ${goalList.length}`}>
                <GoalList
                  goals={goalList.slice(3)}
                  label="More goals without a next action"
                />
              </Disclosure>
            )}
          </>
        ) : (
          <p className="text-body-medium text-on-surface-variant">
            Every active goal has a next action.
          </p>
        )}
      </div>
    </MetricCard>
  );
}
