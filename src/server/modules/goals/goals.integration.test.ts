import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { GOAL_STATUSES, type GoalStatus } from "@/lib/goals";
import { db } from "@/server/db/client";
import { auditEvents, goals, lifeAreas, users } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import {
  createLifeArea,
  deleteLifeArea,
} from "@/server/modules/life-areas/service";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  changeGoalStatus,
  createGoal,
  deleteGoal,
  updateGoal,
} from "./service";
import { createGoalSchema, type CreateGoalInput } from "./validation";

const goal = (fields: Partial<CreateGoalInput> & { title: string }) =>
  createGoalSchema.parse(fields);

const editable = (current: {
  id: string;
  title: string;
  description: string | null;
  reason: string | null;
  lifeAreaId: string | null;
  priority: CreateGoalInput["priority"];
  startDate: string | null;
  targetDate: string | null;
}) => ({
  id: current.id,
  title: current.title,
  description: current.description,
  reason: current.reason,
  lifeAreaId: current.lifeAreaId,
  priority: current.priority,
  startDate: current.startDate,
  targetDate: current.targetDate,
});

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
    .orderBy(auditEvents.occurredAt);
}

async function readGoal(id: string) {
  const [row] = await db.select().from(goals).where(eq(goals.id, id));
  return row;
}

const LONG_AGO = new Date("2020-01-01T00:00:00Z");

/** Inserts a goal already in `status`, with an old status_changed_at. */
async function goalIn(userId: string, status: GoalStatus, completedAt?: Date) {
  const [row] = await db
    .insert(goals)
    .values({
      userId,
      title: "Seeded",
      status,
      completedAt: completedAt ?? (status === "completed" ? LONG_AGO : null),
      statusChangedAt: LONG_AGO,
    })
    .returning();
  return row!;
}

describe("schema", () => {
  it("checks status, priority, date order and completed_at", async () => {
    const user = await createTestUser();
    const base = { userId: user.id, title: "Ok" };
    await expect(
      db.insert(goals).values({ ...base, status: "failed" as never }),
    ).rejects.toThrow();
    await expect(
      db.insert(goals).values({ ...base, priority: "urgent" as never }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(goals)
        .values({ ...base, startDate: "2026-11-02", targetDate: "2026-11-01" }),
    ).rejects.toThrow();
    await expect(
      db.insert(goals).values({ ...base, status: "completed" }),
    ).rejects.toThrow();
    await expect(
      db.insert(goals).values({ ...base, completedAt: new Date() }),
    ).rejects.toThrow();
    await expect(
      db.insert(goals).values({ ...base, title: "" }),
    ).rejects.toThrow();

    await db.insert(goals).values([
      { ...base, startDate: "2026-11-01", targetDate: "2026-11-01" },
      { ...base, status: "archived", completedAt: new Date() },
      { ...base, status: "archived" },
    ]);
  });

  it("refuses another user's life area (composite foreign key)", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const area = await createLifeArea(alice.id, {
      name: "Health",
      description: null,
      color: null,
    });

    await expect(
      db
        .insert(goals)
        .values({ userId: bob.id, title: "Sneaky", lifeAreaId: area.id }),
    ).rejects.toThrow();
  });

  it("clears only life_area_id when the area is deleted, keeping user_id", async () => {
    const user = await createTestUser();
    const area = await createLifeArea(user.id, {
      name: "Health",
      description: null,
      color: null,
    });
    const created = await createGoal(
      user.id,
      goal({ title: "Run a 10k", lifeAreaId: area.id }),
    );

    await deleteLifeArea(user.id, { id: area.id });

    const row = await readGoal(created.id);
    expect(row).toMatchObject({
      id: created.id,
      userId: user.id,
      lifeAreaId: null,
      title: "Run a 10k",
    });
    expect(
      await db.select().from(lifeAreas).where(eq(lifeAreas.id, area.id)),
    ).toHaveLength(0);
  });

  it("is deleted with the account", async () => {
    const user = await createTestUser();
    await createGoal(user.id, goal({ title: "Run a 10k" }));

    await db.delete(users).where(eq(users.id, user.id));

    expect(
      await db.select().from(goals).where(eq(goals.userId, user.id)),
    ).toHaveLength(0);
  });
});

