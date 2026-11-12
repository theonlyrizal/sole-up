import Link from "next/link";
import { Carousel } from "@/components/data/carousel";
import { MetricCard, type MetricContext } from "@/components/data/metric-card";
import { SegmentedPillBar } from "@/components/data/segmented-pill-bar";
import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx, focusRing } from "@/components/ui/cx";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { formatConsistency } from "@/lib/habits/consistency";
import {
  TRACK_RANGE_LABELS,
  trackHabitAnchor,
  weekProgressFigure,
} from "@/lib/habits/track-range";
import type { HabitSummaryItem } from "@/server/modules/metrics/home";
import type { Metric } from "@/server/modules/metrics/metric";

export function HabitCarousel({
  metric,
  ...context
}: MetricContext & { metric: Metric<HabitSummaryItem[]> }) {
  return (
    <MetricCard
      id="home-habits"
      title="Your habits this week"
      plain={metric.hasData}
      metric={metric}
      empty={{
        description:
          "Once you track an active habit, each one shows here with how it's going. There's no combined number.",
        link: { href: "/track", label: "Add a habit" },
      }}
      headerAction={
        metric.hasData && (
          <Link href="/track" className={buttonClass({ variant: "text" })}>
            View all <Icon name="chevron_right" size={18} />
          </Link>
        )
      }
      {...context}
    >
      <Carousel label="Active habits">
        {metric.value.map((habit) => {
          const { id, title, thisWeek, cadenceType, measure, consistency } =
            habit;
          const figure = weekProgressFigure(thisWeek, cadenceType, measure);
          return (
            <li key={id}>
              <Card as="article" className="grid h-full content-start gap-2">
                <ShapeAvatar id={id} entityType="habit" label={title} />
                <h3 className="text-title-medium wrap-anywhere">
                  <Link
                    href={`/track#${trackHabitAnchor(id)}`}
                    className={cx(
                      "flex min-h-12 w-fit items-center rounded-sm hover:underline",
                      focusRing,
                    )}
                  >
                    <span className="line-clamp-2">{title}</span>
                  </Link>
                </h3>
                <SegmentedPillBar
                  value={thisWeek.done}
                  total={thisWeek.target}
                  label={figure}
                  max={12}
                />
                <p className="text-body-medium font-medium">{figure}</p>
                <p className="text-body-small text-on-surface-variant">
                  {TRACK_RANGE_LABELS["4w"]}:{" "}
                  {formatConsistency(consistency, cadenceType, measure)}
                </p>
              </Card>
            </li>
          );
        })}
      </Carousel>
    </MetricCard>
  );
}
