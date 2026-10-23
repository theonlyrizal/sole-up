import { describe, expect, it } from "vitest";

import { todayClock } from "@/lib/today";
import { changeGoalStatus, createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import {
  changeMilestoneStatus,
  createMilestone,
} from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";
import { changeTaskStatus, createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  deadlinesNextSevenDays,
  goalsWithoutNextAction,
  todayTaskCounts,
} from "./home";

// Home's metrics (chunk 3.1) against fixed fixtures: for each, empty data,
// data in range and data out of range.
//
// Tokyo is UTC+9 with no DST. At NOW it is 00:01 on Sat 24 Oct in Tokyo but
// still the 23rd in UTC, so a UTC or server-date bug shows.
const TOKYO = "Asia/Tokyo";
const NOW = new Date("2026-10-23T15:01:00Z");
const clock = todayClock(TOKYO, NOW);

const newTask = (userId: string, fields: Record<string, unknown>) =>
  createTask(userId, createTaskSchema.parse({ title: "A task", ...fields }));

const newGoal = (userId: string, title = "A goal") =>
  createGoal(userId, createGoalSchema.parse({ title }));

const newMilestone = (userId: string, goalId: string) =>
  createMilestone(
    userId,
    createMilestoneSchema.parse({ goalId, title: "A milestone" }),
  );

describe("todayTaskCounts", () => {
  it("has no data with no open tasks", async () => {
    const user = await createTestUser();
    expect(await todayTaskCounts(user.id, clock, TOKYO)).toEqual({
      value: { planned: 0, due: 0, decide: 0 },
      definition: expect.any(String),
      range: {
        from: "2026-10-24",
        to: "2026-10-24",
        timeZone: TOKYO,
        asOf: NOW,
      },
      hasData: false,
    });

    // Closed tasks are not data for today, even planned for today.
    const done = await newTask(user.id, { plannedDate: "2026-10-24" });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    const cancelled = await newTask(user.id, { dueDate: "2026-10-24" });
    await changeTaskStatus(user.id, { id: cancelled.id, status: "cancelled" });
    const metric = await todayTaskCounts(user.id, clock, TOKYO);
    expect(metric.hasData).toBe(false);
    expect(metric.value).toEqual({ planned: 0, due: 0, decide: 0 });
  });

  it("counts today's tasks once each, in their Today section", async () => {
    const user = await createTestUser();
    await newTask(user.id, { plannedDate: "2026-10-24" });
    // Planned today wins over a passed deadline.
    await newTask(user.id, {
      plannedDate: "2026-10-24",
      dueDate: "2026-10-20",
    });
    await newTask(user.id, { dueDate: "2026-10-24" });
    await newTask(user.id, {
      dueDate: "2026-10-24",
      dueTime: "23:59",
      dueTz: TOKYO,
    });
    await newTask(user.id, { dueDate: "2026-10-23" });
    // Midnight Tokyo today is a minute ago: passed, so a decision.
    await newTask(user.id, {
      dueDate: "2026-10-24",
      dueTime: "00:00",
      dueTz: TOKYO,
    });

    const metric = await todayTaskCounts(user.id, clock, TOKYO);
    expect(metric.value).toEqual({ planned: 2, due: 2, decide: 2 });
    expect(metric.hasData).toBe(true);
  });

  it("leaves out tasks outside today, closed tasks and other users' tasks", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await newTask(user.id, { plannedDate: "2026-10-25" });
    await newTask(user.id, { dueDate: "2026-10-25" });
    await newTask(user.id, {
      dueDate: "2026-10-25",
      dueTime: "00:00",
      dueTz: TOKYO,
    });
    // An old plan is "Earlier, not done", which this metric doesn't count.
    await newTask(user.id, { plannedDate: "2026-10-23" });
    await newTask(user.id, {});
    const done = await newTask(user.id, { plannedDate: "2026-10-24" });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    await newTask(other.id, { plannedDate: "2026-10-24" });
    await newTask(other.id, { dueDate: "2026-10-23" });

    const metric = await todayTaskCounts(user.id, clock, TOKYO);
    expect(metric.value).toEqual({ planned: 0, due: 0, decide: 0 });
    expect(metric.hasData).toBe(true);
  });
});

