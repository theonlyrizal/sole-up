import Link from "next/link";
import { MetricCard, type MetricContext } from "@/components/data/metric-card";
import { StatNumber } from "@/components/data/stat-number";
import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  TODAY_SECTION_LABELS,
  todaySectionAnchor,
  type TodaySection,
} from "@/lib/today";
import type { TodayTaskCounts } from "@/server/modules/metrics/home";
import type { Metric } from "@/server/modules/metrics/metric";

function sectionHref(section: TodaySection) {
  return `/plan/today#${todaySectionAnchor(section)}`;
}

export function TodayCard({
  metric,
  feature,
  ...context
}: MetricContext & { metric: Metric<TodayTaskCounts>; feature: boolean }) {
  return (
    <MetricCard
      id="home-today"
      title="Today"
      icon="checklist"
      metric={metric}
      feature={feature}
      empty={{
        description:
          "Tasks you plan for today, or that fall due, are counted here. Use Add task to capture one.",
      }}
      {...context}
    >
      <StatNumber
        value={metric.value.planned}
        unit={TODAY_SECTION_LABELS.planned.toLowerCase()}
        href={sectionHref("planned")}
        feature={feature}
      />
      <div className="flex flex-wrap items-center gap-2">
        {(["due", "decide"] as const).map((section) => (
          <Chip
            key={section}
            type="metric"
            count={metric.value[section]}
            label={TODAY_SECTION_LABELS[section].toLowerCase()}
            href={sectionHref(section)}
          />
        ))}
        <Link
          href="/plan/today"
          className={buttonClass({
            variant: "text",
            className: "medium:ms-auto",
          })}
        >
          Open Today <Icon name="chevron_right" size={20} />
        </Link>
      </div>
    </MetricCard>
  );
}
