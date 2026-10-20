import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./client";

export type DatabaseHealth = "ok" | "unavailable";

export const DATABASE_CHECK_TIMEOUT_MS = 2_000;

/**
 * Checks that the database answers a trivial query within the timeout.
 * Never throws: any failure, including a timeout, is "unavailable". The
 * query is injectable for tests.
 */
export async function checkDatabase(
  query: () => Promise<unknown> = () => db.execute(sql`select 1`),
  timeoutMs = DATABASE_CHECK_TIMEOUT_MS,
): Promise<{ status: DatabaseHealth; error?: unknown }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DatabaseCheckTimeoutError()),
      timeoutMs,
    );
  });
  try {
    await Promise.race([query(), timeout]);
    return { status: "ok" };
  } catch (error) {
    return { status: "unavailable", error };
  } finally {
    clearTimeout(timer);
  }
}

export class DatabaseCheckTimeoutError extends Error {
  override name = "DatabaseCheckTimeoutError";
  constructor() {
    super("Database check timed out");
  }
}
