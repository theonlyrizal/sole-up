"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useSyncExternalStore } from "react";

import { useRefreshOnNewDay } from "@/components/tasks/use-refresh-on-new-day";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { agendaEntryKind } from "@/lib/agenda";
import { calendarDayLabel } from "@/lib/calendar-list";
import {
  type GridItemPosition,
  gridDayShortLabel,
  gridHref,
  gridItemTarget,
  type GridRange,
  gridRangeLabel,
  isGridKey,
  shiftGridDate,
} from "@/lib/calendar-views";
import {
  formatLocalDate,
  formatTimeOfDay,
  type LocalDate,
  localDateOf,
} from "@/lib/dates";
import { timeRangeLabel } from "@/lib/event-form";

import { type EventFormContext, EventFormDialog } from "./event-dialog";
import {
  Calendar,
  type CalendarFeedItem,
  type CalendarItemSegment,
} from "./full-calendar";
import { type CalendarEntry, ItemDialog, useItemDialog } from "./item-dialog";
import { pillClass, ViewNav } from "./view-nav";

type TimeGridViewProps = EventFormContext & {
  entries: CalendarEntry[];
  range: GridRange;
  today: LocalDate;
  /** When the user's tomorrow begins (ISO instant). */
  nextDayStartsAt: string;
};

const ITEM_SELECTOR = "[data-calendar-item]";

/** Tailwind's `md`: narrower than this, Day stands in for Week. */
const WIDE_QUERY = "(min-width: 48rem)";

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the window is wide enough for Week; null on the server. */
function useIsWide(): boolean | null {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => null,
  );
}

/**
 * The Week and Day views (chunk 4.6): a time grid of the user's events and
 * timed task deadlines over a week (from their week start) or one day, in
 * their zone, with an all-day row. Each item's button opens its dialog;
 * Tab and the arrow keys move between items. The view and day live in the
 * URL. On phone widths Week is replaced by Day for the same day.
 */
export function TimeGridView({
  entries,
  range,
  today,
  nextDayStartsAt,
  ...context
}: TimeGridViewProps) {
  useRefreshOnNewDay(nextDayStartsAt);
  const router = useRouter();
  const isWide = useIsWide();
  const tooNarrow = range.view === "week" && isWide === false;
  useEffect(() => {
    if (tooNarrow) router.replace(gridHref("day", range.date, today));
  }, [tooNarrow, router, range.date, today]);

  const { containerRef, buttons, openItem, dialog } =
    useItemDialog(ITEM_SELECTOR);
  const items = useMemo(
    () =>
      entries.map((entry): CalendarFeedItem<CalendarEntry> => ({
        id: entry.id,
        title: entry.title,
        allDay: entry.allDay,
        start: entry.start,
        end: entry.end,
        order: entry.order,
        // Events are filled blocks; deadlines are quiet markers.
        ...(entry.kind === "event"
          ? { color: "var(--accent)", contrastColor: "var(--accent-fg)" }
          : {
              color: "var(--surface-muted)",
              contrastColor: "var(--fg)",
              className: "soleup-deadline",
            }),
        data: entry,
      })),
    [entries],
  );
  const rangeLabel = gridRangeLabel(range, context.locale);
  const unit = range.view === "week" ? "week" : "day";

  // Arrow keys move between items: up and down within a day, left and
  // right to the nearest item of the previous or next day.
  const moveFocus = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (!isGridKey(event.key)) return;
    const target = event.target as HTMLElement;
    if (!target.matches(ITEM_SELECTOR)) return;
    const all = buttons();
    const positions = all.map((button): GridItemPosition => {
      const rect = button.getBoundingClientRect();
      return {
        day: button.closest("[data-date]")?.getAttribute("data-date") ?? "",
        allDay: button.dataset.allDay === "true",
        top: rect.top,
        left: rect.left,
      };
    });
    event.preventDefault();
    const next = gridItemTarget(positions, all.indexOf(target), event.key);
    if (next !== null) all[next]!.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewNav current={range.view} date={range.date} today={today} />
        <EventFormDialog {...context} trigger={<Button>New event</Button>} />
      </div>
      <nav aria-label="Move through the calendar">
        <ul className="flex flex-wrap gap-1">
          <li>
            <Link
              href={gridHref(range.view, shiftGridDate(range, -1), today)}
              className={pillClass(false)}
            >
              Previous {unit}
            </Link>
          </li>
          <li>
            <Link
              href={gridHref(range.view, today, today)}
              aria-current={range.date === today ? "page" : undefined}
              className={pillClass(range.date === today)}
            >
              Today
            </Link>
          </li>
          <li>
            <Link
              href={gridHref(range.view, shiftGridDate(range, 1), today)}
              className={pillClass(false)}
            >
              Next {unit}
            </Link>
          </li>
        </ul>
      </nav>
      <div className="flex flex-col gap-1">
        <p className="text-muted">
          <span className="sr-only">Showing </span>
          {rangeLabel}
        </p>
        <p className="text-sm text-muted">
          {entries.length === 0
            ? `Nothing this ${unit}. Events and tasks due at a set time show here.`
            : "Tab or the arrow keys move between items; Enter opens one."}
        </p>
      </div>
      {tooNarrow ? (
        <LoadingState label="Loading the day" />
      ) : (
        <div ref={containerRef} onKeyDown={moveFocus}>
          <Calendar
            view={range.view}
            range={range}
            timeZone={context.userTimeZone}
            items={items}
            label={`${range.view === "week" ? "Week" : "Day"}, ${rangeLabel}`}
            renderDayHeader={(date) => (
              <DayHeading
                date={date}
                range={range}
                today={today}
                locale={context.locale}
              />
            )}
            dayLink={
              range.view === "week"
                ? {
                    label: (date) =>
                      calendarDayLabel(date, today, context.locale),
                    open: (date) => router.push(gridHref("day", date, today)),
                  }
                : undefined
            }
            renderItem={(entry, segment) => (
              <GridItem
                entry={entry}
                segment={segment}
                context={context}
                onOpen={(opener) => openItem(entry, opener)}
              />
            )}
            empty={null}
          />
        </div>
      )}
      <ItemDialog {...dialog} context={context} />
    </div>
  );
}

