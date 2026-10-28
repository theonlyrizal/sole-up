import { describe, expect, it } from "vitest";

import {
  addDays,
  dayOfWeek,
  startOfWeek,
  type LocalDate,
  type WeekStart,
} from "../dates";

import {
  consistency,
  cutToOneDecimal,
  formatConsistency,
  habitDays,
  isActiveDay,
  weekProgress,
  weekTarget,
  type EngineHabit,
  type EngineLog,
  type EngineSchedule,
  type HabitRangeInput,
} from "./consistency";

// Weeks used throughout, with Monday as the week start:
// W1 = Mon 2026-11-02 … Sun 2026-11-08
// W2 = Mon 2026-11-09 … Sun 2026-11-15
// W3 = Mon 2026-11-16 … Sun 2026-11-22
const W1 = "2026-11-02";
const W2 = "2026-11-09";
const W3 = "2026-11-16";
const AFTER_W3 = "2026-11-23";

const habit = (overrides: Partial<EngineHabit> = {}): EngineHabit => ({
  measure: "check",
  unit: null,
  startDate: "2026-10-01",
  endDate: null,
  ...overrides,
});

const daily = (effectiveFrom = W1, target: number | null = null) =>
  ({
    effectiveFrom,
    cadenceType: "daily",
    cadenceConfig: {},
    target,
  }) satisfies EngineSchedule;

const weeklyDays = (
  days: number[],
  effectiveFrom = W1,
  target: number | null = null,
) =>
  ({
    effectiveFrom,
    cadenceType: "weekly_days",
    cadenceConfig: { days },
    target,
  }) satisfies EngineSchedule;

const timesPerWeek = (
  timesPerWeek: number,
  effectiveFrom = W1,
  target: number | null = null,
) =>
  ({
    effectiveFrom,
    cadenceType: "times_per_week",
    cadenceConfig: { timesPerWeek },
    target,
  }) satisfies EngineSchedule;

const done = (
  localDate: LocalDate,
  value: number | null = null,
): EngineLog => ({
  localDate,
  status: "completed",
  value,
});
const skip = (localDate: LocalDate): EngineLog => ({
  localDate,
  status: "skipped",
  value: null,
});

/** `count` consecutive days from `from`. */
const days = (from: LocalDate, count: number) =>
  Array.from({ length: count }, (_, i) => addDays(from, i));

const week = (from: LocalDate) => ({ from, to: addDays(from, 6) });
const weeks = (from: LocalDate, count: number) => ({
  from,
  to: addDays(from, count * 7 - 1),
});

function input(overrides: Partial<HabitRangeInput> = {}): HabitRangeInput {
  return {
    habit: habit(),
    schedules: [daily()],
    pauses: [],
    logs: [],
    today: AFTER_W3,
    weekStart: 1,
    range: week(W1),
    ...overrides,
  };
}

/** Consistency without the definition, for compact assertions. */
function figure(overrides: Partial<HabitRangeInput> = {}) {
  const { definition, ...rest } = consistency(input(overrides));
  expect(definition.length).toBeGreaterThan(0);
  return rest;
}

const states = (overrides: Partial<HabitRangeInput> = {}) =>
  habitDays(input(overrides)).map((day) => day.state);

describe("fixtures", () => {
  it("use Mondays for the week starts", () => {
    for (const date of [W1, W2, W3, AFTER_W3]) expect(dayOfWeek(date)).toBe(1);
  });
});

describe("isActiveDay", () => {
  const h = { startDate: "2026-11-03", endDate: "2026-11-10" };

  it("includes the start and end dates", () => {
    expect(isActiveDay(h, [], "2026-11-02")).toBe(false);
    expect(isActiveDay(h, [], "2026-11-03")).toBe(true);
    expect(isActiveDay(h, [], "2026-11-10")).toBe(true);
    expect(isActiveDay(h, [], "2026-11-11")).toBe(false);
  });

  it("has no end without an end date", () => {
    expect(isActiveDay({ ...h, endDate: null }, [], "2030-01-01")).toBe(true);
  });

  it("treats a pause's end as the first active day again", () => {
    const pauses = [{ startDate: "2026-11-05", endDate: "2026-11-07" }];
    expect(isActiveDay(h, pauses, "2026-11-04")).toBe(true);
    expect(isActiveDay(h, pauses, "2026-11-05")).toBe(false);
    expect(isActiveDay(h, pauses, "2026-11-06")).toBe(false);
    expect(isActiveDay(h, pauses, "2026-11-07")).toBe(true);
  });

  it("pauses every later day while a pause is open", () => {
    const pauses = [{ startDate: "2026-11-05", endDate: null }];
    expect(isActiveDay(h, pauses, "2026-11-04")).toBe(true);
    expect(isActiveDay(h, pauses, "2026-11-05")).toBe(false);
    expect(isActiveDay({ ...h, endDate: null }, pauses, "2027-06-01")).toBe(
      false,
    );
  });
});

