import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { todayClock } from "@/lib/today";
import { db } from "@/server/db/client";
import { auditEvents, goals, tasks, userPreferences } from "@/server/db/schema";
import { changeGoalStatus, createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import {
  archiveHabit,
  createHabit,
  pauseHabit,
  setHabitLog,
} from "@/server/modules/habits/service";
import {
  createHabitSchema,
  setHabitLogSchema,
} from "@/server/modules/habits/validation";
import {
  changeMilestoneStatus,
  createMilestone,
} from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";
import {
  changeTaskStatus,
  createTask,
  planTask,
  rescheduleTaskDue,
} from "@/server/modules/tasks/service";
import {
  createTaskSchema,
  rescheduleTaskDueSchema,
} from "@/server/modules/tasks/validation";
import { createTestUser } from "../../../../tests/integration/helpers/users";
import { weeklySummary } from "./review";

// The weekly summary (chunk 7.1) against fixed fixtures. Tokyo is UTC+9, so
// the week of Mon 12 Oct runs from 11 Oct 15:00 UTC; a UTC-only bug moves
// events across the boundary. Now is Sat 24 Oct in Tokyo, so this week
// (Mon 19 Oct) is open and last week (Mon 12 Oct) is the reviewed one.
const TOKYO = "Asia/Tokyo";
const NOW = new Date("2026-10-23T15:01:00Z");
const clock = todayClock(TOKYO, NOW);
const LAST_WEEK = "2026-10-12";
const THIS_WEEK = "2026-10-19";

async function tokyoUser(weekStart = 1) {
  const user = await createTestUser();
  await db
    .insert(userPreferences)
    .values({ userId: user.id, timezone: TOKYO, weekStart })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { timezone: TOKYO, weekStart },
    });
  return user;
}

function summaryFor(
  userId: string,
  periodStart = LAST_WEEK,
  weekStart: 0 | 1 | 6 = 1,
) {
  return weeklySummary(userId, {
    periodStart,
    clock,
    timeZone: TOKYO,
    weekStart,
  });
}

const newTask = (userId: string, fields: Record<string, unknown> = {}) =>
  createTask(userId, createTaskSchema.parse({ title: "A task", ...fields }));

const newGoal = (userId: string, title = "A goal") =>
  createGoal(userId, createGoalSchema.parse({ title }));

const newHabit = (userId: string, fields: Record<string, unknown> = {}) =>
  createHabit(
    userId,
    createHabitSchema.parse({
      title: "Stretch",
      measure: "check",
      startDate: "2026-09-01",
      cadenceType: "daily",
      ...fields,
    }),
  );

/** Logs a habit day, at NOW (the log's own date is `localDate`). */
const logHabit = (
  userId: string,
  habitId: string,
  localDate: string,
  status: "completed" | "skipped" = "completed",
) =>
  setHabitLog(
    userId,
    setHabitLogSchema.parse({ habitId, localDate, status }),
    NOW,
  );

/** Runs an action, then stamps the audit events it wrote with `when`. */
async function inTime<T>(
  userId: string,
  when: string,
  action: () => Promise<T>,
): Promise<T> {
  const known = await auditIds(userId);
  const result = await action();
  const fresh = [...(await auditIds(userId))].filter((id) => !known.has(id));
  if (fresh.length > 0) {
    await db
      .update(auditEvents)
      .set({ occurredAt: new Date(when) })
      .where(inArray(auditEvents.id, fresh));
  }
  return result;
}

async function auditIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(eq(auditEvents.userId, userId));
  return new Set(rows.map((row) => row.id));
}

/** Moves every audit event of the user out of the way of the test periods. */
async function settle(userId: string) {
  await db
    .update(auditEvents)
    .set({ occurredAt: new Date("2026-01-01T00:00:00Z") })
    .where(eq(auditEvents.userId, userId));
}

async function setCompletedAt(taskId: string, at: string) {
  await db
    .update(tasks)
    .set({ completedAt: new Date(at) })
    .where(eq(tasks.id, taskId));
}

async function setGoalCreatedAt(goalId: string, at: string) {
  await db
    .update(goals)
    .set({ createdAt: new Date(at) })
    .where(and(eq(goals.id, goalId)));
}

