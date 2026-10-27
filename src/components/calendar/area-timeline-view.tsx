"use client";

import Link from "next/link";
import { useId, useSyncExternalStore } from "react";

import { useRefreshOnNewDay } from "@/components/tasks/use-refresh-on-new-day";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { agendaEntryKind } from "@/lib/agenda";
import type { ColumnArea, SpanPlacement } from "@/lib/area-columns";
import {
  shiftTimelineDate,
  TIMELINE_SCALE,
  TIMELINE_SPAN_LABELS,
  TIMELINE_SPANS,
  timelineHref,
  timelineItemTarget,
  timelineItemTimeLabel,
  type TimelineItemPosition,
  timelineLengthHours,
  type TimelineRange,
  timelineRangeLabel,
  type TimelineRow,
  timelineRows,
  type TimelineTick,
  timelineTicks,
} from "@/lib/area-timeline";
import { blockStatusLabel } from "@/lib/block-form";
import { gridDayShortLabel, isGridKey } from "@/lib/calendar-views";
import { formatTimeOfDay, type LocalDate } from "@/lib/dates";
import type { ScheduleEntry } from "@/lib/schedule";

import { areaItemBoxClass } from "./area-columns-view";
import type { EventFormContext } from "./event-dialog";
import { ItemDialog, useItemDialog } from "./item-dialog";
import { MoveNav, pillClass, ViewNav } from "./view-nav";

type AreaTimelineViewProps = EventFormContext & {
  /** The range's events and time blocks (`listSchedule`). */
  entries: ScheduleEntry[];
  /** The user's life areas, in their order (archived ones included). */
  areas: ColumnArea[];
  range: TimelineRange;
  today: LocalDate;
  /** When the user's tomorrow begins (ISO instant). */
  nextDayStartsAt: string;
};

const ITEM_SELECTOR = "[data-calendar-item]";

/** How tall a lane is, in rem (44 px): a 24 px title and its time. */
const LANE_REM = 2.75;

/** The room above and below a row's lanes, in rem. */
const ROW_PADDING_REM = 0.25;

/**
 * The row headings' width. They stay in view while the axis scrolls, so
 * the region's scroll padding matches them (focus never lands under one).
 */
const HEADING_WIDTH = "w-28 sm:w-36";
const HEADING_SCROLL_PADDING = "scroll-pl-28 sm:scroll-pl-36";

const noSubscription = () => () => {};

/**
 * The Timeline view (chunk 4.11): a day or a week of the user's events and
 * time blocks, in a row per active life area plus "No area", along a
 * horizontal time axis in their zone. Our own component, not FullCalendar's
 * (its resource timeline is premium). Each item's button opens its dialog;
 * Tab and the arrow keys move between items, Left and Right along a row and
 * Up and Down across rows. Items that overlap in a row stack in lanes.
 *
 * It renders in the browser only, as By area does: its time labels come
 * from Intl, which the server's Node and the browser can format
 * differently (a hydration mismatch).
 */