describe("weekTarget", () => {
  // N × active days ÷ 7, rounded to the nearest whole number, halves up.
  const table: Record<number, number[]> = {
    1: [0, 0, 0, 0, 1, 1, 1, 1],
    2: [0, 0, 1, 1, 1, 1, 2, 2],
    3: [0, 0, 1, 1, 2, 2, 3, 3],
    4: [0, 1, 1, 2, 2, 3, 3, 4],
    5: [0, 1, 1, 2, 3, 4, 4, 5],
    6: [0, 1, 2, 3, 3, 4, 5, 6],
  };

  for (const [n, row] of Object.entries(table)) {
    it(`N = ${n} for 0–7 active days is ${row.join(", ")}`, () => {
      expect(row.map((_, a) => weekTarget(Number(n), a))).toEqual(row);
    });
  }

  it("matches ADR 0014's N = 3 example", () => {
    expect([0, 1].map((a) => weekTarget(3, a))).toEqual([0, 0]);
    expect([2, 3].map((a) => weekTarget(3, a))).toEqual([1, 1]);
    expect([4, 5].map((a) => weekTarget(3, a))).toEqual([2, 2]);
    expect([6, 7].map((a) => weekTarget(3, a))).toEqual([3, 3]);
  });

  it("refuses impossible inputs", () => {
    expect(() => weekTarget(3, 8)).toThrow(RangeError);
    expect(() => weekTarget(3, -1)).toThrow(RangeError);
    expect(() => weekTarget(2.5, 3)).toThrow(RangeError);
    expect(() => weekTarget(3, 1.5)).toThrow(RangeError);
  });
});

describe("week boundaries", () => {
  for (const weekStart of [0, 1, 2, 3, 4, 5, 6] as WeekStart[]) {
    describe(`week start ${weekStart}`, () => {
      const from = startOfWeek("2026-11-11", weekStart);
      const to = addDays(from, 6);
      const base = {
        weekStart,
        schedules: [timesPerWeek(3, "2026-10-01")],
        range: { from, to },
        today: "2026-12-31",
      };

      it("starts the range on the week start and lists 7 days", () => {
        const dates = habitDays(input(base)).map((day) => day.date);
        expect(dayOfWeek(from)).toBe(weekStart);
        expect(dates).toEqual(days(from, 7));
      });

      it("counts the first and last day, and nothing either side", () => {
        expect(figure({ ...base, logs: [done(from), done(to)] })).toEqual({
          completed: 2,
          expected: 3,
          skipped: 0,
        });
        expect(
          figure({
            ...base,
            logs: [done(addDays(from, -1)), done(addDays(to, 1))],
          }),
        ).toEqual({ completed: 0, expected: 3, skipped: 0 });
      });

      it("refuses a range that isn't whole weeks", () => {
        expect(() =>
          consistency(
            input({ ...base, range: { from: addDays(from, 1), to } }),
          ),
        ).toThrow(RangeError);
        expect(() =>
          consistency(input({ ...base, range: { from, to: addDays(to, -1) } })),
        ).toThrow(RangeError);
        expect(() =>
          habitDays(input({ ...base, range: { from, to: addDays(to, 1) } })),
        ).toThrow(RangeError);
      });

      it("takes this week from the week start for weekProgress", () => {
        const progress = weekProgress({
          ...input(base),
          today: addDays(from, 3),
        });
        expect(progress.from).toBe(from);
        expect(progress.to).toBe(to);
      });
    });
  }
});

