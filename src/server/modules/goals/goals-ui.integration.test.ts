import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db/client";
import { auditEvents, goals, userPreferences } from "@/server/db/schema";
import {
  archiveLifeArea,
  createLifeArea,
} from "@/server/modules/life-areas/service";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { getGoalsView } from "./queries";
import { changeGoalStatus, createGoal } from "./service";
import { createGoalSchema, TARGET_BEFORE_START } from "./validation";

// The Goals page's read model and the actions its forms call (chunk 1.2).
// Service rules are covered in goals.integration.test.ts.

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

const area = (userId: string, name: string) =>
  createLifeArea(userId, { name, description: null, color: null });

const goal = (userId: string, title: string, lifeAreaId?: string) =>
  createGoal(userId, createGoalSchema.parse({ title, lifeAreaId }));

const titlesByGroup = (view: Awaited<ReturnType<typeof getGoalsView>>) =>
  view.groups.map((group) => [
    group.area?.name ?? null,
    group.goals.map((item) => item.title),
  ]);

describe("getGoalsView", () => {
  it("is empty for a new user", async () => {
    const user = await createTestUser();

    const view = await getGoalsView(user.id, "active");

    expect(view).toEqual({
      status: "active",
      counts: { active: 0, paused: 0, completed: 0, dropped: 0 },
      groups: [],
      areas: [],
    });
  });

  it("groups by area in the user's order, archived areas after, no area last", async () => {
    const user = await createTestUser();
    const health = await area(user.id, "Health");
    const career = await area(user.id, "Career");
    const home = await area(user.id, "Home");
    await area(user.id, "Empty");
    await goal(user.id, "Loose end");
    await goal(user.id, "Fix the shed", home.id);
    await goal(user.id, "Run 10k", health.id);
    await goal(user.id, "Ship v1", career.id);
    await goal(user.id, "Sleep by 11", health.id);
    await archiveLifeArea(user.id, { id: health.id });

    const view = await getGoalsView(user.id, "active");

    expect(titlesByGroup(view)).toEqual([
      ["Career", ["Ship v1"]],
      ["Home", ["Fix the shed"]],
      ["Health", ["Run 10k", "Sleep by 11"]],
      [null, ["Loose end"]],
    ]);
    expect(view.groups[2]!.area?.status).toBe("archived");
    expect(view.areas.map((item) => item.name)).toEqual([
      "Career",
      "Home",
      "Empty",
      "Health",
    ]);
  });

  it("filters by status, counts each filter and leaves archived goals out", async () => {
    const user = await createTestUser();
    const ids = await Promise.all(
      ["A", "B", "C", "D", "E", "F"].map(async (title) => {
        const created = await goal(user.id, title);
        return created.id;
      }),
    );
    await changeGoalStatus(user.id, { id: ids[1]!, status: "paused" });
    await changeGoalStatus(user.id, { id: ids[2]!, status: "completed" });
    await changeGoalStatus(user.id, { id: ids[3]!, status: "dropped" });
    await changeGoalStatus(user.id, { id: ids[4]!, status: "dropped" });
    await changeGoalStatus(user.id, { id: ids[5]!, status: "archived" });

    const counts = { active: 1, paused: 1, completed: 1, dropped: 2 };
    for (const [status, titles] of [
      ["active", ["A"]],
      ["paused", ["B"]],
      ["completed", ["C"]],
      ["dropped", ["D", "E"]],
    ] as const) {
      const view = await getGoalsView(user.id, status);
      expect(view.counts).toEqual(counts);
      expect(view.groups.flatMap((group) => group.goals)).toMatchObject(
        titles.map((title) => ({ title, status })),
      );
    }
  });

  it("formats dates in the user's locale", async () => {
    const user = await createTestUser();
    await getGoalsView(user.id, "active"); // creates the preferences row
    await db
      .update(userPreferences)
      .set({ locale: "en-GB" })
      .where(eq(userPreferences.userId, user.id));
    await createGoal(
      user.id,
      createGoalSchema.parse({
        title: "Dated",
        startDate: "2027-01-01",
        targetDate: "2027-03-12",
      }),
    );

    const [item] = (await getGoalsView(user.id, "active")).groups[0]!.goals;

    expect(item).toMatchObject({
      startDate: "2027-01-01",
      startDateLabel: "1 Jan 2027",
      targetDate: "2027-03-12",
      targetDateLabel: "12 Mar 2027",
    });
  });

  it("shows only the user's own goals and areas", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const hers = await area(alice.id, "Alice's area");
    await goal(alice.id, "Alice's goal", hers.id);
    await goal(alice.id, "Alice's loose goal");

    const view = await getGoalsView(bob.id, "active");

    expect(view.groups).toEqual([]);
    expect(view.areas).toEqual([]);
    expect(view.counts.active).toBe(0);
  });
});

