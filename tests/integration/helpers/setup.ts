import { afterAll, beforeEach } from "vitest";

import { db } from "@/server/db/client";
import { env } from "@/server/env";

import { assertTestDatabaseUrl, truncateUserTables } from "./database";

// Runs in every integration test file. Re-check the target before deleting
// anything, in case DATABASE_URL was overridden after global setup.
assertTestDatabaseUrl(env.DATABASE_URL);

beforeEach(async () => {
  await truncateUserTables(db.$client);
});

afterAll(async () => {
  // Each test file gets its own module graph, and so its own pool.
  await db.$client.end();
});
