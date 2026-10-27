// The time-block UI's values and rules (chunk 4.8). Pure and client-safe:
// no server-only imports, and no `rrule-temporal`. The rules come from
// docs/decisions/0012-calendar-recurrence-time-blocks-views.md.
//
// - A block is a start (local date and time in its zone) and a length in
//   minutes, 1 to 1440, as the server takes it. It has no title: it shows
//   its task's.
// - A new block lasts the task's estimate, else 60 minutes.
// - Moving or resizing a block on the grid keeps its zone; the new times
//   are its wall-clock times there.
// - Status is the user's: "Not marked" is a past block still `scheduled`.

import { localDateTimeOf, type LocalDate } from "./dates";
import {
  defaultRepeat,
  newEventValues,
  readRepeat,
  repeatForNewStart,
  repeatFromRule,
  type RepeatValues,
} from "./event-form";
import type { TaskStatus } from "./tasks";
import {
  TIME_BLOCK_MAX_MINUTES,
  TIME_BLOCK_MIN_MINUTES,
  type TimeBlockOccurrence,
  type TimeBlockStatus,
} from "./time-blocks";

/** A new block's length when its task has no estimate. */
export const DEFAULT_BLOCK_MINUTES = 60;

/** The "Block time" form's fields, as the form holds them. */
export type BlockFormValues = {
  startDate: LocalDate;
  startTime: string;
  /** Whole minutes, as typed. */
  duration: string;
  /** The zone the times are in: the user's for a new block. */
  tz: string;
  repeat: RepeatValues;
};

/** A block's times as the server takes them. */
export type BlockTimesPayload = {
  startDate: LocalDate;
  startTime: string;
  durationMinutes: number;
  tz: string;
};

/** A new block's length: the task's estimate, else 60 minutes. */
export function defaultBlockMinutes(estimate: number | null): number {
  return estimate ?? DEFAULT_BLOCK_MINUTES;
}

/** Elapsed minutes from `start` to `end`, kept within a block's bounds. */
function minutesBetween(start: Date, end: Date): number {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  return Math.min(
    Math.max(minutes, TIME_BLOCK_MIN_MINUTES),
    TIME_BLOCK_MAX_MINUTES,
  );
}

/**
 * A new block in the user's zone from the "Block time" action: starting at
 * the next whole hour of their day, lasting the task's estimate or 60
 * minutes, not repeating.
 */
export function newBlockValues(
  now: Date,
  timeZone: string,
  estimate: number | null,
): BlockFormValues {
  const { startDate, startTime } = newEventValues(now, timeZone);
  return {
    startDate,
    startTime,
    duration: String(defaultBlockMinutes(estimate)),
    tz: timeZone,
    repeat: defaultRepeat(startDate),
  };
}

/** A new block over a selected slot of the grid, in the user's zone. */
export function blockValuesAt(
  start: Date,
  end: Date,
  timeZone: string,
): BlockFormValues {
  const local = localDateTimeOf(start, timeZone);
  return {
    startDate: local.date,
    startTime: local.time,
    duration: String(minutesBetween(start, end)),
    tz: timeZone,
    repeat: defaultRepeat(local.date),
  };
}

/**
 * The form's values for a block or one occurrence of a series, as it shows
 * them: its start in its own zone, its length, and the series' repeat.
 */
export function blockFormValuesOf(
  block: Pick<TimeBlockOccurrence, "startAt" | "endAt" | "tz" | "rrule">,
): BlockFormValues {
  const local = localDateTimeOf(block.startAt, block.tz);
  return {
    startDate: local.date,
    startTime: local.time,
    duration: String(minutesBetween(block.startAt, block.endAt)),
    tz: block.tz,
    repeat: repeatFromRule(block.rrule, local.date),
  };
}

/**
 * The values with a new start date, keeping the length; a weekly or
 * monthly repeat follows the start (as the event form does).
 */
export function withBlockStartDate(
  values: BlockFormValues,
  startDate: string,
): BlockFormValues {
  return {
    ...values,
    startDate,
    repeat: repeatForNewStart(values.repeat, values.startDate, startDate),
  };
}

/** The times to send: the length as a number (blank or text fails on the server). */
export function blockTimesPayload(values: BlockFormValues): BlockTimesPayload {
  const duration = values.duration.trim();
  return {
    startDate: values.startDate,
    startTime: values.startTime,
    durationMinutes: duration === "" ? Number.NaN : Number(duration),
    tz: values.tz,
  };
}

