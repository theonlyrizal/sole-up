import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { TestProject } from "vitest/node";

import { assertTestDatabaseUrl } from "./database";

/**
 * Runs once per `integration` run, before any test file: checks that the
 * target is a local test database, then applies all pending migrations.
 * Uses the same journal (`drizzle.__drizzle_migrations`) as `pnpm db:migrate`.
 */
export default async function setup(project: TestProject) {
  const url = assertTestDatabaseUrl(project.config.env.TEST_DATABASE_URL);

  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: "src/server/db/migrations",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not migrate the test database: ${reason}\nIs Postgres running? Try \`docker compose up -d --wait\`.`,
    );
  } finally {
    await pool.end();
  }
}
