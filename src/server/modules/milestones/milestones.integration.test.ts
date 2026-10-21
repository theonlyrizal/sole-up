import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { auditEvents, goals, milestones, users } from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import { createGoal, deleteGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { getMilestoneProgress } from "./queries";
import {
  changeMilestoneStatus,
  createMilestone,
  deleteMilestone,
  reorderMilestones,
  updateMilestone,
} from "./service";
import { createMilestoneSchema, type CreateMilestoneInput } from "./validation";

const newGoal = (userId: string, title = "Run a 10k") =>
  createGoal(userId, createGoalSchema.parse({ title }));

const milestone = (
  fields: Partial<CreateMilestoneInput> & { goalId: string; title: string },
) => createMilestoneSchema.parse(fields);

/** Creates milestones titled `titles` under `goalId`, in that order. */
async function seed(userId: string, goalId: string, titles: string[]) {
  const created = [];
  for (const title of titles) {
    created.push(await createMilestone(userId, milestone({ goalId, title })));
  }
  return created;
}

async function readMilestone(id: string) {
  const [row] = await db.select().from(milestones).where(eq(milestones.id, id));
  return row;
}

/** The goal's milestones as [title, sortOrder] in list order. */
async function order(goalId: string) {
  const rows = await db
    .select({ title: milestones.title, sortOrder: milestones.sortOrder })
    .from(milestones)
    .where(eq(milestones.goalId, goalId))
    .orderBy(asc(milestones.sortOrder));
  return rows.map((row) => [row.title, row.sortOrder]);
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

describe("schema", () => {
  it("rejects a milestone on another user's goal (composite foreign key)", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const alicesGoal = await newGoal(alice.id);

    const error = await db
      .insert(milestones)
      .values({
        userId: bob.id,
        goalId: alicesGoal.id,
        title: "Sneaky",
        sortOrder: 0,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(
      (error as Error & { cause?: { code?: string; constraint?: string } })
        .cause,
    ).toMatchObject({
      code: "23503",
      constraint: "milestones_goal_id_user_id_fk",
    });
    expect(await db.select().from(milestones)).toHaveLength(0);
  });

  it("checks status, completed_at, sort order and title", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const base = {
      userId: user.id,
      goalId: goal.id,
      title: "Ok",
      sortOrder: 0,
    };

    await expect(
      db.insert(milestones).values({ ...base, status: "done" as never }),
    ).rejects.toThrow();
    await expect(
      db.insert(milestones).values({ ...base, status: "completed" }),
    ).rejects.toThrow();
    await expect(
      db.insert(milestones).values({ ...base, completedAt: new Date() }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(milestones)
        .values({ ...base, status: "dropped", completedAt: new Date() }),
    ).rejects.toThrow();
    await expect(
      db.insert(milestones).values({ ...base, sortOrder: -1 }),
    ).rejects.toThrow();
    await expect(
      db.insert(milestones).values({ ...base, title: "" }),
    ).rejects.toThrow();

    await db
      .insert(milestones)
      .values([
        base,
        { ...base, status: "completed", completedAt: new Date() },
        { ...base, status: "dropped" },
      ]);
  });

  it("deletes a goal's milestones with the goal, and their audit events", async () => {
    const user = await createTestUser();
    const doomed = await newGoal(user.id, "Doomed");
    const kept = await newGoal(user.id, "Kept");
    const [first, second] = await seed(user.id, doomed.id, ["One", "Two"]);
    await changeMilestoneStatus(user.id, {
      id: first!.id,
      status: "completed",
    });
    const [survivor] = await seed(user.id, kept.id, ["Stays"]);

    await deleteGoal(user.id, { id: doomed.id });

    expect(
      await db
        .select()
        .from(milestones)
        .where(eq(milestones.goalId, doomed.id)),
    ).toHaveLength(0);
    expect(await eventsFor(user.id, first!.id)).toHaveLength(0);
    expect(await eventsFor(user.id, second!.id)).toHaveLength(0);
    expect(await readMilestone(survivor!.id)).toBeDefined();
    expect(await eventsFor(user.id, survivor!.id)).toHaveLength(1);
  });

  it("is deleted with the account", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    await seed(user.id, goal.id, ["One"]);

    await db.delete(users).where(eq(users.id, user.id));

    expect(await db.select().from(milestones)).toHaveLength(0);
  });
});

describe("create", () => {
  it("appends to the goal's list and records structured fields only", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const other = await newGoal(user.id, "Other");
    await seed(user.id, other.id, ["Elsewhere"]);

    const [one] = await seed(user.id, goal.id, ["One"]);
    const two = await createMilestone(
      user.id,
      milestone({
        goalId: goal.id,
        title: "Secret title",
        description: "Secret description",
        dueDate: "2026-12-01",
      }),
    );

    expect(one).toMatchObject({
      sortOrder: 0,
      status: "open",
      completedAt: null,
    });
    expect(two).toMatchObject({
      goalId: goal.id,
      sortOrder: 1,
      dueDate: "2026-12-01",
      description: "Secret description",
    });

    const [event] = await eventsFor(user.id, two.id);
    expect(event).toMatchObject({
      eventType: "milestone.created",
      entityType: "milestone",
      changes: {
        goalId: { from: null, to: goal.id },
        status: { from: null, to: "open" },
        sortOrder: { from: null, to: 1 },
        dueDate: { from: null, to: "2026-12-01" },
      },
    });
    expect(JSON.stringify(event!.changes)).not.toMatch(/Secret/);
  });

  it("accepts a due date outside the goal's dates", async () => {
    const user = await createTestUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({
        title: "Bounded",
        startDate: "2026-11-01",
        targetDate: "2026-11-30",
      }),
    );

    const created = await createMilestone(
      user.id,
      milestone({ goalId: goal.id, title: "Late", dueDate: "2027-03-01" }),
    );
    expect(created.dueDate).toBe("2027-03-01");
  });

  it("is NotFound for another user's goal or a missing one", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const alicesGoal = await newGoal(alice.id);

    for (const goalId of [alicesGoal.id, crypto.randomUUID()]) {
      await expect(
        createMilestone(bob.id, milestone({ goalId, title: "Sneaky" })),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(await db.select().from(milestones)).toHaveLength(0);
    expect(await eventsFor(bob.id)).toHaveLength(0);
  });
});

describe("update", () => {
  it("records changed field names and the due date, never text", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const [created] = await seed(user.id, goal.id, ["One"]);

    const updated = await updateMilestone(user.id, {
      id: created!.id,
      title: "Renamed secret",
      description: null,
      dueDate: "2026-12-24",
    });

    expect(updated).toMatchObject({
      title: "Renamed secret",
      dueDate: "2026-12-24",
    });
    const events = await eventsFor(user.id, created!.id);
    expect(events.at(-1)).toMatchObject({
      eventType: "milestone.updated",
      changes: {
        fields: ["title", "dueDate"],
        dueDate: { from: null, to: "2026-12-24" },
      },
    });
    expect(JSON.stringify(events.at(-1)!.changes)).not.toMatch(/secret/);
  });

  it("writes nothing when no field changed", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const [created] = await seed(user.id, goal.id, ["One"]);

    await updateMilestone(user.id, {
      id: created!.id,
      title: "One",
      description: null,
      dueDate: null,
    });
    expect(await eventsFor(user.id, created!.id)).toHaveLength(1);
  });
});

