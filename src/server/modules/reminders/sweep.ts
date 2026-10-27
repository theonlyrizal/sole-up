import "server-only";

import { logger as appLogger, type Logger } from "@/server/logging/logger";

import { claimDueReminders } from "./claim";

/** What one sweep did, by delivery outcome (ADR 0013). */
export type SweepCounts = {
  /** Due reminders claimed (moved to `sending`) by this sweep. */
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
};

export type SweepResult = {
  counts: SweepCounts;
  durationMs: number;
};

/**
 * One reminder sweep: claims the reminders due before the next sweep and
 * delivers them (ADR 0013). Called by `POST /api/reminders/sweep` every 15
 * minutes, and locally by `pnpm reminders:sweep`.
 *
 * It claims the due reminders (moving them to `sending`). Sending them is
 * 5.5's, so until then claimed rows stay `sending`. The log line holds the
 * start, the counts and the duration, never a reminder or its content.
 */
export async function runSweep(
  now: Date,
  log: Logger = appLogger,
): Promise<SweepResult> {
  const startedAt = performance.now();
  const claimed = await claimDueReminders(now);
  const counts: SweepCounts = {
    claimed: claimed.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  const durationMs = Math.round(performance.now() - startedAt);
  log.info(
    {
      source: "reminders",
      sweepStartedAt: now.toISOString(),
      counts,
      durationMs,
    },
    "Reminder sweep finished",
  );
  return { counts, durationMs };
}