describe("create", () => {
  it("starts active and records only structured fields", async () => {
    const user = await createTestUser();
    const area = await createLifeArea(user.id, {
      name: "Health",
      description: null,
      color: null,
    });

    const created = await createGoal(
      user.id,
      goal({
        title: "Secret title",
        description: "Secret description",
        reason: "Secret reason",
        lifeAreaId: area.id,
        priority: "high",
        startDate: "2026-11-01",
        targetDate: "2027-03-01",
      }),
    );

    expect(created).toMatchObject({
      status: "active",
      completedAt: null,
      lifeAreaId: area.id,
      priority: "high",
      startDate: "2026-11-01",
      targetDate: "2027-03-01",
    });
    const events = await eventsFor(user.id, created.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "goal.created",
      entityType: "goal",
      changes: {
        status: { from: null, to: "active" },
        lifeAreaId: { from: null, to: area.id },
        priority: { from: null, to: "high" },
        startDate: { from: null, to: "2026-11-01" },
        targetDate: { from: null, to: "2027-03-01" },
      },
    });
    expect(JSON.stringify(events)).not.toMatch(/Secret/);
  });

  it("turns another user's or a missing area into a field error", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const area = await createLifeArea(alice.id, {
      name: "Health",
      description: null,
      color: null,
    });

    for (const lifeAreaId of [area.id, crypto.randomUUID()]) {
      const error = await createGoal(
        bob.id,
        goal({ title: "Sneaky", lifeAreaId }),
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors).toEqual({
        lifeAreaId: ["Choose one of your areas."],
      });
    }
    expect(
      await db.select().from(goals).where(eq(goals.userId, bob.id)),
    ).toHaveLength(0);
    expect(await eventsFor(bob.id)).toHaveLength(0);
  });
});

describe("update", () => {
  it("records changed field names and structured values, never text", async () => {
    const user = await createTestUser();
    const area = await createLifeArea(user.id, {
      name: "Health",
      description: null,
      color: null,
    });
    const created = await createGoal(user.id, goal({ title: "Old title" }));

    const updated = await updateGoal(user.id, {
      ...editable(created),
      title: "Secret new title",
      reason: "Secret new reason",
      lifeAreaId: area.id,
      targetDate: "2027-01-01",
    });

    expect(updated).toMatchObject({
      title: "Secret new title",
      reason: "Secret new reason",
      lifeAreaId: area.id,
      targetDate: "2027-01-01",
      status: "active",
    });
    const events = await eventsFor(user.id, created.id);
    expect(events.map((e) => e.eventType)).toEqual([
      "goal.created",
      "goal.updated",
    ]);
    expect(events[1]!.changes).toEqual({
      fields: ["title", "reason", "lifeAreaId", "targetDate"],
      lifeAreaId: { from: null, to: area.id },
      targetDate: { from: null, to: "2027-01-01" },
    });
    expect(JSON.stringify(events)).not.toMatch(/Secret|Old title/);
  });

  it("writes nothing when no field changed", async () => {
    const user = await createTestUser();
    const created = await createGoal(user.id, goal({ title: "Same" }));

    await updateGoal(user.id, editable(created));

    expect(await eventsFor(user.id, created.id)).toHaveLength(1);
  });

  it("refuses another user's area", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const area = await createLifeArea(alice.id, {
      name: "Health",
      description: null,
      color: null,
    });
    const created = await createGoal(bob.id, goal({ title: "Mine" }));

    await expect(
      updateGoal(bob.id, { ...editable(created), lifeAreaId: area.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await readGoal(created.id))!.lifeAreaId).toBeNull();
  });
});