describe("daily", () => {
  it("counts past active days, with skips left out", () => {
    expect(
      figure({
        logs: [done("2026-11-02"), done("2026-11-03"), skip("2026-11-04")],
      }),
    ).toEqual({ completed: 2, expected: 6, skipped: 1 });
  });

  it("counts every day of every past week in the range", () => {
    expect(
      figure({
        range: weeks(W1, 3),
        logs: days(W1, 21).map((date) => done(date)),
      }),
    ).toEqual({ completed: 21, expected: 21, skipped: 0 });
  });

  it("starts on a start date in the middle of a week", () => {
    const result = input({
      habit: habit({ startDate: "2026-11-04" }),
      logs: [done("2026-11-03"), done("2026-11-04"), done("2026-11-05")],
    });
    expect(figure(result)).toEqual({ completed: 2, expected: 5, skipped: 0 });
    expect(states(result)).toEqual([
      "inactive",
      "inactive",
      "completed",
      "completed",
      "missed",
      "missed",
      "missed",
    ]);
  });

  it("ends on an end date in the middle of a week, inclusive", () => {
    expect(
      figure({
        habit: habit({ endDate: "2026-11-05" }),
        logs: [done("2026-11-05"), done("2026-11-06")],
      }),
    ).toEqual({ completed: 1, expected: 4, skipped: 0 });
  });

  it("leaves paused days out, with the pause end active again", () => {
    const result = input({
      pauses: [{ startDate: "2026-11-04", endDate: "2026-11-06" }],
      logs: [done("2026-11-04"), done("2026-11-06")],
    });
    expect(figure(result)).toEqual({ completed: 1, expected: 5, skipped: 0 });
    expect(states(result)).toEqual([
      "missed",
      "missed",
      "inactive",
      "inactive",
      "completed",
      "missed",
      "missed",
    ]);
  });

  it("leaves out every day after an open pause", () => {
    expect(
      figure({
        range: weeks(W1, 2),
        pauses: [{ startDate: "2026-11-05", endDate: null }],
      }),
    ).toEqual({ completed: 0, expected: 3, skipped: 0 });
  });

  it("ignores logs on inactive days: before the start, paused, after the end", () => {
    const result = input({
      range: weeks(W1, 2),
      habit: habit({ startDate: "2026-11-04", endDate: "2026-11-12" }),
      pauses: [{ startDate: "2026-11-06", endDate: "2026-11-08" }],
      logs: [...days(W1, 14).map((date) => done(date)), skip("2026-11-13")],
    });
    // Active: 4, 5, 8, 9, 10, 11, 12 November.
    expect(figure(result)).toEqual({ completed: 7, expected: 7, skipped: 0 });
    const history = habitDays(result);
    expect(history.filter((day) => day.state === "inactive")).toHaveLength(7);
    expect(history.find((day) => day.date === "2026-11-06")).toEqual({
      date: "2026-11-06",
      state: "inactive",
      credit: 0,
      log: done("2026-11-06"),
    });
  });

  describe("today", () => {
    const base = { today: "2026-11-04", logs: [done("2026-11-02")] };

    it("doesn't count today before it's logged", () => {
      expect(figure(base)).toEqual({ completed: 1, expected: 2, skipped: 0 });
      expect(states(base)).toEqual([
        "completed",
        "missed",
        "today",
        "future",
        "future",
        "future",
        "future",
      ]);
    });

    it("counts today once it's completed", () => {
      expect(
        figure({ ...base, logs: [...base.logs, done("2026-11-04")] }),
      ).toEqual({ completed: 2, expected: 3, skipped: 0 });
    });

    it("counts a skip today as skipped, not expected", () => {
      expect(
        figure({ ...base, logs: [...base.logs, skip("2026-11-04")] }),
      ).toEqual({ completed: 1, expected: 2, skipped: 1 });
    });

    it("counts a partial quantity day today with its partial credit", () => {
      expect(
        figure({
          ...base,
          habit: habit({ measure: "quantity", unit: "min" }),
          schedules: [daily(W1, 20)],
          logs: [done("2026-11-02", 20), done("2026-11-04", 10)],
        }),
      ).toEqual({ completed: 1.5, expected: 3, skipped: 0, atTarget: 1 });
    });

    it("ignores weeks after the current one", () => {
      expect(figure({ ...base, range: weeks(W1, 3) })).toEqual({
        completed: 1,
        expected: 2,
        skipped: 0,
      });
    });
  });
});

describe("weekly_days", () => {
  const monWedFri = [weeklyDays([1, 3, 5])];

  it("expects only the chosen weekdays and marks other completions as extras", () => {
    const result = input({
      schedules: monWedFri,
      logs: [
        done("2026-11-02"),
        done("2026-11-03"),
        done("2026-11-04"),
        skip("2026-11-05"),
        done("2026-11-07"),
      ],
    });
    expect(figure(result)).toEqual({ completed: 2, expected: 3, skipped: 0 });
    expect(states(result)).toEqual([
      "completed",
      "extra",
      "completed",
      "not_scheduled",
      "missed",
      "extra",
      "not_scheduled",
    ]);
    expect(habitDays(result)[1].credit).toBe(0);
  });

  it("counts a skip on a chosen weekday", () => {
    expect(
      figure({
        schedules: monWedFri,
        logs: [done("2026-11-02"), skip("2026-11-04")],
      }),
    ).toEqual({ completed: 1, expected: 2, skipped: 1 });
  });

  it("marks other weekdays as not scheduled, today included", () => {
    expect(states({ schedules: monWedFri, today: "2026-11-03" })).toEqual([
      "missed",
      "not_scheduled",
      "future",
      "not_scheduled",
      "future",
      "not_scheduled",
      "not_scheduled",
    ]);
    expect(states({ schedules: monWedFri, today: "2026-11-04" })[2]).toBe(
      "today",
    );
  });
});

