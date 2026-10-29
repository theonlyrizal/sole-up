import { describe, expect, it } from "vitest";

import type { HabitWeekInput } from "./consistency";
import {
  changedLogFields,
  CHECK_HAS_NO_VALUE,
  describeLog,
  habitDayLabel,
  isLoggableDay,
  logValueProblem,
  showsOnToday,
  SKIP_HAS_NO_VALUE,
  stripRange,
  VALUE_REQUIRED,
  weekProgressLabel,
} from "./logging";

// Wednesday 4 Nov 2026; with a Monday week start the week began 11-02.
const TODAY = "2026-11-04";

function input(overrides: Partial<HabitWeekInput> = {}): HabitWeekInput {
  return {
    habit: {
      measure: "check",
      unit: null,
      startDate: "2026-10-01",
      endDate: null,
    },
    schedules: [
      {
        effectiveFrom: "2026-09-28",
        cadenceType: "daily",
        cadenceConfig: {},
        target: null,
      },
    ],
    pauses: [],
    logs: [],
    today: TODAY,
    weekStart: 1,
    ...overrides,
  };
}

const timesPerWeek = (n: number) =>
  input({
    schedules: [
      {
        effectiveFrom: "2026-09-28",
        cadenceType: "times_per_week",
        cadenceConfig: { timesPerWeek: n },
        target: null,
      },
    ],
  });

const done = (localDate: string) => ({
  localDate,
  status: "completed" as const,
  value: null,
});

describe("logValueProblem", () => {
  it.each([
    ["check", "completed", null, null],
    ["check", "completed", 1, CHECK_HAS_NO_VALUE],
    ["check", "skipped", null, null],
    ["check", "skipped", 1, SKIP_HAS_NO_VALUE],
    ["quantity", "completed", 2.5, null],
    ["quantity", "completed", null, VALUE_REQUIRED],
    ["quantity", "skipped", null, null],
    ["quantity", "skipped", 2, SKIP_HAS_NO_VALUE],
  ] as const)("%s %s with %s → %s", (measure, status, value, problem) => {
    expect(logValueProblem(measure, { status, value })).toBe(problem);
  });
});

describe("changedLogFields", () => {
  it("names what changed, status first", () => {
    const completed = { status: "completed", value: 8 } as const;
    expect(changedLogFields(completed, completed)).toEqual([]);
    expect(changedLogFields(completed, { ...completed, value: 4 })).toEqual([
      "value",
    ]);
    expect(
      changedLogFields(completed, { status: "skipped", value: null }),
    ).toEqual(["status", "value"]);
    expect(
      changedLogFields(
        { status: "skipped", value: null },
        { status: "completed", value: null },
      ),
    ).toEqual(["status"]);
  });
});

describe("showsOnToday", () => {
  it("shows an active daily habit on an active day only", () => {
    expect(showsOnToday("active", input())).toBe(true);
    expect(
      showsOnToday(
        "active",
        input({ pauses: [{ startDate: TODAY, endDate: null }] }),
      ),
    ).toBe(false);
    expect(
      showsOnToday(
        "active",
        input({
          habit: { ...input().habit, startDate: "2026-11-05" },
        }),
      ),
    ).toBe(false);
    expect(
      showsOnToday(
        "active",
        input({ habit: { ...input().habit, endDate: "2026-11-03" } }),
      ),
    ).toBe(false);
  });

  it("shows paused habits only when logged today, archived ones never", () => {
    expect(showsOnToday("paused", input())).toBe(false);
    const logged = input({ logs: [done(TODAY)] });
    expect(showsOnToday("paused", logged)).toBe(true);
    expect(showsOnToday("archived", logged)).toBe(false);
  });

  it("shows chosen-days habits on their days, or when logged as an extra", () => {
    const habit = (days: number[]) =>
      input({
        schedules: [
          {
            effectiveFrom: "2026-09-28",
            cadenceType: "weekly_days",
            cadenceConfig: { days },
            target: null,
          },
        ],
      });
    // 4 Nov 2026 is a Wednesday (3).
    expect(showsOnToday("active", habit([1, 3, 5]))).toBe(true);
    expect(showsOnToday("active", habit([1, 5]))).toBe(false);
    expect(
      showsOnToday("active", { ...habit([1, 5]), logs: [done(TODAY)] }),
    ).toBe(true);
  });

  it("shows times-a-week habits until the week's target is met", () => {
    expect(showsOnToday("active", timesPerWeek(2))).toBe(true);
    const metEarlier = {
      ...timesPerWeek(2),
      logs: [done("2026-11-02"), done("2026-11-03")],
    };
    expect(showsOnToday("active", metEarlier)).toBe(false);
    // Last week's logs don't count towards this week.
    expect(
      showsOnToday("active", {
        ...timesPerWeek(2),
        logs: [done("2026-10-30"), done("2026-11-01")],
      }),
    ).toBe(true);
    // Met with today's log: stays, so it can be undone.
    expect(
      showsOnToday("active", {
        ...timesPerWeek(2),
        logs: [done("2026-11-02"), done(TODAY)],
      }),
    ).toBe(true);
    // Each skip lowers the target: two skips of two leave nothing to do.
    const skip = (localDate: string) => ({
      localDate,
      status: "skipped" as const,
      value: null,
    });
    expect(
      showsOnToday("active", {
        ...timesPerWeek(2),
        logs: [skip("2026-11-02"), skip("2026-11-03")],
      }),
    ).toBe(false);
  });
});

