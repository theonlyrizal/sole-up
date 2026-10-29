import { describe, expect, it } from "vitest";

import { startOfWeek, type WeekStart } from "../dates";

import {
  DEFAULT_TRACK_RANGE,
  formatDateSpan,
  parseTrackRange,
  shortDateLabel,
  trackHabitAnchor,
  trackHref,
  trackRangeDates,
  TRACK_RANGE_LABELS,
  TRACK_RANGES,
  weekProgressFigure,
  weekStartsOf,
} from "./track-range";

// Wednesday 4 Nov 2026; with a Monday week start the week began 11-02.
const TODAY = "2026-11-04";

describe("parseTrackRange and trackHref", () => {
  it("reads the three ranges and falls back to the last 4 weeks", () => {
    expect(DEFAULT_TRACK_RANGE).toBe("4w");
    expect(parseTrackRange("12w")).toBe("12w");
    expect(parseTrackRange("week")).toBe("week");
    expect(parseTrackRange("4w")).toBe("4w");
    expect(parseTrackRange(["week", "12w"])).toBe("week");
    for (const junk of [undefined, "", "2w", "12", "WEEK", "52w"]) {
      expect(parseTrackRange(junk)).toBe("4w");
    }
  });

  it("keeps the default range on the plain path", () => {
    expect(TRACK_RANGES.map(trackHref)).toEqual([
      "/track",
      "/track?range=12w",
      "/track?range=week",
    ]);
    for (const range of TRACK_RANGES) {
      expect(
        parseTrackRange(
          new URL(trackHref(range), "http://x").searchParams.get("range") ??
            undefined,
        ),
      ).toBe(range);
    }
  });

  it("labels each range", () => {
    expect(TRACK_RANGES.map((range) => TRACK_RANGE_LABELS[range])).toEqual([
      "Last 4 weeks",
      "Last 12 weeks",
      "This week",
    ]);
  });
});

describe("trackHabitAnchor", () => {
  it("names a habit's row on Track, for Home's links", () => {
    expect(trackHabitAnchor("0b1c2d3e-0000-4000-8000-000000000001")).toBe(
      "habit-0b1c2d3e-0000-4000-8000-000000000001",
    );
  });
});

describe("trackRangeDates", () => {
  it("covers whole weeks ending with the week holding today", () => {
    expect(trackRangeDates(TODAY, 1, "4w")).toEqual({
      from: "2026-10-12",
      to: "2026-11-08",
    });
    expect(trackRangeDates(TODAY, 1, "12w")).toEqual({
      from: "2026-08-17",
      to: "2026-11-08",
    });
    expect(trackRangeDates(TODAY, 1, "week")).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
    });
  });

  it("follows every week start, including today as a week's first or last day", () => {
    for (const weekStart of [0, 1, 2, 3, 4, 5, 6] as WeekStart[]) {
      for (const range of TRACK_RANGES) {
        const { from, to } = trackRangeDates(TODAY, weekStart, range);
        const weeks = { "4w": 4, "12w": 12, week: 1 }[range];
        expect(startOfWeek(from, weekStart)).toBe(from);
        expect(weekStartsOf({ from, to })).toHaveLength(weeks);
        expect(from <= TODAY && TODAY <= to).toBe(true);
        // The last week is the one holding today.
        expect(weekStartsOf({ from, to }).at(-1)).toBe(
          startOfWeek(TODAY, weekStart),
        );
      }
    }
    // Wednesday is the first day: the range ends next Tuesday.
    expect(trackRangeDates(TODAY, 3, "week")).toEqual({
      from: "2026-11-04",
      to: "2026-11-10",
    });
    // Thursday is the first day: today is the week's last day.
    expect(trackRangeDates(TODAY, 4, "week")).toEqual({
      from: "2026-10-29",
      to: "2026-11-04",
    });
  });

  it("crosses a year boundary", () => {
    expect(trackRangeDates("2027-01-06", 1, "4w")).toEqual({
      from: "2026-12-14",
      to: "2027-01-10",
    });
  });
});

describe("weekStartsOf", () => {
  it("lists each week's first day, oldest first", () => {
    expect(weekStartsOf({ from: "2026-10-12", to: "2026-11-08" })).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
    ]);
  });
});

// Intl puts thin spaces around the dash; compare with plain spaces.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("formatDateSpan and shortDateLabel", () => {
  it("formats in the user's locale, whatever the server's zone", () => {
    expect(
      plain(formatDateSpan({ from: "2026-10-12", to: "2026-11-08" }, "en-US")),
    ).toBe("Oct 12 – Nov 8, 2026");
    expect(
      plain(formatDateSpan({ from: "2026-12-14", to: "2027-01-10" }, "en-GB")),
    ).toBe("14 Dec 2026 – 10 Jan 2027");
    expect(shortDateLabel("2026-10-26", "en-US")).toBe("Oct 26");
    expect(shortDateLabel("2026-10-26", "en-GB")).toBe("26 Oct");
  });
});

describe("weekProgressFigure", () => {
  it("names times for times_per_week and days otherwise", () => {
    expect(
      weekProgressFigure(
        { done: 1, target: 3, skipped: 0 },
        "times_per_week",
        "check",
      ),
    ).toBe("1 of 3 times so far this week");
    expect(
      weekProgressFigure(
        { done: 0, target: 1, skipped: 0 },
        "times_per_week",
        "check",
      ),
    ).toBe("0 of 1 time so far this week");
    expect(
      weekProgressFigure(
        { done: 2, target: 5, skipped: 1 },
        "weekly_days",
        "check",
      ),
    ).toBe("2 of 5 days so far this week · 1 skipped");
    expect(
      weekProgressFigure({ done: 1, target: 1, skipped: 0 }, "daily", "check"),
    ).toBe("1 of 1 day so far this week");
  });

  it("cuts quantity credit to one decimal and counts days at target", () => {
    expect(
      weekProgressFigure(
        { done: 2.96, target: 7, skipped: 0, atTarget: 2 },
        "daily",
        "quantity",
      ),
    ).toBe("2.9 of 7 days so far this week · 2 at target");
    expect(
      weekProgressFigure(
        { done: 0, target: 2, skipped: 1 },
        "times_per_week",
        "quantity",
      ),
    ).toBe("0 of 2 times so far this week · 0 at target · 1 skipped");
  });

  it("shows no numbers when nothing is expected this week", () => {
    expect(
      weekProgressFigure({ done: 0, target: 0, skipped: 0 }, "daily", "check"),
    ).toBe("Nothing expected this week");
    expect(
      weekProgressFigure(
        { done: 0, target: 0, skipped: 2 },
        "times_per_week",
        "quantity",
      ),
    ).toBe("Nothing expected this week · 2 skipped");
  });
});