/**
 * A block's new times after a drag on the grid moved it or a resize changed
 * its end: the new start in the block's own zone, and the new length.
 */
export function movedBlockTimes(
  block: Pick<TimeBlockOccurrence, "tz">,
  start: Date,
  end: Date,
): BlockTimesPayload {
  const local = localDateTimeOf(start, block.tz);
  return {
    startDate: local.date,
    startTime: local.time,
    durationMinutes: minutesBetween(start, end),
    tz: block.tz,
  };
}

/**
 * The series' rule after one of its occurrences moved to `start` with
 * "this and following" or "all": a weekly rule swaps the old weekday for
 * the new one and a monthly one takes the new day, as the form does when
 * the date changes, so the moved occurrence stays in the series. Other
 * rules are kept.
 */
export function movedSeriesRule(
  block: Pick<TimeBlockOccurrence, "rrule" | "startAt" | "tz">,
  start: Date,
): string | null {
  if (block.rrule === null) return null;
  const from = localDateTimeOf(block.startAt, block.tz).date;
  const to = localDateTimeOf(start, block.tz).date;
  const repeat = repeatForNewStart(repeatFromRule(block.rrule, from), from, to);
  const read = readRepeat(repeat, to);
  return read.ok ? read.rrule : block.rrule;
}

/**
 * Why "This block" can't take a change to one occurrence: a new repeat
 * applies to the series. Null when it can.
 */
export function thisBlockBlocker(repeatChanged: boolean): string | null {
  return repeatChanged ? "A new repeat applies to more than one block." : null;
}

/** An occurrence's key for scoped changes (ISO instant), or null for a one-off. */
export function blockOriginalStart(
  block: Pick<TimeBlockOccurrence, "originalStart">,
): string | null {
  return block.originalStart === null
    ? null
    : block.originalStart.toISOString();
}

/** What addresses a block or occurrence in the actions. */
export function blockKey(
  block: Pick<TimeBlockOccurrence, "id" | "originalStart">,
): { id: string; originalStart?: string } {
  const originalStart = blockOriginalStart(block);
  return originalStart === null
    ? { id: block.id }
    : { id: block.id, originalStart };
}

/** A block's state as it reads to the user. */
export type BlockStatusLabel = "Scheduled" | "Done" | "Skipped" | "Not marked";

/**
 * "Done" or "Skipped" as marked; a block still `scheduled` is "Not marked"
 * once it has ended, else "Scheduled" (ADR 0012).
 */
export function blockStatusLabel(
  block: { status: TimeBlockStatus; endAt: Date },
  now: Date,
): BlockStatusLabel {
  if (block.status === "done") return "Done";
  if (block.status === "skipped") return "Skipped";
  return block.endAt <= now ? "Not marked" : "Scheduled";
}

/** The status actions to offer: every status but the current one. */
export const BLOCK_STATUS_ACTIONS: Record<
  TimeBlockStatus,
  { status: TimeBlockStatus; label: string; toast: string }
> = {
  done: { status: "done", label: "Mark done", toast: "Block marked done" },
  skipped: {
    status: "skipped",
    label: "Mark skipped",
    toast: "Block marked skipped",
  },
  scheduled: {
    status: "scheduled",
    label: "Back to scheduled",
    toast: "Block back to scheduled",
  },
};

export function blockStatusActions(status: TimeBlockStatus) {
  return (["done", "skipped", "scheduled"] as const)
    .filter((next) => next !== status)
    .map((next) => BLOCK_STATUS_ACTIONS[next]);
}

/**
 * "Also complete the task?" is offered on a block marked done while its
 * task is still open: marking a block never completes the task.
 */
export function offersCompleteTask(block: {
  status: TimeBlockStatus;
  taskStatus: TaskStatus;
}): boolean {
  return block.status === "done" && block.taskStatus === "open";
}

/**
 * "End series here" is offered on a future occurrence of a series whose
 * task is completed: auto-mark never ends a series (ADR 0012).
 */
export function offersEndSeries(
  block: Pick<TimeBlockOccurrence, "seriesId" | "taskStatus" | "startAt">,
  now: Date,
): boolean {
  return (
    block.seriesId !== null &&
    block.taskStatus === "completed" &&
    block.startAt > now
  );
}