export function AreaTimelineView({
  entries,
  areas,
  range,
  today,
  nextDayStartsAt,
  ...context
}: AreaTimelineViewProps) {
  useRefreshOnNewDay(nextDayStartsAt);
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const { containerRef, buttons, openItem, dialog } =
    useItemDialog(ITEM_SELECTOR);
  const { userTimeZone: timeZone, locale } = context;
  const rows = timelineRows(entries, areas, range, timeZone);
  const ticks = timelineTicks(range, timeZone);
  const trackWidth = `${timelineLengthHours(range, timeZone) * TIMELINE_SCALE[range.span].hourRem}rem`;
  const rangeLabel = timelineRangeLabel(range, locale);
  const hasActiveArea = areas.some((area) => area.status === "active");

  // Arrow keys move between items: left and right along a row, up and down
  // to the nearest item of the previous or next row that has any.
  const moveFocus = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (!isGridKey(event.key)) return;
    const target = event.target as HTMLElement;
    if (!target.matches(ITEM_SELECTOR)) return;
    const all = buttons();
    const positions = all.map((button): TimelineItemPosition => {
      const rect = button.getBoundingClientRect();
      return {
        row: button.closest<HTMLElement>("[data-row]")?.dataset.row ?? "",
        left: rect.left,
        top: rect.top,
      };
    });
    event.preventDefault();
    const next = timelineItemTarget(positions, all.indexOf(target), event.key);
    if (next !== null) all[next]!.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      <ViewNav
        current="timeline"
        date={range.date}
        today={today}
        timelineSpan={range.span}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <nav aria-label="Timeline span">
          <ul className="flex flex-wrap gap-1">
            {TIMELINE_SPANS.map((span) => (
              <li key={span}>
                <Link
                  href={timelineHref(span, range.date, today)}
                  aria-current={span === range.span ? "page" : undefined}
                  className={pillClass(span === range.span)}
                >
                  {TIMELINE_SPAN_LABELS[span]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <MoveNav
          unit={range.span}
          previousHref={timelineHref(
            range.span,
            shiftTimelineDate(range, -1),
            today,
          )}
          todayHref={timelineHref(range.span, today, today)}
          nextHref={timelineHref(
            range.span,
            shiftTimelineDate(range, 1),
            today,
          )}
          atToday={range.date === today}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-muted">
          <span className="sr-only">Showing </span>
          {rangeLabel}
        </p>
        <p className="text-sm text-muted">
          {entries.length === 0
            ? `Nothing this ${range.span}. Events and time blocks show here, each in its life area's row.`
            : "Tab or the arrow keys move between items; Enter opens one."}
        </p>
        <p className="text-sm text-muted">
          {
            "An event sits in its own life area, and a time block in its task's goal's area."
          }
        </p>
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
          aria-label={`Timeline by area, ${rangeLabel}`}
          // Focusable, so the keyboard can scroll the time axis sideways.
          tabIndex={0}
          onKeyDown={moveFocus}
          className={cx(
            "overflow-x-auto rounded-md border border-border bg-surface",
            HEADING_SCROLL_PADDING,
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          )}
        >
          {/* As wide as its rows, so the sticky headings hold all the way. */}
          <div className="w-max min-w-full">
            <TimeAxis
              ticks={ticks}
              today={today}
              trackWidth={trackWidth}
              timeZone={timeZone}
              locale={locale}
            />
            {rows.map((row, index) => (
              <Row
                key={row.key}
                row={row}
                // Zero-padded, so the keys sort in row order.
                position={String(index).padStart(3, "0")}
                ticks={ticks}
                range={range}
                trackWidth={trackWidth}
                context={context}
                onOpen={openItem}
              />
            ))}
          </div>
        </div>
      ) : (
        <LoadingState label={`Loading the timeline, ${rangeLabel}`} />
      )}
      <ItemDialog {...dialog} context={context} />
    </div>
  );
}

/**
 * The time labels along the top: each hour of a day, or each day of a
 * week (today's in bold). Hidden from assistive tech: each item says its
 * own times.
 */
function TimeAxis({
  ticks,
  today,
  trackWidth,
  timeZone,
  locale,
}: {
  ticks: TimelineTick[];
  today: LocalDate;
  trackWidth: string;
  timeZone: string;
  locale: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="flex border-b border-border text-xs text-muted"
    >
      <div
        className={cx(
          "sticky left-0 z-10 shrink-0 border-r border-border bg-surface",
          HEADING_WIDTH,
        )}
      />
      <div className="relative h-8 shrink-0" style={{ width: trackWidth }}>
        {ticks
          .filter((tick) => tick.label !== null)
          .map((tick) => (
            <span
              key={tick.at.toISOString()}
              className={cx(
                "absolute top-2 leading-none whitespace-nowrap",
                tick.label === "day" &&
                  tick.day === today &&
                  "font-semibold text-fg",
              )}
              style={{ left: `calc(${tick.offset * 100}% + 4px)` }}
            >
              {tick.label === "day"
                ? gridDayShortLabel(tick.day, locale)
                : formatTimeOfDay(tick.at, locale, timeZone)}
            </span>
          ))}
      </div>
    </div>
  );
}

/** One area's row: its heading (kept in view) and its items along the axis. */
function Row({
  row,
  position,
  ticks,
  range,
  trackWidth,
  context,
  onOpen,
}: {
  row: TimelineRow;
  position: string;
  ticks: TimelineTick[];
  range: TimelineRange;
  trackWidth: string;
  context: EventFormContext;
  onOpen: (entry: ScheduleEntry, opener: HTMLElement) => void;
}) {
  const headingId = useId();
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      data-row={position}
      data-area-id={row.areaId ?? ""}
      className="flex border-b border-border last:border-b-0"
    >
      <h2
        id={headingId}
        className={cx(
          "sticky left-0 z-10 shrink-0 border-r border-border bg-surface px-2 py-2 text-sm font-semibold break-words",
          HEADING_WIDTH,
        )}
      >
        {row.name}
        {row.archived && (
          <span className="font-normal text-muted"> (archived area)</span>
        )}
      </h2>
      <div
        data-track=""
        className="relative shrink-0"
        style={{
          width: trackWidth,
          height: `${row.lanes * LANE_REM + 2 * ROW_PADDING_REM}rem`,
        }}
      >
        {ticks.map((tick) => (
          <div
            key={tick.at.toISOString()}
            aria-hidden="true"
            className={cx(
              "absolute inset-y-0 border-l border-border",
              tick.label === null && "border-dashed",
            )}
            style={{ left: `${tick.offset * 100}%` }}
          />
        ))}
        {row.items.length > 0 && (
          <ul>
            {row.items.map((placed) => (
              <TimelineItem
                key={placed.entry.id}
                placed={placed}
                area={row.name}
                range={range}
                context={context}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** An item in its lane, drawn as on By area. */
function TimelineItem({
  placed: { entry, offset, length, lane },
  area,
  range,
  context,
  onOpen,
}: {
  placed: SpanPlacement;
  area: string;
  range: TimelineRange;
  context: EventFormContext;
  onOpen: (entry: ScheduleEntry, opener: HTMLElement) => void;
}) {
  const descriptionId = useId();
  const { locale, userTimeZone } = context;
  const time = timelineItemTimeLabel(entry, range, locale, userTimeZone);
  return (
    <li
      className="absolute p-px"
      style={{
        left: `${offset * 100}%`,
        width: `${length * 100}%`,
        top: `${ROW_PADDING_REM + lane * LANE_REM}rem`,
        height: `${LANE_REM}rem`,
      }}
    >
      <div
        data-kind={entry.kind}
        className={cx(
          "flex h-full min-w-0 flex-col justify-center overflow-hidden rounded-sm px-1 text-xs leading-tight",
          areaItemBoxClass(entry),
        )}
      >
        <button
          type="button"
          data-calendar-item=""
          data-item-id={entry.id}
          data-all-day={entry.allDay}
          aria-describedby={descriptionId}
          title={entry.title}
          onClick={(click) => onOpen(entry, click.currentTarget)}
          className={cx(
            "min-h-6 w-full cursor-pointer truncate rounded-sm text-left font-medium",
            "hover:underline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-current",
          )}
        >
          {entry.title}
        </button>
        {range.span === "day" && <span className="truncate">{time}</span>}
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
    </li>
  );
}