describe("changeStatus", () => {
  const LIVE: GoalStatus[] = ["active", "paused", "completed", "dropped"];
  const allowed = [
    ...LIVE.flatMap((from) =>
      [...LIVE, "archived" as const]
        .filter((to) => to !== from)
        .map((to) => [from, to] as const),
    ),
    ["archived", "active"] as const,
  ];

  it.each(allowed)("moves %s → %s and records it", async (from, to) => {
    const user = await createTestUser();
    const seeded = await goalIn(user.id, from);

    const changed = await changeGoalStatus(user.id, {
      id: seeded.id,
      status: to,
    });

    expect(changed.status).toBe(to);
    expect(changed.statusChangedAt.getTime()).toBeGreaterThan(
      LONG_AGO.getTime(),
    );
    const events = await eventsFor(user.id, seeded.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "goal.status_changed",
      changes: { status: { from, to } },
    });
    // status_changed_at and the event share the transaction's now().
    expect(changed.statusChangedAt.getTime()).toBe(
      events[0]!.occurredAt.getTime(),
    );
  });

  it.each(["paused", "completed", "dropped"] as const)(
    "refuses archived → %s and changes nothing",
    async (to) => {
      const user = await createTestUser();
      const seeded = await goalIn(user.id, "archived");

      await expect(
        changeGoalStatus(user.id, { id: seeded.id, status: to }),
      ).rejects.toBeInstanceOf(ConflictError);

      expect(await readGoal(seeded.id)).toMatchObject({
        status: "archived",
        statusChangedAt: LONG_AGO,
      });
      expect(await eventsFor(user.id, seeded.id)).toHaveLength(0);
    },
  );

  it.each(GOAL_STATUSES)(
    "treats %s → %s again as a no-op with no event",
    async (status) => {
      const user = await createTestUser();
      const seeded = await goalIn(user.id, status);

      const result = await changeGoalStatus(user.id, { id: seeded.id, status });

      expect(result.statusChangedAt).toEqual(LONG_AGO);
      expect(await eventsFor(user.id, seeded.id)).toHaveLength(0);
    },
  );

  describe("completed_at", () => {
    it("is set on completing, kept on archiving, cleared on restore", async () => {
      const user = await createTestUser();
      const { id } = await createGoal(user.id, goal({ title: "Run a 10k" }));

      const completed = await changeGoalStatus(user.id, {
        id,
        status: "completed",
      });
      expect(completed.completedAt).toBeInstanceOf(Date);
      expect(completed.completedAt).toEqual(completed.statusChangedAt);

      const archived = await changeGoalStatus(user.id, {
        id,
        status: "archived",
      });
      expect(archived.completedAt).toEqual(completed.completedAt);

      const restored = await changeGoalStatus(user.id, {
        id,
        status: "active",
      });
      expect(restored).toMatchObject({ status: "active", completedAt: null });

      const events = await eventsFor(user.id, id);
      expect(events.map((e) => e.changes)).toEqual([
        expect.objectContaining({ status: { from: null, to: "active" } }),
        { status: { from: "active", to: "completed" } },
        { status: { from: "completed", to: "archived" } },
        { status: { from: "archived", to: "active" } },
      ]);
    });

    it.each(["active", "paused", "dropped"] as const)(
      "is cleared when a completed goal moves to %s",
      async (to) => {
        const user = await createTestUser();
        const seeded = await goalIn(user.id, "completed");

        const changed = await changeGoalStatus(user.id, {
          id: seeded.id,
          status: to,
        });

        expect(changed.completedAt).toBeNull();
      },
    );

    it("stays empty when an unfinished goal is archived", async () => {
      const user = await createTestUser();
      const seeded = await goalIn(user.id, "dropped");

      const archived = await changeGoalStatus(user.id, {
        id: seeded.id,
        status: "archived",
      });

      expect(archived.completedAt).toBeNull();
    });

    it("is renewed when a goal is completed again", async () => {
      const user = await createTestUser();
      const seeded = await goalIn(user.id, "paused");

      const changed = await changeGoalStatus(user.id, {
        id: seeded.id,
        status: "completed",
      });

      expect(changed.completedAt!.getTime()).toBeGreaterThan(
        LONG_AGO.getTime(),
      );
    });
  });
});

describe("delete", () => {
  it("removes the goal and its audit events only", async () => {
    const user = await createTestUser();
    const doomed = await createGoal(user.id, goal({ title: "Doomed" }));
    const kept = await createGoal(user.id, goal({ title: "Kept" }));
    await changeGoalStatus(user.id, { id: doomed.id, status: "paused" });

    await deleteGoal(user.id, { id: doomed.id });

    expect(await readGoal(doomed.id)).toBeUndefined();
    expect(await eventsFor(user.id, doomed.id)).toHaveLength(0);
    expect(await eventsFor(user.id, kept.id)).toHaveLength(1);
  });

  it("is NotFound for a missing goal", async () => {
    const user = await createTestUser();
    await expect(
      deleteGoal(user.id, { id: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("cross-user access", () => {
  it("lets user B neither edit, change the status of, nor delete A's goal", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const created = await createGoal(alice.id, goal({ title: "Alice's" }));
    const before = await readGoal(created.id);

    await expect(
      updateGoal(bob.id, { ...editable(created), title: "Bob's now" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      changeGoalStatus(bob.id, { id: created.id, status: "dropped" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteGoal(bob.id, { id: created.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(await readGoal(created.id)).toEqual(before);
    expect(await eventsFor(alice.id, created.id)).toHaveLength(1);
    expect(await eventsFor(bob.id)).toHaveLength(0);
  });

  it("gives the same error for another user's goal and a missing one", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const created = await createGoal(alice.id, goal({ title: "Alice's" }));

    const foreign = await deleteGoal(bob.id, { id: created.id }).catch(
      (e: unknown) => e,
    );
    const missing = await deleteGoal(bob.id, {
      id: crypto.randomUUID(),
    }).catch((e: unknown) => e);

    expect(foreign).toBeInstanceOf(NotFoundError);
    expect((foreign as Error).message).toBe((missing as Error).message);
  });
});
