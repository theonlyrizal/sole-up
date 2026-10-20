/**
 * `pnpm db:reset`: drops every table in the target database so that
 * `drizzle-kit migrate` (run next by the script) rebuilds it from scratch.
 *
 * Development only. Refuses to run when NODE_ENV=production or when
 * DATABASE_URL points at a host other than this machine.
 */
import { existsSync } from "node:fs";

import pg from "pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function fail(message: string): never {
  console.error(`db:reset: ${message}`);
  process.exit(1);
}

// Same loading rule as drizzle.config.ts: shell variables win over .env.local.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

if (process.env.NODE_ENV === "production") {
  fail("refusing to run with NODE_ENV=production.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  fail("DATABASE_URL is not set (see README > Local setup).");
}

let url: URL;
try {
  url = new URL(connectionString);
} catch {
  fail("DATABASE_URL is not a valid URL.");
}
if (!LOCAL_HOSTS.has(url.hostname)) {
  fail(`refusing to reset a database on non-local host "${url.hostname}".`);
}
const target = `${url.pathname.slice(1)} on ${url.hostname}`;

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  // `drizzle` holds the migration journal; `public` holds the app tables.
  await client.query(`
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
  `);
} catch (error) {
  fail(
    `could not reset ${target}: ${error instanceof Error ? error.message : String(error)}`,
  );
} finally {
  await client.end();
}

console.log(`db:reset: emptied ${target}. Re-applying migrations...`);
