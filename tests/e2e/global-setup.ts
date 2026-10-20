import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { testDatabaseUrl } from "../../playwright.config";
import { assertTestDatabaseUrl } from "../integration/helpers/database";

/**
 * The e2e app server uses the local test database. Migrate it first, with the
 * same safety check as the integration tests. E2E tests do not truncate:
 * each test signs in as a fresh user with a unique email instead.
 */
export default async function globalSetup() {
  const url = assertTestDatabaseUrl(testDatabaseUrl);
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: "src/server/db/migrations",
    });
  } finally {
    await pool.end();
  }
}