describe("actions", () => {
  it("reject a caller with no session", async () => {
    for (const result of [
      await actions.createGoal({ title: "Anything" }),
      await actions.updateGoal({
        id: crypto.randomUUID(),
        title: "Anything",
      }),
      await actions.changeGoalStatus({
        id: crypto.randomUUID(),
        status: "paused",
      }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    }
  });

  it("create a goal from only a title, with every blank field as null", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    // What the form sends when only the title is filled in.
    const result = await actions.createGoal({
      title: "  Learn Spanish  ",
      reason: "",
      description: "",
      lifeAreaId: null,
      priority: null,
      startDate: "",
      targetDate: "",
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        title: "Learn Spanish",
        reason: null,
        description: null,
        lifeAreaId: null,
        priority: null,
        startDate: null,
        targetDate: null,
        status: "active",
      },
    });
    const view = await getGoalsView(user.id, "active");
    expect(titlesByGroup(view)).toEqual([[null, ["Learn Spanish"]]]);
  });

  it("create and edit every field", async () => {
    const user = await createTestUser();
    const health = await area(user.id, "Health");
    await signInAs(user.id);

    const created = await actions.createGoal({
      title: "Run a half marathon",
      reason: "To feel strong again",
      description: "Spring race",
      lifeAreaId: health.id,
      priority: "high",
      startDate: "2027-01-01",
      targetDate: "2027-04-01",
    });
    if (!created.ok) throw new Error("expected the goal to be created");

    const updated = await actions.updateGoal({
      id: created.data.id,
      title: "Run a 10k",
      reason: "",
      description: "",
      lifeAreaId: null,
      priority: "low",
      startDate: "",
      targetDate: "2027-05-01",
    });

    expect(updated).toMatchObject({
      ok: true,
      data: {
        title: "Run a 10k",
        reason: null,
        description: null,
        lifeAreaId: null,
        priority: "low",
        startDate: null,
        targetDate: "2027-05-01",
      },
    });
  });

  it("return field errors, including a target before the start, and save nothing", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const blank = await actions.createGoal({ title: "   " });
    const reversed = await actions.createGoal({
      title: "Backwards",
      startDate: "2027-05-01",
      targetDate: "2027-04-01",
    });
    const invalid = await actions.createGoal({
      title: "x".repeat(201),
      reason: "y".repeat(2001),
      priority: "urgent" as never,
      lifeAreaId: "not-a-uuid",
      startDate: "2027-02-30",
    });
    const badStatus = await actions.changeGoalStatus({
      id: crypto.randomUUID(),
      status: "finished" as never,
    });

    for (const [result, fields] of [
      [blank, ["title"]],
      [reversed, ["targetDate"]],
      [invalid, ["lifeAreaId", "priority", "reason", "startDate", "title"]],
      [badStatus, ["status"]],
    ] as const) {
      if (result.ok || result.error.code !== "VALIDATION") {
        throw new Error("expected a validation error");
      }
      expect(Object.keys(result.error.fieldErrors).sort()).toEqual(fields);
    }
    if (!reversed.ok && reversed.error.code === "VALIDATION") {
      expect(reversed.error.fieldErrors.targetDate).toEqual([
        TARGET_BEFORE_START,
      ]);
    }
    expect(await db.select().from(goals)).toHaveLength(0);
  });

  it("change status through every list action, and refuse a restricted move", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    const created = await actions.createGoal({ title: "Write a book" });
    if (!created.ok) throw new Error("expected the goal to be created");
    const ref = { id: created.data.id };

    for (const status of [
      "paused",
      "active",
      "completed",
      "active",
      "dropped",
      "active",
      "archived",
    ] as const) {
      expect(await actions.changeGoalStatus({ ...ref, status })).toMatchObject({
        ok: true,
        data: { status },
      });
    }

    // Archived goals are restored to active only (ADR 0010).
    expect(
      await actions.changeGoalStatus({ ...ref, status: "paused" }),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("can't read or change another user's goal, or use their area", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const hers = await area(alice.id, "Alice's area");
    const secret = await goal(alice.id, "Alice's goal", hers.id);
    const ref = { id: secret.id };
    await signInAs(bob.id);

    for (const result of [
      await actions.updateGoal({ ...ref, title: "Mine now" }),
      await actions.changeGoalStatus({ ...ref, status: "dropped" }),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    expect(
      await actions.createGoal({ title: "Sneaky", lifeAreaId: hers.id }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { lifeAreaId: [expect.any(String)] },
      },
    });
    expect(
      await actions.createGoal({ title: "Planted", userId: alice.id } as never),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });

    const [row] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, secret.id), eq(goals.userId, alice.id)));
    expect(row).toMatchObject({ title: "Alice's goal", status: "active" });
    expect(
      await db.select().from(auditEvents).where(eq(auditEvents.userId, bob.id)),
    ).toHaveLength(0);
    expect((await getGoalsView(alice.id, "active")).counts.active).toBe(1);
  });
});
