"use client";

import Link from "next/link";
import { useId, useSyncExternalStore } from "react";

import { AreaChip, type CalendarAreaColors } from "@/components/data/area-chip";
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
import {
  addDays,
  formatTimeOfDay,
  type LocalDate,
  type WeekStart,
} from "@/lib/dates";
import type { ScheduleEntry } from "@/lib/schedule";

import type { BlockableTask } from "./block-form";
import { CalendarActions } from "./calendar-actions";
import {
  areaItemStyle,
  BlockStatusIcon,
  useNowOffset,
} from "./calendar-presentation";
import type { EventFormContext } from "./event-dialog";
import { ItemDialog, useItemDialog } from "./item-dialog";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { CalendarHeader } from "./view-nav";

type AreaTimelineViewProps = EventFormContext & {
  /** The range's events and time blocks (`listSchedule`). */
  entries: ScheduleEntry[];
  /** The user's life areas, in their order (archived ones included). */
  areas: ColumnArea[];
  areaColors: CalendarAreaColors;
  tasks: BlockableTask[];
  weekStart: WeekStart;
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
const HEADING_WIDTH = "w-28 medium:w-36";
const HEADING_SCROLL_PADDING = "scroll-pl-28 medium:scroll-pl-36";

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
  areaColors,
  tasks,
  weekStart,
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
  const nowOffset = useNowOffset(range.start, range.end, timeZone);
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
      <CalendarHeader
        current="timeline"
        date={range.date}
        today={today}
        locale={locale}
        weekStart={weekStart}
        dateLabel={rangeLabel}
        start={range.start}
        end={range.span === "week" ? addDays(range.end, -1) : undefined}
        dateHref={(date) => timelineHref(range.span, date, today)}
        timelineSpan={range.span}
        move={{
          previousLabel: `Previous ${range.span}`,
          nextLabel: `Next ${range.span}`,
          previousHref: timelineHref(
            range.span,
            shiftTimelineDate(range, -1),
            today,
          ),
          todayHref: timelineHref(range.span, today, today),
          nextHref: timelineHref(
            range.span,
            shiftTimelineDate(range, 1),
            today,
          ),
          atToday: range.date === today,
        }}
        actions={<CalendarActions context={context} tasks={tasks} />}
        rangeControl={
          <ConnectedButtonGroup
            label="Timeline span"
            compactLabels
            value={range.span}
            items={TIMELINE_SPANS.map((span) => ({
              value: span,
              label: TIMELINE_SPAN_LABELS[span],
              href: timelineHref(span, range.date, today),
            }))}
          />
        }
      />
      <div className="empty:hidden">
        {entries.length === 0 && (
          <p className="text-body-medium text-on-surface-variant">
            Nothing this {range.span}. Events and time blocks show here by area.
          </p>
        )}
        {!hasActiveArea && (
          <p className="text-body-medium text-on-surface-variant">
            You have no active life areas yet, so everything is under No area.{" "}
            <Link
              href="/goals/areas"
              className={cx("rounded-sm text-on-surface underline", focusRing)}
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
            "overflow-x-auto overscroll-x-contain rounded-xl border border-outline-variant bg-resting-surface",
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
                color={areaColors[row.areaId ?? ""] ?? "gray"}
                nowOffset={nowOffset}
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
      className="flex border-b border-outline-variant text-label-small text-on-surface-variant tabular-nums"
    >
      <div
        className={cx(
          "sticky left-0 z-10 shrink-0 border-r border-outline-variant bg-resting-surface",
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
                  "font-semibold text-on-surface",
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
  color,
  nowOffset,
  position,
  ticks,
  range,
  trackWidth,
  context,
  onOpen,
}: {
  row: TimelineRow;
  color: NonNullable<CalendarAreaColors[string]>;
  nowOffset: number | null;
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
      className="flex border-b border-outline-variant last:border-b-0"
    >
      <h2
        id={headingId}
        className={cx(
          "sticky left-0 z-10 shrink-0 border-r border-outline-variant bg-resting-surface px-2 py-2 text-body-medium font-semibold break-words",
          HEADING_WIDTH,
        )}
      >
        <AreaChip name={row.name} color={color} archived={row.archived} />
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
              "absolute inset-y-0 border-l border-outline-variant",
              tick.label === null && "border-dashed",
            )}
            style={{ left: `${tick.offset * 100}%` }}
          />
        ))}
        {nowOffset !== null && (
          <div
            aria-hidden="true"
            className="calendar-now-line-vertical absolute inset-y-0 z-[1]"
            style={{ left: `${nowOffset * 100}%` }}
          />
        )}
        {row.items.length > 0 && (
          <ul>
            {row.items.map((placed) => (
              <TimelineItem
                key={placed.entry.id}
                placed={placed}
                area={row.name}
                color={color}
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
  color,
  range,
  context,
  onOpen,
}: {
  placed: SpanPlacement;
  area: string;
  color: NonNullable<CalendarAreaColors[string]>;
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
        className="calendar-area-item relative flex h-full min-w-0 flex-col justify-center overflow-hidden rounded-sm px-1 text-label-small leading-tight"
        style={areaItemStyle(color)}
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
            "stretched-link flex min-h-6 w-full cursor-pointer items-center gap-0.5 rounded-sm text-left text-label-large leading-tight",
            "hover:underline",
          )}
        >
          {entry.kind === "block" && (
            <BlockStatusIcon status={entry.block.status} />
          )}
          <span className="truncate">{entry.title}</span>
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
