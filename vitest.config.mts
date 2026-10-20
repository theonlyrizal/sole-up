import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

/**
 * The integration database URL. A shell variable wins over .env.local, like
 * drizzle.config.ts. The file is parsed rather than loaded, so its
 * DATABASE_URL (the dev database) never leaks into test workers. The URL is
 * checked for safety in tests/integration/helpers/global-setup.ts.
 */
function readTestDatabaseUrl(): string {
  const fileEnv = existsSync(".env.local")
    ? parseEnv(readFileSync(".env.local", "utf8"))
    : {};
  return process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL ?? "";
}

const testDatabaseUrl = readTestDatabaseUrl();

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // `server-only` throws outside a React Server Components bundler. Tests
      // run server code directly, so use the package's no-op entry.
      "server-only": fromRoot("./node_modules/server-only/empty.js"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["**/*.integration.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: [
            "src/**/*.integration.test.{ts,tsx}",
            "tests/integration/**/*.integration.test.{ts,tsx}",
          ],
          env: {
            NODE_ENV: "test",
            TEST_DATABASE_URL: testDatabaseUrl,
            // The app's db client reads DATABASE_URL, so point it at the
            // test database for every integration worker.
            DATABASE_URL: testDatabaseUrl,
            // Better Auth needs these at import. Fixed, test-only values:
            // this secret signs sessions in the test database only.
            BETTER_AUTH_SECRET:
              "integration-tests-only-secret-not-for-real-use",
            BETTER_AUTH_URL: "http://localhost:3000",
            // No OAuth credentials reach integration tests: no provider is
            // configured, whatever the shell or .env.local holds.
            GOOGLE_CLIENT_ID: "",
            GOOGLE_CLIENT_SECRET: "",
            GITHUB_CLIENT_ID: "",
            GITHUB_CLIENT_SECRET: "",
          },
          globalSetup: ["tests/integration/helpers/global-setup.ts"],
          setupFiles: ["tests/integration/helpers/setup.ts"],
          // Files share one database and truncate it between tests, so they
          // must not run at the same time.
          fileParallelism: false,
        },
      },
    ],
  },
});
