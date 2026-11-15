"use client";

import Link from "next/link";
import { useId, useSyncExternalStore } from "react";

import { AreaChip, type CalendarAreaColors } from "@/components/data/area-chip";
import { useRefreshOnNewDay } from "@/components/tasks/use-refresh-on-new-day";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { agendaEntryKind } from "@/lib/agenda";
import {
  type AreaColumn,
  areaColumns,
  type ColumnArea,
  dayHourMarks,
  dayLengthHours,
} from "@/lib/area-columns";
import { blockStatusLabel } from "@/lib/block-form";
import {
  type GridItemPosition,
  gridItemTarget,
  gridHref,
  type GridRange,
  gridRangeLabel,
  isGridKey,
} from "@/lib/calendar-views";
import { formatTimeOfDay, type LocalDate, type WeekStart } from "@/lib/dates";
import { type ScheduleEntry, timelineTimeLabel } from "@/lib/schedule";

import type { BlockableTask } from "./block-form";
import { CalendarActions } from "./calendar-actions";
import {
  areaItemStyle,
  BlockStatusIcon,
  useNowOffset,
} from "./calendar-presentation";
import type { EventFormContext } from "./event-dialog";
import { ItemDialog, useItemDialog } from "./item-dialog";
import { CalendarHeader, GridMoveNav } from "./view-nav";

type AreaColumnsViewProps = EventFormContext & {
  /** The day's events and time blocks (`listDaySchedule`). */
  entries: ScheduleEntry[];
  /** The user's life areas, in their order (archived ones included). */
  areas: ColumnArea[];
  areaColors: CalendarAreaColors;
  tasks: BlockableTask[];
  weekStart: WeekStart;
  range: GridRange<"areas">;
  today: LocalDate;
  /** When the user's tomorrow begins (ISO instant). */
  nextDayStartsAt: string;
};

const ITEM_SELECTOR = "[data-calendar-item]";

/** How tall an hour of the day is, in rem (48 px). */
const HOUR_REM = 3;

const noSubscription = () => () => {};

/**
 * The By area view (chunk 4.10): one day of the user's events and time
 * blocks in a column per active life area, plus "No area", in their zone.
 * Our own component, not FullCalendar's (its resource views are premium).
 * Each item's button opens its dialog; Tab and the arrow keys move between
 * items, Up and Down within a column and Left and Right across columns, as
 * on Week and Day. Items that overlap in a column sit side by side.
 *
 * It renders in the browser only, as the FullCalendar views do: its time
 * labels come from Intl, which the server's Node and the browser can
 * format differently (a hydration mismatch).
 */
