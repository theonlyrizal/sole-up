import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AMOUNT_MESSAGE,
  changeHabitScheduleSchema,
  CHECK_HAS_NO_TARGET,
  CHECK_HAS_NO_UNIT,
  createHabitSchema,
  editHabitSchema,
  END_BEFORE_START,
  habitIdSchema,
  TARGET_REQUIRED,
  UNIT_REQUIRED,
  updateHabitSchema,
} from "./validation";

const ID = "4f9c7f3e-2a51-4c55-9a1f-0c6a1e1f3b2d";

const checkHabit = {
  title: "Stretch",
  measure: "check",
  startDate: "2026-11-02",
  cadenceType: "daily",
  cadenceConfig: {},
};

const quantityHabit = {
  title: "Drink water",
  measure: "quantity",
  unit: "glasses",
  target: 8,
  startDate: "2026-11-02",
  cadenceType: "daily",
  cadenceConfig: {},
};

/** Each issue as "path: message", the path dotted like authedAction's. */
function issues(result: { success: boolean; error?: z.ZodError }) {
  expect(result.success).toBe(false);
  return result.error!.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
}

describe("createHabitSchema", () => {
  it("parses a check habit and fills the optional fields with null", () => {
    expect(createHabitSchema.parse(checkHabit)).toEqual({
      title: "Stretch",
      description: null,
      measure: "check",
      unit: null,
      startDate: "2026-11-02",
      endDate: null,
      goalId: null,
      target: null,
      cadence: { cadenceType: "daily", cadenceConfig: {} },
    });
  });

  it("parses a quantity habit with its unit and target", () => {
    expect(
      createHabitSchema.parse({ ...quantityHabit, target: "2.5" }),
    ).toMatchObject({ measure: "quantity", unit: "glasses", target: 2.5 });
  });

  it("sorts weekly days and keeps times per week", () => {
    expect(
      createHabitSchema.parse({
        ...checkHabit,
        cadenceType: "weekly_days",
        cadenceConfig: { days: [5, 1, 3] },
      }).cadence,
    ).toEqual({
      cadenceType: "weekly_days",
      cadenceConfig: { days: [1, 3, 5] },
    });
    expect(
      createHabitSchema.parse({
        ...checkHabit,
        cadenceType: "times_per_week",
        cadenceConfig: { timesPerWeek: 3 },
      }).cadence,
    ).toEqual({
      cadenceType: "times_per_week",
      cadenceConfig: { timesPerWeek: 3 },
    });
  });

  describe("invalid cadence configs", () => {
    const withCadence = (cadenceType: string, cadenceConfig: unknown) =>
      createHabitSchema.safeParse({
        ...checkHabit,
        cadenceType,
        cadenceConfig,
      });

    it("refuses an unknown cadence type", () => {
      expect(issues(withCadence("monthly", {}))).toEqual([
        "cadenceType: Choose how often from the list.",
      ]);
    });

    it("daily takes an empty config only", () => {
      expect(issues(withCadence("daily", { days: [1] }))[0]).toMatch(
        /^cadenceConfig/,
      );
      expect(withCadence("daily", undefined).success).toBe(true);
      const { cadenceConfig: _omitted, ...noConfig } = checkHabit;
      expect(createHabitSchema.safeParse(noConfig).success).toBe(true);
    });

    it("weekly_days needs 1 to 6 distinct weekdays 0–6", () => {
      for (const days of [
        [],
        [0, 1, 2, 3, 4, 5, 6],
        [1, 1],
        [7],
        [-1],
        [1.5],
        ["1"],
        "1,2",
      ]) {
        const errors = issues(withCadence("weekly_days", { days }));
        expect(errors.length, JSON.stringify(days)).toBeGreaterThan(0);
        expect(errors.every((error) => error.startsWith("cadenceConfig"))).toBe(
          true,
        );
      }
      expect(issues(withCadence("weekly_days", {}))[0]).toMatch(
        /^cadenceConfig\.days: Choose 1 to 6 days/,
      );
      expect(issues(withCadence("weekly_days", { days: [2, 2] }))).toEqual([
        "cadenceConfig.days: Choose each day once.",
      ]);
    });

    it("weekly_days refuses a times-per-week config", () => {
      expect(
        withCadence("weekly_days", { days: [1], timesPerWeek: 2 }).success,
      ).toBe(false);
    });

    it("times_per_week needs a whole number from 1 to 6", () => {
      for (const timesPerWeek of [0, 7, 2.5, "3", null]) {
        expect(
          issues(withCadence("times_per_week", { timesPerWeek }))[0],
        ).toMatch(/^cadenceConfig\.timesPerWeek: Choose 1 to 6 times a week/);
      }
      expect(withCadence("times_per_week", { days: [1] }).success).toBe(false);
    });
  });

  describe("check and quantity fields", () => {
    it("a quantity habit needs a unit and a target", () => {
      expect(
        issues(
          createHabitSchema.safeParse({
            ...quantityHabit,
            unit: " ",
            target: "",
          }),
        ),
      ).toEqual([`unit: ${UNIT_REQUIRED}`, `target: ${TARGET_REQUIRED}`]);
    });

    it("a check habit refuses a unit and a target", () => {
      expect(
        issues(
          createHabitSchema.safeParse({
            ...checkHabit,
            unit: "km",
            target: 5,
          }),
        ),
      ).toEqual([
        `unit: ${CHECK_HAS_NO_UNIT}`,
        `target: ${CHECK_HAS_NO_TARGET}`,
      ]);
    });

    it("refuses an unknown measure", () => {
      expect(
        createHabitSchema.safeParse({ ...checkHabit, measure: "minutes" })
          .success,
      ).toBe(false);
    });

    it("takes targets above 0 with at most 2 decimals up to 99,999.99", () => {
      for (const target of [0.01, "99999.99", 1, "  12.5 "]) {
        expect(
          createHabitSchema.safeParse({ ...quantityHabit, target }).success,
          String(target),
        ).toBe(true);
      }
      for (const target of [0, -1, 1.234, "100000", "1e3", "abc", 0.1 + 0.2]) {
        expect(
          issues(createHabitSchema.safeParse({ ...quantityHabit, target })),
          String(target),
        ).toEqual([`target: ${AMOUNT_MESSAGE}`]);
      }
    });
  });

  it("checks the date pair together", () => {
    expect(
      issues(
        createHabitSchema.safeParse({ ...checkHabit, endDate: "2026-11-01" }),
      ),
    ).toEqual([`endDate: ${END_BEFORE_START}`]);
    expect(
      createHabitSchema.safeParse({ ...checkHabit, endDate: "2026-11-02" })
        .success,
    ).toBe(true);
  });

  it("needs a title and a start date", () => {
    expect(
      issues(
        createHabitSchema.safeParse({
          ...checkHabit,
          title: " ",
          startDate: "",
        }),
      ),
    ).toEqual([
      "title: Give the habit a title.",
      "startDate: Pick a start date.",
    ]);
  });

  it("refuses unknown keys", () => {
    expect(
      createHabitSchema.safeParse({ ...checkHabit, status: "archived" })
        .success,
    ).toBe(false);
  });
});

