import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TASK_LIST_FILTERS,
  type TaskListFilters,
} from "@/lib/task-list";
import { db } from "@/server/db/client";
import { auditEvents, tasks } from "@/server/db/schema";
import { changeGoalStatus, createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import { createLifeArea } from "@/server/modules/life-areas/service";
import { createLifeAreaSchema } from "@/server/modules/life-areas/validation";
import { createMilestone } from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { listPlanTasks, listTaskFilterOptions } from "./queries";
import { changeTaskStatus, createTask } from "./service";
import { createTaskSchema } from "./validation";

// The Plan page (chunk 2.4): the filtered list, its filter options, and
// the edit, status and inline schedule actions.

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

const TODAY = "2026-10-23";
const UTC = { today: TODAY, timeZone: "UTC" };

const newTask = (userId: string, fields: Record<string, unknown>) =>
  createTask(userId, createTaskSchema.parse(fields));

const newGoal = (userId: string, title: string, lifeAreaId?: string) =>
  createGoal(userId, createGoalSchema.parse({ title, lifeAreaId }));

const newMilestone = (userId: string, goalId: string, title: string) =>
  createMilestone(userId, createMilestoneSchema.parse({ goalId, title }));

const newArea = (userId: string, name: string) =>
  createLifeArea(userId, createLifeAreaSchema.parse({ name }));

async function titles(
  userId: string,
  filters: Partial<TaskListFilters> = {},
  context = UTC,
) {
  const list = await listPlanTasks(
    userId,
    { ...DEFAULT_TASK_LIST_FILTERS, ...filters },
    context,
  );
  return list.map((task) => task.title);
}

async function eventTypes(userId: string, entityId: string) {
  const rows = await db
    .select({ type: auditEvents.eventType })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.userId, userId), eq(auditEvents.entityId, entityId)),
    );
  return rows.map((row) => row.type).sort();
}

