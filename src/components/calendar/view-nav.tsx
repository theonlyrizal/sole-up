"use client";

import Link from "next/link";

import { WeekStrip } from "@/components/data/week-strip";
import { buttonClass } from "@/components/ui/button";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { IconLink } from "@/components/ui/icon-button";
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
import type { LocalDate, WeekStart } from "@/lib/dates";
import { weekDays } from "@/lib/week-strip";

import { DatePicker } from "./date-picker";

/** Switch views on the same anchor date, keeping the existing span defaults. */
function ViewNav({
  current,
  date,
  today,
  timelineSpan,
}: {
  current: CalendarView;
  date: LocalDate;
  today: LocalDate;
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
    <ConnectedButtonGroup
      label="Calendar view"
      value={current}
      compactLabels
      items={CALENDAR_VIEWS.map((view) => ({
        value: view,
        label: CALENDAR_VIEW_LABELS[view],
        href: href(view),
        className: view === "week" ? "max-[48rem]:hidden" : undefined,
      }))}
    />
  );
}

type MoveNavProps = {
  previousLabel: string;
  nextLabel: string;
  todayLabel?: string;
  previousHref: string;
  todayHref: string;
  nextHref: string;
  atToday: boolean;
  label?: string;
};

function MoveNav({
  previousLabel,
  nextLabel,
  todayLabel = "Today",
  previousHref,
  todayHref,
  nextHref,
  atToday,
  label = "Move through the calendar",
}: MoveNavProps) {
  return (
    <nav aria-label={label} className="flex shrink-0 items-center">
      <IconLink icon="chevron_left" label={previousLabel} href={previousHref} />
      <Link
        href={todayHref}
        aria-label={todayLabel}
        aria-current={atToday ? "page" : undefined}
        className={buttonClass({
          variant: atToday ? "tonal" : "outlined",
          size: "xs",
        })}
      >
        Today
      </Link>
      <IconLink icon="chevron_right" label={nextLabel} href={nextHref} />
    </nav>
  );
}

type CalendarHeaderProps = {
  current: CalendarView;
  date: LocalDate;
  today: LocalDate;
  locale: string;
  weekStart: WeekStart;
  dateLabel: string;
  start?: LocalDate;
  end?: LocalDate;
  dateHref: (date: LocalDate) => string;
  move: MoveNavProps;
  timelineSpan?: TimelineSpan;
  actions: React.ReactNode;
  rangeControl?: React.ReactNode;
};

export function CalendarHeader({
  current,
  date,
  today,
  locale,
  weekStart,
  dateLabel,
  start = date,
  end,
  dateHref,
  move,
  timelineSpan,
  actions,
  rangeControl,
}: CalendarHeaderProps) {
  const dates = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year:
      start.slice(0, 4) !== today.slice(0, 4) ||
      (end && end.slice(0, 4) !== today.slice(0, 4))
        ? "numeric"
        : undefined,
    timeZone: "UTC",
  });
  const firstDate = new Date(`${start}T12:00:00Z`);
  // Server and browser ICU versions can use different spaces around the dash.
  const shortLabel = end
    ? dates
        .formatRange(firstDate, new Date(`${end}T12:00:00Z`))
        .replaceAll("\u2009", " ")
    : dates.format(firstDate);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="calendar-toolbar flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="calendar-date-nav flex max-w-full flex-wrap items-center gap-x-1">
          <MoveNav {...move} />
          <DatePicker
            label={dateLabel}
            shortLabel={shortLabel}
            selected={date}
            today={today}
            locale={locale}
            weekStart={weekStart}
            href={dateHref}
          />
        </div>
        <div className="max-w-full min-w-0 max-medium:w-full">
          <ViewNav
            current={current}
            date={date}
            today={today}
            timelineSpan={timelineSpan}
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {actions}
        </div>
        {rangeControl}
      </div>
      {(current === "day" || current === "agenda") && (
        <div className="min-w-0 medium:hidden">
          <WeekStrip
            days={weekDays(date, weekStart, locale).map((day) => ({
              ...day,
              href: dateHref(day.date),
            }))}
            today={today}
            selected={date}
          />
        </div>
      )}
    </div>
  );
}

/** The previous, today and next links for Week, Day and By area. */
export function GridMoveNav(range: GridRange, today: LocalDate): MoveNavProps {
  const unit = range.view === "week" ? "week" : "day";
  return {
    previousLabel: `Previous ${unit}`,
    nextLabel: `Next ${unit}`,
    previousHref: gridHref(range.view, shiftGridDate(range, -1), today),
    todayHref: gridHref(range.view, today, today),
    nextHref: gridHref(range.view, shiftGridDate(range, 1), today),
    atToday: range.date === today,
  };
}
