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
  it("keeps a fixed message and Postgres code, never params", () => {
    const line = formatAuthLog("error", "Error", [drizzleError()]);
    expect(line).toBe(
      "[Better Auth] ERROR Authentication event (Error | postgres 42P01)",
    );
    expect(line).not.toContain("SECRET");
  });

  it("redacts a query embedded in the message itself", () => {
    const line = formatAuthLog("error", drizzleError().message, []);
    expect(line).toBe("[Better Auth] ERROR Authentication event");
  });

  it("drops non-error arguments such as profiles or tokens", () => {
    const line = formatAuthLog("warn", "Unable to link account", [
      { email: "ada@example.test", accessToken: "SECRET-TOKEN" },
      "SECRET-STRING",
    ]);
    expect(line).toBe(
      "[Better Auth] WARN Authentication event (2 detail(s) redacted)",
    );
  });

  it("drops private values in driver messages, names and plain messages", () => {
    const cause = Object.assign(new Error('invalid input: "PRIVATE-NOTE"'), {
      code: "22P02",
    });
    const error = Object.assign(new Error("PRIVATE-TOKEN", { cause }), {
      name: "PRIVATE-EMAIL",
    });
    const line = formatAuthLog("error", "Failed for PRIVATE-USER", [error]);
    expect(line).toContain("22P02");
    expect(line).not.toContain("PRIVATE");
  });
});