describe("listPlanTasks", () => {
  it("lists open tasks by due date with their goal and milestone", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id, "Run a 10k");
    const milestone = await newMilestone(user.id, goal.id, "5k");
    await newTask(user.id, { title: "No deadline" });
    await newTask(user.id, {
      title: "Due later",
      dueDate: "2026-11-01",
      goalId: goal.id,
    });
    await newTask(user.id, {
      title: "Due sooner",
      dueDate: "2026-10-25",
      milestoneId: milestone.id,
    });
    const done = await newTask(user.id, { title: "Done", dueDate: TODAY });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });

    const list = await listPlanTasks(user.id, DEFAULT_TASK_LIST_FILTERS, UTC);

    expect(list.map((task) => task.title)).toEqual([
      "Due sooner",
      "Due later",
      "No deadline",
    ]);
    expect(list[0]).toMatchObject({
      goal: { id: goal.id, title: "Run a 10k", status: "active" },
      milestone: { id: milestone.id, title: "5k", status: "open" },
    });
    expect(list[1]).toMatchObject({
      goal: { id: goal.id, title: "Run a 10k" },
      milestone: null,
    });
    expect(list[2]).toMatchObject({ goal: null, milestone: null });
  });

  it("filters by goal, including tasks under its milestones, or no goal", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id, "Run a 10k");
    const other = await newGoal(user.id, "Learn Spanish");
    const milestone = await newMilestone(user.id, goal.id, "5k");
    await newTask(user.id, { title: "Direct", goalId: goal.id });
    await newTask(user.id, {
      title: "Via milestone",
      milestoneId: milestone.id,
    });
    await newTask(user.id, { title: "Other goal", goalId: other.id });
    await newTask(user.id, { title: "Loose" });

    expect(await titles(user.id, { goal: goal.id })).toEqual([
      "Direct",
      "Via milestone",
    ]);
    expect(await titles(user.id, { goal: "none" })).toEqual(["Loose"]);
  });

  it("filters by the life area of the task's goal", async () => {
    const user = await createTestUser();
    const health = await newArea(user.id, "Health");
    const work = await newArea(user.id, "Work");
    const run = await newGoal(user.id, "Run a 10k", health.id);
    const ship = await newGoal(user.id, "Ship v1", work.id);
    const milestone = await newMilestone(user.id, run.id, "5k");
    await newTask(user.id, { title: "Shoes", milestoneId: milestone.id });
    await newTask(user.id, { title: "Stretch", goalId: run.id });
    await newTask(user.id, { title: "Deploy", goalId: ship.id });
    await newTask(user.id, { title: "Loose" });

    expect(await titles(user.id, { area: health.id })).toEqual([
      "Shoes",
      "Stretch",
    ]);
  });

  it("filters by priority, or by having none", async () => {
    const user = await createTestUser();
    await newTask(user.id, { title: "High", priority: "high" });
    await newTask(user.id, { title: "Low", priority: "low" });
    await newTask(user.id, { title: "None" });

    expect(await titles(user.id, { priority: "high" })).toEqual(["High"]);
    expect(await titles(user.id, { priority: "none" })).toEqual(["None"]);
  });

  it("sorts by priority high to low, then no priority", async () => {
    const user = await createTestUser();
    await newTask(user.id, { title: "None" });
    await newTask(user.id, { title: "Low", priority: "low" });
    await newTask(user.id, { title: "High", priority: "high" });
    await newTask(user.id, { title: "Medium", priority: "medium" });

    expect(await titles(user.id, { sort: "priority" })).toEqual([
      "High",
      "Medium",
      "Low",
      "None",
    ]);
  });

  it("filters planned dates by window around the user's today", async () => {
    const user = await createTestUser();
    await newTask(user.id, { title: "Yesterday", plannedDate: "2026-10-22" });
    await newTask(user.id, { title: "Today", plannedDate: TODAY });
    await newTask(user.id, { title: "In 7 days", plannedDate: "2026-10-30" });
    await newTask(user.id, { title: "In 8 days", plannedDate: "2026-10-31" });
    await newTask(user.id, { title: "Unplanned" });

    expect(await titles(user.id, { planned: "past" })).toEqual(["Yesterday"]);
    expect(await titles(user.id, { planned: "today" })).toEqual(["Today"]);
    expect(await titles(user.id, { planned: "next7" })).toEqual(["In 7 days"]);
    expect(await titles(user.id, { planned: "later" })).toEqual(["In 8 days"]);
    expect(await titles(user.id, { planned: "none" })).toEqual(["Unplanned"]);
    expect(await titles(user.id, { sort: "planned" })).toEqual([
      "Yesterday",
      "Today",
      "In 7 days",
      "In 8 days",
      "Unplanned",
    ]);
  });

  it("puts a timed deadline in the window of its local day in the user's zone", async () => {
    const user = await createTestUser();
    // Tokyo is UTC+9: its 23 Oct runs from 22 Oct 15:00 to 23 Oct 15:00 UTC.
    await newTask(user.id, {
      title: "Late on the 22nd",
      dueDate: "2026-10-22",
      dueTime: "23:59",
      dueTz: "Asia/Tokyo",
    });
    await newTask(user.id, {
      title: "Just after midnight",
      dueDate: "2026-10-23",
      dueTime: "00:01",
      dueTz: "Asia/Tokyo",
    });
    await newTask(user.id, { title: "All day today", dueDate: TODAY });
    await newTask(user.id, { title: "No deadline" });
    const tokyo = { today: TODAY, timeZone: "Asia/Tokyo" };

    expect(await titles(user.id, { due: "past" }, tokyo)).toEqual([
      "Late on the 22nd",
    ]);
    expect(await titles(user.id, { due: "today" }, tokyo)).toEqual([
      "All day today",
      "Just after midnight",
    ]);
    expect(await titles(user.id, { due: "none" }, tokyo)).toEqual([
      "No deadline",
    ]);
    // Seen from UTC, both timed deadlines fall on the 22nd.
    expect(await titles(user.id, { due: "past" })).toEqual([
      "Late on the 22nd",
      "Just after midnight",
    ]);
  });

  it("shows completed and cancelled tasks only behind the toggle, filterable by status", async () => {
    const user = await createTestUser();
    await newTask(user.id, { title: "Open" });
    const done = await newTask(user.id, { title: "Done" });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    const dropped = await newTask(user.id, { title: "Dropped" });
    await changeTaskStatus(user.id, { id: dropped.id, status: "cancelled" });

    expect(await titles(user.id)).toEqual(["Open"]);
    expect(await titles(user.id, { showClosed: true })).toEqual([
      "Open",
      "Done",
      "Dropped",
    ]);
    expect(
      await titles(user.id, { showClosed: true, status: "cancelled" }),
    ).toEqual(["Dropped"]);
    // The status filter means nothing while closed tasks are hidden.
    expect(await titles(user.id, { status: "completed" })).toEqual(["Open"]);
  });

  it("never shows another user's tasks, even filtered by their goal", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const goal = await newGoal(owner.id, "Run a 10k");
    const area = await newArea(owner.id, "Health");
    await newTask(owner.id, { title: "Theirs", goalId: goal.id });
    await newTask(other.id, { title: "Mine" });

    expect(await titles(other.id, { showClosed: true })).toEqual(["Mine"]);
    expect(await titles(other.id, { goal: goal.id })).toEqual([]);
    expect(await titles(other.id, { area: area.id })).toEqual([]);
  });
});

