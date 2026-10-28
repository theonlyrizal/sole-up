import "server-only";

import { eq, sql } from "drizzle-orm";

import { isSweepOverdue } from "@/lib/reminders";
import { db } from "@/server/db/client";
import { reminderSweepStatus } from "@/server/db/schema";

// When the sweep last ran (chunk 5.7), for Settings' warning that reminders
// have stopped (`isSweepOverdue` in src/lib/reminders.ts). One row for the
// whole app; it holds no user data.

/**
 * Records that a sweep finished at `now`. An earlier sweep that finishes
 * after a later one (they can overlap) never moves the time back.
 */
export async function recordSweepFinished(now: Date): Promise<void> {
  await db
    .insert(reminderSweepStatus)
    .values({ id: 1, lastSweepAt: now })
    .onConflictDoUpdate({
      target: reminderSweepStatus.id,
      set: {
        lastSweepAt: sql`greatest(${reminderSweepStatus.lastSweepAt}, excluded.last_sweep_at)`,
      },
    });
}

/** When the latest sweep finished, or null when none has yet. */
export async function lastSweepAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastSweepAt: reminderSweepStatus.lastSweepAt })
    .from(reminderSweepStatus)
    .where(eq(reminderSweepStatus.id, 1));
  return row?.lastSweepAt ?? null;
}

/** Whether sweeps have stopped as of `now`, and when the last one ran. */
export async function sweepHealth(
  now: Date = new Date(),
): Promise<{ overdue: boolean; lastSweepAt: Date | null }> {
  const last = await lastSweepAt();
  return { overdue: isSweepOverdue(last, now), lastSweepAt: last };
}
