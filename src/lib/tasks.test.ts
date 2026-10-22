import { describe, expect, it } from "vitest";

import {
  TASK_STATUS_EVENTS,
  TASK_STATUSES,
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
