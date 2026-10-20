import { describe, expect, it } from "vitest";

import {
  canChangeGoalStatus,
  completedAtAfterStatusChange,
  GOAL_STATUSES,
  type GoalStatus,
} from "./goals";

const LIVE: GoalStatus[] = ["active", "paused", "completed", "dropped"];

const pairs = GOAL_STATUSES.flatMap((from) =>
  GOAL_STATUSES.filter((to) => to !== from).map((to) => [from, to] as const),
);

// ADR 0010's transition table, written out rather than derived.
const ALLOWED = new Set([
  ...LIVE.flatMap((from) =>
    [...LIVE, "archived"]
      .filter((to) => to !== from)
      .map((to) => `${from}→${to}`),
  ),
  "archived→active",
]);

describe("canChangeGoalStatus", () => {
  it.each(pairs.filter(([from, to]) => ALLOWED.has(`${from}→${to}`)))(
    "allows %s → %s",
    (from, to) => {
      expect(canChangeGoalStatus(from, to)).toBe(true);
    },
  );

  it.each(pairs.filter(([from, to]) => !ALLOWED.has(`${from}→${to}`)))(
    "rejects %s → %s",
    (from, to) => {
      expect(canChangeGoalStatus(from, to)).toBe(false);
    },
  );

  it("has 17 allowed moves and 3 rejected ones", () => {
    expect(ALLOWED.size).toBe(17);
    expect(pairs).toHaveLength(20);
  });

  it.each(GOAL_STATUSES)("treats %s → itself as no change", (status) => {
    expect(canChangeGoalStatus(status, status)).toBe(false);
  });
});

describe("completedAtAfterStatusChange", () => {
  const earlier = "earlier";
  const now = "now";

  it.each(["active", "paused", "dropped", "archived"] as const)(
    "sets it on entering completed from %s",
    (from) => {
      expect(completedAtAfterStatusChange(from, "completed", null, now)).toBe(
        now,
      );
    },
  );

  it("keeps it when a completed goal is archived", () => {
    expect(
      completedAtAfterStatusChange("completed", "archived", earlier, now),
    ).toBe(earlier);
  });

  it.each(["active", "paused", "dropped"] as const)(
    "clears it on leaving completed for %s",
    (to) => {
      expect(completedAtAfterStatusChange("completed", to, earlier, now)).toBe(
        null,
      );
    },
  );

  it("clears it on restore from archived", () => {
    expect(
      completedAtAfterStatusChange("archived", "active", earlier, now),
    ).toBe(null);
  });

  it("stays empty when a goal that never completed is archived", () => {
    expect(completedAtAfterStatusChange("active", "archived", null, now)).toBe(
      null,
    );
  });
});
