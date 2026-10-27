import { addDays, localDateOf } from "@/lib/dates";
import {
  expandOccurrences,
  type TimedException,
  type TimedOccurrence,
  type TimedSeries,
} from "@/lib/recurrence";

/**
 * How many 366-day windows the search for a series' next occurrence looks
 * through before giving up: eight years, enough for a yearly 29 February.
 */
const SEARCH_WINDOWS = 8;
const WINDOW_DAYS = 366;

/**
 * A timed series' first occurrence that starts after `now` and that
 * `isDone` doesn't rule out (one already reminded about), by its actual
 * start: cancelled occurrences are skipped and moved ones count at their
 * new start (ADR 0013). Null when the series has none left within the
 * search. Pure; expansion is bounded by src/lib/recurrence.ts.
 */
export function nextTimedOccurrence(
  series: TimedSeries,
  exceptions: readonly TimedException[],
  now: Date,
  isDone: (occurrence: TimedOccurrence) => boolean = () => false,
): TimedOccurrence | null {
  // From the day before, so an occurrence running over midnight in the
  // series' zone is considered from its own start.
  let localStart = addDays(localDateOf(now, series.tz), -1);
  for (let window = 0; window < SEARCH_WINDOWS; window++) {
    const localEnd = addDays(localStart, WINDOW_DAYS);
    const next = expandOccurrences(
      series,
      { localStart, localEnd, tz: series.tz },
      exceptions,
    )
      .filter((occurrence) => occurrence.startAt > now && !isDone(occurrence))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
    if (next) return next;
    localStart = localEnd;
  }
  return null;
}
