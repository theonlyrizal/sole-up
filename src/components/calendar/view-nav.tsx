import Link from "next/link";

import { cx, focusRing } from "@/components/ui/cx";
import { agendaHref, DEFAULT_AGENDA_DAYS } from "@/lib/agenda";
import {
  DEFAULT_TIMELINE_SPAN,
  timelineHref,
  type TimelineSpan,
} from "@/lib/area-timeline";
import {
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEWS,
  type CalendarView,
  gridHref,
  type GridRange,
  shiftGridDate,
} from "@/lib/calendar-views";
import type { LocalDate } from "@/lib/dates";

/** The calendar page's pill links (views, ranges and moves). */
export const pillClass = (current: boolean) =>
  cx(
    "inline-flex rounded-md border px-3 py-1.5 text-sm",
    current
      ? "border-accent font-medium text-fg"
      : "border-border text-muted hover:text-fg",
    focusRing,
  );

/**
 * Agenda, Week, Day, By area and Timeline. Switching keeps the day the user
 * is looking at: the Agenda starts on it, Week and the Timeline hold it,
 * Day and By area show it. The Timeline spans a day when coming from Day
 * or By area, else a week. Week is not offered on phone widths, where Day
 * stands in for it.
 */
export function ViewNav({
  current,
  date,
  today,
  timelineSpan,
}: {
  current: CalendarView;
  /** The day to carry over to the other views. */
  date: LocalDate;
  today: LocalDate;
  /** The Timeline's span while it is the current view. */
  timelineSpan?: TimelineSpan;
}) {
  const span =
    timelineSpan ??
    (current === "day" || current === "areas" ? "day" : DEFAULT_TIMELINE_SPAN);
  const href = (view: CalendarView) =>
    view === "agenda"
      ? agendaHref({ start: date, days: DEFAULT_AGENDA_DAYS }, today)
      : view === "timeline"
        ? timelineHref(span, date, today)
        : gridHref(view, date, today);
  return (
    <nav aria-label="Calendar view">
      <ul className="flex flex-wrap gap-1">
        {CALENDAR_VIEWS.map((view) => (
          <li key={view} className={view === "week" ? "max-md:hidden" : ""}>
            <Link
              href={href(view)}
              aria-current={view === current ? "page" : undefined}
              className={pillClass(view === current)}
            >
              {CALENDAR_VIEW_LABELS[view]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Previous, Today and Next, a week or a day at a time, as links (so the
 * range is kept in the URL).
 */
export function MoveNav({
  unit,
  previousHref,
  todayHref,
  nextHref,
  atToday,
}: {
  unit: "week" | "day";
  previousHref: string;
  todayHref: string;
  nextHref: string;
  /** The range shown is anchored on today. */
  atToday: boolean;
}) {
  return (
    <nav aria-label="Move through the calendar">
      <ul className="flex flex-wrap gap-1">
        <li>
          <Link href={previousHref} className={pillClass(false)}>
            Previous {unit}
          </Link>
        </li>
        <li>
          <Link
            href={todayHref}
            aria-current={atToday ? "page" : undefined}
            className={pillClass(atToday)}
          >
            Today
          </Link>
        </li>
        <li>
          <Link href={nextHref} className={pillClass(false)}>
            Next {unit}
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** `MoveNav` for a grid view (Week, Day, By area). */
export function GridMoveNav({
  range,
  today,
}: {
  range: GridRange;
  today: LocalDate;
}) {
  return (
    <MoveNav
      unit={range.view === "week" ? "week" : "day"}
      previousHref={gridHref(range.view, shiftGridDate(range, -1), today)}
      todayHref={gridHref(range.view, today, today)}
      nextHref={gridHref(range.view, shiftGridDate(range, 1), today)}
      atToday={range.date === today}
    />
  );
}
