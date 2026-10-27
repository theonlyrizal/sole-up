"use client";

import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "./calendar-theme.css";

import FullCalendar from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import classicTheme from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
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
//
// On the time grids it can also report pointer interactions (chunk 4.8):
// a selected slot, an item dragged to a new time or resized, and something
// dropped on the grid from outside. It changes nothing itself; the page
// saves the change (or reverts it) through its own dialogs and actions,
// each of which also has a keyboard path through a form.

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
  /** The item's colour, a CSS colour such as `var(--accent)`. */
  color?: string;
  /** Its text colour on the time grids, where `color` fills the block. */
  contrastColor?: string;
  /** Extra class names for the item's block on the time grids. */
  className?: string;
  /** Time grids: the item can be dragged to move it and resized. */
  editable?: boolean;
  data: Data;
};

/** An item dragged to a new time or resized on a time grid. */
export type CalendarItemChange<Data> = {
  data: Data;
  /** The new instants FullCalendar shows it at. */
  start: Date;
  end: Date;
  /** Puts the item back where it was. */
  revert: () => void;
};

/** The longest slot that can be selected: a block lasts at most a day. */
const MAX_SELECTION_MS = 24 * 60 * 60 * 1000;

/** Where an item's row sits within a multi-day item. */
export type CalendarItemSegment = { isStart: boolean; isEnd: boolean };

/**
 * What each view is: the Agenda is FullCalendar's list, Week and Day are
 * time grids over exactly the days in `range`.
 */
const VIEW_TYPES = {
  agenda: "list",
  week: "timeGrid",
  day: "timeGrid",
} as const;

type CalendarProps<Data> = {
  view: keyof typeof VIEW_TYPES;
  /** The local days to show, `end` exclusive. */
  range: { start: LocalDate; end: LocalDate };
  /** The user's saved zone: items sit on their local days in it. */
  timeZone: string;
  items: CalendarFeedItem<Data>[];
  /** An item's content. Interactive content (a button) belongs here. */
  renderItem: (data: Data, segment: CalendarItemSegment) => React.ReactNode;
  /** A day's heading. */
  renderDayHeader: (date: LocalDate) => React.ReactNode;
  /**
   * Makes each day heading of a several-day time grid a link to that day:
   * its name, and what following it does.
   */
  dayLink?: {
    label: (date: LocalDate) => string;
    open: (date: LocalDate) => void;
  };
  /** Shown when the Agenda's range has no items. */
  empty: React.ReactNode;
  /** What the calendar shows, for its loading state ("Agenda, …"). */
  label: string;
  /** Time grids: a timed slot range was selected. */
  onSelect?: (range: { start: Date; end: Date }) => void;
  /** Time grids: an `editable` item was moved or resized. */
  onItemChange?: (change: CalendarItemChange<Data>) => void;
  /**
   * Time grids: an element of a FullCalendar `Draggable` outside the
   * calendar was dropped on a timed slot at `date`.
   */
  onDrop?: (drop: { date: Date; element: HTMLElement }) => void;
};

const noSubscription = () => () => {};

export function Calendar<Data>({
  view,
  range,
  timeZone,
  items,
  renderItem,
  renderDayHeader,
  dayLink,
  empty,
  label,
  onSelect,
  onItemChange,
  onDrop,
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
        contrastColor: item.contrastColor,
        className: item.className,
        editable: item.editable ?? false,
        extendedProps: { data: item.data, order: item.order },
      })),
    [items],
  );

  function changeItem(info: {
    event: {
      start: Date | null;
      end: Date | null;
      extendedProps: Record<string, unknown>;
    };
    revert: () => void;
  }) {
    const { start, end, extendedProps } = info.event;
    if (!onItemChange || !start || !end) return info.revert();
    onItemChange({
      data: extendedProps.data as Data,
      start,
      end,
      revert: info.revert,
    });
  }

  if (!inBrowser) return <LoadingState label={`Loading ${label}`} />;
  return (
    <div className={`soleup-calendar soleup-calendar-${view}`}>
      <FullCalendar
        // A new key per view, so switching views starts a fresh calendar.
        key={view}
        plugins={[listPlugin, timeGridPlugin, interactionPlugin, classicTheme]}
        initialView={VIEW_TYPES[view]}
        initialDate={range.start}
        visibleRange={range}
        timeZone={timeZone}
        headerToolbar={false}
        height="auto"
        events={events}
        // Items carry their own button, so FullCalendar must not make the
        // item itself a button (a list may only hold list items, and a
        // button may not hold another).
        eventInteractive={false}
        eventOrder="start,-duration,allDay,order,title"
        eventsHint="Items on this day"
        eventContent={(info) => {
          const data = info.event.extendedProps.data as Data | undefined;
          // A selection's placeholder, or something dragged in from
          // outside, is not one of our items: show its title and times.
          if (data === undefined) {
            return (
              <span className="block px-1 py-0.5 text-xs">
                {[info.event.title, info.timeText].filter(Boolean).join(" · ")}
              </span>
            );
          }
          return renderItem(data, {
            isStart: info.isStart,
            isEnd: info.isEnd,
          });
        }}
        // A list day header has a main label (level 0) and a side one
        // (level 1); renderDayHeader replaces the main one, and the side
        // one would only repeat the date.
        listDayHeaderContent={(info) =>
          info.level === 0
            ? renderDayHeader(localDateOf(info.date, timeZone))
            : null
        }
        noEventsContent={() => empty}
        // Time grids: the whole day, items that overlap side by side
        // rather than over each other, and our own day headings.
        dayHeaderContent={(info) =>
          renderDayHeader(localDateOf(info.date, timeZone))
        }
        allDayText="All day"
        slotEventOverlap={false}
        nowIndicator
        // FullCalendar hides a time grid's heading content from assistive
        // tech (the cell has its own label) unless it is a nav link, so a
        // day link must be FullCalendar's, not a link of ours inside it.
        navLinks={view !== "agenda" && dayLink !== undefined}
        navLinkHint={(_text: string, date: Date) =>
          dayLink?.label(localDateOf(date, timeZone)) ?? _text
        }
        navLinkDayClick={(date: Date) =>
          dayLink?.open(localDateOf(date, timeZone))
        }
        // Pointer interactions on the time grids, all timed: nothing can be
        // selected, moved or dropped into the all-day row, and a selection
        // lasts at most a day. Moves snap to 15 minutes.
        editable={false}
        selectable={view !== "agenda" && onSelect !== undefined}
        selectMirror
        unselectAuto
        snapDuration="00:15:00"
        selectAllow={(span) =>
          !span.allDay &&
          span.end.getTime() - span.start.getTime() <= MAX_SELECTION_MS
        }
        eventAllow={(span) => !span.allDay}
        select={(info) => {
          info.view.calendar.unselect();
          onSelect?.({ start: info.start, end: info.end });
        }}
        eventDrop={(info) => changeItem(info)}
        eventResize={(info) => changeItem(info)}
        droppable={view !== "agenda" && onDrop !== undefined}
        drop={(info) => {
          if (!info.allDay)
            onDrop?.({ date: info.date, element: info.draggedEl });
        }}
      />
    </div>
  );
}
