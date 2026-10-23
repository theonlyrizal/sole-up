"use client";

import Link from "next/link";
import { useId } from "react";

import { buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import type { LocalDate } from "@/lib/dates";
import { PRIORITY_LABELS } from "@/lib/priorities";
import {
  longerUpcomingRange,
  type UpcomingDay,
  type UpcomingEntry,
  upcomingDayLabel,
  upcomingEmptyTitle,
  upcomingEntryDetails,
  upcomingHref,
  type UpcomingRange,
  UPCOMING_RANGE_LABELS,
  UPCOMING_RANGES,
} from "@/lib/upcoming";
import type { PlanTaskItem } from "@/server/modules/tasks/queries";

import { useRefreshOnNewDay } from "./use-refresh-on-new-day";

type UpcomingViewProps = {
  days: UpcomingDay<PlanTaskItem>[];
  range: UpcomingRange;
  today: LocalDate;
  /** When the user's tomorrow begins (ISO instant). */
  nextDayStartsAt: string;
  locale: string;
  timeZone: string;
};

/**
 * Upcoming (chunk 2.6): the next 7, 14 or 30 days, one section per day that
 * has something planned or due on it. A task planned for one day and due on
 * another shows on both.
 */
export function UpcomingView({
  days,
  range,
  today,
  nextDayStartsAt,
  locale,
  timeZone,
}: UpcomingViewProps) {
  useRefreshOnNewDay(nextDayStartsAt);
  const longer = longerUpcomingRange(range);
  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Days to show">
        <ul className="flex flex-wrap gap-1">
          {UPCOMING_RANGES.map((option) => {
            const current = option === range;
            return (
              <li key={option}>
                <Link
                  href={upcomingHref(option)}
                  aria-current={current ? "page" : undefined}
                  className={cx(
                    "inline-flex rounded-md border px-3 py-1.5 text-sm",
                    current
                      ? "border-accent font-medium text-fg"
                      : "border-border text-muted hover:text-fg",
                    focusRing,
                  )}
                >
                  {UPCOMING_RANGE_LABELS[option]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {days.length === 0 ? (
        <EmptyState
          title={upcomingEmptyTitle(range)}
          description="Tasks you plan for a day, or give a deadline, show here by day. Today's are on Today."
          action={
            longer ? (
              <Link
                href={upcomingHref(longer)}
                className={buttonClass({ variant: "secondary" })}
              >
                Show the next {longer} days
              </Link>
            ) : null
          }
        />
      ) : (
        days.map((day) => (
          <UpcomingDayBlock
            key={day.date}
            day={day}
            today={today}
            locale={locale}
            timeZone={timeZone}
          />
        ))
      )}
    </div>
  );
}

function UpcomingDayBlock({
  day,
  today,
  locale,
  timeZone,
}: {
  day: UpcomingDay<PlanTaskItem>;
  today: LocalDate;
  locale: string;
  timeZone: string;
}) {
  const headingId = useId();
  const label = upcomingDayLabel(day.date, today, locale);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        <time dateTime={day.date}>{label}</time>
      </h2>
      <ul
        aria-label={label}
        className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
      >
        {day.entries.map((entry) => (
          <UpcomingRow
            key={entry.task.id}
            entry={entry}
            locale={locale}
            timeZone={timeZone}
          />
        ))}
      </ul>
    </section>
  );
}

function UpcomingRow({
  entry,
  locale,
  timeZone,
}: {
  entry: UpcomingEntry<PlanTaskItem>;
  locale: string;
  timeZone: string;
}) {
  const { task } = entry;
  return (
    <li className="flex flex-col gap-1 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 font-medium break-words">{task.title}</span>
        {task.priority && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted">
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}
      </div>
      {task.goal && (
        <p className="text-sm break-words text-muted">
          <Link
            href={`/goals/${task.goal.id}`}
            className={cx("rounded-sm hover:underline", focusRing)}
          >
            {task.goal.title}
          </Link>
          {task.milestone && <> › {task.milestone.title}</>}
        </p>
      )}
      <p className="text-sm text-muted">
        {upcomingEntryDetails(entry, locale, timeZone).join(" · ")}
      </p>
    </li>
  );
}
