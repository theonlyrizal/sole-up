import { expect, it } from "vitest";

import { todayClock } from "@/lib/today";
import { db } from "@/server/db/client";
import {
  auditEvents,
  goals,
  habitLogs,
  milestones,
  tasks,
  userPreferences,
} from "@/server/db/schema";
import { createHabit } from "@/server/modules/habits/service";
import { createHabitSchema } from "@/server/modules/habits/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  goalInactivityMetric,
  habitConsistencyTrendMetric,
  nextWeekWorkloadMetric,
  overdueTrendMetric,
} from "./insights";

const timeZone = "Asia/Tokyo";
const weekStart = 1;
const clock = todayClock(timeZone, new Date("2026-11-06T12:00:00Z"));
const baseline = new Date("2026-10-01T00:00:00Z");

async function setup() {
  const user = await createTestUser();
  await db
    .insert(userPreferences)
    .values({ userId: user.id, timezone: timeZone, weekStart });
  return { userId: user.id, clock, timeZone, weekStart } as const;
}

async function newHabit(userId: string, fields: Record<string, unknown> = {}) {
  return createHabit(
    userId,
    createHabitSchema.parse({
      title: "Practice",
      measure: "check",
      cadenceType: "daily",
      startDate: "2026-10-26",
      ...fields,
    }),
  );
}

it("finds each active goal's most recent qualifying audit action in local days", async () => {
  const context = await setup();
  const { userId } = context;
  const other = await createTestUser();
  const [goal, fallback] = await db
    .insert(goals)
    .values([
      { userId, title: "Active", createdAt: baseline },
      { userId, title: "No events", createdAt: baseline },
      { userId, title: "Paused", status: "paused", createdAt: baseline },
      { userId: other.id, title: "Private", createdAt: baseline },
    ])
    .returning();
  const [milestone] = await db
    .insert(milestones)
    .values({
      userId,
      goalId: goal.id,
      title: "Milestone",
      sortOrder: 0,
    })
    .returning();
  const [task] = await db
    .insert(tasks)
    .values({
      userId,
      milestoneId: milestone.id,
      title: "Indirect task",
    })
    .returning();
  const habit = await newHabit(userId, { goalId: goal.id });

  await db.insert(auditEvents).values([
    {
      userId,
      entityId: task.id,
      entityType: "task",
      eventType: "task.completed",
      occurredAt: new Date("2026-11-02T15:01:00Z"),
      changes: { status: { from: "open", to: "completed" } },
    },
    {
      userId,
      entityId: task.id,
      entityType: "task",
      eventType: "task.planned",
      occurredAt: new Date("2026-11-05T12:00:00Z"),
      changes: { plannedDate: { from: null, to: "2026-11-06" } },
    },
    {
      userId,
      entityId: habit.id,
      entityType: "habit",
      eventType: "habit.logged",
      occurredAt: new Date("2026-11-05T12:00:00Z"),
      changes: {
        localDate: "2026-11-04",
        fields: ["status"],
        status: { from: null, to: "skipped" },
      },
    },
    {
      userId: other.id,
      entityId: goal.id,
      entityType: "goal",
      eventType: "goal.updated",
      occurredAt: new Date("2026-11-06T11:00:00Z"),
      changes: { fields: ["title"] },
    },
  ]);
  const result = await goalInactivityMetric(context);
  expect(result.hasData).toBe(true);
  expect(result.value).toHaveLength(2);
  expect(result.value).toEqual(
    expect.arrayContaining([
      {
        id: goal.id,
        title: goal.title,
        lastActionDate: "2026-11-03",
        daysInactive: 3,
      },
      {
        id: fallback.id,
        title: fallback.title,
        lastActionDate: "2026-10-01",
        daysInactive: 36,
      },
    ]),
  );

  await db.insert(auditEvents).values([
    {
      userId,
      entityId: habit.id,
      entityType: "habit",
      eventType: "habit.log_changed",
      occurredAt: new Date("2026-11-04T15:01:00Z"),
      changes: {
        localDate: "2026-11-04",
        fields: ["status"],
        status: { from: "skipped", to: "completed" },
      },
    },
    {
      userId,
      entityId: habit.id,
      entityType: "habit",
      eventType: "habit.log_changed",
      occurredAt: new Date("2026-11-06T11:00:00Z"),
      changes: {
        localDate: "2026-11-04",
        fields: ["value"],
        status: { from: "completed", to: "completed" },
      },
    },
    {
      userId,
      entityId: goal.id,
      entityType: "goal",
      eventType: "goal.updated",
      occurredAt: new Date("2026-11-06T13:00:00Z"),
      changes: { fields: ["title"] },
    },
  ]);
  expect((await goalInactivityMetric(context)).value).toContainEqual({
    id: goal.id,
    title: goal.title,
    lastActionDate: "2026-11-05",
    daysInactive: 1,
  });
});

