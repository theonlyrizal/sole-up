import { describe, expect, it } from "vitest";

import {
  canChangeGoalStatus,
  completedAtAfterStatusChange,
  GOAL_LIST_STATUSES,
  GOAL_STATUSES,
  goalDeleteConsequences,
  goalListStatus,
  goalStatusActions,
  type GoalStatus,
  NO_GOAL_TASKS,
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

describe("goalListStatus", () => {
  it("accepts each list status", () => {
    for (const status of GOAL_LIST_STATUSES) {
      expect(goalListStatus(status)).toBe(status);
    }
  });

  it("falls back to active for anything else, including archived", () => {
    for (const value of [undefined, "", "archived", "ACTIVE", ["paused"], 1]) {
      expect(goalListStatus(value)).toBe("active");
    }
  });
});

describe("goalStatusActions", () => {
  const targets = (status: GoalStatus) =>
    goalStatusActions(status).map((action) => `${action.label}→${action.to}`);

  it("offers the chunk's actions for each status", () => {
    expect(targets("active")).toEqual([
      "Mark complete→completed",
      "Pause→paused",
      "Drop→dropped",
      "Archive→archived",
    ]);
    expect(targets("paused")).toEqual([
      "Resume→active",
      "Mark complete→completed",
      "Drop→dropped",
      "Archive→archived",
    ]);
    expect(targets("completed")).toEqual(["Reopen→active", "Archive→archived"]);
    expect(targets("dropped")).toEqual(["Reopen→active", "Archive→archived"]);
    expect(targets("archived")).toEqual(["Restore to Active→active"]);
  });

  it("only offers moves the status rules allow", () => {
    for (const from of GOAL_STATUSES) {
      for (const action of goalStatusActions(from)) {
        expect(canChangeGoalStatus(from, action.to)).toBe(true);
      }
    }
  });

  it("uses copy that doesn't judge", () => {
    const copy = GOAL_STATUSES.flatMap(goalStatusActions)
      .flatMap((action) => [action.label, action.done])
      .join(" ")
      .toLowerCase();
    for (const word of [
      "fail",
      "gave up",
      "give up",
      "quit",
      "abandon",
      "lazy",
      "should",
    ]) {
      expect(copy).not.toContain(word);
    }
  });
});

describe("goalDeleteConsequences", () => {
  const tasks = (toInbox: number, planned = 0, closed = 0) => ({
    toInbox,
    planned,
    closed,
  });

  it("states exactly how many milestones go", () => {
    expect(goalDeleteConsequences(1, tasks(0))).toBe(
      "1 milestone will be deleted. It has no tasks.",
    );
    expect(goalDeleteConsequences(3, tasks(0))).toBe(
      "3 milestones will be deleted. It has no tasks.",
    );
  });

  it("says when there is nothing else to delete or move", () => {
    expect(goalDeleteConsequences(0, NO_GOAL_TASKS)).toBe(
      "It has no milestones or tasks.",
    );
  });

  it("states how many tasks move to the inbox", () => {
    expect(goalDeleteConsequences(3, tasks(7))).toBe(
      "3 milestones will be deleted. 7 tasks will move to your inbox.",
    );
    expect(goalDeleteConsequences(0, tasks(1))).toBe(
      "It has no milestones. 1 task will move to your inbox.",
    );
  });

  it("says planned and closed tasks are kept without a goal", () => {
    expect(goalDeleteConsequences(1, tasks(2, 1, 1))).toBe(
      "1 milestone will be deleted. 2 tasks will move to your inbox. " +
        "1 planned task will keep its date, without a goal. " +
        "1 completed or cancelled task will be kept, without a goal.",
    );
    expect(goalDeleteConsequences(0, tasks(0, 2, 3))).toBe(
      "It has no milestones. " +
        "2 planned tasks will keep their dates, without a goal. " +
        "3 completed or cancelled tasks will be kept, without a goal.",
    );
  });
});
