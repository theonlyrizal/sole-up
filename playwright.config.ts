import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

/** Like vitest.config.mts: a shell variable wins over .env.local. */
function readTestDatabaseUrl(): string {
  const fileEnv = existsSync(".env.local")
    ? parseEnv(readFileSync(".env.local", "utf8"))
    : {};
  return process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL ?? "";
}

export const testDatabaseUrl = readTestDatabaseUrl();

/**
 * End-to-end tests in tests/e2e. Playwright starts its own app server on
 * port 3100 against the test database (migrated in global setup), with the
 * test sign-in shortcut on: the dev server locally, a production build in
 * CI. It never reads real OAuth credentials, so tests cannot reach a real
 * provider. With NODE_ENV=test, Next.js does not load .env.local, so every
 * variable the app needs is set here.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: isCI
      ? `pnpm build && pnpm start --port ${PORT}`
      : `pnpm dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: {
      NODE_ENV: "test",
      SOLEUP_TEST_SIGN_IN: "1",
      // Its own build folder, so it can run next to `pnpm dev`.
      SOLEUP_NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_URL: baseURL,
      // Test-only: signs sessions in the local test database only.
      BETTER_AUTH_SECRET: "e2e-tests-only-secret-not-for-real-use",
      // Placeholder credentials so the sign-in buttons render. No test
      // clicks them: that would leave for the real provider.
      GOOGLE_CLIENT_ID: "e2e-placeholder",
      GOOGLE_CLIENT_SECRET: "e2e-placeholder",
      GITHUB_CLIENT_ID: "e2e-placeholder",
      GITHUB_CLIENT_SECRET: "e2e-placeholder",
    },
  },
});
