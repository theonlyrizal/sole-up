import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { todayClock } from "@/lib/today";
import { db } from "@/server/db/client";
import { auditEvents, tasks, userPreferences } from "@/server/db/schema";
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
import {
  listTodaySuggestions,
  listTodayTasks,
  TODAY_SUGGESTIONS_PER_GOAL_MAX,
  type TodayTasks,
} from "./queries";
import { changeTaskStatus, createTask } from "./service";
import { createTaskSchema } from "./validation";

// The Today view (chunk 2.5): its four sections at the day's boundaries in
// a non-UTC zone, the "Add to today" suggestions, and the one-tap actions.

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

beforeEach(() => {
  requestHeaders.current = new Headers();
});

afterEach(() => {
  vi.useRealTimers();
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

// Tokyo is UTC+9 with no DST. At both instants below UTC's date is the
// 23rd, so a UTC or server-date bug shows at 00:01.
const TOKYO = "Asia/Tokyo";
const AT_2359 = new Date("2026-10-23T14:59:00Z"); // Fri 23 Oct, 23:59 Tokyo
const AT_0001 = new Date("2026-10-23T15:01:00Z"); // Sat 24 Oct, 00:01 Tokyo

const newTask = (userId: string, fields: Record<string, unknown>) =>
  createTask(userId, createTaskSchema.parse(fields));

/** A timed deadline at a Tokyo wall-clock time. */
const dueInTokyo = (dueDate: string, dueTime: string) => ({
  dueDate,
  dueTime,
  dueTz: TOKYO,
});

async function sectionsAt(userId: string, now: Date) {
  return listTodayTasks(userId, todayClock(TOKYO, now), TOKYO);
}

function titlesBySection(sections: TodayTasks) {
  return {
    planned: sections.planned.map((task) => task.title),
    due: sections.due.map((task) => task.title),
    decide: sections.decide.map((task) => task.title),
    earlier: sections.earlier.map((task) => task.title),
  };
}

async function eventsFor(userId: string, entityId: string) {
  return db
    .select({ type: auditEvents.eventType, changes: auditEvents.changes })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.userId, userId), eq(auditEvents.entityId, entityId)),
    );
}

async function storedTask(id: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  return row!;
}

/** Fakes only the clock, so the database driver's timers keep working. */
function setClock(now: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
}

