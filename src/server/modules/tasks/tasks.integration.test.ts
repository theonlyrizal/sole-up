import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { localDateTimeOf } from "@/lib/dates";
import { TASK_STATUSES, type TaskStatus } from "@/lib/tasks";
import { db } from "@/server/db/client";
import { auditEvents, tasks } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import { createMilestone } from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { goalOf, listInboxTasks } from "./queries";
import {
  changeTaskStatus,
  createTask,
  deleteTask,
  moveTask,
  planTask,
  rescheduleTaskDue,
  updateTask,
} from "./service";
import {
  createTaskSchema,
  moveTaskSchema,
  rescheduleTaskDueSchema,
  updateTaskSchema,
} from "./validation";

const newTask = (userId: string, fields: Record<string, unknown> = {}) =>
  createTask(
    userId,
    createTaskSchema.parse({ title: "Book the dentist", ...fields }),
  );

const newGoal = (userId: string) =>
  createGoal(userId, createGoalSchema.parse({ title: "Run a 10k" }));

const newMilestone = (userId: string, goalId: string) =>
  createMilestone(userId, createMilestoneSchema.parse({ goalId, title: "5k" }));

const reschedule = (userId: string, fields: Record<string, unknown>) =>
  rescheduleTaskDue(userId, rescheduleTaskDueSchema.parse(fields));

const move = (userId: string, fields: Record<string, unknown>) =>
  moveTask(userId, moveTaskSchema.parse(fields));

async function readTask(id: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  return row;
}

async function eventsFor(userId: string, entityId?: string) {
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        entityId ? eq(auditEvents.entityId, entityId) : undefined,
      ),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
}

describe("createTask", () => {
  it("creates an open inbox task from a title alone, appended after the others", async () => {
    const user = await createTestUser();
    const first = await newTask(user.id);
    const second = await newTask(user.id, { title: "Call Sam" });

    expect(first).toMatchObject({
      status: "open",
      goalId: null,
      milestoneId: null,
      plannedDate: null,
      completedAt: null,
      cancelledAt: null,
      sortOrder: 0,
    });
    expect(second.sortOrder).toBe(1);

    const [event] = await eventsFor(user.id, first.id);
    expect(event).toMatchObject({
      eventType: "task.created",
      entityType: "task",
      changes: {
        status: { from: null, to: "open" },
        goalId: { from: null, to: null },
        milestoneId: { from: null, to: null },
        priority: { from: null, to: null },
        estimatedMinutes: { from: null, to: null },
        plannedDate: { from: null, to: null },
        dueDate: { from: null, to: null },
        dueAt: { from: null, to: null },
        dueTz: { from: null, to: null },
      },
    });
  });

  it("stores every field and never puts title or notes in the event", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const task = await newTask(user.id, {
      title: "Secret title",
      notes: "Private notes",
      priority: "high",
      estimatedMinutes: 30,
      plannedDate: "2027-03-10",
      goalId: goal.id,
      dueDate: "2027-03-12",
    });
    expect(task).toMatchObject({
      notes: "Private notes",
      priority: "high",
      estimatedMinutes: 30,
      plannedDate: "2027-03-10",
      goalId: goal.id,
      dueDate: "2027-03-12",
      dueAt: null,
      dueTz: null,
    });

    const events = await eventsFor(user.id, task.id);
    const stored = JSON.stringify(events);
    expect(stored).not.toContain("Secret title");
    expect(stored).not.toContain("Private notes");
  });

  it("rejects another user's goal or milestone as a field error and creates nothing", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const goal = await newGoal(alice.id);
    const milestone = await newMilestone(alice.id, goal.id);

    await expect(newTask(bob.id, { goalId: goal.id })).rejects.toMatchObject({
      fieldErrors: { goalId: ["Choose one of your goals."] },
    });
    await expect(
      newTask(bob.id, { milestoneId: milestone.id }),
    ).rejects.toMatchObject({
      fieldErrors: { milestoneId: ["Choose one of your milestones."] },
    });
    expect(
      await db.select().from(tasks).where(eq(tasks.userId, bob.id)),
    ).toEqual([]);
    expect(await eventsFor(bob.id)).toEqual([]);
  });
});