describe("weeklySummary: sparse data", () => {
  it("has no data for each metric with an empty account", async () => {
    const user = await tokyoUser();
    const summary = await summaryFor(user.id);

    expect(summary.tasksCompleted).toMatchObject({ value: 0, hasData: false });
    expect(summary.plannedVersusCompleted).toMatchObject({
      value: { planned: 0, completed: 0 },
      hasData: false,
    });
    expect(summary.rescheduled).toMatchObject({ value: 0, hasData: false });
    expect(summary.goalsWithoutActivity).toMatchObject({
      value: 0,
      hasData: false,
    });
    expect(summary.habits).toMatchObject({ value: [], hasData: false });
    expect(summary.deadlinesNextPeriod).toMatchObject({
      value: 0,
      hasData: false,
    });
  });

  it("reads a quiet week as zero with data, not as no data", async () => {
    const user = await tokyoUser();
    await newTask(user.id, { title: "Open, undated" });
    const summary = await summaryFor(user.id);

    expect(summary.tasksCompleted).toMatchObject({ value: 0, hasData: true });
    expect(summary.plannedVersusCompleted).toMatchObject({
      value: { planned: 0, completed: 0 },
      hasData: true,
    });
    expect(summary.deadlinesNextPeriod).toMatchObject({
      value: 0,
      hasData: false,
    });
  });

  it("states each metric's range, the reviewed week in the user's zone", async () => {
    const user = await tokyoUser();
    const summary = await summaryFor(user.id);
    expect(summary.tasksCompleted.range).toEqual({
      from: "2026-10-12",
      to: "2026-10-18",
      timeZone: TOKYO,
      asOf: NOW,
    });
    expect(summary.tasksCompleted.definition).toEqual(expect.any(String));
  });
});

describe("weeklySummary: week boundaries", () => {
  it("places completions by their local day, not their UTC day", async () => {
    const user = await tokyoUser();
    const other = await tokyoUser();
    const lateSunday = await newTask(user.id, { title: "Late Sunday" });
    const earlyMonday = await newTask(user.id, { title: "Early Monday" });
    const earlier = await newTask(user.id, { title: "Earlier" });
    const cancelled = await newTask(user.id, { title: "Cancelled" });
    const theirs = await newTask(other.id, { title: "Theirs" });
    await changeTaskStatus(user.id, { id: lateSunday.id, status: "completed" });
    await changeTaskStatus(user.id, {
      id: earlyMonday.id,
      status: "completed",
    });
    await changeTaskStatus(user.id, { id: earlier.id, status: "completed" });
    await changeTaskStatus(user.id, { id: cancelled.id, status: "cancelled" });
    await changeTaskStatus(other.id, { id: theirs.id, status: "completed" });
    // Sun 18 Oct 23:59 Tokyo is still last week (18 Oct 14:59 UTC).
    await setCompletedAt(lateSunday.id, "2026-10-18T14:59:00Z");
    // Mon 19 Oct 01:00 Tokyo is this week, though it is still 18 Oct in UTC.
    await setCompletedAt(earlyMonday.id, "2026-10-18T16:00:00Z");
    await setCompletedAt(earlier.id, "2026-10-12T00:00:00Z");
    await setCompletedAt(theirs.id, "2026-10-14T10:00:00Z");

    const lastWeek = await summaryFor(user.id, LAST_WEEK);
    expect(lastWeek.tasksCompleted.value).toBe(2);
    const thisWeek = await summaryFor(user.id, THIS_WEEK);
    expect(thisWeek.tasksCompleted.value).toBe(1);
  });

  it("counts habits only for a period starting on the week start in force", async () => {
    // Sat 17, Sun 18 and Mon 19 Oct are each the first day of a week for
    // exactly one of week starts Saturday (6), Sunday (0) and Monday (1).
    const starts = ["2026-10-17", "2026-10-18", "2026-10-19"] as const;
    const alignedStart = { 0: "2026-10-18", 1: "2026-10-19", 6: "2026-10-17" };
    for (const weekStart of [0, 1, 6] as const) {
      const user = await tokyoUser(weekStart);
      await newHabit(user.id);
      for (const start of starts) {
        const summary = await summaryFor(user.id, start, weekStart);
        if (start === alignedStart[weekStart]) {
          expect(summary.habits.value).toEqual([
            expect.objectContaining({ title: "Stretch" }),
          ]);
        } else {
          expect(summary.habits.value).toBeNull();
          expect(summary.habits.hasData).toBe(false);
        }
      }
    }
  });

  it("reports habits as unavailable for a period off the week start", async () => {
    const user = await tokyoUser(1);
    await newHabit(user.id);
    const summary = await summaryFor(user.id, "2026-10-14");
    expect(summary.habits).toMatchObject({ value: null, hasData: false });
    expect(summary.habits.definition).toContain("whole weeks");
    // The other metrics still count the period, as they don't use week starts.
    expect(summary.tasksCompleted.hasData).toBe(false);
  });
});