describe("reorder", () => {
  it("numbers the goal's milestones 0..n-1 in the given order", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const [a, b, c, d] = await seed(user.id, goal.id, ["A", "B", "C", "D"]);
    await changeMilestoneStatus(user.id, { id: b!.id, status: "dropped" });

    await reorderMilestones(user.id, {
      goalId: goal.id,
      ids: [d!.id, a!.id, b!.id, c!.id],
    });

    expect(await order(goal.id)).toEqual([
      ["D", 0],
      ["A", 1],
      ["B", 2],
      ["C", 3],
    ]);
    const moved = (await eventsFor(user.id)).filter(
      (event) => event.eventType === "milestone.reordered",
    );
    // One transaction, so one occurred_at: compare in target order.
    const byTarget = moved
      .map((event) => [event.entityId, event.changes] as const)
      .sort(
        ([, x], [, y]) =>
          (x as { sortOrder: { to: number } }).sortOrder.to -
          (y as { sortOrder: { to: number } }).sortOrder.to,
      );
    expect(byTarget).toEqual([
      [d!.id, { sortOrder: { from: 3, to: 0 } }],
      [a!.id, { sortOrder: { from: 0, to: 1 } }],
      [b!.id, { sortOrder: { from: 1, to: 2 } }],
      [c!.id, { sortOrder: { from: 2, to: 3 } }],
    ]);
  });

  it("refuses a stale, partial or foreign list and moves nothing", async () => {
    const alice = await createTestUser();
    const goal = await newGoal(alice.id);
    const other = await newGoal(alice.id, "Other");
    const [a, b] = await seed(alice.id, goal.id, ["A", "B"]);
    const [elsewhere] = await seed(alice.id, other.id, ["Elsewhere"]);

    for (const ids of [
      [b!.id],
      [b!.id, a!.id, elsewhere!.id],
      [b!.id, elsewhere!.id],
      [b!.id, crypto.randomUUID()],
    ]) {
      await expect(
        reorderMilestones(alice.id, { goalId: goal.id, ids }),
      ).rejects.toBeInstanceOf(ConflictError);
    }
    expect(await order(goal.id)).toEqual([
      ["A", 0],
      ["B", 1],
    ]);
  });

  it("is NotFound for another user's goal", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const goal = await newGoal(alice.id);
    const [a, b] = await seed(alice.id, goal.id, ["A", "B"]);

    await expect(
      reorderMilestones(bob.id, { goalId: goal.id, ids: [b!.id, a!.id] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await order(goal.id)).toEqual([
      ["A", 0],
      ["B", 1],
    ]);
  });
});

