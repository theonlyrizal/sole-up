import { afterEach, describe, expect, it, vi } from "vitest";

import { isTestSignInEnabled } from "./test-sign-in";

// If the route ever got past its guard, it would import these. Make that
// impossible to miss: importing them fails the test.
vi.mock("@/server/auth/test-session", () => {
  throw new Error("test-session must not be imported when the shortcut is off");
});
vi.mock("@/server/db/client", () => {
  throw new Error("the database must not be touched when the shortcut is off");
});

describe("isTestSignInEnabled", () => {
  it("is on only for NODE_ENV=test with SOLEUP_TEST_SIGN_IN=1", () => {
    expect(
      isTestSignInEnabled({ NODE_ENV: "test", SOLEUP_TEST_SIGN_IN: "1" }),
    ).toBe(true);
  });

  it.each([
    { NODE_ENV: "production", SOLEUP_TEST_SIGN_IN: "1" },
    { NODE_ENV: "development", SOLEUP_TEST_SIGN_IN: "1" },
    { NODE_ENV: undefined, SOLEUP_TEST_SIGN_IN: "1" },
    { NODE_ENV: "test", SOLEUP_TEST_SIGN_IN: undefined },
    { NODE_ENV: "test", SOLEUP_TEST_SIGN_IN: "" },
    { NODE_ENV: "test", SOLEUP_TEST_SIGN_IN: "0" },
    { NODE_ENV: "test", SOLEUP_TEST_SIGN_IN: "true" },
    { NODE_ENV: "test", SOLEUP_TEST_SIGN_IN: " 1" },
    { NODE_ENV: "TEST", SOLEUP_TEST_SIGN_IN: "1" },
  ])("is off for %o", (source) => {
    expect(isTestSignInEnabled(source)).toBe(false);
  });
});

describe("POST /api/test/sign-in", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function postInMode(env: Record<string, string>) {
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/soleup_dev");
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32));
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("SOLEUP_TEST_SIGN_IN", "");
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    // env.ts parses process.env on import, so load the route fresh.
    vi.resetModules();
    const { POST } = await import("@/app/api/test/sign-in/route");
    return POST(
      new Request("http://localhost:3000/api/test/sign-in", {
        method: "POST",
        body: JSON.stringify({ email: "someone@example.test" }),
      }),
    );
  }

  it.each([
    { NODE_ENV: "production", SOLEUP_TEST_SIGN_IN: "1" },
    { NODE_ENV: "development", SOLEUP_TEST_SIGN_IN: "1" },
    { NODE_ENV: "test", SOLEUP_TEST_SIGN_IN: "" },
    { NODE_ENV: "test", SOLEUP_TEST_SIGN_IN: "yes" },
  ])("answers 404 without a session cookie for %o", async (mode) => {
    const response = await postInMode(mode);
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