export function AreaColumnsView({
  entries,
  areas,
  areaColors,
  tasks,
  weekStart,
  range,
  today,
  nextDayStartsAt,
  ...context
}: AreaColumnsViewProps) {
  useRefreshOnNewDay(nextDayStartsAt);
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const { containerRef, buttons, openItem, dialog } =
    useItemDialog(ITEM_SELECTOR);
  const { userTimeZone: timeZone, locale } = context;
  const columns = areaColumns(entries, areas, range.date, timeZone);
  const rangeLabel = gridRangeLabel(range, locale);
  const nowOffset = useNowOffset(range.start, range.end, timeZone);
  const hasActiveArea = areas.some((area) => area.status === "active");

  // Arrow keys move between items: up and down within a column, left and
  // right to the nearest item of the previous or next column that has any.
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
        day: button.closest<HTMLElement>("[data-column]")?.dataset.column ?? "",
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
      <CalendarHeader
        current="areas"
        date={range.date}
        today={today}
        locale={locale}
        weekStart={weekStart}
        dateLabel={rangeLabel}
        dateHref={(date) => gridHref("areas", date, today)}
        move={GridMoveNav(range, today)}
        actions={<CalendarActions context={context} tasks={tasks} />}
      />
      <div className="empty:hidden">
        {entries.length === 0 && (
          <p className="text-body-medium text-on-surface-variant">
            Nothing this day. Events and time blocks show here by area.
          </p>
        )}
        {!hasActiveArea && (
          <p className="text-sm text-muted">
            You have no active life areas yet, so everything is under No area.{" "}
            <Link
              href="/goals/areas"
              className={cx("rounded-sm text-fg underline", focusRing)}
            >
              Manage areas
            </Link>
          </p>
        )}
      </div>
      {inBrowser ? (
        <div
          ref={containerRef}
          role="region"
          aria-label={`By area, ${rangeLabel}`}
          // Focusable, so the keyboard can scroll it sideways when the
          // columns are wider than the page.
          tabIndex={0}
          onKeyDown={moveFocus}
          className={cx(
            "overflow-x-auto overscroll-x-contain rounded-xl border border-outline-variant bg-resting-surface",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          <div
            className="grid grid-rows-[auto_auto_auto]"
            style={{
              gridTemplateColumns: `4.5rem repeat(${columns.length}, minmax(9rem, 1fr))`,
            }}
          >
            <TimeAxis date={range.date} timeZone={timeZone} locale={locale} />
            {columns.map((column, index) => (
              <Column
                key={column.key}
                column={column}
                color={areaColors[column.areaId ?? ""] ?? "gray"}
                nowOffset={nowOffset}
                // Zero-padded, so the keys sort in column order.
                position={String(index).padStart(3, "0")}
                date={range.date}
                context={context}
                onOpen={openItem}
              />
            ))}
          </div>
        </div>
      ) : (
        <LoadingState label={`Loading By area, ${rangeLabel}`} />
      )}
      <ItemDialog {...dialog} context={context} />
    </div>
  );
}

/** The day's height in the view: 48 px an hour, longer on a 25-hour day. */
function dayHeight(date: LocalDate, timeZone: string): string {
  return `${dayLengthHours(date, timeZone) * HOUR_REM}rem`;
}

/**
 * The hour labels down the left. Hidden from assistive tech: each item
 * says its own times.
 */
function TimeAxis({
  date,
  timeZone,
  locale,
}: {
  date: LocalDate;
  timeZone: string;
  locale: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="row-span-3 grid grid-rows-subgrid border-r border-outline-variant text-label-small text-on-surface-variant tabular-nums"
    >
      <div className="border-b border-outline-variant" />
      <div className="border-b border-outline-variant px-1 py-2 text-right">
        All day
      </div>
      <div className="relative" style={{ height: dayHeight(date, timeZone) }}>
        {dayHourMarks(date, timeZone).map((mark) => (
          <span
            key={mark.at.toISOString()}
            className="absolute right-1 leading-none whitespace-nowrap"
            style={{ top: `calc(${mark.offset * 100}% + 2px)` }}
          >
            {formatTimeOfDay(mark.at, locale, timeZone)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One area's column: its heading, its all-day items, its timed items. */
function Column({
  column,
  color,
  nowOffset,
  position,
  date,
  context,
  onOpen,
}: {
  column: AreaColumn;
  color: NonNullable<CalendarAreaColors[string]>;
  nowOffset: number | null;
  position: string;
  date: LocalDate;
  context: EventFormContext;
  onOpen: (entry: ScheduleEntry, opener: HTMLElement) => void;
}) {
  const headingId = useId();
  const { userTimeZone: timeZone } = context;
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      data-column={position}
      data-area-id={column.areaId ?? ""}
      className="row-span-3 grid min-w-0 grid-rows-subgrid border-r border-outline-variant last:border-r-0"
    >
      <h2
        id={headingId}
        className="border-b border-outline-variant px-2 py-2 text-sm font-semibold break-words"
      >
        <AreaChip name={column.name} color={color} archived={column.archived} />
      </h2>
      <div className="border-b border-outline-variant p-1">
        {column.allDay.length > 0 && (
          <ul className="flex flex-col gap-1">
            {column.allDay.map((entry) => (
              <li key={entry.id} className="min-h-12">
                <ColumnItem
                  entry={entry}
                  area={column.name}
                  color={color}
                  date={date}
                  context={context}
                  onOpen={onOpen}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="relative" style={{ height: dayHeight(date, timeZone) }}>
        {dayHourMarks(date, timeZone).map((mark) => (
          <div
            key={mark.at.toISOString()}
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-outline-variant"
            style={{ top: `${mark.offset * 100}%` }}
          />
        ))}
        {nowOffset !== null && (
          <div
            aria-hidden="true"
            className="calendar-now-line absolute inset-x-0 z-10"
            style={{ top: `${nowOffset * 100}%` }}
          />
        )}
        {column.timed.length > 0 && (
          <ul>
            {column.timed.map(({ entry, top, height, lane, lanes }) => (
              <li
                key={entry.id}
                className="absolute p-px"
                style={{
                  top: `${top * 100}%`,
                  height: `${height * 100}%`,
                  left: `${(lane / lanes) * 100}%`,
                  width: `${100 / lanes}%`,
                }}
              >
                <ColumnItem
                  entry={entry}
                  area={column.name}
                  color={color}
                  date={date}
                  context={context}
                  onOpen={onOpen}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** An item in a column, in its box. */
function ColumnItem({
  entry,
  area,
  color,
  date,
  context,
  onOpen,
}: {
  entry: ScheduleEntry;
  area: string;
  color: NonNullable<CalendarAreaColors[string]>;
  date: LocalDate;
  context: EventFormContext;
  onOpen: (entry: ScheduleEntry, opener: HTMLElement) => void;
}) {
  const descriptionId = useId();
  const { locale, userTimeZone } = context;
  const time = timelineTimeLabel(entry, date, locale, userTimeZone);
  return (
    <div
      data-kind={entry.kind}
      className={cx(
        "calendar-area-item relative flex h-full min-w-0 flex-col overflow-hidden rounded-sm px-1 py-0.5 text-label-small leading-tight",
        entry.allDay && "min-h-12 justify-center",
      )}
      style={areaItemStyle(color)}
    >
      <button
        type="button"
        data-calendar-item=""
        data-item-id={entry.id}
        data-all-day={entry.allDay}
        aria-describedby={descriptionId}
        onClick={(click) => onOpen(entry, click.currentTarget)}
        className={cx(
          "stretched-link flex min-w-0 cursor-pointer items-center gap-0.5 rounded-sm text-left text-label-large leading-tight",
          "hover:underline",
        )}
      >
        {entry.kind === "block" && (
          <BlockStatusIcon status={entry.block.status} />
        )}
        <span className="truncate">{entry.title}</span>
      </button>
      {!entry.allDay && <span className="truncate tabular-nums">{time}</span>}
      <span id={descriptionId} className="sr-only">
        {[
          agendaEntryKind(entry),
          time,
          area,
          entry.kind === "block" && blockStatusLabel(entry.block, new Date()),
        ]
          .filter(Boolean)
          .join(", ")}
      </span>
    </div>
  );
}