describe("every error at once", () => {
  it("reports a blank title with the quantity and cadence rules", () => {
    expect(
      issues(
        createHabitSchema.safeParse({
          ...quantityHabit,
          title: "",
          unit: "",
          target: "",
          endDate: "2026-11-01",
          cadenceType: "times_per_week",
          cadenceConfig: { timesPerWeek: 7 },
        }),
      ),
    ).toEqual([
      "title: Give the habit a title.",
      `endDate: ${END_BEFORE_START}`,
      `unit: ${UNIT_REQUIRED}`,
      `target: ${TARGET_REQUIRED}`,
      "cadenceConfig.timesPerWeek: Choose 1 to 6 times a week. Every day is the daily cadence.",
    ]);
  });

  it("skips a rule whose own fields don't parse", () => {
    expect(
      issues(
        createHabitSchema.safeParse({
          ...checkHabit,
          measure: "sometimes",
          unit: "km",
          startDate: "soon",
          endDate: "2026-01-01",
          cadenceType: "hourly",
        }),
      ),
    ).toEqual([
      "startDate: Pick a start date.",
      "measure: Choose how the habit is measured.",
      "cadenceType: Choose how often from the list.",
    ]);
  });
});

describe("updateHabitSchema", () => {
  const edit = { id: ID, title: "Stretch", startDate: "2026-11-02" };

  it("edits in place only: measure, unit and cadence are refused", () => {
    expect(updateHabitSchema.safeParse(edit).success).toBe(true);
    for (const extra of [
      { measure: "quantity" },
      { unit: "km" },
      { cadenceType: "daily" },
      { target: 3 },
    ]) {
      expect(updateHabitSchema.safeParse({ ...edit, ...extra }).success).toBe(
        false,
      );
    }
  });

  it("checks the date pair together", () => {
    expect(
      issues(updateHabitSchema.safeParse({ ...edit, endDate: "2026-10-01" })),
    ).toEqual([`endDate: ${END_BEFORE_START}`]);
  });
});