/**
 * A day column's heading: "Mon 19" in Week, where FullCalendar makes it a
 * link to that day named by the full date ("Today · Friday, 23 October
 * 2026"), and the full date in Day. FullCalendar gives the column its own
 * label and marks today's with aria-current="date".
 */
function DayHeading({
  date,
  range,
  today,
  locale,
}: {
  date: LocalDate;
  range: GridRange;
  today: LocalDate;
  locale: string;
}) {
  return (
    <time
      dateTime={date}
      className="rounded-sm text-sm font-semibold hover:underline"
    >
      {range.view === "week"
        ? gridDayShortLabel(date, locale)
        : calendarDayLabel(date, today, locale)}
    </time>
  );
}

function GridItem({
  entry,
  segment,
  context,
  onOpen,
}: {
  entry: CalendarEntry;
  segment: CalendarItemSegment;
  context: EventFormContext;
  /** Opens the item's dialog; `opener` is the item's button. */
  onOpen: (opener: HTMLElement) => void;
}) {
  const descriptionId = useId();
  const time = timeLabel(entry, segment, context);
  const day = segmentDay(entry, segment, context.userTimeZone);
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden px-1 py-0.5 text-xs leading-tight">
      <button
        type="button"
        data-calendar-item=""
        data-all-day={entry.allDay}
        aria-describedby={descriptionId}
        onClick={(click) => onOpen(click.currentTarget)}
        className={cx(
          "cursor-pointer rounded-sm text-left font-medium break-words",
          "hover:underline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-current",
        )}
      >
        {entry.title}
      </button>
      {time && <span>{time}</span>}
      <span id={descriptionId} className="sr-only">
        {[
          agendaEntryKind(entry),
          day && formatLocalDate(day, context.locale, "full"),
          time,
        ]
          .filter(Boolean)
          .join(", ")}
      </span>
    </div>
  );
}

/**
 * The local day a piece of an item sits on: its start's day for the first
 * piece, its end's day for the last piece of a timed item crossing
 * midnight, and null for pieces in between.
 */
function segmentDay(
  entry: CalendarEntry,
  { isStart, isEnd }: CalendarItemSegment,
  timeZone: string,
): LocalDate | null {
  if (entry.allDay) return isStart ? entry.start : null;
  if (isStart) return localDateOf(new Date(entry.start), timeZone);
  if (isEnd && entry.end !== null) {
    return localDateOf(new Date(Date.parse(entry.end) - 1), timeZone);
  }
  return null;
}

/**
 * When the item happens, in the user's zone: an event's times (or where it
 * starts or ends when it crosses midnight), or the task's deadline time.
 * All-day items need no label: the all-day row says it.
 */
function timeLabel(
  entry: CalendarEntry,
  { isStart, isEnd }: CalendarItemSegment,
  { locale, userTimeZone }: EventFormContext,
): string | null {
  if (entry.kind === "task") {
    return entry.task.dueAt
      ? `Due ${formatTimeOfDay(entry.task.dueAt, locale, userTimeZone)}`
      : null;
  }
  const { event } = entry;
  if (event.allDay) return null;
  if (isStart && isEnd)
    return timeRangeLabel(event.startAt, event.endAt, locale, userTimeZone);
  if (isStart)
    return `From ${formatTimeOfDay(event.startAt, locale, userTimeZone)}`;
  if (isEnd)
    return `Until ${formatTimeOfDay(event.endAt, locale, userTimeZone)}`;
  return null;
}
