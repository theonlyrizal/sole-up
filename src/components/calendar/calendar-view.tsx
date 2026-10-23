"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CalendarEventOccurrence } from "@/lib/calendar-events";
import {
  calendarDayLabel,
  type EventDay,
  occurrenceKey,
} from "@/lib/calendar-list";
import {
  addDays,
  formatLocalDate,
  localDateOf,
  type LocalDate,
} from "@/lib/dates";
import { timeRangeLabel } from "@/lib/event-form";
import { describeRecurrence } from "@/lib/recurrence-rules";

import { DeleteEventDialog } from "./delete-event-dialog";
import { type EventFormContext, EventFormDialog } from "./event-dialog";

type CalendarViewProps = EventFormContext & {
  days: EventDay[];
  today: LocalDate;
  /** How many days the list covers, today included. */
  dayCount: number;
};

/**
 * The calendar page until the FullCalendar views (4.5): a plain list of the
 * coming days' events, with the dialog to add, edit and delete them.
 */
export function CalendarView({
  days,
  today,
  dayCount,
  ...context
}: CalendarViewProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          Events from today to{" "}
          {formatLocalDate(addDays(today, dayCount - 1), context.locale)}.
        </p>
        <EventFormDialog {...context} trigger={<Button>New event</Button>} />
      </div>
      {days.length === 0 ? (
        <EmptyState
          title={`No events in the next ${dayCount} days`}
          description="Add appointments, classes and other commitments here to see them next to your tasks."
        />
      ) : (
        days.map((day) => (
          <EventDayBlock
            key={day.date}
            day={day}
            today={today}
            context={context}
          />
        ))
      )}
    </div>
  );
}

function EventDayBlock({
  day,
  today,
  context,
}: {
  day: EventDay;
  today: LocalDate;
  context: EventFormContext;
}) {
  const headingId = useId();
  const label = calendarDayLabel(day.date, today, context.locale);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        <time dateTime={day.date}>{label}</time>
      </h2>
      <ul
        aria-label={label}
        className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
      >
        {day.events.map((event) => (
          <EventRow
            key={occurrenceKey(event)}
            event={event}
            context={context}
          />
        ))}
      </ul>
    </section>
  );
}

function EventRow({
  event,
  context,
}: {
  event: CalendarEventOccurrence;
  context: EventFormContext;
}) {
  const { locale, userTimeZone, options } = context;
  const goal = options.goals.find((option) => option.id === event.goalId);
  const area = options.areas.find((option) => option.id === event.lifeAreaId);
  const details = [
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
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm text-muted">
          {eventTimeLabel(event, locale, userTimeZone)}
        </p>
        <h3 className="font-medium break-words">{event.title}</h3>
        {details.map((detail) => (
          <p key={detail as string} className="text-sm break-words text-muted">
            {detail}
          </p>
        ))}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <EventFormDialog
          {...context}
          event={event}
          trigger={
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Edit: ${event.title}`}
            >
              Edit
            </Button>
          }
        />
        <DeleteEventDialog
          event={event}
          locale={locale}
          timeZone={userTimeZone}
        />
      </div>
    </li>
  );
}

/**
 * "All day", "All day, to Thu, 6 Nov 2026", or the times in the user's zone,
 * with the event's own times when it is in another zone.
 */
function eventTimeLabel(
  event: CalendarEventOccurrence,
  locale: string,
  timeZone: string,
): string {
  if (event.allDay) {
    const last = addDays(event.endDate, -1);
    return last === event.startDate
      ? "All day"
      : `All day, to ${formatLocalDate(last, locale)}`;
  }
  const yours = timeRangeLabel(event.startAt, event.endAt, locale, timeZone);
  if (event.tz === timeZone) return yours;
  const theirs = timeRangeLabel(event.startAt, event.endAt, locale, event.tz);
  return `${yours} (${theirs} ${event.tz})`;
}
