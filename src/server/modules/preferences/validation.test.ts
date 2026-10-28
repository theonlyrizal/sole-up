import { describe, expect, it } from "vitest";

import { saveReminderSettingsSchema } from "./validation";

const form = {
  remindersEnabled: true,
  remindersPrivate: false,
  quietHours: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  dailyNudgeTime: "08:30",
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

  it("refuses unknown fields", () => {
    expect(
      saveReminderSettingsSchema.safeParse({ ...form, extra: 1 }).success,
    ).toBe(false);
  });
});
