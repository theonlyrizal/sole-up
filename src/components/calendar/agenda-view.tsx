"use client";

import { useMemo } from "react";

import { useRefreshOnNewDay } from "@/components/tasks/use-refresh-on-new-day";
import { DateBadge } from "@/components/data/date-badge";
import { Chip } from "@/components/ui/chip";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
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
import { blockStatusLabel } from "@/lib/block-form";
import type { CalendarEventOccurrence } from "@/lib/calendar-events";
import { calendarDayLabel } from "@/lib/calendar-list";
import {
  addDays,
  formatTimeOfDay,
  type LocalDate,
  localDateOf,
  type WeekStart,
} from "@/lib/dates";
import { timeRangeLabel } from "@/lib/event-form";
import { PRIORITY_LABELS } from "@/lib/priorities";
import { describeRecurrence } from "@/lib/recurrence-rules";
import type { TimeBlockOccurrence } from "@/lib/time-blocks";
import type { PlanTaskItem } from "@/server/modules/tasks/queries";

import type { BlockableTask } from "./block-form";
import { CalendarActions } from "./calendar-actions";
import type { EventFormContext } from "./event-dialog";
import {
  Calendar,
  type CalendarFeedItem,
  type CalendarItemSegment,
} from "./full-calendar";
import { type CalendarEntry, ItemDialog, useItemDialog } from "./item-dialog";
import { CalendarHeader } from "./view-nav";

type Entry = CalendarEntry;

type AgendaViewProps = EventFormContext & {
  entries: Entry[];
  range: AgendaRange;
  tasks: BlockableTask[];
  weekStart: WeekStart;
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
  tasks,
  weekStart,
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
        // Forest for events, Kiwi ink for time blocks, neutral for deadlines.
        color:
          entry.kind === "event"
            ? "var(--md-primary)"
            : entry.kind === "block"
              ? "var(--md-secondary-ink)"
              : "var(--md-on-surface-variant)",
        data: entry,
      })),
    [entries],
  );
  const rangeLabel = agendaRangeLabel(range, context.locale);

  return (
    <div className="flex flex-col gap-6">
      <CalendarHeader
        current="agenda"
        date={range.start}
        today={today}
        locale={context.locale}
        weekStart={weekStart}
        dateLabel={rangeLabel}
        end={addDays(agendaEnd(range), -1)}
        dateHref={(start) => agendaHref({ ...range, start }, today)}
        move={{
          label: "Move through the agenda",
          previousLabel: `Previous ${range.days} days`,
          nextLabel: `Next ${range.days} days`,
          todayLabel: "From today",
          previousHref: agendaHref(shiftAgendaRange(range, -1), today),
          todayHref: agendaHref({ ...range, start: today }, today),
          nextHref: agendaHref(shiftAgendaRange(range, 1), today),
          atToday: range.start === today,
        }}
        actions={<CalendarActions context={context} tasks={tasks} />}
        rangeControl={<DayCountNav range={range} today={today} />}
      />
      <div ref={containerRef}>
        <Calendar
          view="agenda"
          range={{ start: range.start, end: agendaEnd(range) }}
          timeZone={context.userTimeZone}
          items={items}
          label={`Agenda, ${rangeLabel}`}
          renderDayHeader={(date) => (
            <h2 className="flex items-center gap-3 text-title-medium">
              <DateBadge
                date={date}
                today={today}
                locale={context.locale}
                label={calendarDayLabel(date, today, context.locale)}
                relative={date === today ? "Today" : undefined}
              />
              <span aria-hidden="true" className="hidden medium:inline">
                {new Date(`${date}T12:00:00Z`).toLocaleDateString(
                  context.locale,
                  { weekday: "long", timeZone: "UTC" },
                )}
              </span>
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

function DayCountNav({
  range,
  today,
}: {
  range: AgendaRange;
  today: LocalDate;
}) {
  return (
    <ConnectedButtonGroup
      label="Days to show"
      compactLabels
      value={String(range.days)}
      items={AGENDA_DAY_COUNTS.map((days) => ({
        value: String(days),
        label: AGENDA_DAY_COUNT_LABELS[days],
        href: agendaHref({ ...range, days }, today),
      }))}
    />
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
      : entry.kind === "block"
        ? blockDetails(entry.block, context)
        : taskDetails(entry.task);
  return (
    <div className="grid w-full min-w-0 items-start gap-1 p-2 medium:grid-cols-[10rem_minmax(0,1fr)] medium:gap-3">
      <p className="px-2 pt-1 text-label-large text-on-surface-variant tabular-nums">
        {timeLabel(entry, segment, context)}
      </p>
      <div
        data-kind={entry.kind}
        className="calendar-agenda-card relative flex min-w-0 flex-wrap items-start justify-between gap-x-3 rounded-sm py-1 ps-3 pe-2"
      >
        <h3 className="min-w-0 flex-1 text-label-large">
          <button
            type="button"
            data-agenda-item=""
            onClick={(click) => onOpen(click.currentTarget)}
            className={cx(
              "stretched-link min-h-12 cursor-pointer rounded-sm text-left wrap-anywhere hover:underline",
              focusRing,
            )}
          >
            {entry.title}
          </button>
        </h3>
        <Chip type="status" label={agendaEntryKind(entry)} className="my-2" />
        {details.length > 0 && (
          <div className="w-full pb-2 text-body-small wrap-anywhere">
            {details.map((detail) => (
              <p key={detail}>{detail}</p>
            ))}
          </div>
        )}
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
  if (entry.kind === "event" && entry.event.allDay) return "All day";
  const timed = entry.kind === "block" ? entry.block : entry.event;
  if (!timed.startAt || !timed.endAt) return "All day";
  if (isStart && isEnd)
    return timeRangeLabel(timed.startAt, timed.endAt, locale, userTimeZone);
  if (isStart)
    return `From ${formatTimeOfDay(timed.startAt, locale, userTimeZone)}`;
  if (isEnd)
    return `Until ${formatTimeOfDay(timed.endAt, locale, userTimeZone)}`;
  return "All day";
}

/** A block's status ("Not marked" once past) and its repeat. */
function blockDetails(
  block: TimeBlockOccurrence,
  { locale }: EventFormContext,
): string[] {
  return [
    blockStatusLabel(block, new Date()),
    block.rrule &&
      `${describeRecurrence(block.rrule, {
        start: localDateOf(block.startAt, block.tz),
        locale,
      })}${block.modified ? " (this one changed)" : ""}`,
    block.taskStatus === "completed" && "Task completed",
  ].filter((detail): detail is string => Boolean(detail));
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
