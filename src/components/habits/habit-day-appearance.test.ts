import { describe, expect, it } from "vitest";

import { habitDayAppearance, habitDayLegend } from "./habit-day-appearance";

describe("D-19 habit history marks", () => {
  it.each([
    ["completed", 1, "habit-mark-done", "✓"],
    ["completed", 0.5, "habit-mark-partial", "◐"],
    ["extra", 0, "habit-mark-extra", "+"],
    ["skipped", 0, "habit-mark-skipped", "−"],
    ["missed", 0, "habit-mark-missed", null],
    ["unlogged", 0, "habit-mark-unlogged", null],
    ["today", 0, "habit-mark-today", null],
    ["future", 0, "habit-mark-future", "·"],
    ["inactive", 0, "habit-mark-inactive", null],
    ["not_scheduled", 0, "habit-mark-off", "×"],
  ] as const)("maps %s at %s credit", (state, credit, className, glyph) => {
    expect(habitDayAppearance({ state, credit })).toMatchObject({
      className,
      glyph,
    });
  });

  it("explains each treatment once", () => {
    expect(new Set(habitDayLegend.map(({ label }) => label)).size).toBe(
      habitDayLegend.length,
    );
    expect(habitDayLegend).toHaveLength(10);
  });
});