describe("goalsWithoutNextAction", () => {
  it("has no data with no active goals", async () => {
    const user = await createTestUser();
    expect(await goalsWithoutNextAction(user.id, clock, TOKYO)).toEqual({
      value: 0,
      definition: expect.any(String),
      range: { from: null, to: null, timeZone: TOKYO, asOf: NOW },
      hasData: false,
    });

    // Paused and dropped goals are not data, even with no next action.
    const paused = await newGoal(user.id);
    await changeGoalStatus(user.id, { id: paused.id, status: "paused" });
    const dropped = await newGoal(user.id);
    await changeGoalStatus(user.id, { id: dropped.id, status: "dropped" });
    const metric = await goalsWithoutNextAction(user.id, clock, TOKYO);
    expect(metric.value).toBe(0);
    expect(metric.hasData).toBe(false);
  });

  it("counts active goals with no dated open task", async () => {
    const user = await createTestUser();

    // Without a next action: no tasks; only undated tasks; only closed ones.
    await newGoal(user.id, "Empty");
    const undated = await newGoal(user.id, "Undated");
    await newTask(user.id, { goalId: undated.id });
    const closed = await newGoal(user.id, "Closed");
    const done = await newTask(user.id, {
      goalId: closed.id,
      plannedDate: "2026-10-24",
    });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });

    // With one: planned far ahead, a passed deadline, a timed deadline,
    // under a milestone, and under a completed milestone (the task is
    // still open).
    const later = await newGoal(user.id, "Later");
    await newTask(user.id, { goalId: later.id, plannedDate: "2027-06-01" });
    const passed = await newGoal(user.id, "Passed");
    await newTask(user.id, { goalId: passed.id, dueDate: "2026-09-01" });
    const timed = await newGoal(user.id, "Timed");
    await newTask(user.id, {
      goalId: timed.id,
      dueDate: "2026-10-30",
      dueTime: "09:00",
      dueTz: TOKYO,
    });
    const viaMilestone = await newGoal(user.id, "Via milestone");
    const open = await newMilestone(user.id, viaMilestone.id);
    await newTask(user.id, { milestoneId: open.id, dueDate: "2026-11-02" });
    const viaClosed = await newGoal(user.id, "Via closed milestone");
    const finished = await newMilestone(user.id, viaClosed.id);
    await newTask(user.id, {
      milestoneId: finished.id,
      plannedDate: "2026-10-26",
    });
    await changeMilestoneStatus(user.id, {
      id: finished.id,
      status: "completed",
    });

    const metric = await goalsWithoutNextAction(user.id, clock, TOKYO);
    expect(metric.value).toBe(3);
    expect(metric.hasData).toBe(true);
  });

  it("leaves out paused goals, other goals' tasks and other users' goals", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const active = await newGoal(user.id, "Active");
    await newTask(user.id, { goalId: active.id, plannedDate: "2026-10-24" });
    const paused = await newGoal(user.id, "Paused");
    await changeGoalStatus(user.id, { id: paused.id, status: "paused" });
    // A dated task in the inbox gives no goal a next action.
    await newTask(user.id, { dueDate: "2026-10-25" });
    await newGoal(other.id, "Someone else's");

    const metric = await goalsWithoutNextAction(user.id, clock, TOKYO);
    expect(metric.value).toBe(0);
    expect(metric.hasData).toBe(true);

    // The other user's goal is theirs alone.
    const theirs = await goalsWithoutNextAction(other.id, clock, TOKYO);
    expect(theirs.value).toBe(1);
  });
});

describe("deadlinesNextSevenDays", () => {
  it("has no data with no open task that has a deadline", async () => {
    const user = await createTestUser();
    expect(await deadlinesNextSevenDays(user.id, clock, TOKYO)).toEqual({
      value: 0,
      definition: expect.any(String),
      range: {
        from: "2026-10-25",
        to: "2026-10-31",
        timeZone: TOKYO,
        asOf: NOW,
      },
      hasData: false,
    });

    // A plan is not a deadline, and a completed task's deadline is not data.
    await newTask(user.id, { plannedDate: "2026-10-26" });
    const done = await newTask(user.id, { dueDate: "2026-10-26" });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    const metric = await deadlinesNextSevenDays(user.id, clock, TOKYO);
    expect(metric.value).toBe(0);
    expect(metric.hasData).toBe(false);
  });

  it("counts deadlines from tomorrow through day 7 on Tokyo days", async () => {
    const user = await createTestUser();
    await newTask(user.id, { dueDate: "2026-10-25" });
    await newTask(user.id, { dueDate: "2026-10-31" });
    await newTask(user.id, {
      dueDate: "2026-10-25",
      dueTime: "00:00",
      dueTz: TOKYO,
    });
    await newTask(user.id, {
      dueDate: "2026-10-31",
      dueTime: "23:59",
      dueTz: TOKYO,
    });
    // 12:00 on the 24th in New York (EDT) is 01:00 on the 25th in Tokyo.
    await newTask(user.id, {
      dueDate: "2026-10-24",
      dueTime: "12:00",
      dueTz: "America/New_York",
    });

    const metric = await deadlinesNextSevenDays(user.id, clock, TOKYO);
    expect(metric.value).toBe(5);
    expect(metric.hasData).toBe(true);
  });

  it("leaves out deadlines today, before, after day 7, closed and other users'", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await newTask(user.id, { dueDate: "2026-10-23" });
    await newTask(user.id, { dueDate: "2026-10-24" });
    await newTask(user.id, {
      dueDate: "2026-10-24",
      dueTime: "23:59",
      dueTz: TOKYO,
    });
    await newTask(user.id, { dueDate: "2026-11-01" });
    await newTask(user.id, {
      dueDate: "2026-11-01",
      dueTime: "00:00",
      dueTz: TOKYO,
    });
    // 11:00 on the 31st in New York (EDT) is 00:00 on 1 Nov in Tokyo.
    await newTask(user.id, {
      dueDate: "2026-10-31",
      dueTime: "11:00",
      dueTz: "America/New_York",
    });
    const cancelled = await newTask(user.id, { dueDate: "2026-10-27" });
    await changeTaskStatus(user.id, { id: cancelled.id, status: "cancelled" });
    await newTask(other.id, { dueDate: "2026-10-27" });

    const metric = await deadlinesNextSevenDays(user.id, clock, TOKYO);
    expect(metric.value).toBe(0);
    expect(metric.hasData).toBe(true);
  });
});
