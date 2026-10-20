import {
  createSessionCookie,
  insertTestUser,
  type TestUser,
} from "@/server/auth/test-session";

export type { TestUser };

/**
 * Inserts a user with a verified email. Every call gets a unique email unless
 * one is given. Tables are truncated between tests, so no cleanup is needed.
 */
export function createTestUser(
  values: { email?: string; name?: string } = {},
): Promise<TestUser> {
  return insertTestUser(values);
}

export type UserContext = {
  userId: string;
  /** Request headers carrying a real, signed session cookie for the user. */
  headers: Headers;
};

/**
 * Acts as `userId`: creates a real database session and returns the user ID
 * to pass to services (which take `userId` explicitly) plus request headers
 * for code that reads the session, such as getUserFromHeaders() or
 * auth.handler().
 */
export async function asUser(userId: string): Promise<UserContext> {
  const cookie = await createSessionCookie(userId);
  const headers = new Headers({ cookie: `${cookie.name}=${cookie.value}` });
  return { userId, headers };
}