it("reconstructs each week's overdue count from later status and deadline changes", async () => {
  const context = await setup();
  const { userId } = context;
  const other = await createTestUser();
  const completedAt = new Date("2026-10-25T15:00:00Z");
  const [changed, assigned] = await db
    .insert(tasks)
    .values([
      {
        userId,
        title: "Completed at the boundary",
        dueDate: "2026-10-25",
        status: "completed",
        completedAt,
        createdAt: baseline,
      },
      {
        userId,
        title: "Deadline added after first boundary",
        dueDate: "2026-10-05",
        createdAt: baseline,
      },
      {
        userId,
        title: "Timed boundary",
        dueAt: new Date("2026-10-11T15:00:00Z"),
        dueTz: timeZone,
        createdAt: baseline,
      },
      {
        userId: other.id,
        title: "Other user's overdue task",
        dueDate: "2026-10-01",
        createdAt: baseline,
      },
    ])
    .returning();
  const deadlineChange = {
    userId,
    entityType: "task",
    eventType: "task.due_changed",
    occurredAt: new Date("2026-10-15T00:00:00Z"),
  };
  await db.insert(auditEvents).values([
    {
      ...deadlineChange,
      entityId: changed.id,
      changes: { dueDate: { from: "2026-10-10", to: "2026-10-25" } },
    },
    {
      ...deadlineChange,
      entityId: assigned.id,
      changes: { dueDate: { from: null, to: "2026-10-05" } },
    },
    {
      userId,
      entityId: changed.id,
      entityType: "task",
      eventType: "task.completed",
      occurredAt: completedAt,
      changes: { status: { from: "open", to: "completed" } },
    },
  ]);

  const result = await overdueTrendMetric(context);
  expect(result.range).toEqual({
    from: "2026-10-05",
    to: "2026-11-01",
    timeZone,
    asOf: clock.now,
  });
  expect(result.hasData).toBe(true);
  expect(result.value).toEqual([
    { from: "2026-10-05", to: "2026-10-11", overdue: 1 },
    { from: "2026-10-12", to: "2026-10-18", overdue: 2 },
    { from: "2026-10-19", to: "2026-10-25", overdue: 3 },
    { from: "2026-10-26", to: "2026-11-01", overdue: 2 },
  ]);
});

it("uses cadence expectations and skips for completed weeks only", async () => {
  const context = await setup();
  const habit = await newHabit(context.userId);
  await db.insert(habitLogs).values([
    {
      userId: context.userId,
      habitId: habit.id,
      localDate: "2026-10-26",
      status: "completed",
    },
    {
      userId: context.userId,
      habitId: habit.id,
      localDate: "2026-10-27",
      status: "skipped",
    },
    {
      userId: context.userId,
      habitId: habit.id,
      localDate: "2026-11-02",
      status: "completed",
    },
  ]);
  const result = await habitConsistencyTrendMetric(context);
  expect(result.hasData).toBe(true);
  expect(result.value).toHaveLength(1);
  expect(result.value[0].id).toBe(habit.id);
  expect(result.value[0].title).toBe(habit.title);
  expect(result.value[0].weeks).toMatchObject([
    { expected: 0, completed: 0, skipped: 0 },
    { expected: 0, completed: 0, skipped: 0 },
    { expected: 0, completed: 0, skipped: 0 },
    {
      from: "2026-10-26",
      to: "2026-11-01",
      expected: 6,
      completed: 1,
      skipped: 1,
    },
  ]);
});

it("sums next week's estimates once per open task and reports missing estimates", async () => {
  const context = await setup();
  const { userId } = context;
  const other = await createTestUser();
  await db.insert(tasks).values([
    {
      userId,
      title: "Planned and due",
      plannedDate: "2026-11-09",
      dueDate: "2026-11-15",
      estimatedMinutes: 25,
    },
    {
      userId,
      title: "Due at start",
      dueAt: new Date("2026-11-08T15:00:00Z"),
      dueTz: timeZone,
      estimatedMinutes: 30,
    },
    { userId, title: "No estimate", plannedDate: "2026-11-15" },
    {
      userId,
      title: "Due after",
      dueAt: new Date("2026-11-15T15:00:00Z"),
      dueTz: timeZone,
      estimatedMinutes: 90,
    },
    {
      userId,
      title: "Cancelled",
      plannedDate: "2026-11-10",
      status: "cancelled",
      cancelledAt: baseline,
      estimatedMinutes: 60,
    },
    {
      userId: other.id,
      title: "Other user's task",
      plannedDate: "2026-11-11",
      estimatedMinutes: 100,
    },
  ]);
  const result = await nextWeekWorkloadMetric(context);
  expect(result.range).toEqual({
    from: "2026-11-09",
    to: "2026-11-15",
    timeZone,
    asOf: clock.now,
  });
  expect(result.hasData).toBe(true);
  expect(result.value).toEqual({
    estimatedMinutes: 55,
    estimatedTasks: 2,
    unestimatedTasks: 1,
  });
});

it("distinguishes empty source data from zero-valued metrics", async () => {
  const context = await setup();
  const [goals, overdue, habits, workload] = await Promise.all([
    goalInactivityMetric(context),
    overdueTrendMetric(context),
    habitConsistencyTrendMetric(context),
    nextWeekWorkloadMetric(context),
  ]);
  expect(goals).toMatchObject({ hasData: false, value: [] });
  expect(overdue.hasData).toBe(false);
  expect(overdue.value.map(({ overdue }) => overdue)).toEqual([0, 0, 0, 0]);
  expect(habits).toMatchObject({ hasData: false, value: [] });
  expect(workload).toMatchObject({
    hasData: false,
    value: { estimatedMinutes: 0, estimatedTasks: 0, unestimatedTasks: 0 },
  });
});
