import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db/client";
import {
  auditEvents,
  goals,
  milestones,
  userPreferences,
} from "@/server/db/schema";
import { createLifeArea } from "@/server/modules/life-areas/service";
import {
  changeMilestoneStatus,
  createMilestone,
} from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";
import { getUserPreferences } from "@/server/modules/preferences/service";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { getArchivedGoals, getGoalsView } from "./queries";
import { changeGoalStatus, createGoal } from "./service";
import { createGoalSchema } from "./validation";

// The archive view's read model and the delete action (chunk 1.6). The
// service's delete rules are covered in goals.integration.test.ts.

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

async function userInLondon() {
  const user = await createTestUser();
  await getUserPreferences(user.id); // creates the preferences row
  await db
    .update(userPreferences)
    .set({ locale: "en-GB", timezone: "Europe/London" })
    .where(eq(userPreferences.userId, user.id));
  return user;
}

const goal = (userId: string, title: string, lifeAreaId?: string) =>
  createGoal(userId, createGoalSchema.parse({ title, lifeAreaId }));

const archive = (userId: string, id: string) =>
  changeGoalStatus(userId, { id, status: "archived" });

async function addMilestones(userId: string, goalId: string, count: number) {
  const created = [];
  for (let index = 0; index < count; index++) {
    created.push(
      await createMilestone(
        userId,
        createMilestoneSchema.parse({ goalId, title: `Step ${index + 1}` }),
      ),
    );
  }
  return created;
}

describe("getArchivedGoals", () => {
  it("is empty when nothing is archived", async () => {
    const user = await createTestUser();
    await goal(user.id, "Still active");

    expect(await getArchivedGoals(user.id)).toEqual([]);
    expect((await getGoalsView(user.id, "active")).archivedCount).toBe(0);
  });

  it("lists only archived goals, newest archive first, with the archive count", async () => {
    const user = await createTestUser();
    const first = await goal(user.id, "First archived");
    const second = await goal(user.id, "Second archived");
    await goal(user.id, "Still active");
    await archive(user.id, first.id);
    await archive(user.id, second.id);

    const archived = await getArchivedGoals(user.id);
    expect(archived.map((item) => item.title)).toEqual([
      "Second archived",
      "First archived",
    ]);
    const view = await getGoalsView(user.id, "active");
    expect(view.archivedCount).toBe(2);
    expect(view.counts.active).toBe(1);
  });

  it("shows the completed date only for goals completed before archiving", async () => {
    const user = await userInLondon();
    const done = await goal(user.id, "Done then archived");
    const shelved = await goal(user.id, "Shelved");
    await changeGoalStatus(user.id, { id: done.id, status: "completed" });
    await archive(user.id, done.id);
    await archive(user.id, shelved.id);

    const archived = await getArchivedGoals(user.id);
    const byTitle = new Map(archived.map((item) => [item.title, item]));
    const today = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: "Europe/London",
    }).format(new Date());

    expect(byTitle.get("Done then archived")?.completedAtLabel).toBe(today);
    expect(byTitle.get("Shelved")?.completedAtLabel).toBeNull();
    expect(byTitle.get("Shelved")?.archivedAtLabel).toBe(today);
  });

  it("counts every milestone, any status, and carries the area", async () => {
    const user = await createTestUser();
    const health = await createLifeArea(user.id, {
      name: "Health",
      description: null,
      color: null,
    });
    const withSteps = await goal(user.id, "Run a 10k", health.id);
    const [, second, third] = await addMilestones(user.id, withSteps.id, 3);
    await changeMilestoneStatus(user.id, { id: second!.id, status: "dropped" });
    await changeMilestoneStatus(user.id, {
      id: third!.id,
      status: "completed",
    });
    const bare = await goal(user.id, "No steps");
    await archive(user.id, withSteps.id);
    await archive(user.id, bare.id);

    const archived = await getArchivedGoals(user.id);
    const byTitle = new Map(archived.map((item) => [item.title, item]));
    expect(byTitle.get("Run a 10k")).toMatchObject({
      milestoneCount: 3,
      area: { name: "Health" },
    });
    expect(byTitle.get("No steps")).toMatchObject({
      milestoneCount: 0,
      area: null,
    });
  });

  it("never shows another user's archived goals", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const hers = await goal(alice.id, "Alice's archived");
    await addMilestones(alice.id, hers.id, 2);
    await archive(alice.id, hers.id);

    expect(await getArchivedGoals(bob.id)).toEqual([]);
    expect((await getGoalsView(bob.id, "active")).archivedCount).toBe(0);
  });
});

describe("deleteGoal action", () => {
  it("rejects a caller with no session", async () => {
    expect(await actions.deleteGoal({ id: crypto.randomUUID() })).toMatchObject(
      { ok: false, error: { code: "UNAUTHENTICATED" } },
    );
  });

  it("rejects an invalid ID", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    expect(await actions.deleteGoal({ id: "not-a-uuid" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
  });

  it("deletes the goal, its milestones and every related event in one go", async () => {
    const user = await createTestUser();
    const doomed = await goal(user.id, "Doomed");
    const steps = await addMilestones(user.id, doomed.id, 2);
    await archive(user.id, doomed.id);
    const kept = await goal(user.id, "Kept");
    await addMilestones(user.id, kept.id, 1);
    await signInAs(user.id);

    expect(await actions.deleteGoal({ id: doomed.id })).toMatchObject({
      ok: true,
    });

    expect(
      await db.select().from(goals).where(eq(goals.id, doomed.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(milestones)
        .where(eq(milestones.goalId, doomed.id)),
    ).toHaveLength(0);
    const removedIds = [doomed.id, ...steps.map((step) => step.id)];
    expect(
      await db
        .select()
        .from(auditEvents)
        .where(inArray(auditEvents.entityId, removedIds)),
    ).toHaveLength(0);
    // The other goal and its milestone keep their events.
    expect(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.userId, user.id)),
    ).toHaveLength(2);
    expect(await getArchivedGoals(user.id)).toEqual([]);
  });

  it("can't delete another user's goal", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const hers = await goal(alice.id, "Alice's");
    await addMilestones(alice.id, hers.id, 1);
    await signInAs(bob.id);

    expect(await actions.deleteGoal({ id: hers.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(
      await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, hers.id), eq(goals.userId, alice.id))),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.userId, alice.id)),
    ).toHaveLength(2);
  });
});