describe("times_per_week", () => {
  const three = [timesPerWeek(3)];

  it("counts a past week as min(done, target)", () => {
    expect(
      figure({
        schedules: three,
        logs: [done("2026-11-02"), done("2026-11-03")],
      }),
    ).toEqual({ completed: 2, expected: 3, skipped: 0 });
    expect(
      figure({
        schedules: three,
        logs: days(W1, 5).map((date) => done(date)),
      }),
    ).toEqual({ completed: 3, expected: 3, skipped: 0 });
  });

  it("sums whole weeks across the range", () => {
    expect(
      figure({
        schedules: three,
        range: weeks(W1, 3),
        logs: [
          ...days(W1, 4).map((date) => done(date)),
          done(W2),
          ...days(W3, 3).map((date) => done(date)),
        ],
      }),
    ).toEqual({ completed: 7, expected: 9, skipped: 0 });
  });

  it("has no per-day Missed", () => {
    expect(
      states({ schedules: three, today: "2026-11-04", logs: [done(W1)] }),
    ).toEqual([
      "completed",
      "unlogged",
      "today",
      "future",
      "future",
      "future",
      "future",
    ]);
  });

  describe("partial weeks (the rounding table, end to end)", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      for (let active = 0; active <= 7; active++) {
        it(`N = ${n} with ${active} active days expects ${weekTarget(n, active)}`, () => {
          // Starting later in W1 leaves `active` days (0: starting in W2).
          const startDate = addDays(W1, 7 - active);
          expect(
            figure({
              habit: habit({ startDate }),
              schedules: [timesPerWeek(n, startDate)],
            }).expected,
          ).toBe(weekTarget(n, active));
        });
      }
    }

    it("pro-rates a start date in the middle of a week", () => {
      // Saturday and Sunday active: 3 × 2 ÷ 7 = 0.86 → 1.
      expect(
        figure({
          habit: habit({ startDate: "2026-11-07" }),
          schedules: three,
          logs: [done("2026-11-06"), done("2026-11-07"), done("2026-11-08")],
        }),
      ).toEqual({ completed: 1, expected: 1, skipped: 0 });
    });

    it("pro-rates an end date in the middle of a week", () => {
      // Monday to Thursday active: 3 × 4 ÷ 7 = 1.71 → 2.
      expect(
        figure({
          habit: habit({ endDate: "2026-11-05" }),
          schedules: three,
          logs: [done("2026-11-05"), done("2026-11-06"), done("2026-11-07")],
        }),
      ).toEqual({ completed: 1, expected: 2, skipped: 0 });
    });

    it("pro-rates a pause in the middle of a week", () => {
      // Wednesday to Friday paused, 4 active: 2. The paused log is ignored.
      expect(
        figure({
          schedules: three,
          pauses: [{ startDate: "2026-11-04", endDate: "2026-11-07" }],
          logs: [done("2026-11-04"), done("2026-11-07")],
        }),
      ).toEqual({ completed: 1, expected: 2, skipped: 0 });
    });

    it("expects nothing in a fully paused week", () => {
      expect(
        figure({
          schedules: three,
          range: weeks(W1, 2),
          pauses: [{ startDate: W2, endDate: W3 }],
          logs: [done(W1), done(W2)],
        }),
      ).toEqual({ completed: 1, expected: 3, skipped: 0 });
    });
  });

  describe("skips", () => {
    it("lower the week's target by one each", () => {
      expect(
        figure({
          schedules: three,
          logs: [skip("2026-11-02"), done("2026-11-03")],
        }),
      ).toEqual({ completed: 1, expected: 2, skipped: 1 });
    });

    it("can lower a week's target to 0, and never below", () => {
      const two = [timesPerWeek(2)];
      expect(
        figure({
          schedules: two,
          logs: [skip("2026-11-02"), skip("2026-11-03"), done("2026-11-04")],
        }),
      ).toEqual({ completed: 0, expected: 0, skipped: 2 });
      expect(
        figure({
          schedules: two,
          logs: [skip("2026-11-02"), skip("2026-11-03"), skip("2026-11-04")],
        }),
      ).toEqual({ completed: 0, expected: 0, skipped: 3 });
    });

    it("lower a pro-rated target", () => {
      // 4 active days at N = 2: 1, minus one skip: 0.
      expect(
        figure({
          habit: habit({ endDate: "2026-11-05" }),
          schedules: [timesPerWeek(2)],
          logs: [skip("2026-11-02"), done("2026-11-03")],
        }),
      ).toEqual({ completed: 0, expected: 0, skipped: 1 });
    });

    it("don't count on inactive days", () => {
      expect(
        figure({
          schedules: three,
          habit: habit({ endDate: "2026-11-07" }),
          logs: [skip("2026-11-08")],
        }),
      ).toEqual({ completed: 0, expected: 3, skipped: 0 });
    });
  });

  describe("the current week", () => {
    // Today is Wednesday of W2; W1 was done in full.
    const base = {
      schedules: three,
      range: weeks(W1, 2),
      today: "2026-11-11",
    };
    const fullW1 = [done(W1), done("2026-11-03"), done("2026-11-04")];

    it("never lowers the figure", () => {
      expect(figure({ ...base, logs: fullW1 })).toEqual({
        completed: 3,
        expected: 3,
        skipped: 0,
      });
    });

    it("counts what's done so far", () => {
      expect(figure({ ...base, logs: [...fullW1, done(W2)] })).toEqual({
        completed: 4,
        expected: 4,
        skipped: 0,
      });
    });

    it("caps what's done at the week's target", () => {
      expect(
        figure({
          ...base,
          schedules: [timesPerWeek(2)],
          logs: [
            done(W1),
            done("2026-11-03"),
            ...days(W2, 3).map((date) => done(date)),
          ],
        }),
      ).toEqual({ completed: 4, expected: 4, skipped: 0 });
    });

    it("counts a skip and caps at the lowered target", () => {
      expect(
        figure({
          ...base,
          schedules: [timesPerWeek(2)],
          logs: [
            done(W1),
            done("2026-11-03"),
            skip(W2),
            done("2026-11-10"),
            done("2026-11-11"),
          ],
        }),
      ).toEqual({ completed: 3, expected: 3, skipped: 1 });
    });

    it("uses later days' pauses known now", () => {
      // Paused from Friday: 4 active days at N = 3 → 2.
      expect(
        figure({
          ...base,
          pauses: [{ startDate: "2026-11-13", endDate: null }],
          logs: [...fullW1, ...days(W2, 3).map((date) => done(date))],
        }),
      ).toEqual({ completed: 5, expected: 5, skipped: 0 });
    });

    it("counts a partial quantity day with its partial credit", () => {
      expect(
        figure({
          ...base,
          range: week(W2),
          habit: habit({ measure: "quantity", unit: "km" }),
          schedules: [timesPerWeek(3, W1, 5)],
          logs: [done(W2, 2.5), done("2026-11-10", 5)],
        }),
      ).toEqual({ completed: 1.5, expected: 2, skipped: 0, atTarget: 1 });
    });

    it("ignores weeks after the current one", () => {
      expect(
        figure({ ...base, range: weeks(W1, 3), logs: [...fullW1, done(W2)] }),
      ).toEqual({ completed: 4, expected: 4, skipped: 0 });
    });
  });
});