describe("status", () => {
  it("completes, reopens, drops and undrops, keeping completed_at in step", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const [created] = await seed(user.id, goal.id, ["One"]);
    const id = created!.id;

    const completed = await changeMilestoneStatus(user.id, {
      id,
      status: "completed",
    });
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeInstanceOf(Date);
    const [completedEvent] = (await eventsFor(user.id, id)).slice(-1);
    expect(completed.completedAt).toEqual(completedEvent!.occurredAt);

    const reopened = await changeMilestoneStatus(user.id, {
      id,
      status: "open",
    });
    expect(reopened).toMatchObject({ status: "open", completedAt: null });

    await changeMilestoneStatus(user.id, { id, status: "completed" });
    const dropped = await changeMilestoneStatus(user.id, {
      id,
      status: "dropped",
    });
    expect(dropped).toMatchObject({ status: "dropped", completedAt: null });

    const undropped = await changeMilestoneStatus(user.id, {
      id,
      status: "open",
    });
    expect(undropped).toMatchObject({ status: "open", completedAt: null });

    const statusEvents = (await eventsFor(user.id, id))
      .filter((event) => event.eventType === "milestone.status_changed")
      .map((event) => event.changes);
    expect(statusEvents).toEqual([
      { status: { from: "open", to: "completed" } },
      { status: { from: "completed", to: "open" } },
      { status: { from: "open", to: "completed" } },
      { status: { from: "completed", to: "dropped" } },
      { status: { from: "dropped", to: "open" } },
    ]);
  });

  it("treats the same status again as a no-op with no event", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const [created] = await seed(user.id, goal.id, ["One"]);

    await changeMilestoneStatus(user.id, { id: created!.id, status: "open" });
    expect(await eventsFor(user.id, created!.id)).toHaveLength(1);
  });

  it("leaves the goal's status unchanged when the last milestone completes", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const [a, b] = await seed(user.id, goal.id, ["A", "B"]);
    const goalEventsBefore = await eventsFor(user.id, goal.id);

    await changeMilestoneStatus(user.id, { id: a!.id, status: "completed" });
    await changeMilestoneStatus(user.id, { id: b!.id, status: "completed" });

    const [row] = await db.select().from(goals).where(eq(goals.id, goal.id));
    expect(row).toMatchObject({ status: "active", completedAt: null });
    expect(await eventsFor(user.id, goal.id)).toEqual(goalEventsBefore);
  });
});