describe("weeklySummary: planned versus completed", () => {
  it("counts a task planned in the week, even if its plan moved out later", async () => {
    const user = await tokyoUser();
    const other = await tokyoUser();
    const done = await newTask(user.id, { plannedDate: "2026-10-14" });
    const dropped = await newTask(user.id, { plannedDate: "2026-10-15" });
    const moved = await newTask(user.id, { plannedDate: "2026-10-13" });
    const undated = await newTask(user.id, { title: "Never planned" });
    const nextWeek = await newTask(user.id, { plannedDate: "2026-10-21" });
    await newTask(other.id, { plannedDate: "2026-10-14" });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    await setCompletedAt(done.id, "2026-10-15T03:00:00Z");
    await changeTaskStatus(user.id, { id: dropped.id, status: "cancelled" });
    await planTask(user.id, { id: moved.id, plannedDate: "2026-10-30" });
    await changeTaskStatus(user.id, { id: undated.id, status: "completed" });
    await setCompletedAt(undated.id, "2026-10-14T03:00:00Z");
    await changeTaskStatus(user.id, { id: nextWeek.id, status: "completed" });

    const summary = await summaryFor(user.id);
    // done, dropped and moved were planned this week; completed only counts
    // the planned ones completed this week; the undated and next-week tasks don't.
    expect(summary.plannedVersusCompleted).toEqual({
      value: { planned: 3, completed: 1 },
      definition: expect.any(String),
      range: summary.plannedVersusCompleted.range,
      hasData: true,
    });
  });
});

describe("weeklySummary: rescheduled", () => {
  it("counts a plan or deadline moved later, once per task", async () => {
    const user = await tokyoUser();
    await settle(user.id);
    const pushedTwice = await newTask(user.id, { plannedDate: "2026-10-14" });
    await inTime(user.id, "2026-10-13T12:00:00Z", () =>
      planTask(user.id, { id: pushedTwice.id, plannedDate: "2026-10-16" }),
    );
    await inTime(user.id, "2026-10-14T12:00:00Z", () =>
      planTask(user.id, { id: pushedTwice.id, plannedDate: "2026-10-18" }),
    );
    const pulledEarlier = await newTask(user.id, { plannedDate: "2026-10-14" });
    await inTime(user.id, "2026-10-13T12:00:00Z", () =>
      planTask(user.id, { id: pulledEarlier.id, plannedDate: "2026-10-13" }),
    );
    const firstPlan = await newTask(user.id);
    await inTime(user.id, "2026-10-13T12:00:00Z", () =>
      planTask(user.id, { id: firstPlan.id, plannedDate: "2026-10-15" }),
    );
    const deadlineLater = await newTask(user.id, { dueDate: "2026-10-16" });
    await inTime(user.id, "2026-10-14T12:00:00Z", () =>
      rescheduleTaskDue(
        user.id,
        rescheduleTaskDueSchema.parse({
          id: deadlineLater.id,
          dueDate: "2026-10-17",
        }),
      ),
    );
    const deadlineEarlier = await newTask(user.id, { dueDate: "2026-10-20" });
    await inTime(user.id, "2026-10-14T12:00:00Z", () =>
      rescheduleTaskDue(
        user.id,
        rescheduleTaskDueSchema.parse({
          id: deadlineEarlier.id,
          dueDate: "2026-10-16",
        }),
      ),
    );
    // A day deadline moved to a timed one on the same day is not later.
    const sameDay = await newTask(user.id, { dueDate: "2026-10-14" });
    await inTime(user.id, "2026-10-14T12:00:00Z", () =>
      rescheduleTaskDue(
        user.id,
        rescheduleTaskDueSchema.parse({
          id: sameDay.id,
          dueDate: "2026-10-14",
          dueTime: "09:00",
          dueTz: TOKYO,
        }),
      ),
    );
    // A timed deadline moved a day later is.
    const timedLater = await newTask(user.id, {
      dueDate: "2026-10-14",
      dueTime: "09:00",
      dueTz: TOKYO,
    });
    await inTime(user.id, "2026-10-14T12:00:00Z", () =>
      rescheduleTaskDue(
        user.id,
        rescheduleTaskDueSchema.parse({
          id: timedLater.id,
          dueDate: "2026-10-15",
          dueTime: "09:00",
          dueTz: TOKYO,
        }),
      ),
    );
    // Moved later, but in the week after: not in this week's count.
    const laterWeek = await newTask(user.id, { plannedDate: "2026-10-14" });
    await inTime(user.id, "2026-10-20T12:00:00Z", () =>
      planTask(user.id, { id: laterWeek.id, plannedDate: "2026-10-28" }),
    );

    const summary = await summaryFor(user.id);
    expect(summary.rescheduled).toMatchObject({ value: 3, hasData: true });
  });

  it("has no data without tasks", async () => {
    const user = await tokyoUser();
    expect(await summaryFor(user.id)).toMatchObject({
      rescheduled: { value: 0, hasData: false },
    });
  });
});

