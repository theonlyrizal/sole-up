import { eq } from "drizzle-orm";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/server/auth/auth";
import { db } from "@/server/db/client";
import { auditEvents, userPreferences, users } from "@/server/db/schema";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import { savePreferences as savePreferencesAction } from "./actions";
import { getUserPreferences, savePreferences } from "./service";

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

async function preferencesRow(userId: string) {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return row;
}

async function eventsFor(userId: string) {
  return db.select().from(auditEvents).where(eq(auditEvents.userId, userId));
}

const berlin = {
  timezone: "Europe/Berlin",
  locale: "de-DE",
  weekStart: 1,
} as const;

describe("creation", () => {
  it("creates defaults with no time zone on first OAuth sign-in", async () => {
    const context = await auth.$context;
    const result = await handleOAuthUserInfo({ context } as never, {
      userInfo: {
        id: "gh-new",
        name: "New Person",
        email: "new@example.test",
        emailVerified: true,
        image: null,
      },
      account: { providerId: "github", accountId: "gh-new" },
    });
    const userId = result.data?.user.id;
    expect(userId).toBeDefined();

    const row = await preferencesRow(userId!);
    expect(row).toMatchObject({
      timezone: null,
      locale: "en-US",
      weekStart: 1,
    });
  });

  it("creates the row on read when sign-in didn't, and only once", async () => {
    const user = await createTestUser();
    expect(await preferencesRow(user.id)).toBeUndefined();

    const first = await getUserPreferences(user.id);
    const second = await getUserPreferences(user.id);

    expect(first).toEqual({ timezone: null, locale: "en-US", weekStart: 1 });
    expect(second).toEqual(first);
    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id));
    expect(rows).toHaveLength(1);
  });

  it("is deleted with the account", async () => {
    const user = await createTestUser();
    await getUserPreferences(user.id);

    await db.delete(users).where(eq(users.id, user.id));

    expect(await preferencesRow(user.id)).toBeUndefined();
  });

  it("refuses a week start outside 0–6 at the database", async () => {
    const user = await createTestUser();
    await expect(
      db.insert(userPreferences).values({ userId: user.id, weekStart: 7 }),
    ).rejects.toThrow();
  });
});

describe("savePreferences (service)", () => {
  it("saves the values and records only the fields that changed", async () => {
    const user = await createTestUser();

    const saved = await savePreferences(user.id, berlin);

    expect(saved).toEqual(berlin);
    const [event] = await eventsFor(user.id);
    expect(event).toMatchObject({
      eventType: "user_preferences.updated",
      entityType: "user_preferences",
      entityId: user.id,
      changes: {
        timezone: { from: null, to: "Europe/Berlin" },
        locale: { from: "en-US", to: "de-DE" },
      },
    });

    await savePreferences(user.id, { ...berlin, weekStart: 0 });
    const events = await eventsFor(user.id);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.changes)).toContainEqual({
      weekStart: { from: 1, to: 0 },
    });
  });

  it("writes no event when nothing changed", async () => {
    const user = await createTestUser();
    await savePreferences(user.id, berlin);

    await savePreferences(user.id, berlin);

    expect(await eventsFor(user.id)).toHaveLength(1);
  });

  it("changes only the given user's row", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await getUserPreferences(bob.id);

    await savePreferences(alice.id, berlin);

    expect(await getUserPreferences(bob.id)).toEqual({
      timezone: null,
      locale: "en-US",
      weekStart: 1,
    });
    expect(await eventsFor(bob.id)).toHaveLength(0);
  });
});

describe("savePreferences (action)", () => {
  it("rejects a caller with no session", async () => {
    const result = await savePreferencesAction(berlin);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("saves for the signed-in user, in canonical form", async () => {
    const user = await createTestUser();
    requestHeaders.current = (await asUser(user.id)).headers;

    const result = await savePreferencesAction({
      timezone: " US/Pacific ",
      locale: "en-gb",
      weekStart: 0,
    });

    expect(result).toEqual({
      ok: true,
      data: { timezone: "America/Los_Angeles", locale: "en-GB", weekStart: 0 },
    });
    expect(await getUserPreferences(user.id)).toEqual({
      timezone: "America/Los_Angeles",
      locale: "en-GB",
      weekStart: 0,
    });
  });

  it("returns field errors for invalid values and saves nothing", async () => {
    const user = await createTestUser();
    requestHeaders.current = (await asUser(user.id)).headers;

    const result = await savePreferencesAction({
      timezone: "Mars/Olympus_Mons",
      locale: "not a locale",
      weekStart: 7,
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== "VALIDATION") {
      throw new Error("expected a validation error");
    }
    expect(Object.keys(result.error.fieldErrors).sort()).toEqual([
      "locale",
      "timezone",
      "weekStart",
    ]);
    expect(await eventsFor(user.id)).toHaveLength(0);
    expect((await getUserPreferences(user.id)).timezone).toBeNull();
  });

  it("rejects fixed offsets, which follow no one's DST rules", async () => {
    const user = await createTestUser();
    requestHeaders.current = (await asUser(user.id)).headers;

    for (const timezone of ["+05:00", "Etc/GMT+5", ""]) {
      const result = await savePreferencesAction({ ...berlin, timezone });
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "VALIDATION",
          fieldErrors: { timezone: [expect.any(String)] },
        },
      });
    }
  });

  it("can't target another user: unknown keys are rejected", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    requestHeaders.current = (await asUser(alice.id)).headers;

    const result = await savePreferencesAction({
      ...berlin,
      userId: bob.id,
    } as never);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect((await getUserPreferences(bob.id)).timezone).toBeNull();
    expect((await getUserPreferences(alice.id)).timezone).toBeNull();
  });
});
