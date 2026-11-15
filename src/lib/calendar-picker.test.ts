import { describe, expect, it } from "vitest";

import { monthDays, shiftMonth } from "./calendar-picker";

describe("calendar month navigation", () => {
  it("clamps to the last day in short and leap months", () => {
    expect(shiftMonth("2028-01-31", 1)).toBe("2028-02-29");
    expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("shows complete weeks using the saved first weekday", () => {
    const monday = monthDays("2026-11-13", 1);
    const sunday = monthDays("2026-11-13", 0);
    expect(monday[0]?.[0]).toBe("2026-10-26");
    expect(monday.at(-1)?.at(-1)).toBe("2026-12-06");
    expect(sunday[0]?.[0]).toBe("2026-11-01");
    expect(sunday.at(-1)?.at(-1)).toBe("2026-12-05");
    expect(monday.every((week) => week.length === 7)).toBe(true);
  });

  it("allows browsing December of the last supported year", () => {
    expect(monthDays("9999-12-20", 1).flat()).toContain("9999-12-31");
    expect(shiftMonth("9999-12-20", 1)).toBe("9999-12-20");
  });
});