describe("listTaskFilterOptions", () => {
  it("offers every goal, live ones first, and every area, active first", async () => {
    const user = await createTestUser();
    const done = await newGoal(user.id, "Old goal");
    await changeGoalStatus(user.id, { id: done.id, status: "completed" });
    const paused = await newGoal(user.id, "Learn Spanish");
    await changeGoalStatus(user.id, { id: paused.id, status: "paused" });
    const active = await newGoal(user.id, "Run a 10k");
    const health = await newArea(user.id, "Health");
    await newGoal((await createTestUser()).id, "Someone else's");

    expect(await listTaskFilterOptions(user.id)).toEqual({
      goals: [
        { id: active.id, title: "Run a 10k", status: "active" },
        { id: paused.id, title: "Learn Spanish", status: "paused" },
        { id: done.id, title: "Old goal", status: "completed" },
      ],
      areas: [{ id: health.id, name: "Health", status: "active" }],
    });
  });
});

describe("scheduleTask action", () => {
  it("sets the plan, a timed deadline and a milestone, one event each", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id, "Run a 10k");
    const milestone = await newMilestone(user.id, goal.id, "5k");
    const task = await newTask(user.id, { title: "Buy shoes" });
    await signInAs(user.id);

    const result = await actions.scheduleTask({
      id: task.id,
      plannedDate: "2026-10-24",
      dueDate: "2026-10-30",
      dueTime: "17:30",
      dueTz: "Europe/London",
      goalId: null,
      milestoneId: milestone.id,
    });

    expect(result.ok && result.data).toMatchObject({
      plannedDate: "2026-10-24",
      dueDate: null,
      dueAt: new Date("2026-10-30T17:30:00Z"),
      dueTz: "Europe/London",
      milestoneId: milestone.id,
      goalId: null,
    });
    expect(await eventTypes(user.id, task.id)).toEqual([
      "task.created",
      "task.due_changed",
      "task.moved",
      "task.planned",
    ]);
  });

  it("records nothing when nothing changed", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, {
      title: "Call the bank",
      plannedDate: TODAY,
      dueDate: "2026-10-28",
      dueTime: "09:00",
      dueTz: "America/New_York",
    });
    await signInAs(user.id);

    const result = await actions.scheduleTask({
      id: task.id,
      plannedDate: TODAY,
      dueDate: "2026-10-28",
      dueTime: "09:00",
      dueTz: "America/New_York",
      goalId: null,
      milestoneId: null,
    });

    expect(result.ok).toBe(true);
    expect(await eventTypes(user.id, task.id)).toEqual(["task.created"]);
  });

  it("clears plan, deadline and parent from blank fields", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id, "Run a 10k");
    const task = await newTask(user.id, {
      title: "Stretch",
      goalId: goal.id,
      plannedDate: TODAY,
      dueDate: TODAY,
    });
    await signInAs(user.id);

    const result = await actions.scheduleTask({
      id: task.id,
      plannedDate: "",
      dueDate: "",
      dueTime: "",
      dueTz: "",
      goalId: null,
      milestoneId: null,
    });

    expect(result.ok && result.data).toMatchObject({
      plannedDate: null,
      dueDate: null,
      dueAt: null,
      goalId: null,
    });
  });

  it("changes nothing when the parent is another user's", async () => {
    const owner = await createTestUser();
    const user = await createTestUser();
    const goal = await newGoal(owner.id, "Theirs");
    const task = await newTask(user.id, { title: "Mine" });
    await signInAs(user.id);

    const result = await actions.scheduleTask({
      id: task.id,
      plannedDate: TODAY,
      dueDate: TODAY,
      goalId: goal.id,
    });

    expect(!result.ok && result.error).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { goalId: ["Choose one of your goals."] },
    });
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(row).toMatchObject({ plannedDate: null, dueDate: null });
    expect(await eventTypes(user.id, task.id)).toEqual(["task.created"]);
  });

  it("refuses another user's task and an anonymous caller", async () => {
    const owner = await createTestUser();
    const task = await newTask(owner.id, { title: "Theirs" });

    const anonymous = await actions.scheduleTask({
      id: task.id,
      plannedDate: TODAY,
    });
    expect(!anonymous.ok && anonymous.error.code).toBe("UNAUTHENTICATED");

    await signInAs((await createTestUser()).id);
    const foreign = await actions.scheduleTask({
      id: task.id,
      plannedDate: TODAY,
    });
    expect(!foreign.ok && foreign.error.code).toBe("NOT_FOUND");
    expect(await eventTypes(owner.id, task.id)).toEqual(["task.created"]);
  });

  it("returns field errors for a time without a date", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, { title: "Call" });
    await signInAs(user.id);

    const result = await actions.scheduleTask({
      id: task.id,
      dueTime: "09:00",
      dueTz: "UTC",
    });

    expect(!result.ok && result.error).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { dueDate: ["Pick a date for this time."] },
    });
  });
});

