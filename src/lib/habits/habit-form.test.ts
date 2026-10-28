import { describe, expect, it } from "vitest";

import type { HabitCadence } from "./cadence";
import {
  cadenceInput,
  describeCadence,
  describeTarget,
  habitDeleteConsequences,
  isEveryDay,
  pickerValueOf,
  weekdaysFrom,
  type CadencePickerValue,
} from "./habit-form";

const picker = (fields: Partial<CadencePickerValue>): CadencePickerValue => ({
  cadenceType: "daily",
  days: [],
  timesPerWeek: "3",
  ...fields,
});

describe("weekdaysFrom", () => {
  it.each([
    [1, [1, 2, 3, 4, 5, 6, 0]],
    [0, [0, 1, 2, 3, 4, 5, 6]],
    [6, [6, 0, 1, 2, 3, 4, 5]],
  ] as const)("starts the week on %i", (weekStart, days) => {
    expect(weekdaysFrom(weekStart)).toEqual(days);
  });
});

describe("cadenceInput", () => {
  it("sends daily with an empty config", () => {
    expect(cadenceInput(picker({ days: [1], timesPerWeek: "2" }))).toEqual({
      cadenceType: "daily",
      cadenceConfig: {},
    });
  });

  it("sends the chosen days as chosen", () => {
    expect(
      cadenceInput(picker({ cadenceType: "weekly_days", days: [5, 1] })),
    ).toEqual({ cadenceType: "weekly_days", cadenceConfig: { days: [5, 1] } });
  });

  it("sends no days as no days, for the server to refuse", () => {
    expect(cadenceInput(picker({ cadenceType: "weekly_days" }))).toEqual({
      cadenceType: "weekly_days",
      cadenceConfig: { days: [] },
    });
  });

  it("turns all seven weekdays into daily", () => {
    const everyDay = picker({
      cadenceType: "weekly_days",
      days: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(isEveryDay(everyDay)).toBe(true);
    expect(cadenceInput(everyDay)).toEqual({
      cadenceType: "daily",
      cadenceConfig: {},
    });
  });

  it("isn't every day with six days, or for another cadence", () => {
    expect(
      isEveryDay(
        picker({ cadenceType: "weekly_days", days: [0, 1, 2, 3, 4, 5] }),
      ),
    ).toBe(false);
    expect(isEveryDay(picker({ days: [0, 1, 2, 3, 4, 5, 6] }))).toBe(false);
  });

  it("sends times a week as a number", () => {
    expect(
      cadenceInput(
        picker({ cadenceType: "times_per_week", timesPerWeek: "4" }),
      ),
    ).toEqual({
      cadenceType: "times_per_week",
      cadenceConfig: { timesPerWeek: 4 },
    });
  });
});

describe("pickerValueOf", () => {
  it("keeps the saved choice and defaults the others", () => {
    expect(
      pickerValueOf({
        cadenceType: "weekly_days",
        cadenceConfig: { days: [2] },
      }),
    ).toEqual({ cadenceType: "weekly_days", days: [2], timesPerWeek: "3" });
    expect(
      pickerValueOf({
        cadenceType: "times_per_week",
        cadenceConfig: { timesPerWeek: 5 },
      }),
    ).toEqual({ cadenceType: "times_per_week", days: [], timesPerWeek: "5" });
    expect(pickerValueOf({ cadenceType: "daily", cadenceConfig: {} })).toEqual({
      cadenceType: "daily",
      days: [],
      timesPerWeek: "3",
    });
  });

  it("round-trips through cadenceInput", () => {
    const cadence: HabitCadence = {
      cadenceType: "weekly_days",
      cadenceConfig: { days: [1, 3, 5] },
    };
    expect(cadenceInput(pickerValueOf(cadence))).toEqual(cadence);
  });
});

describe("describeCadence", () => {
  it("describes daily", () => {
    expect(
      describeCadence({ cadenceType: "daily", cadenceConfig: {} }, 1),
    ).toBe("Every day");
  });

  it("lists weekdays in the user's week order", () => {
    const cadence: HabitCadence = {
      cadenceType: "weekly_days",
      cadenceConfig: { days: [0, 1, 5] },
    };
    expect(describeCadence(cadence, 1)).toBe("Mon, Fri, Sun");
    expect(describeCadence(cadence, 0)).toBe("Sun, Mon, Fri");
  });

  it("describes times a week", () => {
    const times = (timesPerWeek: number) =>
      describeCadence(
        { cadenceType: "times_per_week", cadenceConfig: { timesPerWeek } },
        1,
      );
    expect(times(1)).toBe("Once a week");
    expect(times(3)).toBe("3 times a week");
  });
});

describe("describeTarget", () => {
  it("shows up to two decimals in the user's locale", () => {
    expect(describeTarget(8, "glasses", "en-GB")).toBe("8 glasses a day");
    expect(describeTarget(2.5, "km", "en-GB")).toBe("2.5 km a day");
    expect(describeTarget(1234.25, "steps", "en-GB")).toBe(
      "1,234.25 steps a day",
    );
    expect(describeTarget(2.5, "km", "de-DE")).toBe("2,5 km a day");
  });
});

describe("habitDeleteConsequences", () => {
  it.each([
    [0, "It has no logs yet."],
    [1, "Its 1 log goes with it."],
    [12, "All 12 of its logs go with it."],
  ])("names %i logs", (count, text) => {
    expect(habitDeleteConsequences(count)).toBe(text);
  });
});