describe("quantity credit", () => {
  const glasses = habit({ measure: "quantity", unit: "glasses" });

  it("gives min(value ÷ target, 1) per day: below, at and above the target", () => {
    const result = input({
      habit: { ...glasses, endDate: "2026-11-05" },
      schedules: [daily(W1, 8)],
      logs: [
        done("2026-11-02", 4),
        done("2026-11-03", 8),
        done("2026-11-04", 12),
      ],
    });
    expect(figure(result)).toEqual({
      completed: 2.5,
      expected: 4,
      skipped: 0,
      atTarget: 2,
    });
    expect(habitDays(result).map((day) => day.credit)).toEqual([
      0.5, 1, 1, 0, 0, 0, 0,
    ]);
  });

  it("never carries extra over to another day", () => {
    expect(
      figure({
        habit: { ...glasses, endDate: "2026-11-03" },
        schedules: [daily(W1, 8)],
        logs: [done("2026-11-02", 16)],
      }),
    ).toEqual({ completed: 1, expected: 2, skipped: 0, atTarget: 1 });
  });

  it("caps a times_per_week week at its target", () => {
    const run = {
      habit: habit({ measure: "quantity", unit: "km" }),
      schedules: [timesPerWeek(2, W1, 5)],
    };
    expect(
      figure({
        ...run,
        logs: [done(W1, 3), done("2026-11-03", 5), done("2026-11-04", 10)],
      }),
    ).toEqual({ completed: 2, expected: 2, skipped: 0, atTarget: 2 });
    expect(
      figure({
        ...run,
        logs: [done(W1, 2.5), done("2026-11-03", 2.5), done("2026-11-04", 2.5)],
      }),
    ).toEqual({ completed: 1.5, expected: 2, skipped: 0, atTarget: 0 });
    expect(
      figure({
        ...run,
        logs: [done(W1, 2.5), done("2026-11-03", 5), done("2026-11-04", 2.5)],
      }),
    ).toEqual({ completed: 2, expected: 2, skipped: 0, atTarget: 1 });
  });

  it("adds credit exactly, so 0.7 + 0.1 is 0.8 and not 0.79…", () => {
    const result = figure({
      habit: { ...glasses, endDate: "2026-11-03" },
      schedules: [daily(W1, 10)],
      logs: [done("2026-11-02", 7), done("2026-11-03", 1)],
    });
    expect(result.completed).toBe(0.8);
    expect(formatConsistency(result, "daily", "quantity")).toBe(
      "0.8 of 2 days · 0 at target",
    );
  });

  it("adds credit exactly across weeks with different targets", () => {
    const result = figure({
      habit: glasses,
      range: weeks(W1, 2),
      schedules: [daily(W1, 10), daily(W2, 5)],
      logs: [done(W1, 7), done(W2, 0.5)],
    });
    expect(result.completed).toBe(0.8);
    expect(result.expected).toBe(14);
  });

  it("gives no credit to a completed log without a value", () => {
    expect(
      figure({
        habit: { ...glasses, endDate: "2026-11-02" },
        schedules: [daily(W1, 8)],
        logs: [done(W1)],
      }),
    ).toEqual({ completed: 0, expected: 1, skipped: 0, atTarget: 0 });
  });

  it("gives a check habit full credit whatever the value", () => {
    expect(
      figure({
        habit: habit({ endDate: "2026-11-02" }),
        logs: [done(W1, 0.25)],
      }),
    ).toEqual({ completed: 1, expected: 1, skipped: 0 });
  });

  it("refuses a quantity schedule without a target", () => {
    expect(() => consistency(input({ habit: glasses }))).toThrow(RangeError);
  });
});

