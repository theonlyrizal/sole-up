/**
 * `pnpm reminders:sweep`: runs one reminder sweep, for local use. There is
 * no cron locally, so this script plays cron-job.org's part (ADR 0013): it
 * calls `POST /api/reminders/sweep` on the running app with
 * `Authorization: Bearer $REMINDER_SWEEP_SECRET`. The sweep runs inside the
 * app, against the database the app is configured with, and the app logs its
 * "Reminder sweep finished" line. Start the app first with `pnpm dev`.
 *
 * Reads BETTER_AUTH_URL (the app's base URL) and REMINDER_SWEEP_SECRET from
 * the shell or .env.local. Never prints the secret.
 */
import { existsSync } from "node:fs";

const SWEEP_PATH = "/api/reminders/sweep";
// The first request to `pnpm dev` compiles the route, which can take a while.
const TIMEOUT_MS = 120_000;

function fail(message: string): never {
  console.error(`reminders:sweep: ${message}`);
  process.exit(1);
}

// Same loading rule as drizzle.config.ts: shell variables win over .env.local.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const secret = process.env.REMINDER_SWEEP_SECRET;
if (!secret) {
  fail("REMINDER_SWEEP_SECRET is not set (see .env.example).");
}
const baseUrl = process.env.BETTER_AUTH_URL;
if (!baseUrl) {
  fail("BETTER_AUTH_URL is not set (see .env.example).");
}

let url: URL;
try {
  url = new URL(SWEEP_PATH, baseUrl);
} catch {
  fail("BETTER_AUTH_URL is not a valid URL.");
}

let response: Response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
} catch {
  fail(`could not reach ${url.origin}. Is the app running (pnpm dev)?`);
}

if (response.status === 401) {
  fail(
    "the app refused the secret. Restart the app after changing REMINDER_SWEEP_SECRET.",
  );
}
if (!response.ok) {
  fail(`the sweep failed with HTTP ${response.status}; see the app's log.`);
}

console.log(
  `reminders:sweep: ${url.origin} ${JSON.stringify(await response.json())}`,
);
