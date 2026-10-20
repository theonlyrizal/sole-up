import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db/client";
import {
  auditEvents,
  lifeAreas,
  userPreferences,
  users,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { getLifeAreasView } from "./queries";
import {
  addStarterLifeAreas,
  archiveLifeArea,
  createLifeArea,
  deleteLifeArea,
  dismissStarterLifeAreas,
  reorderLifeAreas,
  unarchiveLifeArea,
  updateLifeArea,
} from "./service";

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

const area = (name: string) => ({ name, description: null, color: null });

async function eventsFor(userId: string) {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.userId, userId))
    .orderBy(auditEvents.occurredAt);
}

async function namesInOrder(userId: string) {
  const view = await getLifeAreasView(userId);
  return view.active.map((a) => a.name);
}

describe("schema", () => {
  it("refuses two active areas with the same name, ignoring case", async () => {
    const user = await createTestUser();
    await db
      .insert(lifeAreas)
      .values({ userId: user.id, name: "Health", sortOrder: 0 });
    await expect(
      db
        .insert(lifeAreas)
        .values({ userId: user.id, name: "HEALTH", sortOrder: 1 }),
    ).rejects.toThrow();
  });

  it("allows the same name when the other is archived, or another user's", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await db.insert(lifeAreas).values([
      { userId: alice.id, name: "Health", sortOrder: 0, status: "archived" },
      { userId: alice.id, name: "health", sortOrder: 1 },
      { userId: bob.id, name: "Health", sortOrder: 0 },
    ]);
  });

  it("checks status, color and name length", async () => {
    const user = await createTestUser();
    const base = { userId: user.id, name: "Ok", sortOrder: 0 };
    await expect(
      db.insert(lifeAreas).values({ ...base, status: "deleted" as never }),
    ).rejects.toThrow();
    await expect(
      db.insert(lifeAreas).values({ ...base, color: "#ff0000" as never }),
    ).rejects.toThrow();
    await expect(
      db.insert(lifeAreas).values({ ...base, name: "" }),
    ).rejects.toThrow();
  });

  it("is deleted with the account", async () => {
    const user = await createTestUser();
    await createLifeArea(user.id, area("Health"));

    await db.delete(users).where(eq(users.id, user.id));

    expect(
      await db.select().from(lifeAreas).where(eq(lifeAreas.userId, user.id)),
    ).toHaveLength(0);
  });
});

