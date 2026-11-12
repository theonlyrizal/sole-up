import Link from "next/link";
import { MetricCard, type MetricContext } from "@/components/data/metric-card";
import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cx, focusRing } from "@/components/ui/cx";
import { agendaEntryKind } from "@/lib/agenda";
import { calendarItemHref } from "@/lib/calendar-views";
import {
  commitmentWhenLabel,
  isCommitmentUnderWay,
  type ScheduleEntry,
} from "@/lib/schedule";
import type { Metric } from "@/server/modules/metrics/metric";

const calendarLink = { href: "/plan/calendar", label: "Add an event" };
const noCommitment = "Nothing coming up in the next 30 days.";

export function NextCommitmentCard({
  metric,
  timeZone,
  ...context
}: MetricContext & {
  metric: Metric<ScheduleEntry | null>;
  timeZone: string;
}) {
  const entry = metric.value;
  const href = entry && calendarItemHref(entry, context.todayDate, timeZone);
  const now = metric.range.asOf;

  return (
    <MetricCard
      id="home-next"
      title="Next commitment"
      icon={entry ? "schedule" : undefined}
      metric={metric}
      feature={entry !== null}
      plain={entry === null}
      rangeInHeader={entry !== null}
      empty={{
        description:
          "Events and time blocks you add to the calendar show here, starting with the next one.",
        link: calendarLink,
      }}
      {...context}
    >
      {entry && href ? (
        <div className="grid gap-1">
          <Link
            href={href}
            className={cx(
              "w-fit rounded-sm text-headline-small-emphasized wrap-anywhere hover:underline",
              focusRing,
            )}
          >
            {entry.title}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-title-medium tabular-nums">
              {commitmentWhenLabel(
                entry,
                now,
                context.todayDate,
                context.locale,
                timeZone,
              )}
            </p>
            {isCommitmentUnderWay(entry, now) && (
              <Chip
                type="status"
                label="Now"
                className="bg-tertiary! text-on-tertiary!"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={href}
              className={buttonClass({
                variant: "filled",
                trailingIcon: "chevron_right",
              })}
            >
              Open in calendar <Icon name="chevron_right" size={20} />
            </Link>
            <Chip type="status" label={agendaEntryKind(entry)} />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="text-body-medium text-on-surface-variant">
            {noCommitment}
          </p>
          <Link
            href={calendarLink.href}
            className={buttonClass({ variant: "text" })}
          >
            {calendarLink.label}
          </Link>
        </div>
      )}
    </MetricCard>
  );
}
