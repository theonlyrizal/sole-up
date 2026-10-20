import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  changeGoalStatusSchema,
  createGoalSchema,
  TARGET_BEFORE_START,
  updateGoalSchema,
} from "./validation";

const ID = "4f9c7f3e-2a51-4c55-9a1f-0c6a1e1f3b2d";

function fieldErrors(result: { success: boolean; error?: z.ZodError }) {
  expect(result.success).toBe(false);
  return z.flattenError(result.error!).fieldErrors as Record<string, string[]>;
}

describe("createGoalSchema", () => {
  it("needs only a title and fills the rest with null", () => {
    expect(createGoalSchema.parse({ title: "  Run a 10k  " })).toEqual({
      title: "Run a 10k",
      description: null,
      reason: null,
      lifeAreaId: null,
      priority: null,
      startDate: null,
      targetDate: null,
    });
  });

  it("turns blank optional fields into null", () => {
    expect(
      createGoalSchema.parse({
        title: "Learn Spanish",
        description: "   ",
        reason: "",
        startDate: "",
        targetDate: " ",
      }),
    ).toMatchObject({
      description: null,
      reason: null,
      startDate: null,
      targetDate: null,
    });
  });

  it("requires a title", () => {
    expect(fieldErrors(createGoalSchema.safeParse({ title: "   " }))).toEqual({
      title: ["Give the goal a title."],
    });
  });

  it("rejects an unknown priority, a bad area ID and impossible dates", () => {
    const errors = fieldErrors(
      createGoalSchema.safeParse({
        title: "Ok",
        priority: "urgent",
        lifeAreaId: "not-a-uuid",
        startDate: "2026-02-30",
        targetDate: "26-03-01",
      }),
    );
    expect(Object.keys(errors).sort()).toEqual([
      "lifeAreaId",
      "priority",
      "startDate",
      "targetDate",
    ]);
  });

  it("reports a target before the start as a targetDate field error", () => {
    expect(
      fieldErrors(
        createGoalSchema.safeParse({
          title: "Ok",
          startDate: "2026-11-02",
          targetDate: "2026-11-01",
        }),
      ),
    ).toEqual({ targetDate: [TARGET_BEFORE_START] });
  });

  it("accepts a target on the start date, or either date alone", () => {
    for (const dates of [
      { startDate: "2026-11-01", targetDate: "2026-11-01" },
      { startDate: "2026-11-01" },
      { targetDate: "2026-11-01" },
    ]) {
      expect(
        createGoalSchema.safeParse({ title: "Ok", ...dates }).success,
      ).toBe(true);
    }
  });

  it("refuses keys it doesn't know, such as userId or status", () => {
    expect(
      createGoalSchema.safeParse({ title: "Ok", userId: ID }).success,
    ).toBe(false);
    expect(
      createGoalSchema.safeParse({ title: "Ok", status: "completed" }).success,
    ).toBe(false);
  });
});

describe("updateGoalSchema", () => {
  it("needs the goal's ID and checks the date order too", () => {
    expect(updateGoalSchema.safeParse({ title: "Ok" }).success).toBe(false);
    expect(
      fieldErrors(
        updateGoalSchema.safeParse({
          id: ID,
          title: "Ok",
          startDate: "2027-01-01",
          targetDate: "2026-12-31",
        }),
      ),
    ).toEqual({ targetDate: [TARGET_BEFORE_START] });
  });
});

describe("changeGoalStatusSchema", () => {
  it("accepts the five statuses only", () => {
    expect(
      changeGoalStatusSchema.safeParse({ id: ID, status: "archived" }).success,
    ).toBe(true);
    expect(
      fieldErrors(
        changeGoalStatusSchema.safeParse({ id: ID, status: "failed" }),
      ),
    ).toEqual({ status: ["Choose a status from the list."] });
  });
});
