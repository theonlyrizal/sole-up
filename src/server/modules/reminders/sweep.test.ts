import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/server/logging/logger";

import { captureLogs } from "../../../../tests/helpers/logs";
import { claimDueReminders } from "./claim";
import { runSweep } from "./sweep";

// Delivery needs the database and push; the integration tests cover them
// (reminders.integration.test.ts). Here the claim finds nothing due.
vi.mock("./claim", () => ({ claimDueReminders: vi.fn() }));
vi.mock("./record", () => ({ recordDelivery: vi.fn() }));
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/modules/push/send", () => ({ sendPush: vi.fn() }));
vi.mock("@/server/modules/push/service", () => ({
  pushTargetsFor: vi.fn(),
  recordPushOutcome: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runSweep", () => {
  it("claims with the sweep's time and logs one line with the start, counts and duration", async () => {
    vi.mocked(claimDueReminders).mockResolvedValueOnce([]);
    const logs = captureLogs();
    const now = new Date("2026-10-27T09:15:00.000Z");

    const result = await runSweep(now, logger);

    expect(claimDueReminders).toHaveBeenCalledWith(now);
    expect(result).toEqual({
      counts: {
        claimed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        held: 0,
        retrying: 0,
      },
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
