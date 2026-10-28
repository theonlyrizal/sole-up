import { describe, expect, it } from "vitest";

import {
  anyCadenceConfigSchema,
  parseCadence,
  scheduleForWeek,
} from "./cadence";
import {
  closePause,
  HABIT_STATUSES,
  habitStatusActionOutcome,
  pauseStartDate,
  type HabitStatus,
} from "./habit";

describe("habitStatusActionOutcome", () => {
  const table: Record<string, Record<HabitStatus, string>> = {
    pause: { active: "change", paused: "noop", archived: "conflict" },
    resume: { active: "noop", paused: "change", archived: "conflict" },
    archive: { active: "change", paused: "change", archived: "noop" },
    restore: { active: "noop", paused: "conflict", archived: "change" },
  };

  for (const [action, outcomes] of Object.entries(table)) {
    for (const status of HABIT_STATUSES) {
      it(`${action} from ${status} is ${outcomes[status]}`, () => {
        expect(habitStatusActionOutcome(action as "pause", status)).toBe(
          outcomes[status],
        );
      });
    }
  }
});

describe("pauseStartDate", () => {
  it("starts today, or tomorrow when today is logged", () => {
    expect(pauseStartDate("2026-11-04", false, null)).toBe("2026-11-04");
    expect(pauseStartDate("2026-11-04", true, null)).toBe("2026-11-05");
  });

  it("never starts before the latest pause's end", () => {
    expect(pauseStartDate("2026-11-04", false, "2026-11-05")).toBe(
      "2026-11-05",
    );
    expect(pauseStartDate("2026-11-04", false, "2026-11-01")).toBe(
      "2026-11-04",
    );
  });
});

describe("closePause", () => {
  it("ends today, or deletes a pause that would be empty", () => {
    expect(closePause("2026-11-01", "2026-11-04")).toEqual({
      endDate: "2026-11-04",
    });
    expect(closePause("2026-11-04", "2026-11-04")).toBe("delete");
    expect(closePause("2026-11-05", "2026-11-04")).toBe("delete");
  });
});

describe("scheduleForWeek", () => {
  const rows = [
    { effectiveFrom: "2026-10-05", id: "a" },
    { effectiveFrom: "2026-10-19", id: "b" },
    { effectiveFrom: "2026-11-02", id: "c" },
  ];

  it("takes the latest row on or before the week's last day", () => {
    expect(scheduleForWeek(rows, "2026-10-11")?.id).toBe("a");
    expect(scheduleForWeek(rows, "2026-10-25")?.id).toBe("b");
    expect(scheduleForWeek(rows, "2026-11-08")?.id).toBe("c");
    expect(scheduleForWeek(rows, "2027-01-01")?.id).toBe("c");
  });

  it("falls back to the earliest row, and null with none", () => {
    expect(scheduleForWeek(rows, "2026-09-01")?.id).toBe("a");
    expect(scheduleForWeek([], "2026-09-01")).toBeNull();
  });
});

describe("parseCadence", () => {
  it("checks a stored row against its type", () => {
    expect(
      parseCadence({
        cadenceType: "weekly_days",
        cadenceConfig: { days: [2] },
      }),
    ).toEqual({ cadenceType: "weekly_days", cadenceConfig: { days: [2] } });
    expect(() =>
      parseCadence({ cadenceType: "daily", cadenceConfig: { days: [2] } }),
    ).toThrow();
    expect(() =>
      parseCadence({ cadenceType: "hourly", cadenceConfig: {} }),
    ).toThrow();
  });

  it("the audit shape accepts each config and nothing else", () => {
    expect(anyCadenceConfigSchema.safeParse({}).success).toBe(true);
    expect(anyCadenceConfigSchema.safeParse({ days: [1] }).success).toBe(true);
    expect(anyCadenceConfigSchema.safeParse({ timesPerWeek: 2 }).success).toBe(
      true,
    );
    expect(anyCadenceConfigSchema.safeParse({ note: "x" }).success).toBe(false);
  });
});