describe("labels", () => {
  const water = { measure: "quantity", unit: "glasses" } as const;
  const stretch = { measure: "check", unit: null } as const;

  it("weekProgressLabel cuts to one decimal", () => {
    expect(weekProgressLabel({ done: 1, target: 3 })).toBe(
      "1 of 3 so far this week",
    );
    expect(weekProgressLabel({ done: 1.96, target: 3 })).toBe(
      "1.9 of 3 so far this week",
    );
  });

  it("describeLog says done, skipped or the amount against the target", () => {
    expect(
      describeLog({ status: "completed", value: null }, stretch, null, "en"),
    ).toBe("Done");
    expect(
      describeLog({ status: "skipped", value: null }, water, 8, "en"),
    ).toBe("Skipped");
    expect(
      describeLog({ status: "completed", value: 1.5 }, water, 8, "en"),
    ).toBe("1.5 of 8 glasses");
    expect(
      describeLog({ status: "completed", value: 1500 }, water, null, "de"),
    ).toBe("1.500 glasses");
  });

  it("habitDayLabel adds the log where the state doesn't say it", () => {
    const completed = { status: "completed", value: null } as const;
    expect(
      habitDayLabel({ state: "missed", log: null }, stretch, null, "en"),
    ).toBe("Missed");
    expect(
      habitDayLabel(
        { state: "completed", log: completed },
        stretch,
        null,
        "en",
      ),
    ).toBe("Done");
    expect(
      habitDayLabel(
        { state: "completed", log: { status: "completed", value: 4 } },
        water,
        8,
        "en",
      ),
    ).toBe("4 of 8 glasses");
    expect(
      habitDayLabel({ state: "extra", log: completed }, stretch, null, "en"),
    ).toBe("Extra, not counted · Done");
    expect(
      habitDayLabel({ state: "inactive", log: completed }, stretch, null, "en"),
    ).toBe("Not active · Done");
    expect(
      habitDayLabel(
        {
          state: "not_scheduled",
          log: { status: "skipped", value: null },
        },
        stretch,
        null,
        "en",
      ),
    ).toBe("Not scheduled · Skipped");
  });
});

describe("isLoggableDay", () => {
  it("opens active days up to today, and any day with a log", () => {
    const log = { status: "completed", value: null } as const;
    expect(
      isLoggableDay({ date: "2026-11-02", state: "missed", log: null }, TODAY),
    ).toBe(true);
    expect(
      isLoggableDay({ date: TODAY, state: "today", log: null }, TODAY),
    ).toBe(true);
    expect(
      isLoggableDay(
        { date: "2026-11-02", state: "not_scheduled", log: null },
        TODAY,
      ),
    ).toBe(true);
    expect(
      isLoggableDay(
        { date: "2026-11-02", state: "inactive", log: null },
        TODAY,
      ),
    ).toBe(false);
    expect(
      isLoggableDay({ date: "2026-11-02", state: "inactive", log }, TODAY),
    ).toBe(true);
    expect(
      isLoggableDay({ date: "2026-11-05", state: "future", log: null }, TODAY),
    ).toBe(false);
  });
});

describe("stripRange", () => {
  it("covers last week and this week, from the user's week start", () => {
    expect(stripRange(TODAY, 1)).toEqual({
      from: "2026-10-26",
      to: "2026-11-08",
    });
    expect(stripRange(TODAY, 0)).toEqual({
      from: "2026-10-25",
      to: "2026-11-07",
    });
    // Today is the week's first day.
    expect(stripRange(TODAY, 3)).toEqual({
      from: "2026-10-28",
      to: "2026-11-10",
    });
  });
});
