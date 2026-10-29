import { describe, expect, it } from "vitest";

import {
  isReviewOpen,
  openPeriodStarts,
  priorityKey,
  reviewClosesOn,
} from "./weekly-reviews";

describe("isReviewOpen", () => {
  // The week of Mon 26 Oct 2026: period_end 2 Nov, closes 9 Nov.
  const periodEnd = "2026-11-02";

  it("closes a week after the period ends", () => {
    expect(reviewClosesOn(periodEnd)).toBe("2026-11-09");
  });

  it.each([
    ["during the period", "2026-10-28", true],
    ["on the day after it", "2026-11-02", true],
    ["on the last open day", "2026-11-08", true],
    ["on the closing day", "2026-11-09", false],
    ["after it", "2026-12-01", false],
  ])("%s", (_case, today, open) => {
    expect(isReviewOpen(periodEnd, today)).toBe(open);
  });
});

describe("openPeriodStarts", () => {
  it.each([
    [1, "2026-11-04", "2026-11-02", "2026-10-26"],
    [0, "2026-11-04", "2026-11-01", "2026-10-25"],
    [6, "2026-11-04", "2026-10-31", "2026-10-24"],
    // The week's first day itself, and a year boundary.
    [1, "2026-11-02", "2026-11-02", "2026-10-26"],
    [1, "2027-01-01", "2026-12-28", "2026-12-21"],
  ] as const)(
    "week start %i on %s: this week %s, last week %s",
    (weekStart, today, thisWeek, lastWeek) => {
      expect(openPeriodStarts(today, weekStart)).toEqual({
        thisWeek,
        lastWeek,
      });
    },
  );
});

describe("priorityKey", () => {
  it("tells a goal and a task with the same ID apart", () => {
    const id = "6f1c2c8e-8b7a-4b7e-9a51-1f1f6f0e2a10";
    expect(priorityKey({ goalId: id })).not.toBe(priorityKey({ taskId: id }));
  });
});
