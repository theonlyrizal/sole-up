"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useRefreshOnNewDay } from "@/components/tasks/use-refresh-on-new-day";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { agendaEntryKind } from "@/lib/agenda";
import {
  blockStatusLabel,
  defaultBlockMinutes,
  movedBlockTimes,
} from "@/lib/block-form";
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
import {
  createTimeBlock,
  updateTimeBlock,
} from "@/server/modules/time-blocks/actions";

import { type BlockableTask, BlockTimeDialog } from "./block-form";
import { type EventFormContext, EventFormDialog } from "./event-dialog";
import {
  Calendar,
  type CalendarFeedItem,
  type CalendarItemChange,
  type CalendarItemSegment,
} from "./full-calendar";
import { type CalendarEntry, ItemDialog, useItemDialog } from "./item-dialog";
import { MoveBlockDialog, type PendingBlockMove } from "./move-block-dialog";
import { droppedTaskId, TaskPanel } from "./task-panel";
import { pillClass, ViewNav } from "./view-nav";

type TimeGridViewProps = EventFormContext & {
  entries: CalendarEntry[];
  /** The user's open tasks: the block picker's and the task panel's. */
  tasks: BlockableTask[];
  range: GridRange;
  today: LocalDate;
  /** When the user's tomorrow begins (ISO instant). */
  nextDayStartsAt: string;
  /**
   * An item to open on arrival (the page's `item` param), from a link to
   * it on Today or Home (chunk 4.9).
   */
  openItemId?: string | null;
};

/** How many frames to wait for a linked item's button to render. */
const LINKED_ITEM_FRAMES = 300;

const ITEM_SELECTOR = "[data-calendar-item]";

/** Tailwind's `md`: narrower than this, Day stands in for Week. */
const WIDE_QUERY = "(min-width: 48rem)";

/** Tailwind's `lg`: from here the task panel sits beside Week (desktop). */
const DESKTOP_QUERY = "(min-width: 64rem)";

/** Whether the window matches `query`; null on the server. */
function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}

/** How an item looks on the grid. */
function itemStyle(
  entry: CalendarEntry,
): Pick<
  CalendarFeedItem<CalendarEntry>,
  "color" | "contrastColor" | "className" | "editable"
> {
  switch (entry.kind) {
    // Events are filled blocks.
    case "event":
      return { color: "var(--accent)", contrastColor: "var(--accent-fg)" };
    // Time blocks are tinted with a strong edge, and can be dragged.
    case "block":
      return {
        color: "color-mix(in srgb, var(--accent) 16%, var(--surface))",
        contrastColor: "var(--fg)",
        className: `soleup-block soleup-block-${entry.block.status}`,
        editable: true,
      };
    // Deadlines are quiet markers.
    case "task":
      return {
        color: "var(--surface-muted)",
        contrastColor: "var(--fg)",
        className: "soleup-deadline",
      };
  }
}

/**
 * The Week and Day views (chunks 4.6 and 4.8): a time grid of the user's
 * events, time blocks and timed task deadlines over a week (from their
 * week start) or one day, in their zone, with an all-day row. Each item's
 * button opens its dialog; Tab and the arrow keys move between items. The
 * view and day live in the URL. On phone widths Week is replaced by Day
 * for the same day.
 *
 * Blocks can be made and changed with the pointer: select a slot to pick a
 * task for it, drag a block to move it or its end to resize it, or (on a
 * desktop Week) drag a task from the panel beside the grid. Each has a
 * keyboard path through a form: "Block time" (toolbar or panel row), and
 * the block's own dialog for its times.
 */
