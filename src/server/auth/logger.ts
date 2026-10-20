/**
 * Better Auth logs extra arguments as-is, including database errors whose
 * message and `params` hold OAuth state, PKCE verifiers or tokens. That breaks
 * the "Never log" rule (docs/IMPLEMENTATION_PLAN.md), so this logger keeps
 * Better Auth's own message and, for errors, only the error class and the
 * Postgres error code and message (which name tables and constraints, never
 * values). Every other argument is dropped.
 */

import { currentRequestId, loggerFor } from "@/server/logging/request";

type Level = "debug" | "info" | "warn" | "error";

const SQLSTATE = /^[0-9A-Z]{5}$/;

function describeError(error: Error): string {
  const parts = [error.name];
  // Drizzle wraps the driver error; its own message embeds the SQL params.
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string" && SQLSTATE.test(code)) {
      parts.push(`postgres ${code}: ${cause.message}`);
    } else {
      parts.push(cause.name);
    }
  }
  return parts.join(" | ");
}

/**
 * Better Auth sometimes logs a database error's message directly, and
 * Drizzle's messages embed the query and its params. Keep only the part
 * before the query.
 */
function safeMessage(message: string): string {
  const query = message.search(/failed query:|params:/i);
  return (
    query === -1 ? message : message.slice(0, query) + "[query redacted]"
  ).trim();
}

/** Formats one log line. Exported for tests. */
export function formatAuthLog(
  level: Level,
  message: string,
  args: unknown[],
): string {
  const errors = args.filter((arg): arg is Error => arg instanceof Error);
  const details = errors.map(describeError);
  const dropped = args.length - errors.length;
  if (dropped > 0) details.push(`${dropped} detail(s) redacted`);
  const suffix = details.length > 0 ? ` (${details.join("; ")})` : "";
  return `[Better Auth] ${level.toUpperCase()} ${safeMessage(message)}${suffix}`;
}

/**
 * Better Auth's `logger.log`. Writes through the app logger (pino), with the
 * request ID the auth route handler sets (runWithRequestId).
 */
export function logAuth(level: Level, message: string, ...args: unknown[]) {
  loggerFor(currentRequestId())[level](
    { source: "better-auth" },
    formatAuthLog(level, message, args),
  );
}
