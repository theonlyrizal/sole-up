import "server-only";

import { randomUUID } from "node:crypto";

import { makeSignature } from "better-auth/crypto";

import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";

import { auth } from "./auth";

/**
 * Test support only: used by the test sign-in shortcut and the integration
 * fixtures. Never import it from app code.
 */

export type TestUser = typeof users.$inferSelect;

/**
 * Inserts a user with a verified email, as an OAuth sign-in would. The email
 * defaults to a unique `@example.test` address.
 */
export async function insertTestUser(
  values: { email?: string; name?: string } = {},
): Promise<TestUser> {
  const email = values.email ?? `user-${randomUUID()}@example.test`;
  const [user] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      name: values.name ?? "Test User",
      emailVerified: true,
    })
    .returning();
  if (!user) throw new Error("Could not insert the test user.");
  return user;
}

export type SessionCookie = {
  name: string;
  /** Signed and URL-encoded, ready for a Cookie or Set-Cookie header. */
  value: string;
  maxAge: number;
  secure: boolean;
};

/**
 * Creates a real database session for `userId` and returns the signed
 * session cookie Better Auth expects, in the same format it would set after
 * an OAuth sign-in.
 */
export async function createSessionCookie(
  userId: string,
): Promise<SessionCookie> {
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(userId);
  const signature = await makeSignature(session.token, context.secret);
  const { name, attributes } = context.authCookies.sessionToken;
  return {
    name,
    value: encodeURIComponent(`${session.token}.${signature}`),
    maxAge: attributes.maxAge ?? context.sessionConfig.expiresIn,
    secure: attributes.secure ?? false,
  };
}
