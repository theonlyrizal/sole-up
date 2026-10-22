import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayFor } from "@/lib/dates";
import { db } from "@/server/db/client";
import { auditEvents, tasks, userPreferences } from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { changeGoalStatus, createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import {
  changeMilestoneStatus,
  createMilestone,
} from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { listInboxTasks, listTaskParentOptions } from "./queries";
import { createTask, moveTasks, planTasks } from "./service";
import { createTaskSchema } from "./validation";

// Quick add, the inbox's bulk actions and the parent pickers (chunk 2.3).
// Single-task service rules are covered in tasks.integration.test.ts.

// Server Actions read the session from the request's headers, and refresh()
// needs a Next.js request. Outside one, supply both here.
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

async function setTimeZone(userId: string, timezone: string) {
  await db
    .insert(userPreferences)
    .values({ userId, timezone })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { timezone } });
}

const newTask = (userId: string, title = "Book the dentist") =>
  createTask(userId, createTaskSchema.parse({ title }));

const newGoal = (userId: string, title = "Run a 10k") =>
  createGoal(userId, createGoalSchema.parse({ title }));

const newMilestone = (userId: string, goalId: string, title = "5k") =>
  createMilestone(userId, createMilestoneSchema.parse({ goalId, title }));

const inboxTitles = async (userId: string) =>
  (await listInboxTasks(userId)).map((task) => task.title);

async function eventTypes(userId: string, entityId: string) {
  const rows = await db
    .select({ type: auditEvents.eventType })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.userId, userId), eq(auditEvents.entityId, entityId)),
    );
  return rows.map((row) => row.type);
}

describe("createTask action (quick add)", () => {
  it("captures a task from a title alone into the inbox", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const result = await actions.createTask({ title: "Book the dentist" });

    expect(result.ok).toBe(true);
    expect(await inboxTitles(user.id)).toEqual(["Book the dentist"]);
  });

  it("takes the optional fields as blank form strings", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const result = await actions.createTask({
      title: "Call the bank",
      goalId: null,
      milestoneId: null,
      plannedDate: "",
      dueDate: "",
    });

    expect(result.ok && result.data).toMatchObject({
      plannedDate: null,
      dueDate: null,
      goalId: null,
    });
  });

  it("files a task with a milestone, a plan and a due date outside the inbox", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const milestone = await newMilestone(user.id, goal.id);
    await signInAs(user.id);

    const result = await actions.createTask({
      title: "Buy shoes",
      milestoneId: milestone.id,
      plannedDate: "2026-10-24",
      dueDate: "2026-10-30",
    });

    expect(result.ok && result.data).toMatchObject({
      milestoneId: milestone.id,
      goalId: null,
      plannedDate: "2026-10-24",
      dueDate: "2026-10-30",
    });
    expect(await inboxTitles(user.id)).toEqual([]);
  });

  it("refuses a blank title with a field error", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const result = await actions.createTask({ title: "   " });

    expect(!result.ok && result.error).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { title: ["Give the task a title."] },
    });
  });

  it("refuses another user's goal with a field error", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const goal = await newGoal(owner.id);
    await signInAs(other.id);

    const result = await actions.createTask({
      title: "Sneak",
      goalId: goal.id,
    });

    expect(!result.ok && result.error).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { goalId: ["Choose one of your goals."] },
    });
    expect(await db.select().from(tasks)).toEqual([]);
  });

  it("refuses an anonymous caller", async () => {
    const result = await actions.createTask({ title: "Book the dentist" });

    expect(!result.ok && result.error.code).toBe("UNAUTHENTICATED");
    expect(await db.select().from(tasks)).toEqual([]);
  });
});

describe("listTaskParentOptions", () => {
  it("offers active goals, then paused ones, each with its open milestones", async () => {
    const user = await createTestUser();
    const paused = await newGoal(user.id, "Learn Spanish");
    await changeGoalStatus(user.id, { id: paused.id, status: "paused" });
    const active = await newGoal(user.id, "Run a 10k");
    const done = await newGoal(user.id, "Old goal");
    await changeGoalStatus(user.id, { id: done.id, status: "completed" });
    const first = await newMilestone(user.id, active.id, "5k");
    const closed = await newMilestone(user.id, active.id, "7k");
    await changeMilestoneStatus(user.id, {
      id: closed.id,
      status: "completed",
    });
    const last = await newMilestone(user.id, active.id, "10k");
    await newGoal((await createTestUser()).id, "Someone else's");

    expect(await listTaskParentOptions(user.id)).toEqual([
      {
        id: active.id,
        title: "Run a 10k",
        status: "active",
        milestones: [
          { id: first.id, title: "5k" },
          { id: last.id, title: "10k" },
        ],
      },
      {
        id: paused.id,
        title: "Learn Spanish",
        status: "paused",
        milestones: [],
      },
    ]);
  });

  it("is what the picker action returns, and refuses an anonymous caller", async () => {
    const user = await createTestUser();
    await newGoal(user.id);

    expect((await actions.getTaskParentOptions({})).ok).toBe(false);

    await signInAs(user.id);
    const result = await actions.getTaskParentOptions({});
    expect(result.ok && result.data.map((goal) => goal.title)).toEqual([
      "Run a 10k",
    ]);
  });
});

