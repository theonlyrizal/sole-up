import { describe, expect, it } from "vitest";

import {
  compareTasksBy,
  dateWindowBounds,
  dateWindowInstants,
  DEFAULT_TASK_LIST_FILTERS,
  formatEstimate,
  hasActiveTaskFilters,
  parseTaskListFilters,
  type TaskListFilters,
  taskListSearch,
} from "./task-list";

const GOAL_ID = "4b8f0d6e-2c1a-4f3e-9b7d-1a2b3c4d5e6f";
const AREA_ID = "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f";

describe("parseTaskListFilters", () => {
  it("defaults to open tasks by due date with no filters", () => {
    expect(parseTaskListFilters({})).toEqual(DEFAULT_TASK_LIST_FILTERS);
  });

  it("reads every filter", () => {
    expect(
      parseTaskListFilters({
        goal: GOAL_ID,
        area: AREA_ID,
        priority: "high",
        planned: "next7",
        due: "past",
        sort: "priority",
        closed: "1",
        status: "completed",
      }),
    ).toEqual({
      goal: GOAL_ID,
      area: AREA_ID,
      priority: "high",
      planned: "next7",
      due: "past",
      sort: "priority",
      showClosed: true,
      status: "completed",
    });
  });

  it("reads the 'none' choices", () => {
    expect(
      parseTaskListFilters({ goal: "none", priority: "none", due: "none" }),
    ).toMatchObject({ goal: "none", priority: "none", due: "none" });
  });

  it("ignores unknown or malformed values", () => {
    expect(
      parseTaskListFilters({
        goal: "not-a-uuid",
        area: "none",
        priority: "urgent",
        planned: "tomorrow",
        due: "",
        sort: "title",
        closed: "yes",
        status: "completed",
      }),
    ).toEqual(DEFAULT_TASK_LIST_FILTERS);
  });

  it("ignores the status filter while closed tasks are hidden", () => {
    expect(parseTaskListFilters({ status: "cancelled" }).status).toBeNull();
  });

  it("takes the first of repeated params and lowercases IDs", () => {
    expect(
      parseTaskListFilters({
        goal: [GOAL_ID.toUpperCase(), AREA_ID],
        sort: ["planned", "due"],
      }),
    ).toMatchObject({ goal: GOAL_ID, sort: "planned" });
  });
});

describe("taskListSearch", () => {
  it("is empty for the defaults", () => {
    expect(taskListSearch(DEFAULT_TASK_LIST_FILTERS)).toBe("");
  });

  it("round-trips with parseTaskListFilters", () => {
    const filters: TaskListFilters = {
      goal: "none",
      area: AREA_ID,
      priority: "low",
      planned: "today",
      due: "later",
      sort: "planned",
      showClosed: true,
      status: "cancelled",
    };
    const search = taskListSearch(filters);
    expect(search).toBe(
      `?goal=none&area=${AREA_ID}&priority=low&planned=today&due=later&sort=planned&closed=1&status=cancelled`,
    );
    const params = Object.fromEntries(new URLSearchParams(search));
    expect(parseTaskListFilters(params)).toEqual(filters);
  });

  it("drops the status when closed tasks are hidden", () => {
    expect(
      taskListSearch({
        ...DEFAULT_TASK_LIST_FILTERS,
        status: "completed",
      }),
    ).toBe("");
  });
});

describe("hasActiveTaskFilters", () => {
  it("ignores the sort and the closed toggle on its own", () => {
    expect(
      hasActiveTaskFilters({
        ...DEFAULT_TASK_LIST_FILTERS,
        sort: "priority",
        showClosed: true,
      }),
    ).toBe(false);
    expect(
      hasActiveTaskFilters({ ...DEFAULT_TASK_LIST_FILTERS, due: "today" }),
    ).toBe(true);
  });
});

describe("dateWindowBounds", () => {
  const today = "2026-12-30";

  it("splits time into windows that don't overlap", () => {
    expect(dateWindowBounds("past", today)).toEqual({
      from: null,
      to: "2026-12-29",
    });
    expect(dateWindowBounds("today", today)).toEqual({
      from: today,
      to: today,
    });
    expect(dateWindowBounds("next7", today)).toEqual({
      from: "2026-12-31",
      to: "2027-01-06",
    });
    expect(dateWindowBounds("later", today)).toEqual({
      from: "2027-01-07",
      to: null,
    });
  });
});

