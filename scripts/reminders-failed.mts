/**
 * `pnpm reminders:failed`: prints the reminders that failed to send (3
 * attempts, ADR 0013), grouped by error code, with how long ago they
 * failed. There is no admin role, so this is how the developer checks
 * delivery problems (chunk 5.7).
 *
 * Prints counts, error codes and ages only: no titles, users, IDs,
 * payloads or subscriptions. Read-only.
 *
 * Reads DATABASE_URL from the shell or .env.local. To check production, run
 * it with the Neon direct connection string in DATABASE_URL (DEPLOY.md >
 * Reminder sweep). Never prints the URL.
 */
import { existsSync } from "node:fs";

import pg from "pg";

function fail(message: string): never {
  console.error(`reminders:failed: ${message}`);
  process.exit(1);
}

// Same loading rule as drizzle.config.ts: shell variables win over .env.local.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

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
const target = `${url.pathname.slice(1)} on ${url.hostname}`;

type Group = {
  code: string;
  total: number;
  last_day: number;
  last_week: number;
  older: number;
  newest_seconds: number;
  oldest_seconds: number;
};

// A failed row's `updated_at` is when its last attempt failed.
const QUERY = `
  SELECT coalesce(last_error_code, 'unknown') AS code,
         count(*)::int AS total,
         count(*) FILTER (WHERE updated_at >= now() - interval '1 day')::int
           AS last_day,
         count(*) FILTER (WHERE updated_at < now() - interval '1 day'
                            AND updated_at >= now() - interval '7 days')::int
           AS last_week,
         count(*) FILTER (WHERE updated_at < now() - interval '7 days')::int
           AS older,
         extract(epoch FROM now() - max(updated_at))::int AS newest_seconds,
         extract(epoch FROM now() - min(updated_at))::int AS oldest_seconds
    FROM reminders
   WHERE status = 'failed'
   GROUP BY 1
   ORDER BY total DESC, code`;

/** "12 min", "5 h" or "3 days" ago. */
function age(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

const client = new pg.Client({ connectionString });
let groups: Group[];
try {
  await client.connect();
  groups = (await client.query<Group>(QUERY)).rows;
} catch (error) {
  // The error's name only: driver messages can quote connection details.
  fail(
    `could not read ${target} (${error instanceof Error ? error.name : "error"}). Is the database running and migrated?`,
  );
} finally {
  await client.end();
}

const total = groups.reduce((sum, group) => sum + group.total, 0);
if (total === 0) {
  console.log(`reminders:failed: no failed reminders in ${target}.`);
  process.exit(0);
}

console.log(
  `reminders:failed: ${total} failed reminder${total === 1 ? "" : "s"} in ${target}\n`,
);
const header = [
  "Error code",
  "Total",
  "< 1 day",
  "1–7 days",
  "Older",
  "Newest",
  "Oldest",
];
const rows = groups.map((group) => [
  group.code,
  String(group.total),
  String(group.last_day),
  String(group.last_week),
  String(group.older),
  `${age(group.newest_seconds)} ago`,
  `${age(group.oldest_seconds)} ago`,
]);
const widths = header.map((title, column) =>
  Math.max(title.length, ...rows.map((row) => row[column]!.length)),
);
for (const row of [header, ...rows]) {
  console.log(
    row.map((cell, column) => cell.padEnd(widths[column]!)).join("  "),
  );
}