describe("planTasksToday action", () => {
  it("plans every selected task for today in the user's zone, taking them out of the inbox", async () => {
    const user = await createTestUser();
    // Far from UTC, so a server-date bug would show on most days.
    await setTimeZone(user.id, "Pacific/Kiritimati");
    const a = await newTask(user.id, "A");
    const b = await newTask(user.id, "B");
    await newTask(user.id, "C");
    await signInAs(user.id);

    const result = await actions.planTasksToday({ ids: [a.id, b.id, a.id] });

    const today = todayFor("Pacific/Kiritimati");
    expect(result.ok && result.data).toEqual({ plannedDate: today, count: 2 });
    expect(await inboxTitles(user.id)).toEqual(["C"]);
    expect(await eventTypes(user.id, a.id)).toContain("task.planned");
    expect(await eventTypes(user.id, b.id)).toContain("task.planned");
  });

  it("changes nothing when one task is another user's", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await setTimeZone(user.id, "Europe/London");
    const mine = await newTask(user.id, "Mine");
    const theirs = await newTask(other.id, "Theirs");
    await signInAs(user.id);

    const result = await actions.planTasksToday({ ids: [mine.id, theirs.id] });

    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
    expect(await inboxTitles(user.id)).toEqual(["Mine"]);
    expect(await inboxTitles(other.id)).toEqual(["Theirs"]);
    expect(await eventTypes(user.id, mine.id)).toEqual(["task.created"]);
  });

  it("refuses an empty selection and an anonymous caller", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);

    expect(!(await actions.planTasksToday({ ids: [task.id] })).ok).toBe(true);

    await signInAs(user.id);
    const result = await actions.planTasksToday({ ids: [] });
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(await inboxTitles(user.id)).toEqual(["Book the dentist"]);
  });
});

describe("moveTasks action (assign to a goal)", () => {
  it("puts every selected task under the goal, taking them out of the inbox", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const a = await newTask(user.id, "A");
    const b = await newTask(user.id, "B");
    await signInAs(user.id);

    const result = await actions.moveTasks({
      ids: [a.id, b.id],
      goalId: goal.id,
    });

    expect(result.ok && result.data).toEqual({ count: 2 });
    expect(await inboxTitles(user.id)).toEqual([]);
    const rows = await db
      .select({ goalId: tasks.goalId })
      .from(tasks)
      .where(eq(tasks.userId, user.id));
    expect(rows).toEqual([{ goalId: goal.id }, { goalId: goal.id }]);
    expect(await eventTypes(user.id, a.id)).toContain("task.moved");
  });

  it("puts tasks under a milestone", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const milestone = await newMilestone(user.id, goal.id);
    const task = await newTask(user.id);

    const [moved] = await moveTasks(user.id, {
      ids: [task.id],
      goalId: null,
      milestoneId: milestone.id,
    });

    expect(moved).toMatchObject({ milestoneId: milestone.id, goalId: null });
    expect(await inboxTitles(user.id)).toEqual([]);
  });

  it("refuses another user's goal and changes nothing", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const theirGoal = await newGoal(other.id);
    const task = await newTask(user.id);
    await signInAs(user.id);

    const result = await actions.moveTasks({
      ids: [task.id],
      goalId: theirGoal.id,
    });

    expect(!result.ok && result.error).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { goalId: ["Choose one of your goals."] },
    });
    expect(await inboxTitles(user.id)).toEqual(["Book the dentist"]);
  });

  it("changes nothing when one task is another user's", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const goal = await newGoal(user.id);
    const mine = await newTask(user.id, "Mine");
    const theirs = await newTask(other.id, "Theirs");

    await expect(
      moveTasks(user.id, {
        ids: [mine.id, theirs.id],
        goalId: goal.id,
        milestoneId: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await inboxTitles(user.id)).toEqual(["Mine"]);
    expect(await inboxTitles(other.id)).toEqual(["Theirs"]);
  });
});

describe("planTasks", () => {
  it("records no event for a task already planned on that date", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    await planTasks(user.id, { ids: [task.id], plannedDate: "2026-10-23" });

    await planTasks(user.id, { ids: [task.id], plannedDate: "2026-10-23" });

    expect(await eventTypes(user.id, task.id)).toEqual([
      "task.created",
      "task.planned",
    ]);
  });
});