describe("timed deadlines", () => {
  it("round-trips a wall-clock deadline through UTC in its own zone", async () => {
    const user = await createTestUser();
    // 12 March 2027 is before US daylight saving starts (14 March): UTC-5.
    const task = await newTask(user.id, {
      dueDate: "2027-03-12",
      dueTime: "09:00",
      dueTz: "America/New_York",
    });

    expect(task.dueDate).toBeNull();
    expect(task.dueTz).toBe("America/New_York");
    expect(task.dueAt?.toISOString()).toBe("2027-03-12T14:00:00.000Z");

    const row = await readTask(task.id);
    expect(row?.dueAt?.toISOString()).toBe("2027-03-12T14:00:00.000Z");
    expect(localDateTimeOf(row!.dueAt!, row!.dueTz!)).toEqual({
      date: "2027-03-12",
      time: "09:00",
    });
    // The same instant seen from elsewhere is a different wall-clock time,
    // and from Tokyo it is already the next local date.
    expect(localDateTimeOf(row!.dueAt!, "Europe/London")).toEqual({
      date: "2027-03-12",
      time: "14:00",
    });
    expect(localDateTimeOf(row!.dueAt!, "Asia/Tokyo")).toEqual({
      date: "2027-03-12",
      time: "23:00",
    });

    const [event] = await eventsFor(user.id, task.id);
    expect(event?.changes).toMatchObject({
      dueAt: { from: null, to: "2027-03-12T14:00:00.000Z" },
      dueTz: { from: null, to: "America/New_York" },
    });
  });

  it("uses the zone's offset on the deadline's date, across daylight saving", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    // 1 July 2027 in New York is daylight time: UTC-4.
    const summer = await reschedule(user.id, {
      id: task.id,
      dueDate: "2027-07-01",
      dueTime: "09:00",
      dueTz: "America/New_York",
    });
    expect(summer.dueAt?.toISOString()).toBe("2027-07-01T13:00:00.000Z");
    expect(localDateTimeOf(summer.dueAt!, summer.dueTz!)).toEqual({
      date: "2027-07-01",
      time: "09:00",
    });
  });

  it("records old and new deadlines when switching between all-day, timed and none", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, { dueDate: "2027-03-12" });

    const timed = await reschedule(user.id, {
      id: task.id,
      dueDate: "2027-03-13",
      dueTime: "18:30",
      dueTz: "Asia/Tokyo",
    });
    expect(timed).toMatchObject({ dueDate: null, dueTz: "Asia/Tokyo" });
    expect(timed.dueAt?.toISOString()).toBe("2027-03-13T09:30:00.000Z");

    const cleared = await reschedule(user.id, { id: task.id });
    expect(cleared).toMatchObject({ dueDate: null, dueAt: null, dueTz: null });

    const events = (await eventsFor(user.id, task.id)).filter(
      (event) => event.eventType === "task.due_changed",
    );
    expect(events.map((event) => event.changes)).toEqual([
      {
        dueDate: { from: "2027-03-12", to: null },
        dueAt: { from: null, to: "2027-03-13T09:30:00.000Z" },
        dueTz: { from: null, to: "Asia/Tokyo" },
      },
      {
        dueDate: { from: null, to: null },
        dueAt: { from: "2027-03-13T09:30:00.000Z", to: null },
        dueTz: { from: "Asia/Tokyo", to: null },
      },
    ]);
  });

  it("treats the same deadline again as a no-op with no event", async () => {
    const user = await createTestUser();
    const due = {
      dueDate: "2027-03-12",
      dueTime: "09:00",
      dueTz: "Europe/Berlin",
    };
    const task = await newTask(user.id, due);
    await reschedule(user.id, { id: task.id, ...due });
    const dated = await newTask(user.id, { dueDate: "2027-04-01" });
    await reschedule(user.id, { id: dated.id, dueDate: "2027-04-01" });

    const types = (await eventsFor(user.id)).map((event) => event.eventType);
    expect(types).toEqual(["task.created", "task.created"]);
  });
});