describe("schedule changes", () => {
  it("counts each week by the schedule it had", () => {
    const result = consistency(
      input({
        range: weeks(W1, 2),
        schedules: [daily(W1), timesPerWeek(2, W2)],
        logs: [
          ...days(W1, 5).map((date) => done(date)),
          ...days(W2, 3).map((date) => done(date)),
        ],
      }),
    );
    expect(result).toMatchObject({ completed: 7, expected: 9, skipped: 0 });
    expect(result.definition).toContain("2 times a week");
    expect(result.definition).toContain("different schedule");
  });

  it("moves extras with the weekdays chosen each week", () => {
    expect(
      figure({
        range: weeks(W1, 2),
        schedules: [weeklyDays([1], W1), weeklyDays([2], W2)],
        logs: [done(W1), done("2026-11-03"), done(W2), done("2026-11-10")],
      }),
    ).toEqual({ completed: 2, expected: 2, skipped: 0 });
  });

  it("uses the earliest schedule before its effective date", () => {
    // The start moved earlier than the first schedule's week.
    expect(
      figure({
        range: weeks(W1, 2),
        schedules: [timesPerWeek(1, W2), timesPerWeek(2, W3)],
        logs: [done(W1), done("2026-11-03")],
      }),
    ).toEqual({ completed: 1, expected: 2, skipped: 0 });
  });

  it("applies a schedule from any day of its week to the whole week", () => {
    expect(
      figure({
        schedules: [daily(W1), timesPerWeek(1, "2026-11-08")],
        logs: [done(W1)],
      }),
    ).toEqual({ completed: 1, expected: 1, skipped: 0 });
  });

  it("only mentions a change when the range has one", () => {
    const result = consistency(
      input({ range: week(W2), schedules: [daily(W1), timesPerWeek(2, W2)] }),
    );
    expect(result.definition).not.toContain("different schedule");
  });
});

describe("a week-start change", () => {
  // A Sunday and the Monday after it.
  const base = {
    schedules: [timesPerWeek(1, "2026-10-01")],
    logs: [done("2026-11-08"), done("2026-11-09")],
  };

  it("regroups the weeks", () => {
    expect(figure({ ...base, weekStart: 1, range: weeks(W1, 2) })).toEqual({
      completed: 2,
      expected: 2,
      skipped: 0,
    });
    // Weeks from Sunday: 1–7 November (nothing), 8–14 November (both, capped).
    expect(
      figure({
        ...base,
        weekStart: 0,
        range: { from: "2026-11-01", to: "2026-11-14" },
      }),
    ).toEqual({ completed: 1, expected: 2, skipped: 0 });
  });
});

