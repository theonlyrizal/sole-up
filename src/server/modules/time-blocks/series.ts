// Pure helpers for repeating time blocks (ADR 0012). No database access:
// service.ts loads and writes the rows. The approach follows
// calendar-events/series.ts, simplified because blocks are timed only and
// have no text of their own: an occurrence is its times plus its status.
//
// - An occurrence is addressed by its original start, the instant its rule
//   generates. Every builder frequency has at most one occurrence a day, so
//   the original start's local date (in the series' zone) names it too.
// - A modified exception is a full snapshot of its occurrence (times and
//   status); an occurrence with no exception is `scheduled`.
// - "All" and "following" edits move the series by the days the occurrence
//   moved and take its new time of day, zone and length; exceptions follow
//   (`reconcileExceptions`) and keep their status.

import {
  addDays,
  daysBetween,
  instantFromLocal,
  localDateOf,
  type LocalDate,
  startOfLocalDay,
} from "@/lib/dates";
import {
  expandOccurrences,
  fromRrule,
  occurrenceStartOn,
  seriesStartDate,
  type TimedSeries,
} from "@/lib/recurrence";
import {
  type TimeBlockStatus,
  timeBlockTiming,
  type TimeBlockWhen,
} from "@/lib/time-blocks";
import type { timeBlockExceptions, timeBlocks } from "@/server/db/schema";

export type TimeBlockRow = typeof timeBlocks.$inferSelect;
export type ExceptionRow = typeof timeBlockExceptions.$inferSelect;

/** The columns a series or one-off edit can write. */
export type SeriesColumns = Pick<
  TimeBlockRow,
  "startAt" | "endAt" | "tz" | "rrule" | "status"
>;

/** An exception's columns other than its ID, owner and series. */
export type ExceptionColumns = Omit<
  ExceptionRow,
  "id" | "userId" | "blockId" | "createdAt" | "updatedAt"
>;

export type Times = { startAt: Date; endAt: Date };

/** What one occurrence shows. */
export type OccurrenceValues = Times & { status: TimeBlockStatus };

/** A rule with one occurrence: how a one-off block expands. */
const ONE_OCCURRENCE = "FREQ=DAILY;COUNT=1";

/** The series in the shape `src/lib/recurrence.ts` takes. */
export function asSeries(row: SeriesColumns): TimedSeries {
  return {
    allDay: false,
    rrule: row.rrule ?? ONE_OCCURRENCE,
    startAt: row.startAt,
    endAt: row.endAt,
    tz: row.tz,
  };
}

export function seriesColumnsOf(row: TimeBlockRow): SeriesColumns {
  return {
    startAt: row.startAt,
    endAt: row.endAt,
    tz: row.tz,
    rrule: row.rrule,
    status: row.status,
  };
}

/** The local date an original start falls on, in the series' zone. */
export function originalDateOf(series: SeriesColumns, key: Date): LocalDate {
  return localDateOf(key, series.tz);
}

/** The rule's start on `date`, or null when it generates none that day. */
export function occurrenceOn(
  series: SeriesColumns,
  date: LocalDate,
): Date | null {
  return occurrenceStartOn(asSeries(series), date);
}

/** True when the series' rule generates an occurrence starting at `key`. */
export function generatesOccurrence(series: SeriesColumns, key: Date): boolean {
  const start = occurrenceOn(series, originalDateOf(series, key));
  return start !== null && start.getTime() === key.getTime();
}

/** The times the rule gives the occurrence starting at `key`. */
export function generatedTimes(series: SeriesColumns, key: Date): Times {
  const duration = series.endAt.getTime() - series.startAt.getTime();
  return { startAt: key, endAt: new Date(key.getTime() + duration) };
}

export function sameTimes(a: Times, b: Times): boolean {
  return (
    a.startAt.getTime() === b.startAt.getTime() &&
    a.endAt.getTime() === b.endAt.getTime()
  );
}

/**
 * What the occurrence at `key` shows: its modified exception, or the
 * generated times, `scheduled`. Null when it is cancelled.
 */