describe("listTodayTasks at the day's boundaries in Tokyo", () => {
  async function seed(userId: string) {
    await newTask(userId, { title: "Planned 23rd", plannedDate: "2026-10-23" });
    await newTask(userId, { title: "Planned 22nd", plannedDate: "2026-10-22" });
    await newTask(userId, { title: "Planned 24th", plannedDate: "2026-10-24" });
    await newTask(userId, { title: "Due 23rd", dueDate: "2026-10-23" });
    await newTask(userId, { title: "Due 24th", dueDate: "2026-10-24" });
    await newTask(userId, { title: "Due 22nd", dueDate: "2026-10-22" });
    await newTask(userId, {
      title: "Due 23rd 23:30",
      ...dueInTokyo("2026-10-23", "23:30"),
    });
    await newTask(userId, {
      title: "Due 24th 00:00",
      ...dueInTokyo("2026-10-24", "00:00"),
    });
    await newTask(userId, { title: "No dates" });
  }

  it("at 23:59 shows the 23rd's plan and deadlines, and a passed time as a decision", async () => {
    const user = await createTestUser();
    await seed(user.id);

    expect(titlesBySection(await sectionsAt(user.id, AT_2359))).toEqual({
      planned: ["Planned 23rd"],
      due: ["Due 23rd"],
      decide: ["Due 22nd", "Due 23rd 23:30"],
      earlier: ["Planned 22nd"],
    });
  });

  it("at 00:01 has moved to the 24th, and a plan from yesterday sits under Earlier, not done, unchanged", async () => {
    const user = await createTestUser();
    await seed(user.id);
    const [yesterday] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, user.id), eq(tasks.title, "Planned 23rd")));
    const eventsBefore = await eventsFor(user.id, yesterday!.id);

    const sections = await sectionsAt(user.id, AT_0001);

    expect(titlesBySection(sections)).toEqual({
      planned: ["Planned 24th"],
      due: ["Due 24th"],
      // Midnight has just passed, so a deadline at 00:00 needs a decision.
      decide: ["Due 22nd", "Due 23rd", "Due 23rd 23:30", "Due 24th 00:00"],
      earlier: ["Planned 22nd", "Planned 23rd"],
    });
    const shown = sections.earlier.find((task) => task.id === yesterday!.id);
    expect(shown?.plannedDate).toBe("2026-10-23");
    // Nothing was written: same planned date, no new event.
    expect((await storedTask(yesterday!.id)).plannedDate).toBe("2026-10-23");
    expect(await eventsFor(user.id, yesterday!.id)).toEqual(eventsBefore);
  });

  it("puts a task that matches several sections in exactly one", async () => {
    const user = await createTestUser();
    await newTask(user.id, {
      title: "Planned today, deadline passed",
      plannedDate: "2026-10-23",
      dueDate: "2026-10-20",
    });
    await newTask(user.id, {
      title: "Planned earlier, due today",
      plannedDate: "2026-10-21",
      dueDate: "2026-10-23",
    });
    await newTask(user.id, {
      title: "Planned earlier, deadline passed",
      plannedDate: "2026-10-21",
      dueDate: "2026-10-22",
    });

    const sections = await sectionsAt(user.id, AT_2359);

    expect(titlesBySection(sections)).toEqual({
      planned: ["Planned today, deadline passed"],
      due: ["Planned earlier, due today"],
      decide: ["Planned earlier, deadline passed"],
      earlier: [],
    });
    const ids = Object.values(sections).flatMap((list) =>
      list.map((task) => task.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows open tasks only, with their goal and milestone, and none of another user's", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Run a 10k" }),
    );
    const milestone = await createMilestone(
      user.id,
      createMilestoneSchema.parse({ goalId: goal.id, title: "5k" }),
    );
    await newTask(user.id, {
      title: "Long run",
      plannedDate: "2026-10-23",
      milestoneId: milestone.id,
    });
    const done = await newTask(user.id, {
      title: "Done",
      plannedDate: "2026-10-23",
    });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    const cancelled = await newTask(user.id, {
      title: "Cancelled",
      dueDate: "2026-10-01",
    });
    await changeTaskStatus(user.id, { id: cancelled.id, status: "cancelled" });
    await newTask(other.id, { title: "Theirs", plannedDate: "2026-10-23" });

    const sections = await sectionsAt(user.id, AT_2359);

    expect(titlesBySection(sections)).toEqual({
      planned: ["Long run"],
      due: [],
      decide: [],
      earlier: [],
    });
    expect(sections.planned[0]).toMatchObject({
      goal: { id: goal.id, title: "Run a 10k" },
      milestone: { id: milestone.id, title: "5k" },
    });
  });
});

