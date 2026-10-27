import "server-only";

import { z } from "zod";

import { clientEnvSchema, readClientEnv } from "@/lib/client-env";

/** Treats `KEY=` (empty) the same as an unset variable. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );

/**
 * Server-only environment variables. Importing this module from client code
 * fails the build (`server-only`), so secrets cannot reach the browser.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: "must be a postgres:// or postgresql:// connection URL",
  }),

  // Authentication (Better Auth, src/server/auth/auth.ts).
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url({ error: "must be an absolute URL" }),
  // OAuth providers. Each provider is enabled only when both its ID and
  // secret are set; setting just one of the pair is an error (see below).
  GOOGLE_CLIENT_ID: optional(z.string()),
  GOOGLE_CLIENT_SECRET: optional(z.string()),
  GITHUB_CLIENT_ID: optional(z.string()),
  GITHUB_CLIENT_SECRET: optional(z.string()),

  // Reminders (ADR 0013). Bearer secret for POST /api/reminders/sweep, which
  // cron-job.org calls every 15 minutes. At least 32 random bytes; 43
  // characters is 32 bytes in unpadded base64.
  REMINDER_SWEEP_SECRET: z
    .string()
    .min(43, "must be at least 43 characters (32 random bytes, base64)"),

  // End-to-end tests only. Enables the test sign-in shortcut when it is "1"
  // and NODE_ENV is "test" (src/server/auth/test-sign-in.ts).
  SOLEUP_TEST_SIGN_IN: optional(z.string()),
});

/** OAuth credentials that must be set together or not at all. */
const providerPairs = [
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
] as const;

const envSchema = serverEnvSchema
  .extend(clientEnvSchema.shape)
  .superRefine((values, ctx) => {
    for (const [idKey, secretKey] of providerPairs) {
      const hasId = values[idKey] !== undefined;
      const hasSecret = values[secretKey] !== undefined;
      if (hasId === hasSecret) continue;
      const missing = hasId ? secretKey : idKey;
      const present = hasId ? idKey : secretKey;
      ctx.addIssue({
        code: "custom",
        path: [missing],
        message: `is missing (required when ${present} is set)`,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  override name = "EnvValidationError";
}

/**
 * Validates environment variables and throws an `EnvValidationError` that
 * lists every problem. Messages name the variable but never echo its value.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse({ ...source, ...readClientEnv() });
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join(".");
    const value = source[key];
    const reason =
      issue.code !== "custom" && (value === undefined || value === "")
        ? "is missing"
        : issue.message;
    return `  - ${key} ${reason}`;
  });

  throw new EnvValidationError(
    [
      "Invalid environment variables:",
      ...problems,
      "Set them in .env.local (copy .env.example to start). See README > Local setup.",
    ].join("\n"),
  );
}

/**
 * `next build` imports route modules to collect page data, and those modules
 * import this one. The build must not need real configuration (CI builds
 * without secrets), so during the build phase only, required variables that
 * are unset get inert placeholders. The build never serves a request or
 * opens a database connection, and the running server re-reads and fully
 * validates the real environment at boot (src/instrumentation-node.ts).
 */
const BUILD_PHASE_PLACEHOLDERS = {
  DATABASE_URL: "postgres://build-placeholder@localhost:5432/build_placeholder",
  BETTER_AUTH_SECRET: "build-placeholder-never-used-at-runtime",
  BETTER_AUTH_URL: "http://localhost:3000",
  REMINDER_SWEEP_SECRET: "build-placeholder-never-used-at-runtime-0000",
};

function withBuildPlaceholders(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const result = { ...source };
  for (const [key, placeholder] of Object.entries(BUILD_PHASE_PLACEHOLDERS)) {
    if (!result[key]) result[key] = placeholder;
  }
  return result;
}

export const env = parseEnv(
  process.env.NEXT_PHASE === "phase-production-build"
    ? withBuildPlaceholders(process.env)
    : process.env,
);
