import { describe, expect, it } from "vitest";

import {
  DUPLICATE_PRIORITY,
  saveWeeklyReviewTextSchema,
  setWeeklyReviewPrioritiesSchema,
  startWeeklyReviewSchema,
} from "./validation";

const ID = "0b7e3c6a-2f5d-4c1e-9a8b-7d6e5f4a3b2c";
const goal = (n: number) => ({
  goalId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
});
const task = (n: number) => ({
  taskId: `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`,
});

function messages(result: { success: boolean; error?: { issues: unknown } }) {
  return (result.error?.issues as { message: string }[]).map(
    (issue) => issue.message,
  );
}

describe("startWeeklyReviewSchema", () => {
  it("takes a local date", () => {
    expect(
      startWeeklyReviewSchema.parse({ periodStart: "2026-11-02" }),
    ).toEqual({ periodStart: "2026-11-02" });
  });

  it.each(["", "2026-11-31", "next week", "2026-11-02T00:00"])(
    "refuses %j",
    (periodStart) => {
      expect(startWeeklyReviewSchema.safeParse({ periodStart }).success).toBe(
        false,
      );
    },
  );
});

describe("saveWeeklyReviewTextSchema", () => {
  it("trims, turns blank into null and leaves absent fields out", () => {
    expect(
      saveWeeklyReviewTextSchema.parse({
        id: ID,
        wins: "  Shipped it  ",
        blockers: "   ",
        lessons: null,
      }),
    ).toEqual({ id: ID, wins: "Shipped it", blockers: null, lessons: null });
  });

  it("accepts 5,000 characters and refuses 5,001", () => {
    expect(
      saveWeeklyReviewTextSchema.safeParse({ id: ID, wins: "a".repeat(5000) })
        .success,
    ).toBe(true);
    const result = saveWeeklyReviewTextSchema.safeParse({
      id: ID,
      prioritiesNote: "a".repeat(5001),
    });
    expect(messages(result)).toEqual([
      "Keep the note to 5,000 characters or fewer.",
    ]);
  });

  it("counts characters after trimming", () => {
    expect(
      saveWeeklyReviewTextSchema.safeParse({
        id: ID,
        lessons: ` ${"a".repeat(5000)} `,
      }).success,
    ).toBe(true);
  });

  it("refuses unknown fields and a bad ID", () => {
    expect(
      saveWeeklyReviewTextSchema.safeParse({ id: ID, mood: "fine" }).success,
    ).toBe(false);
    expect(saveWeeklyReviewTextSchema.safeParse({ id: "x" }).success).toBe(
      false,
    );
  });
});

describe("setWeeklyReviewPrioritiesSchema", () => {
  it("keeps goals and tasks in order", () => {
    const priorities = [task(1), goal(1), task(2)];
    expect(
      setWeeklyReviewPrioritiesSchema.parse({ id: ID, priorities }),
    ).toEqual({ id: ID, priorities });
  });

  it("accepts an empty list and 10 priorities, refuses 11", () => {
    const ten = Array.from({ length: 10 }, (_, n) =>
      n % 2 ? goal(n) : task(n),
    );
    expect(
      setWeeklyReviewPrioritiesSchema.safeParse({ id: ID, priorities: [] })
        .success,
    ).toBe(true);
    expect(
      setWeeklyReviewPrioritiesSchema.safeParse({ id: ID, priorities: ten })
        .success,
    ).toBe(true);
    const result = setWeeklyReviewPrioritiesSchema.safeParse({
      id: ID,
      priorities: [...ten, goal(99)],
    });
    expect(messages(result)).toEqual(["Choose up to 10 priorities."]);
  });

  it.each([
    ["the same goal twice", [goal(1), task(1), goal(1)]],
    ["the same task twice", [task(1), task(1)]],
  ])("refuses %s", (_case, priorities) => {
    const result = setWeeklyReviewPrioritiesSchema.safeParse({
      id: ID,
      priorities,
    });
    expect(messages(result)).toEqual([DUPLICATE_PRIORITY]);
  });

  it.each([
    ["both a goal and a task", { ...goal(1), ...task(1) }],
    ["neither", {}],
    ["an unknown key", { ...goal(1), title: "Run" }],
    ["a bad ID", { goalId: "nope" }],
  ])("refuses a priority with %s", (_case, priority) => {
    expect(
      setWeeklyReviewPrioritiesSchema.safeParse({
        id: ID,
        priorities: [priority],
      }).success,
    ).toBe(false);
  });
});
