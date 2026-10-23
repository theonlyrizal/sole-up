import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NO_GOAL_TASKS } from "@/lib/goals";
import { db } from "@/server/db/client";
import {
  auditEvents,
  milestones,
  tasks,
  userPreferences,
} from "@/server/db/schema";
import {
  changeMilestoneStatus,
  createMilestone,
  deleteMilestone,
} from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";
import { getUserPreferences } from "@/server/modules/preferences/service";
import * as taskActions from "@/server/modules/tasks/actions";
import { listInboxTasks } from "@/server/modules/tasks/queries";
import { changeTaskStatus, createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { getArchivedGoals, getGoalDetail } from "./queries";
import { changeGoalStatus, createGoal, deleteGoal } from "./service";
import { createGoalSchema } from "./validation";

// Tasks on goal detail, the goal's next action, and what a goal delete does
// to its tasks (chunk 2.7).

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

beforeEach(() => {
  requestHeaders.current = new Headers();
});

async function signInAs(userId: string) {
  requestHeaders.current = (await asUser(userId)).headers;
}

const TOKYO = "Asia/Tokyo";

async function userInTokyo() {
  const user = await createTestUser();
  await getUserPreferences(user.id); // creates the preferences row
  await db
    .update(userPreferences)
    .set({ timezone: TOKYO })
    .where(eq(userPreferences.userId, user.id));
  return user;
}

const goal = (userId: string, title = "Learn to swim") =>
  createGoal(userId, createGoalSchema.parse({ title }));

const milestone = (userId: string, goalId: string, title: string) =>
  createMilestone(userId, createMilestoneSchema.parse({ goalId, title }));

const task = (userId: string, fields: Record<string, unknown>) =>
  createTask(userId, createTaskSchema.parse({ title: "A task", ...fields }));

const complete = (userId: string, id: string) =>
  changeTaskStatus(userId, { id, status: "completed" });

/** A goal with tasks in every place and state a delete has to handle. */
async function goalWithTasks(userId: string) {
  const swim = await goal(userId);
  const [lessons, laps] = [
    await milestone(userId, swim.id, "Take lessons"),
    await milestone(userId, swim.id, "Swim 10 laps"),
  ];
  const direct = await task(userId, { title: "Buy goggles", goalId: swim.id });
  const directPlanned = await task(userId, {
    title: "Find a pool",
    goalId: swim.id,
    plannedDate: "2026-10-28",
  });
  const underLessons = await task(userId, {
    title: "Book a lesson",
    milestoneId: lessons.id,
    dueDate: "2026-10-26",
  });
  const underLaps = await task(userId, {
    title: "Swim 5 laps",
    milestoneId: laps.id,
  });
  await complete(userId, underLaps.id);
  return {
    swim,
    lessons,
    laps,
    direct,
    directPlanned,
    underLessons,
    underLaps,
  };
}

describe("goal detail tasks", () => {
  it("lists direct and milestone tasks in any status, and nothing else", async () => {
    const user = await userInTokyo();
    const setup = await goalWithTasks(user.id);
    const other = await goal(user.id, "Another goal");
    await task(user.id, { title: "Elsewhere", goalId: other.id });
    await task(user.id, { title: "Inbox task" });
    const stranger = await createTestUser();
    await task(stranger.id, { title: "Not mine" });

    const detail = await getGoalDetail(user.id, setup.swim.id);
    expect(detail?.tasks.map((item) => item.title).sort()).toEqual([
      "Book a lesson",
      "Buy goggles",
      "Find a pool",
      "Swim 5 laps",
    ]);
    const booked = detail?.tasks.find((item) => item.title === "Book a lesson");
    expect(booked?.milestone).toMatchObject({ id: setup.lessons.id });
    expect(booked?.goal).toMatchObject({ id: setup.swim.id });
    expect(detail?.timeZone).toBe(TOKYO);
    expect(detail?.taskParentOptions.map((option) => option.id)).toEqual([
      setup.swim.id,
      other.id,
    ]);
  });

  it("shows the earliest planned or due open task as the next action", async () => {
    const user = await userInTokyo();
    const setup = await goalWithTasks(user.id);

    // Due on the 26th beats planned for the 28th; the completed task and
    // the undated one don't count.
    let detail = await getGoalDetail(user.id, setup.swim.id);
    expect(detail?.nextAction?.id).toBe(setup.underLessons.id);

    await complete(user.id, setup.underLessons.id);
    detail = await getGoalDetail(user.id, setup.swim.id);
    expect(detail?.nextAction?.id).toBe(setup.directPlanned.id);

    // A timed deadline at 00:30 on the 27th in Tokyo (the 26th in UTC).
    const timed = await task(user.id, {
      title: "Call the coach",
      goalId: setup.swim.id,
      dueDate: "2026-10-27",
      dueTime: "00:30",
      dueTz: TOKYO,
    });
    detail = await getGoalDetail(user.id, setup.swim.id);
    expect(detail?.nextAction?.id).toBe(timed.id);
  });

  it("has no next action when no open task has a date", async () => {
    const user = await userInTokyo();
    const swim = await goal(user.id);
    expect((await getGoalDetail(user.id, swim.id))?.nextAction).toBeNull();

    await task(user.id, { title: "Undated", goalId: swim.id });
    const done = await task(user.id, {
      title: "Done",
      goalId: swim.id,
      plannedDate: "2026-10-24",
    });
    await complete(user.id, done.id);
    expect((await getGoalDetail(user.id, swim.id))?.nextAction).toBeNull();
  });

  it("never lets task status change milestones, the goal or its progress", async () => {
    const user = await userInTokyo();
    const setup = await goalWithTasks(user.id);
    const before = await getGoalDetail(user.id, setup.swim.id);

    await complete(user.id, setup.underLessons.id);
    await complete(user.id, setup.direct.id);
    await complete(user.id, setup.directPlanned.id);

    const after = await getGoalDetail(user.id, setup.swim.id);
    expect(after?.goal.status).toBe("active");
    expect(after?.progress).toEqual(before?.progress);
    expect(after?.progress).toEqual({ completed: 0, countable: 2 });
    expect(after?.milestones.map((item) => item.status)).toEqual([
      "open",
      "open",
    ]);
  });

  it("adds a task to a milestone in context through the action", async () => {
    const user = await userInTokyo();
    const swim = await goal(user.id);
    const lessons = await milestone(user.id, swim.id, "Take lessons");
    await signInAs(user.id);

    const result = await taskActions.createTask({
      title: "  Book a lesson  ",
      milestoneId: lessons.id,
    });
    expect(result).toMatchObject({ ok: true });

    const detail = await getGoalDetail(user.id, swim.id);
    expect(detail?.tasks).toMatchObject([
      { title: "Book a lesson", milestoneId: lessons.id, goalId: null },
    ]);
  });
});

describe("goal task counts for the delete confirmation", () => {
  it("counts inbox-bound, planned and closed tasks, direct and under milestones", async () => {
    const user = await userInTokyo();
    const setup = await goalWithTasks(user.id);
    await changeMilestoneStatus(user.id, {
      id: setup.laps.id,
      status: "dropped",
    });
    const expected = { toInbox: 2, planned: 1, closed: 1 };

    expect((await getGoalDetail(user.id, setup.swim.id))?.taskCounts).toEqual(
      expected,
    );

    await changeGoalStatus(user.id, { id: setup.swim.id, status: "archived" });
    const empty = await goal(user.id, "Empty");
    await changeGoalStatus(user.id, { id: empty.id, status: "archived" });
    const archived = await getArchivedGoals(user.id);
    expect(
      archived.find((item) => item.id === setup.swim.id)?.taskCounts,
    ).toEqual(expected);
    expect(archived.find((item) => item.id === empty.id)?.taskCounts).toEqual(
      NO_GOAL_TASKS,
    );
  });

  it("never counts another user's tasks", async () => {
    const user = await userInTokyo();
    const swim = await goal(user.id);
    await task(user.id, { goalId: swim.id });
    const stranger = await createTestUser();
    await task(stranger.id, {});

    expect((await getGoalDetail(user.id, swim.id))?.taskCounts).toEqual({
      toInbox: 1,
      planned: 0,
      closed: 0,
    });
    expect(await getGoalDetail(stranger.id, swim.id)).toBeNull();
  });
});

describe("deleting a goal keeps its tasks", () => {
  it("moves open unplanned tasks to the inbox and keeps the rest without a goal", async () => {
    const user = await userInTokyo();
    const setup = await goalWithTasks(user.id);
    const other = await goal(user.id, "Keep me");
    const untouched = await task(user.id, { title: "Stays", goalId: other.id });
    await signInAs(user.id);

    expect(await actions.deleteGoal({ id: setup.swim.id })).toMatchObject({
      ok: true,
    });

    const ids = [
      setup.direct.id,
      setup.directPlanned.id,
      setup.underLessons.id,
      setup.underLaps.id,
    ];
    const rows = await db.select().from(tasks).where(inArray(tasks.id, ids));
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toMatchObject({
        userId: user.id,
        goalId: null,
        milestoneId: null,
      });
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(setup.directPlanned.id)?.plannedDate).toBe("2026-10-28");
    expect(byId.get(setup.underLessons.id)?.dueDate).toBe("2026-10-26");
    expect(byId.get(setup.underLaps.id)?.status).toBe("completed");

    // The inbox: open, no parent, no plan (ADR 0011).
    expect(
      (await listInboxTasks(user.id)).map((item) => item.id).sort(),
    ).toEqual([setup.direct.id, setup.underLessons.id].sort());

    const [kept] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, untouched.id));
    expect(kept?.goalId).toBe(other.id);
    expect(
      await db
        .select()
        .from(milestones)
        .where(eq(milestones.goalId, setup.swim.id)),
    ).toEqual([]);
  });

  it("records a task.moved event for each task it takes off the goal", async () => {
    const user = await userInTokyo();
    const setup = await goalWithTasks(user.id);

    await deleteGoal(user.id, { id: setup.swim.id });

    const moves = await db
      .select({ entityId: auditEvents.entityId, changes: auditEvents.changes })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, user.id),
          eq(auditEvents.eventType, "task.moved"),
        ),
      );
    const changesOf = (id: string) =>
      moves.find((move) => move.entityId === id)?.changes;
    expect(moves).toHaveLength(4);
    expect(changesOf(setup.direct.id)).toEqual({
      goalId: { from: setup.swim.id, to: null },
      milestoneId: { from: null, to: null },
    });
    expect(changesOf(setup.underLessons.id)).toEqual({
      goalId: { from: null, to: null },
      milestoneId: { from: setup.lessons.id, to: null },
    });
    // The tasks' earlier events stay; the goal's and milestones' go.
    const remaining = await db
      .select({ entityType: auditEvents.entityType })
      .from(auditEvents)
      .where(eq(auditEvents.userId, user.id));
    expect(new Set(remaining.map((event) => event.entityType))).toEqual(
      new Set(["task"]),
    );
  });

  it("changes nothing when another user tries to delete the goal", async () => {
    const user = await userInTokyo();
    const setup = await goalWithTasks(user.id);
    const stranger = await createTestUser();
    await signInAs(stranger.id);

    expect(await actions.deleteGoal({ id: setup.swim.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    const [row] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, setup.direct.id));
    expect(row?.goalId).toBe(setup.swim.id);
    const moves = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "task.moved"));
    expect(moves).toEqual([]);
  });
});

describe("deleting a milestone keeps its tasks", () => {
  it("takes them off the milestone with a task.moved event each", async () => {
    const user = await userInTokyo();
    const setup = await goalWithTasks(user.id);

    await deleteMilestone(user.id, { id: setup.lessons.id });

    const [row] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, setup.underLessons.id));
    expect(row).toMatchObject({ goalId: null, milestoneId: null });
    const moves = await db
      .select({ entityId: auditEvents.entityId, changes: auditEvents.changes })
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "task.moved"));
    expect(moves).toEqual([
      {
        entityId: setup.underLessons.id,
        changes: {
          goalId: { from: null, to: null },
          milestoneId: { from: setup.lessons.id, to: null },
        },
      },
    ]);
    // The other milestone's task and the direct ones stay where they were.
    const detail = await getGoalDetail(user.id, setup.swim.id);
    expect(detail?.tasks.map((item) => item.id).sort()).toEqual(
      [setup.direct.id, setup.directPlanned.id, setup.underLaps.id].sort(),
    );
  });
});
