import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/server/logging/logger";

import { captureLogs } from "../../../../tests/helpers/logs";
import { claimDueReminders } from "./claim";
import { runSweep } from "./sweep";

// The claim needs the database; the integration tests cover it for real.
vi.mock("./claim", () => ({ claimDueReminders: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runSweep", () => {
  it("claims with the sweep's time and logs one line with the start, counts and duration", async () => {
    vi.mocked(claimDueReminders).mockResolvedValueOnce([
      { id: "a" },
      { id: "b" },
    ] as Awaited<ReturnType<typeof claimDueReminders>>);
    const logs = captureLogs();
    const now = new Date("2026-10-27T09:15:00.000Z");

    const result = await runSweep(now, logger);

    expect(claimDueReminders).toHaveBeenCalledWith(now);
    expect(result).toEqual({
      counts: { claimed: 2, sent: 0, skipped: 0, failed: 0 },
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

  it("returns zero counts when nothing is due", async () => {
    vi.mocked(claimDueReminders).mockResolvedValueOnce([]);
    captureLogs();

    const result = await runSweep(new Date(), logger);

    expect(result.counts).toEqual({
      claimed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
  });
});
