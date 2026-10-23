import { describe, expect, it } from "vitest";

import { actionDayOf, groupGoalTasks, nextActionOf } from "./goal-tasks";
import type { Task } from "./tasks";

// Tokyo is UTC+9: a deadline at 00:30 Tokyo time is the day before in UTC,
// so a UTC-date bug picks the wrong day.
const TOKYO = "Asia/Tokyo";

let nextId = 0;
function task(fields: Partial<Task> = {}): Task {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
    goalId: "goal",
    milestoneId: null,
    title: `Task ${nextId}`,
    notes: null,
    status: "open",
    priority: null,
    dueDate: null,
    dueAt: null,
    dueTz: null,
    plannedDate: null,
    estimatedMinutes: null,
    completedAt: null,
    cancelledAt: null,
    sortOrder: nextId,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...fields,
  };
}

describe("actionDayOf", () => {
  it("is the earlier of the planned date and the deadline's day", () => {
    expect(
      actionDayOf(
        task({ plannedDate: "2026-10-27", dueDate: "2026-10-25" }),
        TOKYO,
      ),
    ).toBe("2026-10-25");
    expect(
      actionDayOf(
        task({ plannedDate: "2026-10-24", dueDate: "2026-10-25" }),
        TOKYO,
      ),
    ).toBe("2026-10-24");
    expect(actionDayOf(task({ plannedDate: "2026-10-24" }), TOKYO)).toBe(
      "2026-10-24",
    );
    expect(actionDayOf(task(), TOKYO)).toBeNull();
  });

  it("puts a timed deadline on its local day in the user's zone", () => {
    const dueAt = new Date("2026-10-24T15:30:00Z"); // 00:30 on the 25th in Tokyo
    expect(actionDayOf(task({ dueAt, dueTz: TOKYO }), TOKYO)).toBe(
      "2026-10-25",
    );
    expect(actionDayOf(task({ dueAt, dueTz: TOKYO }), "UTC")).toBe(
      "2026-10-24",
    );
  });
});

describe("nextActionOf", () => {
  it("picks the open task with the earliest planned or due day", () => {
    const later = task({ plannedDate: "2026-10-30" });
    const soonest = task({ dueDate: "2026-10-26", plannedDate: "2026-11-02" });
    const middle = task({ plannedDate: "2026-10-28" });
    expect(nextActionOf([later, soonest, middle], TOKYO)).toBe(soonest);
  });

  it("includes passed dates, which need attention first", () => {
    const overdue = task({ dueDate: "2026-10-01" });
    const upcoming = task({ plannedDate: "2026-10-24" });
    expect(nextActionOf([upcoming, overdue], TOKYO)).toBe(overdue);
  });

  it("ignores closed and undated tasks", () => {
    const done = task({
      status: "completed",
      plannedDate: "2026-10-20",
      completedAt: new Date(),
    });
    const cancelled = task({
      status: "cancelled",
      dueDate: "2026-10-21",
      cancelledAt: new Date(),
    });
    const undated = task();
    const dated = task({ dueDate: "2026-11-15" });
    expect(nextActionOf([done, cancelled, undated, dated], TOKYO)).toBe(dated);
    expect(nextActionOf([done, cancelled, undated], TOKYO)).toBeNull();
    expect(nextActionOf([], TOKYO)).toBeNull();
  });

  it("breaks a tie on the same day by deadline, then position", () => {
    const timed = task({
      dueAt: new Date("2026-10-26T01:00:00Z"),
      dueTz: TOKYO,
    });
    const allDay = task({ dueDate: "2026-10-26" });
    const plannedFirst = task({ plannedDate: "2026-10-26", sortOrder: 0 });
    const plannedSecond = task({ plannedDate: "2026-10-26", sortOrder: 1 });
    // An all-day deadline starts the day, before a timed one; a plan with no
    // deadline comes after both.
    expect(
      nextActionOf([plannedSecond, timed, plannedFirst, allDay], TOKYO),
    ).toBe(allDay);
    expect(nextActionOf([plannedSecond, timed, plannedFirst], TOKYO)).toBe(
      timed,
    );
    expect(nextActionOf([plannedSecond, plannedFirst], TOKYO)).toBe(
      plannedFirst,
    );
  });
});

describe("groupGoalTasks", () => {
  it("splits direct tasks from each milestone's, open first then by day", () => {
    const directUndated = task();
    const directDated = task({ plannedDate: "2026-10-29" });
    const directDone = task({
      status: "completed",
      plannedDate: "2026-10-01",
      completedAt: new Date(),
    });
    const stepA1 = task({
      goalId: null,
      milestoneId: "a",
      dueDate: "2026-11-02",
    });
    const stepA2 = task({
      goalId: null,
      milestoneId: "a",
      dueDate: "2026-10-30",
    });
    const stepB = task({ goalId: null, milestoneId: "b" });

    const { direct, byMilestone } = groupGoalTasks(
      [directUndated, stepA1, directDone, stepB, directDated, stepA2],
      TOKYO,
    );
    expect(direct).toEqual([directDated, directUndated, directDone]);
    expect(byMilestone.get("a")).toEqual([stepA2, stepA1]);
    expect(byMilestone.get("b")).toEqual([stepB]);
    expect(byMilestone.has("c")).toBe(false);
  });
});
