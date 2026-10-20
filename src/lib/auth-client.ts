import { createAuthClient } from "better-auth/react";

/**
 * Browser client for Better Auth's HTTP endpoints (same origin). Sign-in and
 * sign-out use it rather than Server Actions so they pass through the route
 * handler, where rate limiting applies.
 */
export const authClient = createAuthClient();