describe("updateTask action", () => {
  it("saves title, notes, priority and estimate from form strings", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, { title: "Draft" });
    await signInAs(user.id);

    const result = await actions.updateTask({
      id: task.id,
      title: "  Write the report ",
      notes: "Section 2 first",
      priority: "high",
      estimatedMinutes: "90",
    });

    expect(result.ok && result.data).toMatchObject({
      title: "Write the report",
      notes: "Section 2 first",
      priority: "high",
      estimatedMinutes: 90,
    });

    const cleared = await actions.updateTask({
      id: task.id,
      title: "Write the report",
      notes: "",
      priority: null,
      estimatedMinutes: "",
    });
    expect(cleared.ok && cleared.data).toMatchObject({
      notes: null,
      priority: null,
      estimatedMinutes: null,
    });
  });

  it("refuses an estimate outside 1 to 1440 minutes", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, { title: "Draft" });
    await signInAs(user.id);

    for (const estimatedMinutes of ["0", "1441", "1.5"]) {
      const result = await actions.updateTask({
        id: task.id,
        title: "Draft",
        estimatedMinutes,
      });
      expect(!result.ok && result.error).toMatchObject({
        code: "VALIDATION",
        fieldErrors: {
          estimatedMinutes: ["Enter whole minutes from 1 to 1440."],
        },
      });
    }
  });

  it("refuses another user's task", async () => {
    const owner = await createTestUser();
    const task = await newTask(owner.id, { title: "Theirs" });
    await signInAs((await createTestUser()).id);

    const result = await actions.updateTask({ id: task.id, title: "Mine" });

    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(row?.title).toBe("Theirs");
  });
});

describe("changeTaskStatus action", () => {
  it("completes, cancels and reopens the user's task", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, { title: "Call" });
    await signInAs(user.id);

    const completed = await actions.changeTaskStatus({
      id: task.id,
      status: "completed",
    });
    expect(completed.ok && completed.data.status).toBe("completed");
    const cancelled = await actions.changeTaskStatus({
      id: task.id,
      status: "cancelled",
    });
    expect(cancelled.ok && cancelled.data).toMatchObject({
      status: "cancelled",
      completedAt: null,
    });
    const reopened = await actions.changeTaskStatus({
      id: task.id,
      status: "open",
    });
    expect(reopened.ok && reopened.data.status).toBe("open");
  });

  it("refuses another user's task", async () => {
    const owner = await createTestUser();
    const task = await newTask(owner.id, { title: "Theirs" });
    await signInAs((await createTestUser()).id);

    const result = await actions.changeTaskStatus({
      id: task.id,
      status: "completed",
    });

    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });
});