describe("dateWindowInstants", () => {
  it("covers the window's local days in the user's zone", () => {
    expect(dateWindowInstants("today", "2026-10-23", "Asia/Tokyo")).toEqual({
      start: new Date("2026-10-22T15:00:00Z"),
      end: new Date("2026-10-23T15:00:00Z"),
    });
  });

  it("follows DST: the next 7 days from New York's last summer day", () => {
    expect(
      dateWindowInstants("next7", "2026-10-31", "America/New_York"),
    ).toEqual({
      start: new Date("2026-11-01T04:00:00Z"),
      end: new Date("2026-11-08T05:00:00Z"),
    });
  });

  it("leaves open ends open", () => {
    expect(dateWindowInstants("past", "2026-10-23", "UTC")).toEqual({
      start: null,
      end: new Date("2026-10-23T00:00:00Z"),
    });
  });
});

describe("compareTasksBy", () => {
  let position = 0;
  const task = (
    id: string,
    fields: Partial<Parameters<ReturnType<typeof compareTasksBy>>[0]> = {},
  ) => ({
    id,
    dueDate: null,
    dueAt: null,
    plannedDate: null,
    priority: null,
    sortOrder: position++,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...fields,
  });
  const order = (
    sort: Parameters<typeof compareTasksBy>[0],
    tasks: ReturnType<typeof task>[],
    timeZone = "UTC",
  ) => [...tasks].sort(compareTasksBy(sort, timeZone)).map((t) => t.id);

  it("sorts by deadline, all-day before that day's timed ones, none last", () => {
    expect(
      order("due", [
        task("none"),
        task("timed-24th", { dueAt: new Date("2026-10-24T09:00:00Z") }),
        task("all-day-24th", { dueDate: "2026-10-24" }),
        task("all-day-23rd", { dueDate: "2026-10-23" }),
      ]),
    ).toEqual(["all-day-23rd", "all-day-24th", "timed-24th", "none"]);
  });

  it("places all-day deadlines at the start of the day in the user's zone", () => {
    // 23 Oct, 20:00 UTC is already 24 Oct in Tokyo, after 24 Oct begins.
    const tasks = [
      task("timed", { dueAt: new Date("2026-10-23T20:00:00Z") }),
      task("all-day", { dueDate: "2026-10-24" }),
    ];
    expect(order("due", tasks, "UTC")).toEqual(["timed", "all-day"]);
    expect(order("due", tasks, "Asia/Tokyo")).toEqual(["all-day", "timed"]);
  });

  it("sorts by planned date, unplanned last, ties by deadline", () => {
    expect(
      order("planned", [
        task("unplanned"),
        task("25th", { plannedDate: "2026-10-25" }),
        task("24th-later-due", {
          plannedDate: "2026-10-24",
          dueDate: "2026-11-02",
        }),
        task("24th-sooner-due", {
          plannedDate: "2026-10-24",
          dueDate: "2026-10-30",
        }),
      ]),
    ).toEqual(["24th-sooner-due", "24th-later-due", "25th", "unplanned"]);
  });

  it("sorts priority high to low with no priority last (ADR 0011)", () => {
    expect(
      order("priority", [
        task("none"),
        task("low", { priority: "low" }),
        task("high", { priority: "high" }),
        task("medium", { priority: "medium" }),
      ]),
    ).toEqual(["high", "medium", "low", "none"]);
  });

  it("falls back to the task's position", () => {
    expect(order("due", [task("first"), task("second")]).at(0)).toBe("first");
  });
});

describe("formatEstimate", () => {
  it.each([
    [1, "1 min"],
    [45, "45 min"],
    [60, "1 h"],
    [90, "1 h 30 min"],
    [1440, "24 h"],
  ])("%i minutes → %s", (minutes, label) => {
    expect(formatEstimate(minutes)).toBe(label);
  });
});