describe("changeTaskStatus", () => {
  const EVENT: Record<TaskStatus, string> = {
    open: "task.reopened",
    completed: "task.completed",
    cancelled: "task.cancelled",
  };

  async function taskIn(userId: string, status: TaskStatus, goalId: string) {
    const task = await newTask(userId, { goalId });
    if (status !== "open")
      await changeTaskStatus(userId, { id: task.id, status });
    return task;
  }

  for (const from of TASK_STATUSES) {
    for (const to of TASK_STATUSES) {
      const name =
        from === to ? `${from} → ${to} is a no-op` : `${from} → ${to}`;
      it(name, async () => {
        const user = await createTestUser();
        const goal = await newGoal(user.id);
        const task = await taskIn(user.id, from, goal.id);
        const before = await readTask(task.id);
        const eventsBefore = await eventsFor(user.id, task.id);

        const result = await changeTaskStatus(user.id, {
          id: task.id,
          status: to,
        });
        const after = await readTask(task.id);
        const newEvents = (await eventsFor(user.id, task.id)).slice(
          eventsBefore.length,
        );

        expect(result.status).toBe(to);
        expect(after?.goalId).toBe(goal.id);
        if (from === to) {
          expect(after).toEqual(before);
          expect(newEvents).toEqual([]);
          return;
        }
        expect(after?.completedAt !== null).toBe(to === "completed");
        expect(after?.cancelledAt !== null).toBe(to === "cancelled");
        expect(newEvents).toHaveLength(1);
        expect(newEvents[0]).toMatchObject({
          eventType: EVENT[to],
          changes: { status: { from, to } },
        });
        // now() in the update is the transaction start, as is occurred_at.
        const stamp =
          to === "completed" ? after?.completedAt : after?.cancelledAt;
        if (stamp) expect(stamp).toEqual(newEvents[0]?.occurredAt);
      });
    }
  }

  it("reopening clears completed_at, and completing never moves the task", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const milestone = await newMilestone(user.id, goal.id);
    const task = await newTask(user.id, { milestoneId: milestone.id });

    const done = await changeTaskStatus(user.id, {
      id: task.id,
      status: "completed",
    });
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.milestoneId).toBe(milestone.id);

    const reopened = await changeTaskStatus(user.id, {
      id: task.id,
      status: "open",
    });
    expect(reopened).toMatchObject({
      status: "open",
      completedAt: null,
      cancelledAt: null,
      milestoneId: milestone.id,
    });
    expect((await readTask(task.id))?.completedAt).toBeNull();
  });
});

describe("updateTask", () => {
  it("records changed field names with old and new priority and estimate only", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, { notes: "Old notes" });
    const updated = await updateTask(
      user.id,
      updateTaskSchema.parse({
        id: task.id,
        title: "New secret title",
        notes: "New private notes",
        priority: "medium",
        estimatedMinutes: "90",
      }),
    );
    expect(updated).toMatchObject({
      title: "New secret title",
      notes: "New private notes",
      priority: "medium",
      estimatedMinutes: 90,
    });

    const events = await eventsFor(user.id, task.id);
    expect(events[1]).toMatchObject({
      eventType: "task.updated",
      changes: {
        fields: ["title", "notes", "priority", "estimatedMinutes"],
        priority: { from: null, to: "medium" },
        estimatedMinutes: { from: null, to: 90 },
      },
    });
    const stored = JSON.stringify(events);
    expect(stored).not.toContain("secret");
    expect(stored).not.toContain("private");
  });

  it("omits priority and estimate when only text changed, and an unchanged edit is a no-op", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id, { priority: "low" });
    await updateTask(
      user.id,
      updateTaskSchema.parse({
        id: task.id,
        title: "Renamed",
        priority: "low",
      }),
    );
    await updateTask(
      user.id,
      updateTaskSchema.parse({
        id: task.id,
        title: "Renamed",
        priority: "low",
      }),
    );
    const events = await eventsFor(user.id, task.id);
    expect(events.map((event) => event.changes)).toEqual([
      expect.anything(),
      { fields: ["title"] },
    ]);
  });
});

