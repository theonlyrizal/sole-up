import { describe, expect, it } from "vitest";

import { metricAsOfLabel, metricRangeLabel } from "./metric-range";

describe("metricRangeLabel", () => {
  const today = "2026-10-24";

  it("names today when the range is one day and it is today", () => {
    expect(metricRangeLabel({ from: today, to: today }, today, "en-GB")).toBe(
      "Today, 24 Oct 2026",
    );
  });

  it("gives a single other day as its date", () => {
    expect(
      metricRangeLabel(
        { from: "2026-10-30", to: "2026-10-30" },
        today,
        "en-GB",
      ),
    ).toBe("30 Oct 2026");
  });

  it("gives both ends of a multi-day range", () => {
    expect(
      metricRangeLabel(
        { from: "2026-10-25", to: "2026-10-31" },
        today,
        "en-GB",
      ),
    ).toBe("25 Oct 2026 to 31 Oct 2026");
  });

  it("states open bounds", () => {
    expect(metricRangeLabel({ from: null, to: null }, today, "en-GB")).toBe(
      "Any date",
    );
    expect(
      metricRangeLabel({ from: "2026-10-25", to: null }, today, "en-GB"),
    ).toBe("From 25 Oct 2026");
    expect(
      metricRangeLabel({ from: null, to: "2026-10-31" }, today, "en-GB"),
    ).toBe("Up to 31 Oct 2026");
  });

  it("formats dates in the user's locale", () => {
    expect(
      metricRangeLabel(
        { from: "2026-10-25", to: "2026-10-31" },
        today,
        "en-US",
      ),
    ).toBe("Oct 25, 2026 to Oct 31, 2026");
  });
});

describe("metricAsOfLabel", () => {
  it("is the time of day in the user's zone, not UTC", () => {
    // 15:01 UTC on the 23rd is 00:01 on the 24th in Tokyo.
    const asOf = new Date("2026-10-23T15:01:00Z");
    expect(metricAsOfLabel({ asOf, timeZone: "Asia/Tokyo" }, "en-GB")).toBe(
      "00:01",
    );
    expect(metricAsOfLabel({ asOf, timeZone: "UTC" }, "en-GB")).toBe("15:01");
  });
});
