import { formatLocalDate, formatTimeOfDay, type LocalDate } from "@/lib/dates";
import type { MetricRange } from "@/server/modules/metrics/metric";

// How a Home card states the time its number covers (chunk 3.2). Pure, so
// the wording is unit-tested and every card says it the same way.

/**
 * The local days a metric covers: "Today, 23 Oct 2026", "24 Oct 2026 to
 * 31 Oct 2026", or "Any date" for a metric with no date bounds (it looks
 * at the user's current state).
 */
export function metricRangeLabel(
  range: Pick<MetricRange, "from" | "to">,
  today: LocalDate,
  locale: string,
): string {
  const { from, to } = range;
  const format = (date: LocalDate) => formatLocalDate(date, locale);
  if (from && to) {
    if (from !== to) return `${format(from)} to ${format(to)}`;
    return from === today ? `Today, ${format(from)}` : format(from);
  }
  if (from) return `From ${format(from)}`;
  if (to) return `Up to ${format(to)}`;
  return "Any date";
}

/** When the metric was worked out, as a time of day in the user's zone. */
export function metricAsOfLabel(
  range: Pick<MetricRange, "asOf" | "timeZone">,
  locale: string,
): string {
  return formatTimeOfDay(range.asOf, locale, range.timeZone);
}
