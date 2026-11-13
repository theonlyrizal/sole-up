"use client";

import Link from "next/link";
import { useId } from "react";

import { DateBadge } from "@/components/data/date-badge";
import { buttonClass } from "@/components/ui/button";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addDays,
  formatLocalDate,
  formatTimeOfDay,
  type LocalDate,
} from "@/lib/dates";
import { ListGroup } from "@/components/ui/list";
import {
  longerUpcomingRange,
  type UpcomingDay,
  upcomingDayLabel,
  upcomingEmptyTitle,
  upcomingEntryDetails,
  upcomingHref,
  type UpcomingRange,
  UPCOMING_RANGES,
} from "@/lib/upcoming";
import type { PlanTaskItem } from "@/server/modules/tasks/queries";

import { TaskListRow, TaskListScope } from "./plan-task-list";
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
      <div className="grid min-w-0 gap-2">
        <ConnectedButtonGroup
          label="Days to show"
          value={String(range)}
          items={UPCOMING_RANGES.map((option) => ({
            value: String(option),
            label: `${option} days`,
            href: upcomingHref(option),
          }))}
        />
        <p
          id="upcoming-date-range"
          tabIndex={-1}
          className="text-body-medium text-on-surface-variant"
        >
          {formatLocalDate(addDays(today, 1), locale)} –{" "}
          {formatLocalDate(addDays(today, range), locale)}
        </p>
      </div>
      <TaskListScope
        locale={locale}
        timeZone={timeZone}
        fallbackId="upcoming-date-range"
      >
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
      </TaskListScope>
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
  const relative = day.date === addDays(today, 1) ? "Tomorrow" : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className="grid min-w-0 gap-3 medium:grid-cols-[auto_minmax(0,1fr)] medium:gap-4"
    >
      <h2 id={headingId}>
        <DateBadge
          date={day.date}
          today={today}
          locale={locale}
          label={label}
          relative={relative}
        />
      </h2>
      <ListGroup label={label}>
        {day.entries.map((entry) => {
          const [, ...context] = upcomingEntryDetails(entry, locale, timeZone);
          const due = entry.task.dueAt
            ? `Due ${formatTimeOfDay(entry.task.dueAt, locale, timeZone)}`
            : "Due";
          return (
            <TaskListRow
              key={entry.task.id}
              task={entry.task}
              details={
                <>
                  {entry.planned && (
                    <Chip type="status" label="Planned" tone="active" />
                  )}
                  {entry.due && <Chip type="status" label={due} />}
                  {context.map((detail) => (
                    <span key={detail}>{detail}</span>
                  ))}
                </>
              }
            />
          );
        })}
      </ListGroup>
    </section>
  );
}