describe("planTask", () => {
  it("plans, replans into the past (backfill) and unplans, recording old and new dates", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);

    expect(
      (await planTask(user.id, { id: task.id, plannedDate: "2027-03-10" }))
        .plannedDate,
    ).toBe("2027-03-10");
    expect(
      (await planTask(user.id, { id: task.id, plannedDate: "2020-01-01" }))
        .plannedDate,
    ).toBe("2020-01-01");
    await planTask(user.id, { id: task.id, plannedDate: "2020-01-01" }); // no-op
    expect(
      (await planTask(user.id, { id: task.id, plannedDate: null })).plannedDate,
    ).toBeNull();

    const planned = (await eventsFor(user.id, task.id)).filter(
      (event) => event.eventType === "task.planned",
    );
    expect(planned.map((event) => event.changes)).toEqual([
      { plannedDate: { from: null, to: "2027-03-10" } },
      { plannedDate: { from: "2027-03-10", to: "2020-01-01" } },
      { plannedDate: { from: "2020-01-01", to: null } },
    ]);
  });

  it("plans a completed task too, for logging done work after the fact", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    await changeTaskStatus(user.id, { id: task.id, status: "completed" });
    const planned = await planTask(user.id, {
      id: task.id,
      plannedDate: "2026-10-01",
    });
    expect(planned).toMatchObject({
      status: "completed",
      plannedDate: "2026-10-01",
    });
  });
});

describe("moveTask", () => {
  it("moves between a goal, a milestone and no parent, recording each move", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const milestone = await newMilestone(user.id, goal.id);
    const task = await newTask(user.id);

    expect(await move(user.id, { id: task.id, goalId: goal.id })).toMatchObject(
      {
        goalId: goal.id,
        milestoneId: null,
      },
    );
    expect(
      await move(user.id, { id: task.id, milestoneId: milestone.id }),
    ).toMatchObject({ goalId: null, milestoneId: milestone.id });
    await move(user.id, { id: task.id, milestoneId: milestone.id }); // no-op
    expect(await move(user.id, { id: task.id })).toMatchObject({
      goalId: null,
      milestoneId: null,
    });

    const moved = (await eventsFor(user.id, task.id)).filter(
      (event) => event.eventType === "task.moved",
    );
    expect(moved.map((event) => event.changes)).toEqual([
      {
        goalId: { from: null, to: goal.id },
        milestoneId: { from: null, to: null },
      },
      {
        goalId: { from: goal.id, to: null },
        milestoneId: { from: null, to: milestone.id },
      },
      {
        goalId: { from: null, to: null },
        milestoneId: { from: milestone.id, to: null },
      },
    ]);
  });

  it("rejects moving to another user's goal or milestone and changes nothing", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const alicesGoal = await newGoal(alice.id);
    const alicesMilestone = await newMilestone(alice.id, alicesGoal.id);
    const bobsGoal = await newGoal(bob.id);
    const task = await newTask(bob.id, { goalId: bobsGoal.id });

    const toGoal = await move(bob.id, {
      id: task.id,
      goalId: alicesGoal.id,
    }).catch((e: unknown) => e);
    expect(toGoal).toBeInstanceOf(ValidationError);
    expect(toGoal).toMatchObject({
      fieldErrors: { goalId: ["Choose one of your goals."] },
    });
    await expect(
      move(bob.id, { id: task.id, milestoneId: alicesMilestone.id }),
    ).rejects.toMatchObject({
      fieldErrors: { milestoneId: ["Choose one of your milestones."] },
    });

    expect(await readTask(task.id)).toMatchObject({
      goalId: bobsGoal.id,
      milestoneId: null,
    });
    const types = (await eventsFor(bob.id, task.id)).map(
      (event) => event.eventType,
    );
    expect(types).toEqual(["task.created"]);
  });
});

