import Link from "next/link";
import { MetricCard, type MetricContext } from "@/components/data/metric-card";
import { StatNumber } from "@/components/data/stat-number";
import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import type { Metric } from "@/server/modules/metrics/metric";

const href = "/plan?due=next7";

export function DeadlinesCard({
  metric,
  ...context
}: MetricContext & { metric: Metric<number> }) {
  return (
    <MetricCard
      id="home-deadlines"
      title="Deadlines in the next 7 days"
      icon="calendar_month"
      metric={metric}
      empty={{ description: "Tasks with a due date are counted here." }}
      {...context}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <StatNumber
          value={metric.value}
          unit={metric.value === 1 ? "deadline" : "deadlines"}
          href={href}
        />
        <Link href={href} className={buttonClass({ variant: "text" })}>
          View in Plan <Icon name="chevron_right" size={20} />
        </Link>
      </div>
    </MetricCard>
  );
}
