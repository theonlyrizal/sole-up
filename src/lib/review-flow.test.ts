import { describe, expect, it } from "vitest";

import {
  adjacentReviewStep,
  defaultReviewWeek,
  nextReviewWeek,
  parseReviewStep,
  parseReviewWeek,
  REVIEW_STEPS,
  reviewHref,
} from "./review-flow";

describe("parseReviewStep", () => {
  it.each(REVIEW_STEPS)("reads %s", (step) => {
    expect(parseReviewStep(step)).toBe(step);
  });

  it.each([undefined, "", "summary", ["reflect"]])(
    "falls back to the first step for %j",
    (value) => {
      expect(parseReviewStep(value)).toBe("look-back");
    },
  );
});

describe("parseReviewWeek", () => {
  it("reads a local date", () => {
    expect(parseReviewWeek("2026-10-19")).toBe("2026-10-19");
  });

  it.each([undefined, "", "2026-13-01", "last", ["2026-10-19"]])(
    "ignores %j",
    (value) => {
      expect(parseReviewWeek(value)).toBeNull();
    },
  );
});

describe("adjacentReviewStep", () => {
  it("walks the four steps in order", () => {
    expect(adjacentReviewStep("look-back", 1)).toBe("reflect");
    expect(adjacentReviewStep("reflect", 1)).toBe("adjust");
    expect(adjacentReviewStep("adjust", 1)).toBe("priorities");
    expect(adjacentReviewStep("priorities", -1)).toBe("adjust");
  });

  it("stops at either end", () => {
    expect(adjacentReviewStep("look-back", -1)).toBeNull();
    expect(adjacentReviewStep("priorities", 1)).toBeNull();
  });
});

describe("reviewHref", () => {
  it("leaves out the default week and the first step", () => {
    expect(reviewHref()).toBe("/review");
    expect(reviewHref("2026-10-19")).toBe("/review?week=2026-10-19");
    expect(reviewHref("2026-10-19", "look-back")).toBe(
      "/review?week=2026-10-19",
    );
  });

  it("names the week and the step", () => {
    expect(reviewHref("2026-10-19", "adjust")).toBe(
      "/review?week=2026-10-19&step=adjust",
    );
  });

  it("round-trips through the parsers", () => {
    const url = new URL(reviewHref("2026-10-19", "priorities"), "http://x");
    expect(parseReviewWeek(url.searchParams.get("week"))).toBe("2026-10-19");
    expect(parseReviewStep(url.searchParams.get("step"))).toBe("priorities");
  });
});

describe("defaultReviewWeek", () => {
  const weeks = { thisWeek: "2026-10-26", lastWeek: "2026-10-19" };

  it("opens last week until its review is finished", () => {
    expect(defaultReviewWeek(weeks, false)).toBe("2026-10-19");
  });

  it("opens this week once last week's review is finished", () => {
    expect(defaultReviewWeek(weeks, true)).toBe("2026-10-26");
  });
});

describe("nextReviewWeek", () => {
  it("is the seven days after the reviewed week", () => {
    // Reviewing the week of Mon 26 Oct on its Thursday.
    expect(nextReviewWeek("2026-11-02", "2026-10-29")).toEqual({
      start: "2026-11-02",
      end: "2026-11-09",
      days: [
        "2026-11-02",
        "2026-11-03",
        "2026-11-04",
        "2026-11-05",
        "2026-11-06",
        "2026-11-07",
        "2026-11-08",
      ],
    });
  });

  it("offers only the days left when it is already under way", () => {
    // Reviewing last week (19–25 Oct) on Thursday 29 Oct.
    expect(nextReviewWeek("2026-10-26", "2026-10-29").days).toEqual([
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });

  it("crosses a month and a year", () => {
    const { start, end, days } = nextReviewWeek("2026-12-28", "2026-12-20");
    expect(start).toBe("2026-12-28");
    expect(end).toBe("2027-01-04");
    expect(days.at(-1)).toBe("2027-01-03");
  });
});
