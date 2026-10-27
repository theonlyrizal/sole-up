import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/server/logging/logger";

import { captureLogs } from "../../../../tests/helpers/logs";
import { runSweep } from "./sweep";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runSweep", () => {
  it("returns zero counts and logs one line with the start, counts and duration", async () => {
    const logs = captureLogs();
    const now = new Date("2026-10-27T09:15:00.000Z");

    const result = await runSweep(now, logger);

    expect(result).toEqual({
      counts: { claimed: 0, sent: 0, skipped: 0, failed: 0 },
      durationMs: expect.any(Number),
    });
    expect(logs.entries()).toEqual([
      expect.objectContaining({
        level: "info",
        msg: "Reminder sweep finished",
        source: "reminders",
        sweepStartedAt: "2026-10-27T09:15:00.000Z",
        counts: result.counts,
        durationMs: result.durationMs,
      }),
    ]);
  });
});
