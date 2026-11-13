import Link from "next/link";
import { useId } from "react";

import { Icon } from "@/components/icons/icon";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { cx, focusRing } from "@/components/ui/cx";
import { agendaEntryKind } from "@/lib/agenda";
import { blockStatusLabel } from "@/lib/block-form";
import { calendarItemHref } from "@/lib/calendar-views";
import type { LocalDate } from "@/lib/dates";
import {
  endInstant,
  isCommitmentUnderWay,
  type ScheduleEntry,
  timelineTimeLabel,
} from "@/lib/schedule";

export const TODAY_SCHEDULE_ANCHOR = "today-schedule";

export function Timeline({
  entries,
  today,
  now,
  locale,
  timeZone,
}: {
  entries: ScheduleEntry[];
  today: LocalDate;
  now: Date;
  locale: string;
  timeZone: string;
}) {
  const heading = useId();
  const allDay = entries.filter((entry) => entry.allDay);
  const timed = entries.filter((entry) => !entry.allDay);
  return (
    <div id={TODAY_SCHEDULE_ANCHOR} className="scroll-mt-20 medium:scroll-mt-4">
      <Card headingId={heading} className="grid gap-3">
        <h2 id={heading} className="text-title-medium">
          Schedule
        </h2>
        {entries.length === 0 && (
          <p className="text-body-medium text-on-surface-variant">
            No events or time blocks today.
          </p>
        )}
        {allDay.length > 0 && (
          <ul aria-label="All day" className="flex flex-wrap gap-2">
            {allDay.map((entry) => (
              <li key={entry.id} className="min-w-0">
                <Chip
                  type="assist"
                  icon="event"
                  label={`All day: ${entry.title}`}
                  href={calendarItemHref(entry, today, timeZone)}
                />
              </li>
            ))}
          </ul>
        )}
        {timed.length > 0 && (
          <ol aria-label="Schedule" className="grid gap-1">
            {timed.map((entry) => {
              const active =
                isCommitmentUnderWay(entry, now) &&
                endInstant(entry, timeZone) > now.getTime();
              return (
                <li
                  key={entry.id}
                  className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 before:absolute before:inset-y-0 before:start-1.5 before:w-px before:bg-outline-variant first:before:top-5 last:before:h-5"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "relative mt-4 size-3 rounded-full",
                      active
                        ? "border-2 border-feature-ink bg-resting-surface"
                        : entry.kind === "block"
                          ? "bg-secondary-ink"
                          : "bg-primary",
                    )}
                  />
                  <Link
                    href={calendarItemHref(entry, today, timeZone)}
                    aria-label={entry.title}
                    className={cx(
                      "group grid min-h-12 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-xs py-2",
                      focusRing,
                    )}
                  >
                    <div className="grid min-w-0 gap-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-label-large text-on-surface-variant tabular-nums">
                          {timelineTimeLabel(entry, today, locale, timeZone)}
                        </span>
                        {active && (
                          <span className="rounded-sm bg-tertiary px-2 py-0.5 text-label-small text-on-tertiary">
                            Now
                          </span>
                        )}
                      </div>
                      <span className="text-body-large-emphasized wrap-anywhere text-primary group-hover:underline">
                        {entry.title}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-body-small text-on-surface-variant">
                        <Chip
                          type="status"
                          label={
                            entry.kind === "block"
                              ? `${agendaEntryKind(entry)} · ${blockStatusLabel(entry.block, now)}`
                              : agendaEntryKind(entry)
                          }
                        />
                      </div>
                    </div>
                    <Icon name="chevron_right" className="text-primary" />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
