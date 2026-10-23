"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useRefreshOnNewDay } from "@/components/tasks/use-refresh-on-new-day";
import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AGENDA_DAY_COUNT_LABELS,
  AGENDA_DAY_COUNTS,
  agendaEnd,
  agendaEntryKind,
  agendaHref,
  type AgendaRange,
  agendaRangeLabel,
  shiftAgendaRange,
} from "@/lib/agenda";
import type { CalendarEventOccurrence } from "@/lib/calendar-events";
import { calendarDayLabel } from "@/lib/calendar-list";
import { formatTimeOfDay, type LocalDate, localDateOf } from "@/lib/dates";
import { timeRangeLabel } from "@/lib/event-form";
import { PRIORITY_LABELS } from "@/lib/priorities";
import { describeRecurrence } from "@/lib/recurrence-rules";
import type { PlanTaskItem } from "@/server/modules/tasks/queries";

import { type EventFormContext, EventFormDialog } from "./event-dialog";
import {
  Calendar,
  type CalendarFeedItem,
  type CalendarItemSegment,
} from "./full-calendar";
import { type CalendarEntry, ItemDialog, useItemDialog } from "./item-dialog";
import { pillClass, ViewNav } from "./view-nav";

type Entry = CalendarEntry;

type AgendaViewProps = EventFormContext & {
  entries: Entry[];
  range: AgendaRange;
  today: LocalDate;
  /** When the user's tomorrow begins (ISO instant). */
  nextDayStartsAt: string;
};

/**
 * The Agenda (chunk 4.5): events, planned tasks and timed task deadlines
 * in date order for the chosen days, in the user's zone. Each item's
 * button opens its dialog. The range lives in the URL.
 */
export function AgendaView({
  entries,
  range,
  today,
  nextDayStartsAt,
  ...context
}: AgendaViewProps) {
  useRefreshOnNewDay(nextDayStartsAt);
  const { containerRef, openItem, dialog } =
    useItemDialog("[data-agenda-item]");
  const items = useMemo(
    () =>
      entries.map((entry): CalendarFeedItem<Entry> => ({
        id: entry.id,
        title: entry.title,
        allDay: entry.allDay,
        start: entry.start,
        end: entry.end,
        order: entry.order,
        // Events in the accent colour, tasks in a quieter one.
        color: entry.kind === "event" ? "var(--accent)" : "var(--fg-muted)",
        data: entry,
      })),
    [entries],
  );
  const rangeLabel = agendaRangeLabel(range, context.locale);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewNav current="agenda" date={range.start} today={today} />
        <EventFormDialog {...context} trigger={<Button>New event</Button>} />
      </div>
      <RangeNav range={range} today={today} />
      <DayCountNav range={range} today={today} />
      <p className="text-muted">
        <span className="sr-only">Showing </span>
        {rangeLabel}
      </p>
      <div ref={containerRef}>
        <Calendar
          view="agenda"
          range={{ start: range.start, end: agendaEnd(range) }}
          timeZone={context.userTimeZone}
          items={items}
          label={`Agenda, ${rangeLabel}`}
          renderDayHeader={(date) => (
            <h2 className="text-base font-semibold">
              <time dateTime={date}>
                {calendarDayLabel(date, today, context.locale)}
              </time>
            </h2>
          )}
          renderItem={(entry, segment) => (
            <AgendaItem
              entry={entry}
              segment={segment}
              context={context}
              onOpen={(opener) => openItem(entry, opener)}
            />
          )}
          empty={
            <EmptyState
              title="Nothing in these days"
              description="Events, planned tasks and tasks due at a set time show here by day."
            />
          }
        />
      </div>
      <ItemDialog {...dialog} context={context} />
    </div>
  );
}

function RangeNav({ range, today }: { range: AgendaRange; today: LocalDate }) {
  const isToday = range.start === today;
  return (
    <nav aria-label="Move through the agenda">
      <ul className="flex flex-wrap gap-1">
        <li>
          <Link
            href={agendaHref(shiftAgendaRange(range, -1), today)}
            className={pillClass(false)}
          >
            Previous {range.days} days
          </Link>
        </li>
        <li>
          <Link
            href={agendaHref({ ...range, start: today }, today)}
            aria-current={isToday ? "page" : undefined}
            className={pillClass(isToday)}
          >
            From today
          </Link>
        </li>
        <li>
          <Link
            href={agendaHref(shiftAgendaRange(range, 1), today)}
            className={pillClass(false)}
          >
            Next {range.days} days
          </Link>
        </li>
      </ul>
    </nav>
  );
}