describe("weeklySummary: goals without activity", () => {
  it("finds active goals with no activity in the week, and counts activity by milestone, task or habit", async () => {
    const user = await tokyoUser();
    const other = await tokyoUser();
    await settle(user.id);

    // No activity this week: counted.
    const quiet = await newGoal(user.id, "Quiet");
    await setGoalCreatedAt(quiet.id, "2026-10-01T00:00:00Z");

    // Activity only through a milestone's status change.
    const milestoneGoal = await newGoal(user.id, "Milestone");
    await setGoalCreatedAt(milestoneGoal.id, "2026-10-01T00:00:00Z");
    const milestone = await createMilestone(
      user.id,
      createMilestoneSchema.parse({ goalId: milestoneGoal.id, title: "Step" }),
    );
    await inTime(user.id, "2026-10-14T12:00:00Z", () =>
      changeMilestoneStatus(user.id, { id: milestone.id, status: "completed" }),
    );

    // Activity only through a task under a milestone.
    const taskGoal = await newGoal(user.id, "Task");
    await setGoalCreatedAt(taskGoal.id, "2026-10-01T00:00:00Z");
    const step = await createMilestone(
      user.id,
      createMilestoneSchema.parse({ goalId: taskGoal.id, title: "Step" }),
    );
    const underMilestone = await newTask(user.id, { milestoneId: step.id });
    await inTime(user.id, "2026-10-14T12:00:00Z", () =>
      changeTaskStatus(user.id, { id: underMilestone.id, status: "completed" }),
    );

    // Activity only through a completed log of a linked habit.
    const habitGoal = await newGoal(user.id, "Habit");
    await setGoalCreatedAt(habitGoal.id, "2026-10-01T00:00:00Z");
    const habit = await newHabit(user.id, { goalId: habitGoal.id });
    await logHabit(user.id, habit.id, "2026-10-14");

    // A skipped log is not activity.
    const skippedGoal = await newGoal(user.id, "Skipped");
    await setGoalCreatedAt(skippedGoal.id, "2026-10-01T00:00:00Z");
    const skippedHabit = await newHabit(user.id, { goalId: skippedGoal.id });
    await logHabit(user.id, skippedHabit.id, "2026-10-14", "skipped");

    // Created after the week ended: not counted at all.
    const later = await newGoal(user.id, "Later");
    await setGoalCreatedAt(later.id, "2026-10-20T00:00:00Z");

    // Paused goals are not counted.
    const paused = await newGoal(user.id, "Paused");
    await setGoalCreatedAt(paused.id, "2026-10-01T00:00:00Z");
    await changeGoalStatus(user.id, { id: paused.id, status: "paused" });

    // Another user's quiet goal is not counted here.
    const theirs = await newGoal(other.id, "Theirs");
    await setGoalCreatedAt(theirs.id, "2026-10-01T00:00:00Z");

    const summary = await summaryFor(user.id);
    expect(summary.goalsWithoutActivity).toMatchObject({
      value: 2,
      hasData: true,
    });
  });

  it("counts activity in the week only, not before or after it", async () => {
    const user = await tokyoUser();
    await settle(user.id);
    const goal = await newGoal(user.id, "Timing");
    await setGoalCreatedAt(goal.id, "2026-10-01T00:00:00Z");
    const step = await createMilestone(
      user.id,
      createMilestoneSchema.parse({ goalId: goal.id, title: "Step" }),
    );
    await inTime(user.id, "2026-10-19T12:00:00Z", () =>
      changeMilestoneStatus(user.id, { id: step.id, status: "completed" }),
    );
    expect(await summaryFor(user.id)).toMatchObject({
      goalsWithoutActivity: { value: 1, hasData: true },
    });
    expect(await summaryFor(user.id, THIS_WEEK)).toMatchObject({
      goalsWithoutActivity: { value: 0, hasData: true },
    });
  });
});

