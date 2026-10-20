import { eq } from "drizzle-orm";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { describe, expect, it } from "vitest";

import { auth } from "@/server/auth/auth";
import { getUserFromHeaders } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { accounts, sessions, users } from "@/server/db/schema";

import { asUser, createTestUser } from "./helpers/users";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE_URL = "http://localhost:3000/api/auth";

/** Calls Better Auth over HTTP, as the browser would. */
function authRequest(
  path: string,
  init: { method?: string; headers?: Headers; body?: unknown; ip?: string },
) {
  const headers = new Headers(init.headers);
  headers.set("origin", "http://localhost:3000");
  if (init.ip) headers.set("x-forwarded-for", init.ip);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return auth.handler(
    new Request(`${BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
}

describe("fixtures", () => {
  it("createTestUser inserts a verified user with a UUID id", async () => {
    const user = await createTestUser({ name: "Ada" });
    expect(user.id).toMatch(UUID);
    expect(user.emailVerified).toBe(true);
    expect(user.name).toBe("Ada");

    const other = await createTestUser();
    expect(other.email).not.toBe(user.email);
  });

  it("asUser returns headers with a session for that user only", async () => {
    const ada = await createTestUser();
    const grace = await createTestUser();

    const { userId, headers } = await asUser(ada.id);
    expect(userId).toBe(ada.id);

    const current = await getUserFromHeaders(headers);
    expect(current?.id).toBe(ada.id);
    expect(current?.id).not.toBe(grace.id);
  });
});

describe("sessions", () => {
  it("are stored in the database with UUID ids", async () => {
    const user = await createTestUser();
    await asUser(user.id);

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toMatch(UUID);
  });

  it("no cookie or a forged cookie means no user", async () => {
    expect(await getUserFromHeaders(new Headers())).toBeNull();

    const user = await createTestUser();
    const { headers } = await asUser(user.id);
    const [name, value] = headers.get("cookie")!.split("=");
    const forged = new Headers({
      cookie: `${name}=${value!.replace(/^[^.%]+/, "forged-token")}`,
    });
    expect(await getUserFromHeaders(forged)).toBeNull();
  });

  it("sign-out deletes the session, so the cookie stops working", async () => {
    const user = await createTestUser();
    const { headers } = await asUser(user.id);

    const response = await authRequest("/sign-out", {
      method: "POST",
      headers,
      body: {},
    });
    expect(response.status).toBe(200);

    expect(await getUserFromHeaders(headers)).toBeNull();
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it("deleting a user cascades to sessions and accounts", async () => {
    const user = await createTestUser();
    await asUser(user.id);
    await db.insert(accounts).values({
      userId: user.id,
      providerId: "github",
      accountId: "12345",
    });

    await db.delete(users).where(eq(users.id, user.id));

    expect(
      await db.select().from(sessions).where(eq(sessions.userId, user.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(accounts).where(eq(accounts.userId, user.id)),
    ).toHaveLength(0);
  });

  it("one provider identity cannot belong to two users", async () => {
    const ada = await createTestUser();
    const grace = await createTestUser();
    const identity = { providerId: "google", accountId: "subject-1" };
    await db.insert(accounts).values({ userId: ada.id, ...identity });

    await expect(
      db.insert(accounts).values({ userId: grace.id, ...identity }),
    ).rejects.toThrow();
  });
});

describe("account linking", () => {
  /**
   * Runs Better Auth's real OAuth sign-in decision (the code the callback
   * route calls after talking to the provider) for an incoming profile.
   */
  async function oauthSignIn(profile: {
    providerId: string;
    accountId: string;
    email: string;
    emailVerified: boolean;
  }) {
    const context = await auth.$context;
    return handleOAuthUserInfo({ context } as never, {
      userInfo: {
        id: profile.accountId,
        name: "Provider Name",
        email: profile.email,
        emailVerified: profile.emailVerified,
        image: null,
      },
      account: {
        providerId: profile.providerId,
        accountId: profile.accountId,
      },
    });
  }

  async function accountsOf(userId: string) {
    return db.select().from(accounts).where(eq(accounts.userId, userId));
  }

  it("links a new provider when it reports the same email as verified", async () => {
    const user = await createTestUser({ email: "ada@example.test" });

    const result = await oauthSignIn({
      providerId: "github",
      accountId: "gh-1",
      email: "Ada@Example.test",
      emailVerified: true,
    });

    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe(user.id);
    expect((await accountsOf(user.id)).map((a) => a.providerId)).toEqual([
      "github",
    ]);
  });

  it("refuses to link when the provider's email is not verified", async () => {
    const user = await createTestUser({ email: "ada@example.test" });

    const result = await oauthSignIn({
      providerId: "github",
      accountId: "gh-1",
      email: "ada@example.test",
      emailVerified: false,
    });

    expect(result.error).toBe("account not linked");
    expect(result.data).toBeNull();
    expect(await accountsOf(user.id)).toHaveLength(0);
  });

  it("refuses to link when the existing user's email is not verified", async () => {
    const user = await createTestUser({ email: "ada@example.test" });
    await db
      .update(users)
      .set({ emailVerified: false })
      .where(eq(users.id, user.id));

    const result = await oauthSignIn({
      providerId: "google",
      accountId: "g-1",
      email: "ada@example.test",
      emailVerified: true,
    });

    expect(result.error).toBe("account not linked");
    expect(await accountsOf(user.id)).toHaveLength(0);
  });

  it("creates a separate user for a different email", async () => {
    const user = await createTestUser({ email: "ada@example.test" });

    const result = await oauthSignIn({
      providerId: "google",
      accountId: "g-2",
      email: "someone-else@example.test",
      emailVerified: true,
    });

    expect(result.data?.user.id).toMatch(UUID);
    expect(result.data?.user.id).not.toBe(user.id);
    expect(await accountsOf(user.id)).toHaveLength(0);
  });
});

describe("providers", () => {
  it("an unconfigured provider fails with a clean client error", async () => {
    const response = await authRequest("/sign-in/social", {
      method: "POST",
      body: { provider: "google", callbackURL: "/home" },
      ip: "203.0.113.10",
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBeTruthy();
  });
});

describe("rate limiting", () => {
  it("limits sign-in attempts per client IP", async () => {
    const attempt = (ip: string) =>
      authRequest("/sign-in/social", {
        method: "POST",
        body: { provider: "github", callbackURL: "/home" },
        ip,
      });

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await attempt("203.0.113.20")).status);
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);

    // Another client is not affected.
    expect((await attempt("203.0.113.21")).status).not.toBe(429);
  });
});