describe("empty ranges", () => {
  it("returns nothing for a range of no weeks", () => {
    const empty = input({ range: { from: W1, to: addDays(W1, -1) } });
    expect(habitDays(empty)).toEqual([]);
    expect(figure(empty)).toEqual({ completed: 0, expected: 0, skipped: 0 });
  });

  it("refuses a reversed range", () => {
    expect(() =>
      consistency(input({ range: { from: W2, to: addDays(W1, -1) } })),
    ).toThrow(RangeError);
  });

  it("expects nothing before the start date", () => {
    const before = input({
      range: weeks(W1, 3),
      habit: habit({ startDate: "2026-12-01" }),
      schedules: [daily("2026-11-30")],
      logs: [done(W1)],
    });
    expect(figure(before)).toEqual({ completed: 0, expected: 0, skipped: 0 });
    expect(new Set(states(before))).toEqual(new Set(["inactive"]));
    expect(formatConsistency(consistency(before), "daily", "check")).toBe(
      "Nothing expected in this range",
    );
  });

  it("expects nothing in weeks after today", () => {
    expect(figure({ range: weeks(W2, 2), today: "2026-11-04" })).toEqual({
      completed: 0,
      expected: 0,
      skipped: 0,
    });
    expect(
      figure({
        range: weeks(W2, 2),
        today: "2026-11-04",
        schedules: [timesPerWeek(3)],
      }),
    ).toEqual({ completed: 0, expected: 0, skipped: 0 });
  });

  it("returns atTarget 0 for an empty quantity range", () => {
    expect(
      figure({
        range: { from: W1, to: addDays(W1, -1) },
        habit: habit({ measure: "quantity", unit: "min" }),
        schedules: [daily(W1, 10)],
      }),
    ).toEqual({ completed: 0, expected: 0, skipped: 0, atTarget: 0 });
  });

  it("refuses a habit without a schedule", () => {
    expect(() => consistency(input({ schedules: [] }))).toThrow(RangeError);
  });
});

describe("weekProgress", () => {
  const wednesday = "2026-11-04";
  const progress = (overrides: Partial<HabitRangeInput>) => {
    const { definition, from, to, ...rest } = weekProgress(
      input({ today: wednesday, ...overrides }),
    );
    expect(definition.length).toBeGreaterThan(0);
    expect([from, to]).toEqual([W1, "2026-11-08"]);
    return rest;
  };

  it("shows a times_per_week week's done of its target", () => {
    expect(
      progress({ schedules: [timesPerWeek(3)], logs: [done(W1)] }),
    ).toEqual({ done: 1, target: 3, skipped: 0 });
  });

  it("lowers the target per skip and pro-rates for pauses known now", () => {
    expect(
      progress({
        schedules: [timesPerWeek(3)],
        pauses: [{ startDate: "2026-11-06", endDate: null }],
        logs: [done(W1), skip("2026-11-03")],
      }),
    ).toEqual({ done: 1, target: 1, skipped: 1 });
  });

  it("caps done at the target", () => {
    expect(
      progress({
        schedules: [timesPerWeek(2)],
        logs: days(W1, 3).map((date) => done(date)),
      }),
    ).toEqual({ done: 2, target: 2, skipped: 0 });
  });

  it("counts the whole week's expected days for daily and weekly_days", () => {
    expect(progress({ logs: [done(W1), skip("2026-11-03")] })).toEqual({
      done: 1,
      target: 6,
      skipped: 1,
    });
    expect(
      progress({
        schedules: [weeklyDays([1, 3, 5])],
        logs: [done(W1), done("2026-11-03"), skip(wednesday)],
      }),
    ).toEqual({ done: 1, target: 2, skipped: 1 });
  });

  it("gives quantity credit and atTarget", () => {
    expect(
      progress({
        habit: habit({ measure: "quantity", unit: "km" }),
        schedules: [timesPerWeek(3, W1, 5)],
        logs: [done(W1, 2.5), done("2026-11-03", 6)],
      }),
    ).toEqual({ done: 1.5, target: 3, skipped: 0, atTarget: 1 });
  });

  it("uses this week's schedule", () => {
    expect(
      weekProgress(
        input({
          today: "2026-11-11",
          schedules: [daily(W1), timesPerWeek(4, W2)],
          logs: [done(W2)],
        }),
      ),
    ).toMatchObject({ from: W2, done: 1, target: 4 });
  });
});

