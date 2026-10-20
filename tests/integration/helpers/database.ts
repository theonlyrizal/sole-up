import type { ClientBase, Pool } from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Integration tests empty every table between tests, so only accept a URL that
 * clearly names a local test database: a local host and a database name that
 * ends in `_test`. Returns the URL, or throws a readable error.
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Add it to .env.local (see .env.example and README > Testing).",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL.");
  }

  const database = parsed.pathname.slice(1);
  if (!LOCAL_HOSTS.has(parsed.hostname) || !database.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL must point at a local database whose name ends in "_test" (got "${database}" on "${parsed.hostname}"). Integration tests delete all data in it.`,
    );
  }
  return url;
}

/**
 * Empties every table in the `public` schema, which holds all app tables.
 * The migration journal lives in the `drizzle` schema and is kept, so the
 * schema itself stays migrated.
 */
export async function truncateUserTables(
  client: Pool | ClientBase,
): Promise<void> {
  const { rows } = await client.query<{ name: string }>(
    `SELECT quote_ident(tablename) AS name
       FROM pg_tables
      WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;

  const tables = rows.map((row) => `public.${row.name}`).join(", ");
  await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