describe("weeklySummary: habits", () => {
  it("gives a past week its consistency, with paused habits and no archived ones", async () => {
    const user = await tokyoUser(1);
    const daily = await newHabit(user.id, { title: "Stretch" });
    await logHabit(user.id, daily.id, "2026-10-13");
    await logHabit(user.id, daily.id, "2026-10-14", "skipped");
    const paused = await newHabit(user.id, { title: "Paused" });
    await pauseHabit(user.id, { id: paused.id }, NOW);
    const archived = await newHabit(user.id, { title: "Archived" });
    await archiveHabit(user.id, { id: archived.id }, NOW);

    const summary = await summaryFor(user.id, LAST_WEEK, 1);
    expect(summary.habits.hasData).toBe(true);
    expect(summary.habits.value).toEqual([
      {
        id: daily.id,
        title: "Stretch",
        status: "active",
        // Seven days, one skipped leaves six expected, one of them done.
        figure: "1 of 6 days · 1 skipped",
      },
      {
        id: paused.id,
        title: "Paused",
        status: "paused",
        figure: expect.any(String),
      },
    ]);
  });

  it("shows this week so far for the current week", async () => {
    const user = await tokyoUser(1);
    const daily = await newHabit(user.id, { title: "Stretch" });
    await logHabit(user.id, daily.id, "2026-10-19");
    await logHabit(user.id, daily.id, "2026-10-20");
    const summary = await summaryFor(user.id, THIS_WEEK, 1);
    expect(summary.habits.value?.[0]).toMatchObject({
      title: "Stretch",
      figure: "2 of 7 days so far this week",
    });
  });

  it("leaves out a habit that began after the reviewed week", async () => {
    const user = await tokyoUser(1);
    await newHabit(user.id, { title: "New", startDate: "2026-10-20" });
    const summary = await summaryFor(user.id, LAST_WEEK, 1);
    expect(summary.habits).toMatchObject({ value: [], hasData: true });
    // The user does have habits, so the metric has data; this week shows them.
    expect((await summaryFor(user.id, THIS_WEEK, 1)).habits.value).toHaveLength(
      1,
    );
  });
});

describe("weeklySummary: deadlines next period", () => {
  it("counts open deadlines in the seven days after the week, in the user's zone", async () => {
    const user = await tokyoUser();
    const other = await tokyoUser();
    await newTask(user.id, { dueDate: "2026-10-19" });
    await newTask(user.id, { dueDate: "2026-10-25" });
    await newTask(user.id, {
      dueDate: "2026-10-24",
      dueTime: "23:30",
      dueTz: TOKYO,
    });
    // Outside the window: the reviewed week's last day, and the day after it.
    await newTask(user.id, { dueDate: "2026-10-18" });
    await newTask(user.id, { dueDate: "2026-10-26" });
    // Closed deadlines are not open.
    const done = await newTask(user.id, { dueDate: "2026-10-20" });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    await newTask(other.id, { dueDate: "2026-10-20" });

    const summary = await summaryFor(user.id);
    expect(summary.deadlinesNextPeriod).toMatchObject({
      value: 3,
      hasData: true,
      range: {
        from: "2026-10-19",
        to: "2026-10-25",
        timeZone: TOKYO,
        asOf: NOW,
      },
    });
  });
});

describe("weeklySummary: a week's data is kept apart from other users'", () => {
  it("never reads another user's tasks, goals or habits", async () => {
    const user = await tokyoUser();
    const other = await tokyoUser();
    const theirTask = await newTask(other.id, { plannedDate: "2026-10-14" });
    await changeTaskStatus(other.id, { id: theirTask.id, status: "completed" });
    await setCompletedAt(theirTask.id, "2026-10-14T03:00:00Z");
    await newHabit(other.id, { title: "Theirs" });
    const summary = await summaryFor(user.id);
    expect(summary.tasksCompleted).toMatchObject({ value: 0, hasData: false });
    expect(summary.plannedVersusCompleted.value).toEqual({
      planned: 0,
      completed: 0,
    });
    expect(summary.habits).toMatchObject({ value: [], hasData: false });
  });
});