describe("goalOf", () => {
  it("is the direct goal, the milestone's goal, or null", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const milestone = await newMilestone(user.id, goal.id);
    const direct = await newTask(user.id, { goalId: goal.id });
    const viaMilestone = await newTask(user.id, { milestoneId: milestone.id });
    const loose = await newTask(user.id);

    expect(await goalOf(user.id, direct.id)).toBe(goal.id);
    expect(await goalOf(user.id, viaMilestone.id)).toBe(goal.id);
    expect(await goalOf(user.id, loose.id)).toBeNull();
  });

  it("refuses another user's task as not found", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const task = await newTask(alice.id, {
      goalId: (await newGoal(alice.id)).id,
    });
    await expect(goalOf(bob.id, task.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listInboxTasks", () => {
  it("holds open, unplanned tasks with no parent, a due date alone included", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const goal = await newGoal(user.id);
    const milestone = await newMilestone(user.id, goal.id);

    const plain = await newTask(user.id, { title: "Plain" });
    const dueOnly = await newTask(user.id, {
      title: "Due only",
      dueDate: "2027-03-12",
    });
    const timedDue = await newTask(user.id, {
      title: "Timed due",
      dueDate: "2027-03-12",
      dueTime: "09:00",
      dueTz: "Europe/Berlin",
    });
    await newTask(user.id, { title: "Planned", plannedDate: "2027-03-10" });
    await newTask(user.id, { title: "Under goal", goalId: goal.id });
    await newTask(user.id, {
      title: "Under milestone",
      milestoneId: milestone.id,
    });
    const done = await newTask(user.id, { title: "Done" });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    const dropped = await newTask(user.id, { title: "Dropped" });
    await changeTaskStatus(user.id, { id: dropped.id, status: "cancelled" });
    await newTask(other.id, { title: "Someone else's" });

    const inbox = await listInboxTasks(user.id);
    expect(inbox.map((task) => task.id)).toEqual([
      plain.id,
      dueOnly.id,
      timedDue.id,
    ]);
  });

  it("returns a task when it is unplanned or moved out of its goal", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const planned = await newTask(user.id, { plannedDate: "2027-03-10" });
    const parented = await newTask(user.id, { goalId: goal.id });
    expect(await listInboxTasks(user.id)).toEqual([]);

    await planTask(user.id, { id: planned.id, plannedDate: null });
    await move(user.id, { id: parented.id });
    expect((await listInboxTasks(user.id)).map((task) => task.id)).toEqual([
      planned.id,
      parented.id,
    ]);
  });
});

describe("deleteTask", () => {
  it("removes the task and its events in one go, leaving other tasks' events", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const kept = await newTask(user.id);
    await planTask(user.id, { id: task.id, plannedDate: "2027-03-10" });
    await changeTaskStatus(user.id, { id: task.id, status: "completed" });

    await deleteTask(user.id, { id: task.id });

    expect(await readTask(task.id)).toBeUndefined();
    expect(await eventsFor(user.id, task.id)).toEqual([]);
    expect(await eventsFor(user.id, kept.id)).toHaveLength(1);
  });
});

describe("cross-user access", () => {
  it("treats another user's task as not found for every operation and changes nothing", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const task = await newTask(alice.id);
    const before = await readTask(task.id);
    const id = task.id;

    const attempts = [
      () => updateTask(bob.id, updateTaskSchema.parse({ id, title: "Hijack" })),
      () => changeTaskStatus(bob.id, { id, status: "completed" }),
      () => planTask(bob.id, { id, plannedDate: "2027-03-10" }),
      () => reschedule(bob.id, { id, dueDate: "2027-03-12" }),
      () => move(bob.id, { id }),
      () => deleteTask(bob.id, { id }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    }

    expect(await readTask(task.id)).toEqual(before);
    expect(await eventsFor(alice.id, task.id)).toHaveLength(1);
    expect(await eventsFor(bob.id)).toEqual([]);
  });
});
