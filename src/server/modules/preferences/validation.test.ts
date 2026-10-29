import { describe, expect, it } from "vitest";

import { saveReminderSettingsSchema } from "./validation";

const form = {
  remindersEnabled: true,
  remindersPrivate: false,
  quietHours: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  dailyNudgeTime: "08:30",
  weeklyReviewDay: 0,
  weeklyReviewTime: "18:00",
};

const fieldErrorsOf = (input: unknown) => {
  const result = saveReminderSettingsSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.error!.flatten().fieldErrors;
};

describe("saveReminderSettingsSchema", () => {
  it("keeps quiet hours that cross midnight and the nudge time", () => {
    expect(saveReminderSettingsSchema.parse(form)).toEqual({
      remindersEnabled: true,
      remindersPrivate: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      dailyNudgeTime: "08:30",
      weeklyReviewDay: 0,
      weeklyReviewTime: "18:00",
    });
  });

  it("stores no quiet hours while they're off, whatever the times say", () => {
    expect(
      saveReminderSettingsSchema.parse({
        ...form,
        quietHours: false,
        quietHoursStart: "",
        quietHoursEnd: "",
        dailyNudgeTime: "",
      }),
    ).toMatchObject({
      quietHoursStart: null,
      quietHoursEnd: null,
      dailyNudgeTime: null,
    });
  });

  it("asks for both quiet-hours times, valid and different", () => {
    expect(
      fieldErrorsOf({ ...form, quietHoursStart: "", quietHoursEnd: "" }),
    ).toEqual({
      quietHoursStart: ["Enter when quiet hours start."],
      quietHoursEnd: ["Enter when quiet hours end."],
    });
    expect(
      fieldErrorsOf({ ...form, quietHoursStart: "25:00" }).quietHoursStart,
    ).toEqual(["Enter a valid time."]);
    expect(
      fieldErrorsOf({ ...form, quietHoursEnd: "22:00" }).quietHoursEnd,
    ).toEqual(["Quiet hours need to end at a different time than they start."]);
  });

  it("refuses a malformed nudge time and switches that aren't booleans", () => {
    expect(fieldErrorsOf({ ...form, dailyNudgeTime: "8:30" })).toEqual({
      dailyNudgeTime: ["Enter a valid time."],
    });
    expect(
      Object.keys(fieldErrorsOf({ ...form, remindersEnabled: "yes" })),
    ).toEqual(["remindersEnabled"]);
    expect(
      Object.keys(fieldErrorsOf({ ...form, remindersPrivate: undefined })),
    ).toEqual(["remindersPrivate"]);
  });

  it("stores no weekly review time while no day is chosen", () => {
    expect(
      saveReminderSettingsSchema.parse({
        ...form,
        weeklyReviewDay: null,
        weeklyReviewTime: "18:00",
      }),
    ).toMatchObject({ weeklyReviewDay: null, weeklyReviewTime: null });
  });

  it("asks for a time once a weekly review day is chosen, and a day from the list", () => {
    expect(fieldErrorsOf({ ...form, weeklyReviewTime: "" })).toEqual({
      weeklyReviewTime: ["Enter a time for the weekly review reminder."],
    });
    expect(fieldErrorsOf({ ...form, weeklyReviewTime: "6pm" })).toEqual({
      weeklyReviewTime: ["Enter a valid time."],
    });
    for (const weeklyReviewDay of [7, -1, 1.5, "1", undefined]) {
      expect(fieldErrorsOf({ ...form, weeklyReviewDay })).toEqual({
        weeklyReviewDay: ["Choose a day from the list."],
      });
    }
  });

  it("refuses unknown fields", () => {
    expect(
      saveReminderSettingsSchema.safeParse({ ...form, extra: 1 }).success,
    ).toBe(false);
  });
});
