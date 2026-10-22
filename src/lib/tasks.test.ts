import { describe, expect, it } from "vitest";

import {
  isInboxTask,
  parentFromChoice,
  TASK_STATUS_EVENTS,
  TASK_STATUSES,
  taskParentChoice,
  timestampsAfterTaskStatusChange,
} from "./tasks";

const NOW = "now";

describe("timestampsAfterTaskStatusChange", () => {
  // The result depends only on the status entered: each timestamp is set
  // exactly while its status holds (ADR 0011), whatever the task left.
  for (const from of TASK_STATUSES) {
    for (const to of TASK_STATUSES.filter((status) => status !== from)) {
      it(`${from} → ${to}`, () => {
        expect(timestampsAfterTaskStatusChange(to, NOW)).toEqual({
          completedAt: to === "completed" ? NOW : null,
          cancelledAt: to === "cancelled" ? NOW : null,
        });
      });
    }
  }
});

describe("TASK_STATUS_EVENTS", () => {
  it("names the event for the status entered", () => {
    expect(TASK_STATUS_EVENTS).toEqual({
      open: "task.reopened",
      completed: "task.completed",
      cancelled: "task.cancelled",
    });
  });
});

describe("task parent choices", () => {
  const GOAL = "4f9c7f3e-2a51-4c55-9a1f-0c6a1e1f3b2d";
  const MILESTONE = "9b1d2c3e-4f50-4a61-8b72-93c4d5e6f708";

  it.each([
    [{ goalId: null, milestoneId: null }, ""],
    [{ goalId: GOAL, milestoneId: null }, `goal:${GOAL}`],
    [{ goalId: null, milestoneId: MILESTONE }, `milestone:${MILESTONE}`],
  ])("round-trips %o through %s", (parent, choice) => {
    expect(taskParentChoice(parent)).toBe(choice);
    expect(parentFromChoice(choice)).toEqual(parent);
  });

  it.each(["", "goal:", "milestone", "area:abc", "nonsense"])(
    "treats %j as no parent",
    (choice) => {
      expect(parentFromChoice(choice)).toEqual({
        goalId: null,
        milestoneId: null,
      });
    },
  );
});

describe("isInboxTask", () => {
  const inbox = {
    status: "open",
    goalId: null,
    milestoneId: null,
    plannedDate: null,
  } as const;

  it("is true for an open task with no parent and no plan", () => {
    expect(isInboxTask(inbox)).toBe(true);
  });

  it.each([
    ["a goal", { goalId: "g" }],
    ["a milestone", { milestoneId: "m" }],
    ["a planned date", { plannedDate: "2026-10-23" }],
    ["completed", { status: "completed" as const }],
    ["cancelled", { status: "cancelled" as const }],
  ])("is false with %s", (_label, change) => {
    expect(isInboxTask({ ...inbox, ...change })).toBe(false);
  });
});
