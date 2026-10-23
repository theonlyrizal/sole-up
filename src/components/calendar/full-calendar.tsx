"use client";

import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "./calendar-theme.css";

import FullCalendar from "@fullcalendar/react";
import listPlugin from "@fullcalendar/react/list";
import classicTheme from "@fullcalendar/react/themes/classic";
import { useMemo, useSyncExternalStore } from "react";

import { LoadingState } from "@/components/ui/skeleton";
import { type LocalDate, localDateOf } from "@/lib/dates";

// The app's one FullCalendar component (ADR 0012). FullCalendar only
// renders: the server expands repeating events and decides what each view
// holds, and our own dialogs own create and edit. Colours come from the
// app's tokens (calendar-theme.css), so light and dark follow the app.
//
// It renders in the browser only: FullCalendar formats labels with Intl and
// reads the clock for "today", and the server's Node and the browser can
// disagree on both (a hydration mismatch). The page's data still comes
// from the server; only this component waits for hydration.

/**
 * One item of an already-expanded feed. `start`/`end` are ISO instants for
 * timed items and local dates for all-day ones (end exclusive); `order`
 * breaks ties between items with the same start.
 */
export type CalendarFeedItem<Data> = {
  id: string;
  title: string;
  allDay: boolean;
  start: string;
  end: string | null;
  order: number;
  /** The item's marker colour, a CSS colour such as `var(--accent)`. */
  color?: string;
  data: Data;
};

/** Where an item's row sits within a multi-day item. */
export type CalendarItemSegment = { isStart: boolean; isEnd: boolean };

type CalendarProps<Data> = {
  /** Only the Agenda (list) view exists so far; Week and Day come in 4.6. */
  view: "agenda";
  /** The local days to show, `end` exclusive. */
  range: { start: LocalDate; end: LocalDate };
  /** The user's saved zone: items sit on their local days in it. */
  timeZone: string;
  items: CalendarFeedItem<Data>[];
  /** An item's row. Interactive content (a button) belongs here. */
  renderItem: (data: Data, segment: CalendarItemSegment) => React.ReactNode;
  /** A day's heading. */
  renderDayHeader: (date: LocalDate) => React.ReactNode;
  /** Shown when the range has no items. */
  empty: React.ReactNode;
  /** What the calendar shows, for its loading state ("Agenda, …"). */
  label: string;
};

const noSubscription = () => () => {};

export function Calendar<Data>({
  range,
  timeZone,
  items,
  renderItem,
  renderDayHeader,
  empty,
  label,
}: CalendarProps<Data>) {
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const events = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        title: item.title,
        allDay: item.allDay,
        start: item.start,
        end: item.end ?? undefined,
        color: item.color,
        extendedProps: { data: item.data, order: item.order },
      })),
    [items],
  );

  if (!inBrowser) return <LoadingState label={`Loading ${label}`} />;
  return (
    <div className="soleup-calendar">
      <FullCalendar
        plugins={[listPlugin, classicTheme]}
        initialView="list"
        initialDate={range.start}
        visibleRange={range}
        timeZone={timeZone}
        headerToolbar={false}
        height="auto"
        events={events}
        // Rows carry their own button, so FullCalendar must not make the
        // row itself a button (a list may only hold list items).
        eventInteractive={false}
        eventOrder="start,-duration,allDay,order,title"
        eventsHint="Items on this day"
        eventContent={(info) =>
          renderItem(info.event.extendedProps.data as Data, {
            isStart: info.isStart,
            isEnd: info.isEnd,
          })
        }
        // A day header has a main label (level 0) and a side one (level
        // 1); renderDayHeader replaces the main one, and the side one
        // would only repeat the date.
        listDayHeaderContent={(info) =>
          info.level === 0
            ? renderDayHeader(localDateOf(info.date, timeZone))
            : null
        }
        noEventsContent={() => empty}
      />
    </div>
  );
}