describe("delete", () => {
  it("removes the milestone and its events and keeps the order dense", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const [a, b, c] = await seed(user.id, goal.id, ["A", "B", "C"]);
    await changeMilestoneStatus(user.id, { id: b!.id, status: "completed" });

    await deleteMilestone(user.id, { id: a!.id });

    expect(await readMilestone(a!.id)).toBeUndefined();
    expect(await eventsFor(user.id, a!.id)).toHaveLength(0);
    expect(await order(goal.id)).toEqual([
      ["B", 0],
      ["C", 1],
    ]);
    expect((await eventsFor(user.id, c!.id)).at(-1)).toMatchObject({
      eventType: "milestone.reordered",
      changes: { sortOrder: { from: 2, to: 1 } },
    });

    const [next] = await seed(user.id, goal.id, ["D"]);
    expect(next!.sortOrder).toBe(2);
  });

  it("is NotFound for a missing milestone", async () => {
    const user = await createTestUser();
    await expect(
      deleteMilestone(user.id, { id: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("progress", () => {
  it("counts completed out of non-dropped milestones per goal", async () => {
    const user = await createTestUser();
    const mixed = await newGoal(user.id, "Mixed");
    const allDropped = await newGoal(user.id, "All dropped");
    const allDone = await newGoal(user.id, "All done");
    const empty = await newGoal(user.id, "Empty");

    const [m1, m2, m3, m4] = await seed(user.id, mixed.id, [
      "1",
      "2",
      "3",
      "4",
    ]);
    await changeMilestoneStatus(user.id, { id: m1!.id, status: "completed" });
    await changeMilestoneStatus(user.id, { id: m2!.id, status: "dropped" });
    await changeMilestoneStatus(user.id, { id: m3!.id, status: "completed" });
    void m4;

    const [d1] = await seed(user.id, allDropped.id, ["1"]);
    await changeMilestoneStatus(user.id, { id: d1!.id, status: "dropped" });

    const [c1] = await seed(user.id, allDone.id, ["1"]);
    await changeMilestoneStatus(user.id, { id: c1!.id, status: "completed" });

    const progress = await getMilestoneProgress(user.id, [
      mixed.id,
      allDropped.id,
      allDone.id,
      empty.id,
    ]);

    expect(progress.get(mixed.id)).toEqual({ completed: 2, countable: 3 });
    expect(progress.get(allDropped.id)).toEqual({ completed: 0, countable: 0 });
    expect(progress.get(allDone.id)).toEqual({ completed: 1, countable: 1 });
    expect(progress.has(empty.id)).toBe(false);
  });

  it("ignores another user's goals", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const goal = await newGoal(alice.id);
    await seed(alice.id, goal.id, ["A"]);

    expect((await getMilestoneProgress(bob.id, [goal.id])).size).toBe(0);
    expect(await getMilestoneProgress(alice.id, [])).toEqual(new Map());
  });
});

describe("cross-user access", () => {
  it("lets user B neither edit, change the status of, nor delete A's milestone", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const goal = await newGoal(alice.id);
    const [created] = await seed(alice.id, goal.id, ["Alice's"]);
    const before = await readMilestone(created!.id);

    await expect(
      updateMilestone(bob.id, {
        id: created!.id,
        title: "Bob's now",
        description: null,
        dueDate: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      changeMilestoneStatus(bob.id, { id: created!.id, status: "completed" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      deleteMilestone(bob.id, { id: created!.id }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await readMilestone(created!.id)).toEqual(before);
    expect(await eventsFor(alice.id, created!.id)).toHaveLength(1);
    expect(await eventsFor(bob.id)).toHaveLength(0);
  });

  it("gives the same error for another user's milestone and a missing one", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const goal = await newGoal(alice.id);
    const [created] = await seed(alice.id, goal.id, ["Alice's"]);

    const foreign = await deleteMilestone(bob.id, { id: created!.id }).catch(
      (e: unknown) => e,
    );
    const missing = await deleteMilestone(bob.id, {
      id: crypto.randomUUID(),
    }).catch((e: unknown) => e);

    expect(foreign).toBeInstanceOf(NotFoundError);
    expect((foreign as Error).message).toBe((missing as Error).message);
  });
});