describe("changeHabitScheduleSchema", () => {
  it("returns the cadence pair and the target", () => {
    expect(
      changeHabitScheduleSchema.parse({
        id: ID,
        cadenceType: "weekly_days",
        cadenceConfig: { days: [6, 0] },
        target: "3",
      }),
    ).toEqual({
      id: ID,
      target: 3,
      cadence: { cadenceType: "weekly_days", cadenceConfig: { days: [0, 6] } },
    });
  });

  it("refuses a config that doesn't fit its type", () => {
    expect(
      issues(
        changeHabitScheduleSchema.safeParse({
          id: ID,
          cadenceType: "times_per_week",
          cadenceConfig: { timesPerWeek: 7 },
        }),
      )[0],
    ).toMatch(/^cadenceConfig\.timesPerWeek/);
  });
});

describe("editHabitSchema", () => {
  const edit = {
    id: ID,
    title: "Stretch",
    description: "",
    startDate: "2026-11-02",
    endDate: "",
    goalId: null,
    cadenceType: "weekly_days",
    cadenceConfig: { days: [5, 1, 3] },
    target: null,
  };

  it("parses the fields and the schedule together, days sorted", () => {
    expect(editHabitSchema.parse(edit)).toEqual({
      id: ID,
      title: "Stretch",
      description: null,
      startDate: "2026-11-02",
      endDate: null,
      goalId: null,
      target: null,
      cadence: {
        cadenceType: "weekly_days",
        cadenceConfig: { days: [1, 3, 5] },
      },
    });
  });

  it("reports field, date and cadence errors in one go", () => {
    expect(
      issues(
        editHabitSchema.safeParse({
          ...edit,
          title: " ",
          target: "1.234",
          endDate: "2026-11-01",
          cadenceConfig: { days: [] },
        }),
      ),
    ).toEqual([
      "title: Give the habit a title.",
      `target: ${AMOUNT_MESSAGE}`,
      `endDate: ${END_BEFORE_START}`,
      "cadenceConfig.days: Choose 1 to 6 days. Every day is the daily cadence.",
    ]);
  });

  it("refuses the measure and unit, which can't change", () => {
    expect(
      issues(
        editHabitSchema.safeParse({ ...edit, measure: "quantity", unit: "km" }),
      ),
    ).toEqual([': Unrecognized keys: "measure", "unit"']);
  });
});

describe("habitIdSchema", () => {
  it("needs a UUID", () => {
    expect(habitIdSchema.safeParse({ id: "nope" }).success).toBe(false);
    expect(habitIdSchema.parse({ id: ID })).toEqual({ id: ID });
  });
});
