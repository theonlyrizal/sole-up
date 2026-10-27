import Link from "next/link";
import { useId } from "react";

import { cx, focusRing } from "@/components/ui/cx";
import { agendaEntryKind } from "@/lib/agenda";
import { blockStatusLabel } from "@/lib/block-form";
import { calendarItemHref } from "@/lib/calendar-views";
import type { LocalDate } from "@/lib/dates";
import { type ScheduleEntry, timelineTimeLabel } from "@/lib/schedule";

/** The timeline's section ID, so other pages can link to it. */
export const TODAY_SCHEDULE_ANCHOR = "today-schedule";

/**
 * Today's timeline (chunk 4.9): the events and time blocks on the user's
 * today, all-day events first, then by start. Each title links to the item
 * in the calendar's Day view, where its dialog opens. `now` is the server's
 * instant, so a block's "Not marked" is the same on both renders.
 */
export function TodayTimeline({
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
  const headingId = useId();
  return (
    <section
      id={TODAY_SCHEDULE_ANCHOR}
      aria-labelledby={headingId}
      className="flex scroll-mt-4 flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold">
          Schedule
        </h2>
        <p className="text-sm text-muted">
          {entries.length === 0
            ? "No events or time blocks today."
            : "Events and time blocks today, in time order."}
        </p>
      </div>
      {entries.length > 0 && (
        <ol
          aria-label="Schedule"
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="shrink-0 text-sm text-muted tabular-nums sm:w-36">
                {timelineTimeLabel(entry, today, locale, timeZone)}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={calendarItemHref(entry, today, timeZone)}
                  className={cx(
                    "rounded-sm font-medium break-words hover:underline",
                    focusRing,
                  )}
                >
                  {entry.title}
                </Link>
                <span className="text-sm text-muted">
                  {entry.kind === "block"
                    ? `${agendaEntryKind(entry)} · ${blockStatusLabel(entry.block, now)}`
                    : agendaEntryKind(entry)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
