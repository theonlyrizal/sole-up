import { describe, expect, it } from "vitest";

import { instantFromLocal } from "@/lib/dates";
import { timeBlockTiming } from "@/lib/time-blocks";

import {
  createTimeBlockSchema,
  deleteTimeBlockOccurrenceSchema,
  editTimeBlockOccurrenceSchema,
  setTimeBlockStatusSchema,
} from "./validation";

const TASK_ID = "6f1c2b9e-4d7a-4b1e-9c3f-2a8d5e7f1b20";

const block = (fields: Record<string, unknown> = {}) => ({
  taskId: TASK_ID,
  startDate: "2026-10-05",
  startTime: "09:00",
  durationMinutes: 60,
  tz: "America/New_York",
  ...fields,
});

const fieldErrors = (result: { error?: { flatten(): unknown } }) =>
  (result.error?.flatten() as { fieldErrors: Record<string, string[]> })
    ?.fieldErrors;

describe("createTimeBlockSchema", () => {
  it("groups the times as `when` and stores a canonical rule", () => {
    expect(
      createTimeBlockSchema.parse(
        block({ rrule: "FREQ=WEEKLY;BYDAY=WE,MO;INTERVAL=1" }),
      ),
    ).toEqual({
      taskId: TASK_ID,
      when: {
        startDate: "2026-10-05",
        startTime: "09:00",
        durationMinutes: 60,
        tz: "America/New_York",
      },
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
    });
    expect(createTimeBlockSchema.parse(block({ rrule: "" })).rrule).toBeNull();
  });

  it("accepts 1 to 1440 minutes and nothing else", () => {
    for (const durationMinutes of [1, 1440]) {
      expect(
        createTimeBlockSchema.safeParse(block({ durationMinutes })).success,
      ).toBe(true);
    }
    for (const durationMinutes of [0, 1441, 30.5, "60"]) {
      expect(
        fieldErrors(
          createTimeBlockSchema.safeParse(block({ durationMinutes })),
        ),
      ).toEqual({
        durationMinutes: ["Choose a length from 1 minute to 24 hours."],
      });
    }
  });

  it("names each bad field", () => {
    expect(
      fieldErrors(
        createTimeBlockSchema.safeParse(
          block({
            taskId: "nope",
            startDate: "2026-02-30",
            startTime: "24:00",
            tz: "Mars/Olympus",
          }),
        ),
      ),
    ).toEqual({
      taskId: ["Choose one of your tasks."],
      startDate: ["Pick a date."],
      startTime: ["Enter a start time."],
      tz: ["Choose a time zone."],
    });
    expect(
      fieldErrors(
        createTimeBlockSchema.safeParse(
          block({ rrule: "FREQ=DAILY;UNTIL=20261004" }),
        ),
      ),
    ).toEqual({ rrule: ["End the repeat on or after the start date."] });
    expect(
      createTimeBlockSchema.safeParse(block({ title: "Focus" })).success,
    ).toBe(false);
  });
});

describe("occurrence schemas", () => {
  const occurrence = {
    id: TASK_ID,
    originalStart: "2026-10-05T13:00:00.000Z",
  };

  it('takes no rule with "this" and a rule with the wider scopes', () => {
    const times = {
      startDate: "2026-10-05",
      startTime: "09:00",
      durationMinutes: 60,
      tz: "America/New_York",
    };
    expect(
      editTimeBlockOccurrenceSchema.safeParse({
        ...occurrence,
        scope: "this",
        ...times,
        rrule: "FREQ=DAILY",
      }).success,
    ).toBe(false);
    expect(
      editTimeBlockOccurrenceSchema.parse({
        ...occurrence,
        scope: "all",
        ...times,
        rrule: "FREQ=DAILY",
      }),
    ).toMatchObject({
      originalStart: new Date("2026-10-05T13:00:00.000Z"),
      scope: "all",
      rrule: "FREQ=DAILY",
    });
  });

  it("refuses a date as an original start and an unknown scope or status", () => {
    expect(
      deleteTimeBlockOccurrenceSchema.safeParse({
        ...occurrence,
        originalStart: "2026-10-05",
        scope: "this",
      }).success,
    ).toBe(false);
    expect(
      deleteTimeBlockOccurrenceSchema.safeParse({
        ...occurrence,
        scope: "some",
      }).success,
    ).toBe(false);
    expect(
      setTimeBlockStatusSchema.safeParse({ id: TASK_ID, status: "missed" })
        .success,
    ).toBe(false);
  });
});

describe("timeBlockTiming", () => {
  it("keeps elapsed minutes across a DST change", () => {
    const timing = timeBlockTiming({
      startDate: "2026-11-01",
      startTime: "00:30",
      durationMinutes: 120,
      tz: "America/New_York",
    });
    expect(timing.startAt).toEqual(
      instantFromLocal("2026-11-01", "00:30", "America/New_York"),
    );
    // 00:30 EDT + 2 hours of elapsed time is 01:30 EST.
    expect(timing.endAt.toISOString()).toBe("2026-11-01T06:30:00.000Z");
  });
});
