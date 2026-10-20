import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";
import { ensureUserPreferences } from "@/server/modules/preferences/service";

import { logAuth } from "./logger";
import { configuredProviders, type ProviderId } from "./providers";

const SIGN_IN_PATH = "/sign-in";

function socialProviders() {
  const providers: Partial<
    Record<ProviderId, { clientId: string; clientSecret: string }>
  > = {};
  for (const provider of configuredProviders(env)) {
    providers[provider.id] = {
      clientId: provider.clientId,
      clientSecret: provider.clientSecret,
    };
  }
  return providers;
}

/**
 * Better Auth, with its tables in our Postgres (src/server/db/schema/auth.ts).
 * See docs/decisions/0002-auth.md. Route handler: src/app/api/auth/[...all].
 */
export const auth = betterAuth({
  appName: "SoleUp",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    // Better Auth's `user` model is our `users` table, and so on.
    usePlural: true,
  }),
  socialProviders: socialProviders(),
  account: {
    accountLinking: {
      enabled: true,
      // No provider is trusted blindly: a new provider is linked to an
      // existing user only when it reports the email as verified, and the
      // existing user's email is verified too. Different emails never link.
      trustedProviders: [],
      allowDifferentEmails: false,
      requireLocalEmailVerified: true,
    },
  },
  databaseHooks: {
    user: {
      create: {
        // First sign-in: create the preferences row with defaults. The time
        // zone stays unset until the user confirms it in the app.
        after: async (user) => {
          await ensureUserPreferences(user.id);
        },
      },
    },
  },
  session: {
    // Database sessions (revocable). No cookie cache, so signing out or
    // deleting a session takes effect on the next request.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    // Applies to HTTP requests through the route handler only, not to
    // server-side `auth.api.*` calls. That is why sign-in and sign-out go
    // through the Better Auth client (src/lib/auth-client.ts).
    // Better Auth only rate-limits in production by default. Keep it on
    // everywhere so the limits are exercised in development and tests.
    enabled: true,
    // In memory: ADR 0003 runs one Node host. Counters reset on restart.
    storage: "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/*": { window: 60, max: 10 },
      "/callback/*": { window: 60, max: 10 },
    },
  },
  advanced: {
    database: { generateId: "uuid" },
    // Secure cookies whenever the app is served over HTTPS (always in
    // production); plain http://localhost in development cannot use them.
    useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
    cookiePrefix: "soleup",
  },
  onAPIError: {
    // OAuth failures (denied consent, misconfigured provider) land back on
    // the sign-in page with `?error=<code>`, which shows a readable message.
    errorURL: SIGN_IN_PATH,
    // API errors (4xx and the like) still become normal responses. Anything
    // unexpected is rethrown to the route handler, which logs it redacted:
    // Better Auth's default handling prints the raw error, SQL params and all.
    throw: true,
  },
  telemetry: { enabled: false },
  // Redacts OAuth payloads and query params from Better Auth's logs.
  logger: { level: "warn", log: logAuth },
});

export type Session = typeof auth.$Infer.Session;