describe("create and edit", () => {
  it("adds areas to the end and records the creation", async () => {
    const user = await createTestUser();

    const first = await createLifeArea(user.id, area("Health"));
    const second = await createLifeArea(user.id, {
      name: "Career",
      description: "Work and growth",
      color: "blue",
    });

    expect(first).toMatchObject({ sortOrder: 0, status: "active" });
    expect(second).toMatchObject({
      sortOrder: 1,
      description: "Work and growth",
      color: "blue",
    });
    const events = await eventsFor(user.id);
    expect(events.map((e) => e.eventType)).toEqual([
      "life_area.created",
      "life_area.created",
    ]);
    expect(events[1]).toMatchObject({
      entityType: "life_area",
      entityId: second.id,
      changes: {
        status: { from: null, to: "active" },
        sortOrder: { from: null, to: 1 },
        color: { from: null, to: "blue" },
      },
    });
  });

  it("rejects a duplicate active name as a field error", async () => {
    const user = await createTestUser();
    await createLifeArea(user.id, area("Health"));

    const error = await createLifeArea(user.id, area("HEALTH")).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toHaveProperty("name");
    expect(await eventsFor(user.id)).toHaveLength(1);
  });

  it("edits and records which fields changed", async () => {
    const user = await createTestUser();
    const created = await createLifeArea(user.id, area("Health"));

    const updated = await updateLifeArea(user.id, {
      id: created.id,
      name: "Wellbeing",
      description: null,
      color: "green",
    });

    expect(updated).toMatchObject({ name: "Wellbeing", color: "green" });
    const events = await eventsFor(user.id);
    expect(events.at(-1)).toMatchObject({
      eventType: "life_area.updated",
      changes: {
        fields: ["name", "color"],
        color: { from: null, to: "green" },
      },
    });
  });

  it("writes no event when nothing changed", async () => {
    const user = await createTestUser();
    const created = await createLifeArea(user.id, area("Health"));

    await updateLifeArea(user.id, { id: created.id, ...area("Health") });

    expect(await eventsFor(user.id)).toHaveLength(1);
  });

  it("refuses renaming onto another active area's name", async () => {
    const user = await createTestUser();
    await createLifeArea(user.id, area("Health"));
    const career = await createLifeArea(user.id, area("Career"));

    await expect(
      updateLifeArea(user.id, { id: career.id, ...area("HEALTH") }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await namesInOrder(user.id)).toEqual(["Health", "Career"]);
  });
});

describe("audit privacy", () => {
  it("never stores a name or description in an event", async () => {
    const user = await createTestUser();
    const name = "Secret Area Name 7f3a";
    const description = "Private description 9c2e";

    const created = await createLifeArea(user.id, {
      name,
      description,
      color: "red",
    });
    await updateLifeArea(user.id, {
      id: created.id,
      name: `${name} renamed`,
      description: `${description} edited`,
      color: "red",
    });
    await archiveLifeArea(user.id, { id: created.id });
    await unarchiveLifeArea(user.id, { id: created.id });
    await createLifeArea(user.id, area("Other"));
    await reorderLifeAreas(user.id, {
      ids: (await getLifeAreasView(user.id)).active.map((a) => a.id).reverse(),
    });

    const events = await eventsFor(user.id);
    expect(events.length).toBeGreaterThanOrEqual(6);
    const stored = JSON.stringify(events);
    expect(stored).not.toContain("Secret");
    expect(stored).not.toContain("7f3a");
    expect(stored).not.toContain("Private");
    expect(stored).not.toContain("Other");
  });
});

describe("reorder", () => {
  it("applies the new order and records each moved area", async () => {
    const user = await createTestUser();
    const a = await createLifeArea(user.id, area("A"));
    const b = await createLifeArea(user.id, area("B"));
    const c = await createLifeArea(user.id, area("C"));

    await reorderLifeAreas(user.id, { ids: [c.id, a.id, b.id] });

    expect(await namesInOrder(user.id)).toEqual(["C", "A", "B"]);
    const reordered = (await eventsFor(user.id)).filter(
      (e) => e.eventType === "life_area.reordered",
    );
    expect(reordered).toHaveLength(3);
    expect(reordered.find((e) => e.entityId === c.id)?.changes).toEqual({
      sortOrder: { from: 2, to: 0 },
    });
  });

  it("refuses a stale or partial list and moves nothing", async () => {
    const user = await createTestUser();
    const a = await createLifeArea(user.id, area("A"));
    const b = await createLifeArea(user.id, area("B"));

    await expect(
      reorderLifeAreas(user.id, { ids: [b.id] }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      reorderLifeAreas(user.id, { ids: [b.id, crypto.randomUUID()] }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await namesInOrder(user.id)).toEqual(["A", "B"]);
    expect(a.sortOrder).toBe(0);
  });
});

describe("archive, unarchive and delete", () => {
  it("archives and restores to the end of the active list", async () => {
    const user = await createTestUser();
    const health = await createLifeArea(user.id, area("Health"));
    await createLifeArea(user.id, area("Career"));

    await archiveLifeArea(user.id, { id: health.id });
    let view = await getLifeAreasView(user.id);
    expect(view.active.map((a) => a.name)).toEqual(["Career"]);
    expect(view.archived.map((a) => a.name)).toEqual(["Health"]);

    const restored = await unarchiveLifeArea(user.id, { id: health.id });
    expect(restored).toMatchObject({ status: "active", sortOrder: 2 });
    view = await getLifeAreasView(user.id);
    expect(view.active.map((a) => a.name)).toEqual(["Career", "Health"]);

    const types = (await eventsFor(user.id)).map((e) => e.eventType);
    expect(types).toContain("life_area.archived");
    expect(types).toContain("life_area.unarchived");
  });

  it("archiving twice records one event", async () => {
    const user = await createTestUser();
    const health = await createLifeArea(user.id, area("Health"));

    await archiveLifeArea(user.id, { id: health.id });
    await archiveLifeArea(user.id, { id: health.id });

    const archived = (await eventsFor(user.id)).filter(
      (e) => e.eventType === "life_area.archived",
    );
    expect(archived).toHaveLength(1);
  });

  it("refuses to restore onto an active area's name", async () => {
    const user = await createTestUser();
    const old = await createLifeArea(user.id, area("Health"));
    await archiveLifeArea(user.id, { id: old.id });
    await createLifeArea(user.id, area("health"));

    await expect(
      unarchiveLifeArea(user.id, { id: old.id }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await getLifeAreasView(user.id)).archived).toHaveLength(1);
  });

  it("deletes the area and its audit events, and nothing else", async () => {
    const user = await createTestUser();
    const health = await createLifeArea(user.id, area("Health"));
    const career = await createLifeArea(user.id, area("Career"));
    await archiveLifeArea(user.id, { id: health.id });

    await deleteLifeArea(user.id, { id: health.id });

    const view = await getLifeAreasView(user.id);
    expect([...view.active, ...view.archived].map((a) => a.id)).toEqual([
      career.id,
    ]);
    const events = await eventsFor(user.id);
    expect(events.some((e) => e.entityId === health.id)).toBe(false);
    expect(events.filter((e) => e.entityId === career.id)).toHaveLength(1);
  });

  it("deleting a missing area is NotFound", async () => {
    const user = await createTestUser();
    await expect(
      deleteLifeArea(user.id, { id: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("cross-user access", () => {
  it("user B can't read, edit, reorder, archive or delete user A's area", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const secret = await createLifeArea(alice.id, {
      name: "Alice's area",
      description: "Hers",
      color: "pink",
    });
    const ref = { id: secret.id };

    // Read
    const bobView = await getLifeAreasView(bob.id);
    expect([...bobView.active, ...bobView.archived]).toHaveLength(0);

    // Service: every mutation is NotFound, exactly as for a missing ID.
    await expect(
      updateLifeArea(bob.id, { ...ref, ...area("Mine now") }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveLifeArea(bob.id, ref)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(unarchiveLifeArea(bob.id, ref)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteLifeArea(bob.id, ref)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      reorderLifeAreas(bob.id, { ids: [secret.id] }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Actions, signed in as Bob.
    await signInAs(bob.id);
    for (const result of [
      await actions.updateLifeArea({ ...ref, name: "Mine now" }),
      await actions.archiveLifeArea(ref),
      await actions.unarchiveLifeArea(ref),
      await actions.deleteLifeArea(ref),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }

    // Alice's area and history are untouched.
    const [row] = await db
      .select()
      .from(lifeAreas)
      .where(and(eq(lifeAreas.id, secret.id), eq(lifeAreas.userId, alice.id)));
    expect(row).toMatchObject({
      name: "Alice's area",
      description: "Hers",
      color: "pink",
      status: "active",
      sortOrder: 0,
    });
    expect(await eventsFor(alice.id)).toHaveLength(1);
    expect(await eventsFor(bob.id)).toHaveLength(0);
  });

  it("an action can't create an area for another user", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await signInAs(alice.id);

    const result = await actions.createLifeArea({
      name: "Planted",
      userId: bob.id,
    } as never);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect((await getLifeAreasView(bob.id)).active).toHaveLength(0);
    expect((await getLifeAreasView(alice.id)).active).toHaveLength(0);
  });
});

describe("actions", () => {
  it("reject a caller with no session", async () => {
    const result = await actions.createLifeArea({ name: "Health" });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("create for the signed-in user, trimmed, blank description as null", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const result = await actions.createLifeArea({
      name: "  Health  ",
      description: "   ",
    });

    expect(result).toMatchObject({
      ok: true,
      data: { name: "Health", description: null, color: null },
    });
  });

  it("return field errors for invalid input and save nothing", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const blank = await actions.createLifeArea({ name: "   " });
    const tooLong = await actions.createLifeArea({
      name: "x".repeat(61),
      description: "y".repeat(501),
      color: "chartreuse" as never,
    });
    const badId = await actions.archiveLifeArea({ id: "not-a-uuid" });

    for (const [result, fields] of [
      [blank, ["name"]],
      [tooLong, ["color", "description", "name"]],
      [badId, ["id"]],
    ] as const) {
      if (result.ok || result.error.code !== "VALIDATION") {
        throw new Error("expected a validation error");
      }
      expect(Object.keys(result.error.fieldErrors).sort()).toEqual(fields);
    }
    expect(await eventsFor(user.id)).toHaveLength(0);
  });

  it("return a duplicate name as a field error", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    await actions.createLifeArea({ name: "Health" });

    const result = await actions.createLifeArea({ name: "HEALTH" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { name: [expect.any(String)] },
      },
    });
  });
});

describe("starter areas", () => {
  it("are offered to a new user with no areas", async () => {
    const user = await createTestUser();
    expect((await getLifeAreasView(user.id)).offerStarters).toBe(true);
  });

  it("create only the chosen areas, in order, and are offered once", async () => {
    const user = await createTestUser();

    const created = await addStarterLifeAreas(user.id, {
      names: ["Health", "Career"],
    });

    expect(created.map((a) => [a.name, a.sortOrder])).toEqual([
      ["Health", 0],
      ["Career", 1],
    ]);
    const view = await getLifeAreasView(user.id);
    expect(view.offerStarters).toBe(false);
    await expect(
      addStarterLifeAreas(user.id, { names: ["Home"] }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await namesInOrder(user.id)).toEqual(["Health", "Career"]);

    const types = (await eventsFor(user.id)).map((e) => e.eventType);
    expect(types.filter((t) => t === "life_area.created")).toHaveLength(2);
    expect(types).toContain("user_preferences.updated");
  });

  it("skip a name the user already has", async () => {
    const user = await createTestUser();
    await createLifeArea(user.id, area("health"));

    const created = await addStarterLifeAreas(user.id, {
      names: ["Health", "Home"],
    });

    expect(created.map((a) => a.name)).toEqual(["Home"]);
    expect(await namesInOrder(user.id)).toEqual(["health", "Home"]);
  });

  it("are never offered again once dismissed, even with no areas", async () => {
    const user = await createTestUser();

    await dismissStarterLifeAreas(user.id);
    await dismissStarterLifeAreas(user.id);

    expect((await getLifeAreasView(user.id)).offerStarters).toBe(false);
    const [prefs] = await db
      .select({ answer: userPreferences.lifeAreaStarters })
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id));
    expect(prefs?.answer).toBe("dismissed");
    expect(await eventsFor(user.id)).toHaveLength(1);
    expect((await getLifeAreasView(user.id)).active).toHaveLength(0);
  });

  it("are not offered once the user has an area", async () => {
    const user = await createTestUser();
    await createLifeArea(user.id, area("Health"));
    expect((await getLifeAreasView(user.id)).offerStarters).toBe(false);
  });

  it("accept only known starter names through the action", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const result = await actions.addStarterLifeAreas({
      names: ["Health", "Anything I like"] as never,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect((await getLifeAreasView(user.id)).offerStarters).toBe(true);
  });
});
