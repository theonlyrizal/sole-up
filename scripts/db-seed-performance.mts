/** Replace only the reserved synthetic users, atomically, in a local _perf DB. */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import pg from "pg";

import { performanceDatabaseUrl } from "./performance/database.mjs";

const { values } = parseArgs({
  options: { "as-of": { type: "string" }, users: { type: "string" } },
});
const asOf = values["as-of"] ?? new Date().toISOString().slice(0, 10);
const users = Number(values.users ?? 24);
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
  Number.isNaN(Date.parse(asOf)) ||
  new Date(asOf).toISOString().slice(0, 10) !== asOf ||
  !Number.isInteger(users) ||
  users < 1 ||
  users > 100
) {
  throw new Error("Use --as-of=YYYY-MM-DD and --users=1..100.");
}

const client = new pg.Client({ connectionString: performanceDatabaseUrl() });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(107, 1)");
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  await client.query("CREATE TEMP TABLE seed_config (as_of date, users int)");
  await client.query("INSERT INTO seed_config VALUES ($1, $2)", [asOf, users]);
  await client.query(
    await readFile(new URL("./performance/seed.sql", import.meta.url), "utf8"),
  );
  await client.query("COMMIT");
  // Refresh statistics and visibility maps before comparing warm plans.
  await client.query("VACUUM (ANALYZE)");
  const { rows } = await client.query(`
    SELECT 'users' AS relation, count(*)::int AS rows FROM users
    UNION ALL SELECT 'tasks', count(*)::int FROM tasks
    UNION ALL SELECT 'audit_events', count(*)::int FROM audit_events
    UNION ALL SELECT 'habit_logs', count(*)::int FROM habit_logs
    UNION ALL SELECT 'calendar_events', count(*)::int FROM calendar_events
    UNION ALL SELECT 'time_blocks', count(*)::int FROM time_blocks
    UNION ALL SELECT 'notes', count(*)::int FROM notes
  `);
  console.log(
    JSON.stringify({ asOf, users, days: 365, counts: rows }, null, 2),
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  // PostgreSQL messages can echo values. Report structural diagnostics only.
  console.error("Performance seed failed", {
    code: (error as pg.DatabaseError).code,
    constraint: (error as pg.DatabaseError).constraint,
  });
  process.exitCode = 1;
} finally {
  await client.end();
}
