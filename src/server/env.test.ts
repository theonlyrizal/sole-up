import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as EnvModule from "./env";

const VALID_URL = "postgres://user:pass@localhost:5432/soleup_dev";
const AUTH = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};
const SWEEP = { REMINDER_SWEEP_SECRET: "s".repeat(43) };
const MINIMAL = { DATABASE_URL: VALID_URL, ...AUTH, ...SWEEP };

let parseEnv: typeof EnvModule.parseEnv;
let EnvValidationError: typeof EnvModule.EnvValidationError;

beforeAll(async () => {
  // env.ts also parses process.env on import, which unit tests don't set up.
  vi.stubEnv("DATABASE_URL", VALID_URL);
  vi.stubEnv("BETTER_AUTH_SECRET", AUTH.BETTER_AUTH_SECRET);
  vi.stubEnv("BETTER_AUTH_URL", AUTH.BETTER_AUTH_URL);
  vi.stubEnv("REMINDER_SWEEP_SECRET", SWEEP.REMINDER_SWEEP_SECRET);
  ({ parseEnv, EnvValidationError } = await import("./env"));
  vi.unstubAllEnvs();
});

function problemsFor(source: Record<string, string | undefined>): string {
  try {
    parseEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return (error as Error).message;
  }
  throw new Error("expected parseEnv to throw");
}

describe("parseEnv", () => {
  it("accepts a minimal valid environment and applies defaults", () => {
    const env = parseEnv(MINIMAL);
    expect(env.DATABASE_URL).toBe(VALID_URL);
    expect(env.NODE_ENV).toBe("development");
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("accepts the postgresql:// scheme", () => {
    const url = "postgresql://user:pass@localhost:5432/soleup_dev";
    expect(parseEnv({ ...MINIMAL, DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it("reports a missing or empty DATABASE_URL as missing", () => {
    expect(problemsFor({ ...AUTH })).toContain("DATABASE_URL is missing");
    expect(problemsFor({ ...AUTH, DATABASE_URL: "" })).toContain(
      "DATABASE_URL is missing",
    );
  });

  it("rejects a non-Postgres URL without echoing its value", () => {
    const secretish = "mysql://admin:hunter2@db.internal/app";
    const message = problemsFor({ ...AUTH, DATABASE_URL: secretish });
    expect(message).toContain("DATABASE_URL must be a postgres://");
    expect(message).not.toContain("hunter2");
  });

  it("treats empty optional variables as unset", () => {
    const env = parseEnv({ ...MINIMAL, GITHUB_CLIENT_ID: "" });
    expect(env.GITHUB_CLIENT_ID).toBeUndefined();
  });

  it("requires the Better Auth secret and URL", () => {
    const message = problemsFor({ DATABASE_URL: VALID_URL });
    expect(message).toContain("BETTER_AUTH_SECRET is missing");
    expect(message).toContain("BETTER_AUTH_URL is missing");
  });

  it("requires a reminder sweep secret of at least 32 random bytes", () => {
    expect(problemsFor({ DATABASE_URL: VALID_URL, ...AUTH })).toContain(
      "REMINDER_SWEEP_SECRET is missing",
    );
    const short = "s".repeat(42);
    const message = problemsFor({ ...MINIMAL, REMINDER_SWEEP_SECRET: short });
    expect(message).toContain("REMINDER_SWEEP_SECRET must be at least 43");
    expect(message).not.toContain(short);
  });

  it("accepts a fully configured provider", () => {
    const env = parseEnv({
      ...MINIMAL,
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    });
    expect(env.GOOGLE_CLIENT_ID).toBe("id");
  });

  it("rejects a provider with only half of its credentials", () => {
    const message = problemsFor({
      ...MINIMAL,
      GOOGLE_CLIENT_ID: "id",
      GITHUB_CLIENT_SECRET: "do-not-echo",
    });
    expect(message).toContain(
      "GOOGLE_CLIENT_SECRET is missing (required when GOOGLE_CLIENT_ID is set)",
    );
    expect(message).toContain(
      "GITHUB_CLIENT_ID is missing (required when GITHUB_CLIENT_SECRET is set)",
    );
    expect(message).not.toContain("do-not-echo");
  });

  it("lists every problem at once", () => {
    const message = problemsFor({
      BETTER_AUTH_SECRET: "too-short",
      BETTER_AUTH_URL: "not a url",
    });
    expect(message).toContain("DATABASE_URL is missing");
    expect(message).toContain("BETTER_AUTH_SECRET must be at least 32");
    expect(message).toContain("BETTER_AUTH_URL must be an absolute URL");
    expect(message).not.toContain("too-short");
  });
});

describe("env at import", () => {
  async function importEnvWith(values: Record<string, string>) {
    vi.resetModules();
    for (const key of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "REMINDER_SWEEP_SECRET",
    ])
      vi.stubEnv(key, "");
    for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
    try {
      return await import("./env");
    } finally {
      vi.unstubAllEnvs();
    }
  }

  it("fails fast at runtime when required variables are missing", async () => {
    await expect(importEnvWith({})).rejects.toThrow(
      "BETTER_AUTH_SECRET is missing",
    );
  });

  it("uses inert placeholders only during `next build`", async () => {
    const { env } = await importEnvWith({
      NEXT_PHASE: "phase-production-build",
    });
    expect(env.BETTER_AUTH_SECRET).toContain("build-placeholder");
    expect(env.REMINDER_SWEEP_SECRET).toContain("build-placeholder");
  });

  it("never replaces a real value during `next build`", async () => {
    const { env } = await importEnvWith({
      NEXT_PHASE: "phase-production-build",
      ...MINIMAL,
    });
    expect(env.BETTER_AUTH_SECRET).toBe(AUTH.BETTER_AUTH_SECRET);
  });
});