function DayCountNav({
  range,
  today,
}: {
  range: AgendaRange;
  today: LocalDate;
}) {
  return (
    <nav aria-label="Days to show">
      <ul className="flex flex-wrap gap-1">
        {AGENDA_DAY_COUNTS.map((days) => {
          const current = days === range.days;
          return (
            <li key={days}>
              <Link
                href={agendaHref({ ...range, days }, today)}
                aria-current={current ? "page" : undefined}
                className={pillClass(current)}
              >
                {AGENDA_DAY_COUNT_LABELS[days]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AgendaItem({
  entry,
  segment,
  context,
  onOpen,
}: {
  entry: Entry;
  segment: CalendarItemSegment;
  context: EventFormContext;
  /** Opens the item's dialog; `opener` is the item's button. */
  onOpen: (opener: HTMLElement) => void;
}) {
  const details =
    entry.kind === "event"
      ? eventDetails(entry.event, context)
      : taskDetails(entry.task);
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 py-1 sm:flex-row sm:gap-4">
      <p className="shrink-0 text-sm text-muted sm:w-36">
        {timeLabel(entry, segment, context)}
      </p>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="font-medium break-words">
          <button
            type="button"
            data-agenda-item=""
            onClick={(click) => onOpen(click.currentTarget)}
            className={cx(
              "cursor-pointer rounded-sm text-left underline-offset-2 hover:underline",
              focusRing,
            )}
          >
            {entry.title}
          </button>
        </h3>
        <p className="text-sm text-muted">{agendaEntryKind(entry)}</p>
        {details.map((detail) => (
          <p key={detail} className="text-sm break-words text-muted">
            {detail}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * When the row happens on its day, in the user's zone: a timed event's
 * times (or where it starts or ends when it spans days), "All day", or the
 * task's deadline time.
 */
function timeLabel(
  entry: Entry,
  { isStart, isEnd }: CalendarItemSegment,
  { locale, userTimeZone }: EventFormContext,
): string {
  if (entry.kind === "task") {
    return entry.task.dueAt && entry.role !== "planned"
      ? `Due ${formatTimeOfDay(entry.task.dueAt, locale, userTimeZone)}`
      : "Planned";
  }
  const { event } = entry;
  if (event.allDay) return "All day";
  if (isStart && isEnd)
    return timeRangeLabel(event.startAt, event.endAt, locale, userTimeZone);
  if (isStart)
    return `From ${formatTimeOfDay(event.startAt, locale, userTimeZone)}`;
  if (isEnd)
    return `Until ${formatTimeOfDay(event.endAt, locale, userTimeZone)}`;
  return "All day";
}

function eventDetails(
  event: CalendarEventOccurrence,
  { options, locale, userTimeZone }: EventFormContext,
): string[] {
  const goal = options.goals.find((option) => option.id === event.goalId);
  const area = options.areas.find((option) => option.id === event.lifeAreaId);
  return [
    !event.allDay &&
      event.tz !== userTimeZone &&
      `${timeRangeLabel(event.startAt, event.endAt, locale, event.tz, true)} ${event.tz}`,
    event.location,
    event.rrule &&
      `${describeRecurrence(event.rrule, {
        start: event.allDay
          ? event.startDate
          : localDateOf(event.startAt, event.tz),
        locale,
      })}${event.modified ? " (this one changed)" : ""}`,
    goal && `Goal: ${goal.title}`,
    area && `Area: ${area.name}`,
  ].filter((detail): detail is string => Boolean(detail));
}

function taskDetails(task: PlanTaskItem): string[] {
  const parent = task.goal
    ? task.milestone
      ? `${task.goal.title} › ${task.milestone.title}`
      : task.goal.title
    : null;
  return [
    task.priority && PRIORITY_LABELS[task.priority],
    parent && `Goal: ${parent}`,
  ].filter((detail): detail is string => Boolean(detail));
}