describe("listTodaySuggestions", () => {
  async function suggestionsAt(userId: string, now = AT_2359) {
    const result = await listTodaySuggestions(
      userId,
      todayClock(TOKYO, now),
      TOKYO,
    );
    return {
      dueSoon: result.dueSoon.map((task) => task.title),
      goals: result.goals.map((goal) => ({
        title: goal.title,
        tasks: goal.tasks.map((task) => task.title),
      })),
    };
  }

  it("suggests unplanned tasks due in the next 7 days, soonest first", async () => {
    const user = await createTestUser();
    await newTask(user.id, { title: "Due in 7 days", dueDate: "2026-10-30" });
    await newTask(user.id, { title: "Due tomorrow", dueDate: "2026-10-24" });
    await newTask(user.id, {
      title: "Due tomorrow 00:00",
      ...dueInTokyo("2026-10-24", "00:00"),
    });
    await newTask(user.id, { title: "Due in 8 days", dueDate: "2026-10-31" });
    await newTask(user.id, { title: "Due today", dueDate: "2026-10-23" });
    await newTask(user.id, { title: "Due before", dueDate: "2026-10-20" });
    await newTask(user.id, {
      title: "Due soon, planned",
      dueDate: "2026-10-25",
      plannedDate: "2026-10-26",
    });

    expect(await suggestionsAt(user.id)).toEqual({
      dueSoon: ["Due tomorrow", "Due tomorrow 00:00", "Due in 7 days"],
      goals: [],
    });
  });

  it("suggests the next actions of active goals, a few each, and each task once", async () => {
    const user = await createTestUser();
    const run = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Run a 10k" }),
    );
    const spanish = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Learn Spanish" }),
    );
    const paused = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Paused goal" }),
    );
    await changeGoalStatus(user.id, { id: paused.id, status: "paused" });
    const done = await createMilestone(
      user.id,
      createMilestoneSchema.parse({ goalId: run.id, title: "Done part" }),
    );
    await changeMilestoneStatus(user.id, { id: done.id, status: "completed" });
    const next = await createMilestone(
      user.id,
      createMilestoneSchema.parse({ goalId: run.id, title: "5k" }),
    );

    await newTask(user.id, { title: "Run 1", goalId: run.id });
    await newTask(user.id, { title: "Run 2", milestoneId: next.id });
    await newTask(user.id, {
      title: "Run due soon",
      goalId: run.id,
      dueDate: "2026-10-25",
    });
    await newTask(user.id, { title: "Run 3", goalId: run.id });
    await newTask(user.id, { title: "Run 4", goalId: run.id });
    await newTask(user.id, {
      title: "Under done milestone",
      milestoneId: done.id,
    });
    await newTask(user.id, {
      title: "Already planned",
      goalId: run.id,
      plannedDate: "2026-10-28",
    });
    await newTask(user.id, { title: "Hola", goalId: spanish.id });
    await newTask(user.id, { title: "Paused task", goalId: paused.id });
    await newTask(user.id, { title: "Inbox task" });

    expect(await suggestionsAt(user.id)).toEqual({
      dueSoon: ["Run due soon"],
      goals: [
        { title: "Run a 10k", tasks: ["Run 1", "Run 2", "Run 3"] },
        { title: "Learn Spanish", tasks: ["Hola"] },
      ],
    });
    expect(TODAY_SUGGESTIONS_PER_GOAL_MAX).toBe(3);
  });

  it("never suggests another user's tasks", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const theirGoal = await createGoal(
      other.id,
      createGoalSchema.parse({ title: "Theirs" }),
    );
    await newTask(other.id, { title: "Their task", goalId: theirGoal.id });
    await newTask(other.id, { title: "Their deadline", dueDate: "2026-10-24" });

    expect(await suggestionsAt(user.id)).toEqual({ dueSoon: [], goals: [] });
  });
});