export function TimeGridView({
  entries,
  tasks,
  range,
  today,
  nextDayStartsAt,
  openItemId = null,
  ...context
}: TimeGridViewProps) {
  useRefreshOnNewDay(nextDayStartsAt);
  const router = useRouter();
  const isWide = useMediaQuery(WIDE_QUERY);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const tooNarrow = range.view === "week" && isWide === false;
  const showPanel = range.view === "week" && isDesktop === true;
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [slotOpen, setSlotOpen] = useState(false);
  const [move, setMove] = useState<PendingBlockMove | null>(null);
  useEffect(() => {
    if (tooNarrow) router.replace(gridHref("day", range.date, today));
  }, [tooNarrow, router, range.date, today]);

  const { containerRef, buttons, openItem, dialog } =
    useItemDialog(ITEM_SELECTOR);

  // A link to one item opens its dialog once FullCalendar has rendered its
  // button (so focus returns there), then drops `item` from the URL so a
  // refresh doesn't open it again.
  const openedLinkedItem = useRef<string | null>(null);
  useEffect(() => {
    if (!openItemId || openedLinkedItem.current === openItemId) return;
    const entry = entries.find((candidate) => candidate.id === openItemId);
    if (!entry || tooNarrow) return;
    let frame = 0;
    let tries = 0;
    const tryOpen = () => {
      const button = buttons().find(
        (candidate) => candidate.dataset.itemId === openItemId,
      );
      if (!button) {
        if (++tries < LINKED_ITEM_FRAMES) {
          frame = requestAnimationFrame(tryOpen);
        }
        return;
      }
      openedLinkedItem.current = openItemId;
      button.scrollIntoView({ block: "center" });
      openItem(entry, button);
      window.history.replaceState(
        null,
        "",
        gridHref(range.view, range.date, today),
      );
    };
    tryOpen();
    return () => cancelAnimationFrame(frame);
  }, [
    openItemId,
    entries,
    tooNarrow,
    buttons,
    openItem,
    range.view,
    range.date,
    today,
  ]);
  const items = useMemo(
    () =>
      entries.map((entry): CalendarFeedItem<CalendarEntry> => ({
        id: entry.id,
        title: entry.title,
        allDay: entry.allDay,
        start: entry.start,
        end: entry.end,
        order: entry.order,
        ...itemStyle(entry),
        data: entry,
      })),
    [entries],
  );
  const rangeLabel = gridRangeLabel(range, context.locale);
  const unit = range.view === "week" ? "week" : "day";
  const { userTimeZone, locale } = context;

  function selectSlot(selected: { start: Date; end: Date }) {
    setSlot(selected);
    setSlotOpen(true);
  }

  /** A block dragged or resized: save a one-off, ask about a series. */
  async function changeBlock({
    data,
    start,
    end,
    revert,
  }: CalendarItemChange<CalendarEntry>) {
    if (data.kind !== "block") return revert();
    const { block } = data;
    const times = movedBlockTimes(block, start, end);
    const kind =
      start.getTime() === block.startAt.getTime() ? "resize" : "move";
    if (block.seriesId !== null) {
      setMove({ block, times, start, kind, revert });
      return;
    }
    const result = await updateTimeBlock({ id: block.id, ...times });
    if (result.ok) {
      toast({
        title: kind === "move" ? "Block moved" : "Block length changed",
        variant: "success",
      });
    } else {
      revert();
      toast({ title: result.error.message, variant: "error" });
    }
  }

  /** A task dropped from the panel: a block at that time, for its estimate. */
  async function dropTask({
    date,
    element,
  }: {
    date: Date;
    element: HTMLElement;
  }) {
    const task = tasks.find((option) => option.id === droppedTaskId(element));
    if (!task) return;
    const minutes = defaultBlockMinutes(task.estimatedMinutes);
    const times = movedBlockTimes(
      { tz: userTimeZone },
      date,
      new Date(date.getTime() + minutes * 60_000),
    );
    const result = await createTimeBlock({ taskId: task.id, ...times });
    toast(
      result.ok
        ? { title: "Time blocked", variant: "success" }
        : { title: result.error.message, variant: "error" },
    );
  }

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
        <div className="flex flex-wrap gap-2">
          <BlockTimeDialog
            tasks={tasks}
            timeZone={userTimeZone}
            locale={locale}
            trigger={<Button variant="secondary">Block time</Button>}
          />
          <EventFormDialog {...context} trigger={<Button>New event</Button>} />
        </div>
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
            ? `Nothing this ${unit}. Events, time blocks and tasks due at a set time show here.`
            : "Tab or the arrow keys move between items; Enter opens one."}
        </p>
        <p className="text-sm text-muted">
          Select a time on the grid to block it for a task; drag a block to move
          it, or its bottom edge to change its length.
        </p>
      </div>
      {tooNarrow ? (
        <LoadingState label="Loading the day" />
      ) : (
        <div
          className={cx(
            showPanel &&
              "grid grid-cols-[minmax(0,1fr)_16rem] items-start gap-4",
          )}
        >
          <div ref={containerRef} onKeyDown={moveFocus} className="min-w-0">
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
              onSelect={selectSlot}
              onItemChange={(change) => void changeBlock(change)}
              onDrop={showPanel ? (drop) => void dropTask(drop) : undefined}
            />
          </div>
          {showPanel && (
            <TaskPanel tasks={tasks} timeZone={userTimeZone} locale={locale} />
          )}
        </div>
      )}
      <ItemDialog {...dialog} context={context} />
      <BlockTimeDialog
        // A fresh form for each selected slot.
        key={
          slot ? `${slot.start.toISOString()}/${slot.end.toISOString()}` : ""
        }
        tasks={tasks}
        slot={slot ?? undefined}
        timeZone={userTimeZone}
        locale={locale}
        open={slotOpen}
        onOpenChange={setSlotOpen}
      />
      <MoveBlockDialog
        move={move}
        locale={locale}
        timeZone={userTimeZone}
        onDone={() => setMove(null)}
      />
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
        data-item-id={entry.id}
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
          entry.kind === "block" && blockStatusLabel(entry.block, new Date()),
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
  if (entry.kind === "event" && entry.event.allDay) return null;
  const timed = entry.kind === "block" ? entry.block : entry.event;
  if (!timed.startAt || !timed.endAt) return null;
  if (isStart && isEnd)
    return timeRangeLabel(timed.startAt, timed.endAt, locale, userTimeZone);
  if (isStart)
    return `From ${formatTimeOfDay(timed.startAt, locale, userTimeZone)}`;
  if (isEnd)
    return `Until ${formatTimeOfDay(timed.endAt, locale, userTimeZone)}`;
  return null;
}
