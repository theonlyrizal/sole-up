import { describe, expect, it } from "vitest";
import { z } from "zod";

import { completedAtAfterMilestoneStatusChange } from "@/lib/milestones";

import {
  changeMilestoneStatusSchema,
  createMilestoneSchema,
  reorderMilestonesSchema,
  updateMilestoneSchema,
} from "./validation";

const ID = "4f9c7f3e-2a51-4c55-9a1f-0c6a1e1f3b2d";
const OTHER_ID = "9b1d2c3e-4f50-4a6b-8c7d-0e1f2a3b4c5d";

function fieldErrors(result: { success: boolean; error?: z.ZodError }) {
  expect(result.success).toBe(false);
  return z.flattenError(result.error!).fieldErrors as Record<string, string[]>;
}

describe("createMilestoneSchema", () => {
  it("needs a goal and a title, trims, and fills the rest with null", () => {
    expect(
      createMilestoneSchema.parse({
        goalId: ID,
        title: "  First 5k  ",
        description: "  ",
        dueDate: "",
      }),
    ).toEqual({
      goalId: ID,
      title: "First 5k",
      description: null,
      dueDate: null,
    });
  });

  it("explains a missing title, a bad date and a bad goal ID", () => {
    expect(
      fieldErrors(
        createMilestoneSchema.safeParse({
          goalId: "nope",
          title: "  ",
          dueDate: "2026-02-30",
        }),
      ),
    ).toEqual({
      goalId: ["Choose a goal."],
      title: ["Give the milestone a title."],
      dueDate: ["Enter a valid date."],
    });
  });

  it("limits title and description length", () => {
    const errors = fieldErrors(
      createMilestoneSchema.safeParse({
        goalId: ID,
        title: "x".repeat(201),
        description: "x".repeat(2001),
      }),
    );
    expect(errors.title).toEqual([
      "Keep the title to 200 characters or fewer.",
    ]);
    expect(errors.description).toEqual([
      "Keep the description to 2000 characters or fewer.",
    ]);
  });

  it("rejects unknown keys such as userId, status or sortOrder", () => {
    for (const extra of [
      { userId: ID },
      { status: "completed" },
      { sortOrder: 3 },
    ]) {
      expect(
        createMilestoneSchema.safeParse({ goalId: ID, title: "A", ...extra })
          .success,
      ).toBe(false);
    }
  });
});

describe("updateMilestoneSchema", () => {
  it("needs the milestone ID and does not accept a new goal", () => {
    expect(
      fieldErrors(updateMilestoneSchema.safeParse({ title: "A" })),
    ).toEqual({ id: ["Choose a milestone."] });
    expect(
      updateMilestoneSchema.safeParse({ id: ID, title: "A", goalId: ID })
        .success,
    ).toBe(false);
  });
});

describe("reorderMilestonesSchema", () => {
  it("refuses an empty list and duplicates", () => {
    expect(
      reorderMilestonesSchema.safeParse({ goalId: ID, ids: [] }).success,
    ).toBe(false);
    expect(
      reorderMilestonesSchema.safeParse({ goalId: ID, ids: [ID, ID] }).success,
    ).toBe(false);
    expect(
      reorderMilestonesSchema.parse({ goalId: ID, ids: [OTHER_ID, ID] }),
    ).toEqual({ goalId: ID, ids: [OTHER_ID, ID] });
  });
});

describe("changeMilestoneStatusSchema", () => {
  it("accepts the three statuses only", () => {
    for (const status of ["open", "completed", "dropped"]) {
      expect(
        changeMilestoneStatusSchema.safeParse({ id: ID, status }).success,
      ).toBe(true);
    }
    expect(
      fieldErrors(
        changeMilestoneStatusSchema.safeParse({ id: ID, status: "archived" }),
      ),
    ).toEqual({ status: ["Choose a status from the list."] });
  });
});

describe("completedAtAfterMilestoneStatusChange", () => {
  it("sets the time on completing and clears it otherwise", () => {
    expect(completedAtAfterMilestoneStatusChange("completed", "now")).toBe(
      "now",
    );
    expect(completedAtAfterMilestoneStatusChange("open", "now")).toBeNull();
    expect(completedAtAfterMilestoneStatusChange("dropped", "now")).toBeNull();
  });
});
