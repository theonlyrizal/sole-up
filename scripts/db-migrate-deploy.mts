/**
 * `pnpm db:migrate:deploy`: applies pending migrations to the database in
 * DATABASE_URL. This is the release step: the host runs it after the build
 * and before the new version serves traffic (render.yaml, docs/DEPLOY.md).
 *
 * Unlike `pnpm db:migrate` (drizzle-kit, a dev dependency, reads .env.local),
 * it reads only the process environment, uses the app's own drizzle-orm
 * migrator (same journal table, so the two are interchangeable), and never
 * prints the connection URL or error messages that could quote it.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const MIGRATIONS_FOLDER = "./src/server/db/migrations";

function fail(message: string): never {
  console.error(`db:migrate:deploy: ${message}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) fail("DATABASE_URL is not set.");

let target: string;
try {
  const url = new URL(connectionString);
  target = `${url.pathname.slice(1)} on ${url.hostname}`;
} catch {
  fail("DATABASE_URL is not a valid URL.");
}

const pool = new pg.Pool({
  connectionString,
  max: 1,
  // A suspended serverless database (Neon Free) can take a few seconds to wake.
  connectionTimeoutMillis: 30_000,
});

console.log(`db:migrate:deploy: migrating ${target}...`);
try {
  // Runs every pending migration in one transaction: all apply or none do.
  await migrate(drizzle({ client: pool }), {
    migrationsFolder: MIGRATIONS_FOLDER,
  });
  console.log("db:migrate:deploy: done.");
} catch (error) {
  // Postgres error messages can quote values; the code (a SQLSTATE, or a
  // network code such as ECONNREFUSED) identifies the failure. Drizzle wraps
  // the driver's error, so look through causes.
  let code: string | undefined;
  for (
    let e: unknown = error;
    e && !code;
    e = (e as { cause?: unknown }).cause
  ) {
    if (typeof e === "object" && "code" in e) code = String(e.code);
  }
  const name = error instanceof Error ? error.name : "Error";
  fail(
    `migration failed: ${name}${code ? ` (code ${code})` : ""}. No migration was applied.`,
  );
} finally {
  await pool.end();
}
