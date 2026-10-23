import type { LocalDate } from "@/lib/dates";

// The metrics module's contract (chunk 3.1). Every metric is a named function
// returning a Metric, so a number never travels without its definition and
// the time it covers. Home (3.2), the weekly review (7.1) and insights (9.1)
// read from here, so each definition lives in one place.

/**
 * The local days a metric covers, inclusive, in the user's zone. A null
 * bound is open: a metric with both null looks at the user's current state,
 * whatever the dates. `asOf` is the instant it was worked out at.
 */
export type MetricRange = {
  from: LocalDate | null;
  to: LocalDate | null;
  timeZone: string;
  asOf: Date;
};

export type Metric<Value> = {
  value: Value;
  /** Plain-language definition, shown next to the number. */
  definition: string;
  range: MetricRange;
  /**
   * False when there is nothing for the metric to look at yet (for example
   * no open tasks at all), so the UI says "nothing yet" instead of a zero
   * that reads like a result. True with a zero value means there is data,
   * just none that counts in the range.
   */
  hasData: boolean;
};
