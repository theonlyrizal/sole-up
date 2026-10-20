import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as EnvModule from "./env";

const VALID_URL = "postgres://user:pass@localhost:5432/soleup_dev";

let parseEnv: typeof EnvModule.parseEnv;
let EnvValidationError: typeof EnvModule.EnvValidationError;

beforeAll(async () => {
  // env.ts also parses process.env on import, which unit tests don't set up.
  vi.stubEnv("DATABASE_URL", VALID_URL);
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
    const env = parseEnv({ DATABASE_URL: VALID_URL });
    expect(env.DATABASE_URL).toBe(VALID_URL);
    expect(env.NODE_ENV).toBe("development");
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
  });

  it("accepts the postgresql:// scheme", () => {
    const url = "postgresql://user:pass@localhost:5432/soleup_dev";
    expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it("reports a missing or empty DATABASE_URL as missing", () => {
    expect(problemsFor({})).toContain("DATABASE_URL is missing");
    expect(problemsFor({ DATABASE_URL: "" })).toContain(
      "DATABASE_URL is missing",
    );
  });

  it("rejects a non-Postgres URL without echoing its value", () => {
    const secretish = "mysql://admin:hunter2@db.internal/app";
    const message = problemsFor({ DATABASE_URL: secretish });
    expect(message).toContain("DATABASE_URL must be a postgres://");
    expect(message).not.toContain("hunter2");
  });

  it("treats empty optional variables as unset", () => {
    const env = parseEnv({ DATABASE_URL: VALID_URL, BETTER_AUTH_SECRET: "" });
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
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