export function displayedValues(
  series: SeriesColumns,
  key: Date,
  exception: ExceptionRow | undefined,
): OccurrenceValues | null {
  if (exception?.kind === "cancelled") return null;
  if (exception) {
    // The override CHECK sets a modified exception's times and status.
    return {
      startAt: exception.startAt!,
      endAt: exception.endAt!,
      status: exception.status!,
    };
  }
  return { ...generatedTimes(series, key), status: "scheduled" };
}

export function cancelledColumns(key: Date): ExceptionColumns {
  return {
    originalStartAt: key,
    kind: "cancelled",
    startAt: null,
    endAt: null,
    status: null,
  };
}

export function modifiedColumns(
  key: Date,
  values: OccurrenceValues,
): ExceptionColumns {
  return {
    originalStartAt: key,
    kind: "modified",
    startAt: values.startAt,
    endAt: values.endAt,
    status: values.status,
  };
}

export type SeriesEdit = {
  /** The series' columns after the edit. */
  next: SeriesColumns;
  /** Days every occurrence moves by. */
  shift: number;
  /** The occurrence's new times, when the user changed them. */
  times: Times | null;
};

/**
 * A series after an "all" edit made from one of its occurrences (or, from a
 * base starting at the split occurrence, a "this and following" one).
 * Changed times move the series' first occurrence by the same number of
 * days as the occurrence moved, at the new time of day, zone and length.
 * The rule is the one the form sent; null stops the repeat.
 */
export function seriesAfterEdit(
  base: SeriesColumns,
  displayed: Times,
  input: { when: TimeBlockWhen; rrule: string | null },
): SeriesEdit {
  const { when, rrule } = input;
  const next: SeriesColumns = { ...base, rrule };
  const inputTimes = timeBlockTiming(when);
  const timesChanged = !sameTimes(inputTimes, displayed) || when.tz !== base.tz;
  if (!timesChanged) return { next, shift: 0, times: null };

  const shift = daysBetween(
    localDateOf(displayed.startAt, base.tz),
    when.startDate,
  );
  const startDate = addDays(seriesStartDate(asSeries(base)), shift);
  const startAt = instantFromLocal(startDate, when.startTime, when.tz);
  const duration = inputTimes.endAt.getTime() - inputTimes.startAt.getTime();
  Object.assign(next, {
    startAt,
    endAt: new Date(startAt.getTime() + duration),
    tz: when.tz,
  });
  return {
    next,
    shift,
    times: { startAt: inputTimes.startAt, endAt: inputTimes.endAt },
  };
}

/** True when the rule ends on a date before the series' first occurrence. */
export function endsBeforeStart(series: SeriesColumns): boolean {
  if (!series.rrule) return false;
  const end = fromRrule(series.rrule).end;
  return end.type === "until" && end.until < seriesStartDate(asSeries(series));
}

export type Reconciled = {
  /** Exceptions kept, with their new columns (which may be unchanged). */
  kept: { row: ExceptionRow; next: ExceptionColumns }[];
  /** Exceptions the change removes, which the user should be told about. */
  dropped: ExceptionRow[];
  /** Exceptions whose occurrence the old rule no longer generated. */
  stale: ExceptionRow[];
  /**
   * When the repeat stops: the first occurrence's modified exception, whose
   * times and status become the one-off block's.
   */
  folded: { row: ExceptionRow; values: OccurrenceValues } | null;
};

/**
 * Carries a series' exceptions over a change from `from` to `to`, where
 * every occurrence moved by `shift` days. `edit` is the occurrence the
 * change was made from, whose own exception takes the new times.
 *
 * - An exception moves to the occurrence `shift` days later. It is dropped
 *   when the new rule generates none that day.
 * - A modified exception keeps its status. Times equal to the old
 *   generated ones follow the new generated ones; times it moved are kept.
 * - When the repeat stops (`to.rrule` is null), only the first occurrence
 *   remains: its modified exception is folded into the block, and every
 *   other exception, including a cancelled first occurrence, is dropped.
 */
