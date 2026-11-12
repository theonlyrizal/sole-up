import Link from "next/link";
import type { ReactNode } from "react";
import {
  metricAsOfLabel,
  metricRangeLabel,
} from "@/components/home/metric-range";
import type { IconName } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import type { LocalDate } from "@/lib/dates";
import type { Metric } from "@/server/modules/metrics/metric";
import { MetricInfo } from "./metric-info";

export type MetricContext = { todayDate: LocalDate; locale: string };

export function MetricCard({
  id,
  title,
  icon,
  metric,
  empty,
  todayDate,
  locale,
  children,
  feature,
  plain,
  headerAction,
  rangeInHeader,
}: MetricContext & {
  id: string;
  title: string;
  icon?: IconName;
  metric: Metric<unknown>;
  empty: { description: string; link?: { href: string; label: string } };
  children: ReactNode;
  feature?: boolean;
  plain?: boolean;
  headerAction?: ReactNode;
  rangeInHeader?: boolean;
}) {
  const headingId = `${id}-heading`;
  const range = metricRangeLabel(metric.range, todayDate, locale);
  const caption = (
    <p className={cx("text-body-small", !feature && "text-on-surface-variant")}>
      <span className="sr-only">Range: </span>
      {range}
    </p>
  );
  return (
    <Card
      headingId={headingId}
      variant={feature ? "hero" : "default"}
      className={cx(
        "grid content-start gap-2",
        plain && "bg-transparent! p-0! shadow-none!",
      )}
    >
      <CardHeader
        id={headingId}
        title={title}
        icon={icon}
        supporting={rangeInHeader ? caption : undefined}
        actions={
          <div className="flex items-center">
            {headerAction}
            <MetricInfo
              title={title}
              definition={metric.definition}
              range={range}
              asOf={metric.range.asOf.toISOString()}
              asOfLabel={metricAsOfLabel(metric.range, locale)}
            />
          </div>
        }
      />
      {metric.hasData ? (
        children
      ) : (
        <EmptyState
          compact
          className="p-0!"
          headingLevel={3}
          title="Nothing yet"
          description={empty.description}
          action={
            empty.link && (
              <Link
                href={empty.link.href}
                className={buttonClass({ variant: "tonal" })}
              >
                {empty.link.label}
              </Link>
            )
          }
        />
      )}
      {!rangeInHeader && caption}
    </Card>
  );
}