describe("formatConsistency", () => {
  it("shows days or times, never a percentage", () => {
    const result = { completed: 12, expected: 14, skipped: 2 };
    expect(formatConsistency(result, "daily", "check")).toBe(
      "12 of 14 days · 2 skipped",
    );
    expect(formatConsistency(result, "weekly_days", "check")).toBe(
      "12 of 14 days · 2 skipped",
    );
    expect(
      formatConsistency(
        { completed: 7, expected: 9, skipped: 1 },
        "times_per_week",
        "check",
      ),
    ).toBe("7 of 9 times · 1 skipped");
  });

  it("leaves out a skip count of 0", () => {
    expect(
      formatConsistency(
        { completed: 7, expected: 9, skipped: 0 },
        "times_per_week",
        "check",
      ),
    ).toBe("7 of 9 times");
  });

  it("uses the singular for one", () => {
    const one = { completed: 1, expected: 1, skipped: 0 };
    expect(formatConsistency(one, "daily", "check")).toBe("1 of 1 day");
    expect(formatConsistency(one, "times_per_week", "check")).toBe(
      "1 of 1 time",
    );
  });

  it("shows quantity habits with days at target, cut to one decimal", () => {
    expect(
      formatConsistency(
        { completed: 11.6, expected: 14, skipped: 0, atTarget: 10 },
        "daily",
        "quantity",
      ),
    ).toBe("11.6 of 14 days · 10 at target");
    expect(
      formatConsistency(
        { completed: 13.96, expected: 14, skipped: 1, atTarget: 13 },
        "daily",
        "quantity",
      ),
    ).toBe("13.9 of 14 days · 13 at target · 1 skipped");
  });

  it("shows no figure when nothing is expected", () => {
    expect(
      formatConsistency(
        { completed: 0, expected: 0, skipped: 3 },
        "times_per_week",
        "check",
      ),
    ).toBe("Nothing expected in this range");
  });
});

describe("cutToOneDecimal", () => {
  it("cuts rather than rounds", () => {
    expect(cutToOneDecimal(13.96)).toBe("13.9");
    expect(cutToOneDecimal(13.99999)).toBe("13.9");
    expect(cutToOneDecimal(0.05)).toBe("0");
  });

  it("keeps exact tenths and whole numbers", () => {
    for (let tenths = 0; tenths <= 200; tenths++) {
      expect(cutToOneDecimal(tenths / 10)).toBe(String(tenths / 10));
    }
    expect(cutToOneDecimal(14)).toBe("14");
  });

  it("refuses negative and non-finite numbers", () => {
    expect(() => cutToOneDecimal(-0.1)).toThrow(RangeError);
    expect(() => cutToOneDecimal(Number.NaN)).toThrow(RangeError);
  });
});

describe("definition text", () => {
  const definition = (overrides: Partial<HabitRangeInput>) =>
    consistency(input(overrides)).definition;

  it("says what's expected for each cadence and how today counts", () => {
    const text = definition({});
    expect(text).toContain("every active day");
    expect(text).toContain("logged as completed");
    expect(text).toContain("skipped days aren't counted");
    expect(text).toContain("Paused days");
    expect(text).toContain("Today counts only once");
  });

  it("names the chosen weekdays in week order and the extras rule", () => {
    expect(definition({ schedules: [weeklyDays([0, 1, 5])] })).toContain(
      "Monday, Friday and Sunday each week",
    );
    expect(
      definition({
        weekStart: 0,
        range: { from: "2026-11-01", to: "2026-11-07" },
        schedules: [weeklyDays([0, 1, 5])],
      }),
    ).toContain("Sunday, Monday and Friday each week");
    expect(definition({ schedules: [weeklyDays([3])] })).toContain(
      "Wednesday each week. Completions on other days show as extras",
    );
  });

  it("spells out the partial-week, skip and this-week rules", () => {
    const text = definition({
      schedules: [timesPerWeek(3)],
      weekStart: 6,
      range: { from: "2026-11-07", to: "2026-11-13" },
    });
    expect(text).toContain("3 times a week (weeks start on Saturday)");
    expect(text).toContain("3 × its active days ÷ 7");
    expect(text).toContain("halves rounded up");
    expect(text).toContain("lowers its week's target by one");
    expect(text).toContain(
      "This week counts only the completions logged so far",
    );
    expect(definition({ schedules: [timesPerWeek(1)] })).toContain(
      "1 time a week",
    );
  });

  it("names the target, its unit and partial credit for quantity habits", () => {
    const text = definition({
      habit: habit({ measure: "quantity", unit: "km" }),
      schedules: [timesPerWeek(3, W1, 2.5)],
    });
    expect(text).toContain("the target of 2.5 km");
    expect(text).toContain("up to one full day");
    expect(text).toContain("never carries over");
  });

  it("describes this week for weekProgress", () => {
    expect(
      weekProgress(input({ schedules: [timesPerWeek(2)] })).definition,
    ).toContain("against the week's target");
    expect(weekProgress(input()).definition).toContain(
      "all of this week's expected days",
    );
  });
});
