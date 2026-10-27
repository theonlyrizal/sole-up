import { describe, expect, it } from "vitest";

import { instantFromLocal } from "@/lib/dates";
import type { TimedSeries } from "@/lib/recurrence";

import { nextTimedOccurrence } from "./next-occurrence";

const NEW_YORK = "America/New_York";
const at = (local: string) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, NEW_YORK);
};

const weekly: TimedSeries = {
  allDay: false,
  rrule: "FREQ=WEEKLY;BYDAY=SU",
  startAt: at("2027-01-03 01:30"),
  endAt: at("2027-01-03 02:00"),
  tz: NEW_YORK,
};

describe("nextTimedOccurrence", () => {
  it("keeps the wall-clock time across a DST change", () => {
    // 14 March 2027 is the spring-forward Sunday in New York.
    const next = nextTimedOccurrence(weekly, [], at("2027-03-10 12:00"));
    expect(next?.startAt).toEqual(at("2027-03-14 01:30"));
    const after = nextTimedOccurrence(weekly, [], at("2027-03-14 02:00"));
    expect(after?.startAt).toEqual(at("2027-03-21 01:30"));
    expect(after!.startAt.getTime() - next!.startAt.getTime()).toBe(
      (7 * 24 - 1) * 3_600_000,
    );
  });

  it("skips cancelled and done occurrences and an occurrence that has started", () => {
    const now = at("2027-01-10 01:45");
    const next = nextTimedOccurrence(
      weekly,
      [{ kind: "cancelled", originalStartAt: at("2027-01-17 01:30") }],
      now,
      (occurrence) =>
        occurrence.originalStartAt.getTime() ===
        at("2027-01-24 01:30").getTime(),
    );
    expect(next?.originalStartAt).toEqual(at("2027-01-31 01:30"));
  });

  it("returns null when the series has ended", () => {
    const ended = { ...weekly, rrule: "FREQ=WEEKLY;BYDAY=SU;COUNT=2" };
    expect(nextTimedOccurrence(ended, [], at("2027-01-11 00:00"))).toBeNull();
  });
});
