import { describe, expect, it } from "vitest";

import { GOAL_STATUSES } from "@/lib/goals";

import {
  buildGoalHistory,
  statusChangeSummary,
  type GoalAuditEvent,
  type GoalHistoryContext,
} from "./history";

const AREA_ID = "8d5f3c1e-0a3b-4c55-9a3e-1f2b3c4d5e6f";
const DELETED_AREA_ID = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9";

const context: GoalHistoryContext = {
  locale: "en-GB",
  timeZone: "UTC",
  areaNames: new Map([[AREA_ID, "Health"]]),
};

let sequence = 0;
function event(
  eventType: string,
  changes: unknown,
  occurredAt = `2027-03-12T10:0${sequence}:00Z`,
): GoalAuditEvent {
  sequence += 1;
  return {
    id: `event-${sequence}`,
    eventType,
    occurredAt: new Date(occurredAt),
    changes,
  };
}

const change = <T>(from: T | null, to: T | null) => ({ from, to });

const created = (overrides: Record<string, unknown> = {}) =>
  event("goal.created", {
    status: change(null, "active"),
    lifeAreaId: change(null, null),
    priority: change(null, null),
    startDate: change(null, null),
    targetDate: change(null, null),
    ...overrides,
  });

describe("buildGoalHistory", () => {
  it("lists events newest first, with the time in the user's zone", () => {
    const history = buildGoalHistory(
      [
        created(),
        event(
          "goal.status_changed",
          { status: change("active", "paused") },
          "2027-03-12T23:30:00Z",
        ),
      ],
      { ...context, timeZone: "Asia/Jakarta" },
    );

    expect(history.map((entry) => entry.summary)).toEqual([
      "Paused",
      "Created",
    ]);
    expect(history[0]).toMatchObject({
      occurredAtLabel: "13 Mar 2027, 06:30",
      details: ["Active → Paused"],
    });
  });

  it("describes what a new goal started with", () => {
    const [entry] = buildGoalHistory(
      [
        created({
          lifeAreaId: change(null, AREA_ID),
          priority: change(null, "high"),
          startDate: change(null, "2027-04-01"),
          targetDate: change(null, "2027-10-31"),
        }),
      ],
      context,
    );

    expect(entry).toMatchObject({
      summary: "Created",
      details: [
        "Area: Health",
        "Priority: High",
        "Start date: 1 Apr 2027",
        "Target date: 31 Oct 2027",
      ],
    });
  });

  it("shows structured edits with old and new values, and only names text fields", () => {
    const [entry] = buildGoalHistory(
      [
        event("goal.updated", {
          fields: ["title", "reason", "lifeAreaId", "priority", "targetDate"],
          lifeAreaId: change(DELETED_AREA_ID, AREA_ID),
          priority: change("low", null),
          targetDate: change(null, "2027-12-31"),
        }),
      ],
      context,
    );

    expect(entry).toMatchObject({
      summary: "Edited",
      details: [
        "Area: A deleted area → Health",
        "Priority: Low → None",
        "Target date: Not set → 31 Dec 2027",
        "Edited the title and why it matters",
      ],
    });
  });

  it("shows an unknown or malformed event without details", () => {
    const history = buildGoalHistory(
      [
        event("goal.something_new", { status: change("active", "paused") }),
        event("goal.status_changed", { status: "paused" }),
      ],
      context,
    );

    expect(
      history.map(({ summary, details }) => ({ summary, details })),
    ).toEqual([
      { summary: "Changed", details: [] },
      { summary: "Changed", details: [] },
    ]);
  });
});

describe("statusChangeSummary", () => {
  it("names every allowed move", () => {
    expect(statusChangeSummary("paused", "active")).toBe("Resumed");
    expect(statusChangeSummary("completed", "active")).toBe("Reopened");
    expect(statusChangeSummary("dropped", "active")).toBe("Reopened");
    expect(statusChangeSummary("archived", "active")).toBe(
      "Restored from the archive",
    );
    expect(statusChangeSummary("active", "completed")).toBe("Marked complete");
    expect(statusChangeSummary("active", "dropped")).toBe("Dropped");
    expect(statusChangeSummary("completed", "archived")).toBe("Archived");
    for (const from of GOAL_STATUSES) {
      for (const to of GOAL_STATUSES) {
        expect(statusChangeSummary(from, to)).not.toBe("");
      }
    }
  });
});
