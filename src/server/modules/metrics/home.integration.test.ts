import { describe, expect, it } from "vitest";

import { todayClock } from "@/lib/today";
import { createCalendarEvent } from "@/server/modules/calendar-events/service";
import { createCalendarEventSchema } from "@/server/modules/calendar-events/validation";
import { changeGoalStatus, createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import {
  changeMilestoneStatus,
  createMilestone,
} from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";
import { changeTaskStatus, createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";
import {
  createTimeBlock,
  setTimeBlockStatus,
} from "@/server/modules/time-blocks/service";
import { createTimeBlockSchema } from "@/server/modules/time-blocks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  deadlinesNextSevenDays,
  goalsWithoutNextAction,
  listGoalsWithoutNextAction,
  nextCommitment,
  todayTaskCounts,
} from "./home";

// Home's metrics (chunk 3.1) against fixed fixtures: for each, empty data,
// data in range and data out of range.
//
// Tokyo is UTC+9 with no DST. At NOW it is 00:01 on Sat 24 Oct in Tokyo but
// still the 23rd in UTC, so a UTC or server-date bug shows.
const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";
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
    expect(await listGoalsWithoutNextAction(user.id)).toEqual([]);
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

    // The list Home names is exactly the counted goals, oldest first.
    expect(await listGoalsWithoutNextAction(user.id)).toEqual([
      { id: expect.any(String), title: "Empty" },
      { id: undated.id, title: "Undated" },
      { id: closed.id, title: "Closed" },
    ]);
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

    expect(await listGoalsWithoutNextAction(user.id)).toEqual([]);

    // The other user's goal is theirs alone.
    const theirs = await goalsWithoutNextAction(other.id, clock, TOKYO);
    expect(theirs.value).toBe(1);
    expect(await listGoalsWithoutNextAction(other.id)).toEqual([
      { id: expect.any(String), title: "Someone else's" },
    ]);
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

describe("nextCommitment", () => {
  const timedEvent = (
    userId: string,
    title: string,
    start: string,
    end: string,
    tz = TOKYO,
  ) => {
    const [startDate, startTime] = start.split(" ");
    const [endDate, endTime] = end.split(" ");
    return createCalendarEvent(
      userId,
      createCalendarEventSchema.parse({
        title,
        allDay: false,
        startDate,
        startTime,
        endDate,
        endTime,
        tz,
      }),
    );
  };

  const allDayEvent = (
    userId: string,
    title: string,
    startDate: string,
    endDate = startDate,
  ) =>
    createCalendarEvent(
      userId,
      createCalendarEventSchema.parse({
        title,
        allDay: true,
        startDate,
        endDate,
      }),
    );

  const block = async (userId: string, title: string, start: string) => {
    const task = await newTask(userId, { title });
    const [startDate, startTime] = start.split(" ");
    const created = await createTimeBlock(
      userId,
      createTimeBlockSchema.parse({
        taskId: task.id,
        startDate,
        startTime,
        durationMinutes: 60,
        tz: TOKYO,
      }),
    );
    return { task, block: created };
  };

  const titleOf = async (userId: string) =>
    (await nextCommitment(userId, clock, TOKYO)).value?.title ?? null;

  it("has no data with no events or time blocks", async () => {
    const user = await createTestUser();
    expect(await nextCommitment(user.id, clock, TOKYO)).toEqual({
      value: null,
      definition: expect.any(String),
      // Today and the 29 days after it.
      range: {
        from: "2026-10-24",
        to: "2026-11-22",
        timeZone: TOKYO,
        asOf: NOW,
      },
      hasData: false,
    });
  });

  it("is nothing with only ended or out-of-range items", async () => {
    const user = await createTestUser();
    // Ended exactly at Tokyo midnight, a minute ago.
    await timedEvent(user.id, "Ended", "2026-10-23 23:00", "2026-10-24 00:00");
    await allDayEvent(user.id, "Yesterday", "2026-10-23");
    // Day 30 from today, past the range's last day.
    await timedEvent(
      user.id,
      "Too far",
      "2026-11-23 09:00",
      "2026-11-23 10:00",
    );
    const metric = await nextCommitment(user.id, clock, TOKYO);
    expect(metric.hasData).toBe(true);
    expect(metric.value).toBeNull();

    // The range's last day counts.
    await timedEvent(
      user.id,
      "Last day",
      "2026-11-22 23:00",
      "2026-11-22 23:30",
    );
    expect(await titleOf(user.id)).toBe("Last day");
  });

  it("picks the earliest start among items that haven't ended", async () => {
    const user = await createTestUser();
    await timedEvent(
      user.id,
      "Dentist",
      "2026-10-24 09:00",
      "2026-10-24 10:00",
    );
    await block(user.id, "Write report", "2026-10-24 08:00");
    expect(await titleOf(user.id)).toBe("Write report");

    // One already under way comes first: it began before now and runs on.
    await timedEvent(
      user.id,
      "Late call",
      "2026-10-23 23:30",
      "2026-10-24 00:30",
    );
    expect(await titleOf(user.id)).toBe("Late call");

    // An all-day event today starts at local midnight: after the call,
    // which began the evening before, but before the morning's items.
    await allDayEvent(user.id, "Birthday", "2026-10-24");
    expect(await titleOf(user.id)).toBe("Late call");

    const morning = await createTestUser();
    await block(morning.id, "Write report", "2026-10-24 08:00");
    await allDayEvent(morning.id, "Birthday", "2026-10-24");
    const metric = await nextCommitment(morning.id, clock, TOKYO);
    expect(metric.value).toMatchObject({
      kind: "event",
      allDay: true,
      title: "Birthday",
      start: "2026-10-24",
    });

    // A multi-day all-day event that began days ago is still under way.
    await allDayEvent(morning.id, "Trip", "2026-10-20", "2026-10-26");
    expect(await titleOf(morning.id)).toBe("Trip");
  });

  it("puts a New York event on its instant, not its local time", async () => {
    const user = await createTestUser();
    // 09:00 in New York on the 23rd is 22:00 on the 23rd in Tokyo: ended.
    await timedEvent(
      user.id,
      "NY ended",
      "2026-10-23 09:00",
      "2026-10-23 10:00",
      NEW_YORK,
    );
    // 11:30 in New York on the 23rd is 00:30 on the 24th in Tokyo.
    await timedEvent(
      user.id,
      "NY soon",
      "2026-10-23 11:30",
      "2026-10-23 12:00",
      NEW_YORK,
    );
    await timedEvent(
      user.id,
      "Tokyo later",
      "2026-10-24 01:00",
      "2026-10-24 02:00",
    );
    expect(await titleOf(user.id)).toBe("NY soon");
  });

  it("skips blocks marked done or skipped, and blocks for closed tasks", async () => {
    const user = await createTestUser();
    const done = await block(user.id, "Marked done", "2026-10-24 07:00");
    await setTimeBlockStatus(user.id, { id: done.block.id, status: "done" });
    const skipped = await block(user.id, "Marked skipped", "2026-10-24 08:00");
    await setTimeBlockStatus(user.id, {
      id: skipped.block.id,
      status: "skipped",
    });
    const finished = await block(user.id, "Task finished", "2026-10-24 09:00");
    await changeTaskStatus(user.id, {
      id: finished.task.id,
      status: "completed",
    });
    const dropped = await block(user.id, "Task dropped", "2026-10-24 10:00");
    await changeTaskStatus(user.id, {
      id: dropped.task.id,
      status: "cancelled",
    });
    await block(user.id, "Still on", "2026-10-24 11:00");

    const metric = await nextCommitment(user.id, clock, TOKYO);
    expect(metric.value).toMatchObject({ kind: "block", title: "Still on" });
  });

  it("only looks at the user's own items", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await timedEvent(
      other.id,
      "Theirs",
      "2026-10-24 09:00",
      "2026-10-24 10:00",
    );
    await block(other.id, "Their block", "2026-10-24 08:00");
    const metric = await nextCommitment(user.id, clock, TOKYO);
    expect(metric.hasData).toBe(false);
    expect(metric.value).toBeNull();
    expect(await titleOf(other.id)).toBe("Their block");
  });
});
