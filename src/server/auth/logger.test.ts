import { describe, expect, it } from "vitest";

import { formatAuthLog } from "./logger";

/** Shaped like Drizzle's DrizzleQueryError wrapping a pg error. */
function drizzleError() {
  const cause = Object.assign(
    new Error('relation "verifications" does not exist'),
    { code: "42P01" },
  );
  return Object.assign(
    new Error(
      'Failed query: insert into "verifications" values ($1)\nparams: auth-state:SECRET-STATE,{"codeVerifier":"SECRET-VERIFIER"}',
      { cause },
    ),
    { name: "DrizzleQueryError", params: ["SECRET-STATE"] },
  );
}

describe("formatAuthLog", () => {
  it("keeps the message, error class and Postgres code, never params", () => {
    const line = formatAuthLog("error", "Error", [drizzleError()]);
    expect(line).toBe(
      '[Better Auth] ERROR Error (DrizzleQueryError | postgres 42P01: relation "verifications" does not exist)',
    );
    expect(line).not.toContain("SECRET");
  });

  it("redacts a query embedded in the message itself", () => {
    const line = formatAuthLog("error", drizzleError().message, []);
    expect(line).toBe("[Better Auth] ERROR [query redacted]");
  });

  it("drops non-error arguments such as profiles or tokens", () => {
    const line = formatAuthLog("warn", "Unable to link account", [
      { email: "ada@example.test", accessToken: "SECRET-TOKEN" },
      "SECRET-STRING",
    ]);
    expect(line).toBe(
      "[Better Auth] WARN Unable to link account (2 detail(s) redacted)",
    );
  });
});
