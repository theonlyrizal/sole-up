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

  // Authentication. Optional until chunk 0.6 wires up Better Auth.
  BETTER_AUTH_SECRET: optional(
    z.string().min(32, "must be at least 32 characters"),
  ),
  BETTER_AUTH_URL: optional(z.url({ error: "must be an absolute URL" })),
  GOOGLE_CLIENT_ID: optional(z.string()),
  GOOGLE_CLIENT_SECRET: optional(z.string()),
  GITHUB_CLIENT_ID: optional(z.string()),
  GITHUB_CLIENT_SECRET: optional(z.string()),
});

const envSchema = serverEnvSchema.extend(clientEnvSchema.shape);

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
      value === undefined || value === "" ? "is missing" : issue.message;
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

export const env = parseEnv(process.env);
