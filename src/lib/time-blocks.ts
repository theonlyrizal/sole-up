// Time block constants shared by the server (schema, validation, service,
// audit) and the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0012-calendar-recurrence-time-blocks-views.md.

import { instantFromLocal, type LocalDate } from "./dates";
import type { TaskStatus } from "./tasks";

/**
 * A block's or occurrence's status, set by the user (ADR 0012). Completing
 * the task auto-marks started blocks `done`; nothing else changes it.
 */
export const TIME_BLOCK_STATUSES = ["scheduled", "done", "skipped"] as const;
export type TimeBlockStatus = (typeof TIME_BLOCK_STATUSES)[number];

/** A block lasts at most a day: 1 to 1440 minutes. */
export const TIME_BLOCK_MIN_MINUTES = 1;
export const TIME_BLOCK_MAX_MINUTES = 1440;

/** The longest stored RRULE value (the builder's rules are far shorter). */
export const TIME_BLOCK_RRULE_MAX = 200;

/**
 * Which occurrences of a repeating block an edit or delete applies to, as
 * for events: this one, this one and every later one, or the whole series.
 */
export const TIME_BLOCK_SCOPES = ["this", "following", "all"] as const;
export type TimeBlockScope = (typeof TIME_BLOCK_SCOPES)[number];

/** An exception either removes one occurrence or holds its own values. */
export const TIME_BLOCK_EXCEPTION_KINDS = ["cancelled", "modified"] as const;
export type TimeBlockExceptionKind =
  (typeof TIME_BLOCK_EXCEPTION_KINDS)[number];

/**
 * Fields a series or one-off edit can change, in the order
 * `time_block.updated` lists them. A block has no text of its own.
 * `status` changes here only when stopping a repeat folds the first
 * occurrence's status into the row; a direct status change is
 * `time_block.status_changed`.
 */
export const TIME_BLOCK_EDITABLE_FIELDS = [
  "startAt",
  "endAt",
  "tz",
  "rrule",
  "status",
] as const;
export type TimeBlockEditableField =
  (typeof TIME_BLOCK_EDITABLE_FIELDS)[number];

/** Columns of an exception that `time_block_exception.updated` can name. */
export const TIME_BLOCK_EXCEPTION_FIELDS = [
  "blockId",
  "originalStartAt",
  "kind",
  "startAt",
  "endAt",
  "status",
] as const;
export type TimeBlockExceptionField =
  (typeof TIME_BLOCK_EXCEPTION_FIELDS)[number];

/** One stored block: a one-off, or the series row of a repeating one. */
export type TimeBlock = {
  id: string;
  taskId: string;
  /** UTC instants; at most 24 hours apart. */
  startAt: Date;
  endAt: Date;
  /** The IANA zone the block was planned in; occurrences keep its wall clock. */
  tz: string;
  /** The RRULE value of a repeating series (ADR 0012); null for a one-off. */
  rrule: string | null;
  /** A one-off's status. A series row stays `scheduled`; occurrences have their own. */
  status: TimeBlockStatus;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * One block or occurrence as `blocksBetween` returns it, with what the
 * calendar shows for it: its task's title and status, and its lane (the
 * task's goal's life area; null is "No area").
 */
export type TimeBlockOccurrence = TimeBlock & {
  /** The series row's ID for an occurrence of a repeating block; null for a one-off. */
  seriesId: string | null;
  /**
   * The occurrence's start as the rule generated it, before any exception
   * moved it: what scoped changes address it by. Null for a one-off.
   */
  originalStart: Date | null;
  /** True when an exception changed this occurrence's times or status. */
  modified: boolean;
  taskTitle: string;
  taskStatus: TaskStatus;
  /** The task's goal: its own, or its milestone's. */
  goalId: string | null;
  /** The goal's life area, the block's resource lane. */
  lifeAreaId: string | null;
};

/** A block's times as the form sends them: a start and a length. */
export type TimeBlockWhen = {
  startDate: LocalDate;
  startTime: string;
  durationMinutes: number;
  tz: string;
};

/**
 * The stored instants for a block's form times: the start is that
 * wall-clock time in `tz` ("compatible" across DST, ADR 0008), and the end
 * is `durationMinutes` of elapsed time later.
 */
export function timeBlockTiming(when: TimeBlockWhen): {
  startAt: Date;
  endAt: Date;
  tz: string;
} {
  const startAt = instantFromLocal(when.startDate, when.startTime, when.tz);
  return {
    startAt,
    endAt: new Date(startAt.getTime() + when.durationMinutes * 60_000),
    tz: when.tz,
  };
}