export function reconcileExceptions({
  from,
  to,
  shift,
  exceptions,
  edit,
}: {
  from: SeriesColumns;
  to: SeriesColumns;
  shift: number;
  exceptions: readonly ExceptionRow[];
  edit?: { key: Date; times: Times | null };
}): Reconciled {
  const result: Reconciled = { kept: [], dropped: [], stale: [], folded: null };

  for (const row of exceptions) {
    const key = row.originalStartAt;
    if (!generatesOccurrence(from, key)) {
      result.stale.push(row);
      continue;
    }
    const newKey = occurrenceOn(to, addDays(originalDateOf(from, key), shift));
    if (newKey === null) {
      result.dropped.push(row);
      continue;
    }
    if (row.kind === "cancelled") {
      result.kept.push({ row, next: cancelledColumns(newKey) });
      continue;
    }

    const isEdit = edit !== undefined && edit.key.getTime() === key.getTime();
    let times: Times = { startAt: row.startAt!, endAt: row.endAt! };
    if (isEdit && edit.times) times = edit.times;
    else if (sameTimes(times, generatedTimes(from, key)))
      times = generatedTimes(to, newKey);
    result.kept.push({
      row,
      next: modifiedColumns(newKey, { ...times, status: row.status! }),
    });
  }

  if (to.rrule === null) {
    for (const { row, next } of result.kept) {
      if (next.kind === "modified" && !result.folded) {
        result.folded = {
          row,
          values: {
            startAt: next.startAt!,
            endAt: next.endAt!,
            status: next.status!,
          },
        };
      } else {
        result.dropped.push(row);
      }
    }
    result.kept = [];
  }
  return result;
}

/** One block or occurrence that auto-mark changes to `done`. */
export type AutoMarkTarget =
  | { kind: "block"; row: TimeBlockRow }
  | {
      kind: "occurrence";
      series: TimeBlockRow;
      originalStartAt: Date;
      times: Times;
      exception: ExceptionRow | undefined;
    };

/**
 * The blocks of a task that completing it at `completedAt` marks `done`
 * (ADR 0012), with `timeZone` the user's (each series' own zone when the
 * user has none yet):
 * - a one-off block that is still `scheduled` and has started (its start
 *   at or before the completion);
 * - an occurrence of a series that started on the completion's local day
 *   (at or after that day's midnight, at or before the completion) and is
 *   still `scheduled`. Earlier occurrences stay as they are.
 * Skipped, done, cancelled and future blocks are never targets.
 */
export function autoMarkTargets(
  blocks: readonly TimeBlockRow[],
  exceptions: readonly ExceptionRow[],
  completedAt: Date,
  timeZone: string | null,
): AutoMarkTarget[] {
  const targets: AutoMarkTarget[] = [];
  const completed = completedAt.getTime();

  for (const row of blocks) {
    if (row.rrule === null) {
      if (row.status === "scheduled" && row.startAt.getTime() <= completed) {
        targets.push({ kind: "block", row });
      }
      continue;
    }

    const tz = timeZone ?? row.tz;
    const today = localDateOf(completedAt, tz);
    const dayStart = startOfLocalDay(today, tz).getTime();
    const own = exceptions.filter((exception) => exception.blockId === row.id);
    const occurrences = expandOccurrences<ExceptionRow>(
      { ...asSeries(row), rrule: row.rrule },
      { localStart: today, localEnd: addDays(today, 1), tz },
      own.map((exception) =>
        exception.kind === "cancelled"
          ? { kind: "cancelled", originalStartAt: exception.originalStartAt }
          : {
              kind: "modified",
              originalStartAt: exception.originalStartAt,
              startAt: exception.startAt!,
              endAt: exception.endAt!,
              patch: exception,
            },
      ),
    );
    for (const occurrence of occurrences) {
      const start = occurrence.startAt.getTime();
      const status = occurrence.patch?.status ?? "scheduled";
      if (start < dayStart || start > completed || status !== "scheduled") {
        continue;
      }
      targets.push({
        kind: "occurrence",
        series: row,
        originalStartAt: occurrence.originalStartAt,
        times: { startAt: occurrence.startAt, endAt: occurrence.endAt },
        exception: occurrence.patch ?? undefined,
      });
    }
  }
  return targets;
}
