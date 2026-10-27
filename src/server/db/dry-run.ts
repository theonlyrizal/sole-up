import "server-only";

import { db, type DbTransaction } from "./client";

/** Carries a dry run's result out of the transaction it rolls back. */
class RollbackWith<T> extends Error {
  constructor(readonly result: T) {
    super("Dry run rolled back");
  }
}

/**
 * Runs `change` in a transaction and rolls it back, returning what it
 * would have returned. Domain and validation errors pass through as they
 * would on the real change. Used for the scope prompts' previews, so a
 * preview can never disagree with saving.
 */
export async function dryRun<T>(
  change: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  try {
    await db.transaction(async (tx) => {
      throw new RollbackWith(await change(tx));
    });
  } catch (error) {
    if (error instanceof RollbackWith) return error.result as T;
    throw error;
  }
  throw new Error("Dry run committed");
}