describe("Today's actions", () => {
  it("plans for today and tomorrow from the user's zone at 00:01, not UTC's date", async () => {
    const user = await createTestUser();
    await setTimeZone(user.id, TOKYO);
    const task = await newTask(user.id, {
      title: "From yesterday",
      plannedDate: "2026-10-23",
    });
    await signInAs(user.id);
    setClock(AT_0001);

    const today = await actions.planTaskForDay({ id: task.id, day: "today" });
    expect(today.ok && today.data.plannedDate).toBe("2026-10-24");

    const tomorrow = await actions.planTaskForDay({
      id: task.id,
      day: "tomorrow",
    });
    expect(tomorrow.ok && tomorrow.data.plannedDate).toBe("2026-10-25");

    const events = await eventsFor(user.id, task.id);
    expect(
      events
        .filter((event) => event.type === "task.planned")
        .map((event) => event.changes),
    ).toEqual(
      expect.arrayContaining([
        { plannedDate: { from: "2026-10-23", to: "2026-10-24" } },
        { plannedDate: { from: "2026-10-24", to: "2026-10-25" } },
      ]),
    );
  });

  it("adds picked suggestions to the user's today at 23:59", async () => {
    const user = await createTestUser();
    await setTimeZone(user.id, TOKYO);
    const a = await newTask(user.id, { title: "A", dueDate: "2026-10-24" });
    await signInAs(user.id);
    setClock(AT_2359);

    const result = await actions.planTasksToday({ ids: [a.id] });

    expect(result.ok && result.data).toEqual({
      plannedDate: "2026-10-23",
      count: 1,
    });
    const sections = await sectionsAt(user.id, AT_2359);
    expect(sections.planned.map((task) => task.title)).toEqual(["A"]);
  });

  it("picks a date or unplans, back to the inbox when the task has no goal", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, {
      title: "Call the bank",
      plannedDate: "2026-10-22",
    });
    await signInAs(user.id);

    const picked = await actions.planTask({
      id: task.id,
      plannedDate: "2026-10-27",
    });
    expect(picked.ok && picked.data.plannedDate).toBe("2026-10-27");

    const unplanned = await actions.planTask({
      id: task.id,
      plannedDate: null,
    });
    expect(unplanned.ok && unplanned.data.plannedDate).toBeNull();
    expect(
      (await eventsFor(user.id, task.id)).filter(
        (event) => event.type === "task.planned",
      ),
    ).toHaveLength(2);
  });

  it("gives a timed deadline a new date and keeps its time and zone", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, {
      title: "Send the form",
      ...dueInTokyo("2026-10-22", "17:00"),
    });
    await signInAs(user.id);

    const result = await actions.rescheduleTaskDue({
      id: task.id,
      ...dueInTokyo("2026-10-26", "17:00"),
    });

    expect(result.ok && result.data).toMatchObject({
      dueDate: null,
      dueAt: new Date("2026-10-26T08:00:00Z"),
      dueTz: TOKYO,
    });
    const sections = await sectionsAt(user.id, AT_2359);
    expect(sections.decide).toEqual([]);
  });

  it("refuses another user's task, an anonymous caller and a bad day", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await setTimeZone(user.id, TOKYO);
    const theirs = await newTask(other.id, {
      title: "Theirs",
      plannedDate: "2026-10-20",
    });

    const anonymous = await actions.planTaskForDay({
      id: theirs.id,
      day: "today",
    });
    expect(!anonymous.ok && anonymous.error.code).toBe("UNAUTHENTICATED");

    await signInAs(user.id);
    for (const result of [
      await actions.planTaskForDay({ id: theirs.id, day: "today" }),
      await actions.planTask({ id: theirs.id, plannedDate: null }),
      await actions.rescheduleTaskDue({ id: theirs.id, dueDate: "2026-10-30" }),
    ]) {
      expect(!result.ok && result.error.code).toBe("NOT_FOUND");
    }
    expect((await storedTask(theirs.id)).plannedDate).toBe("2026-10-20");
    expect((await storedTask(theirs.id)).dueDate).toBeNull();

    const bad = await actions.planTaskForDay({
      id: theirs.id,
      // @ts-expect-error: only "today" and "tomorrow" are allowed
      day: "yesterday",
    });
    expect(
      !bad.ok && bad.error.code === "VALIDATION" && bad.error.fieldErrors,
    ).toEqual({ day: ["Choose today or tomorrow."] });
  });

  it("asks for a confirmed time zone before planning by day", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, { title: "No zone yet" });
    await signInAs(user.id);

    const result = await actions.planTaskForDay({ id: task.id, day: "today" });

    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect((await storedTask(task.id)).plannedDate).toBeNull();
  });
});
