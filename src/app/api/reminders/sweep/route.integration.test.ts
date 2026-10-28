import { afterEach, describe, expect, it, vi } from "vitest";

import { REQUEST_ID_HEADER } from "@/lib/request-id";
import { env } from "@/server/env";

import { captureLogs } from "../../../../../tests/helpers/logs";
import { POST } from "./route";

const REQUEST_ID = "0b6e4d1a-3c2f-4e8a-9f71-5d2c8b4a6e10";
const SWEEP_URL = "http://localhost:3000/api/reminders/sweep";

function post(authorization?: string, body?: string): Promise<Response> {
  const headers: Record<string, string> = { [REQUEST_ID_HEADER]: REQUEST_ID };
  if (authorization) headers.authorization = authorization;
  return POST(new Request(SWEEP_URL, { method: "POST", headers, body }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/reminders/sweep", () => {
  it("answers 401 without the secret, without sweeping", async () => {
    const logs = captureLogs();

    const response = await post();

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(logs.entries()).toEqual([
      expect.objectContaining({
        level: "warn",
        requestId: REQUEST_ID,
        msg: "Reminder sweep refused: bad secret",
      }),
    ]);
  });

  it("answers the same 401 for a wrong secret, and never logs what was sent", async () => {
    const logs = captureLogs();
    const wrong = `${env.REMINDER_SWEEP_SECRET.slice(0, -1)}x`;

    const missing = await post();
    const wrongResponse = await post(`Bearer ${wrong}`);

    expect(wrongResponse.status).toBe(401);
    expect(await wrongResponse.text()).toBe(await missing.text());
    expect(logs.text()).not.toContain(wrong);
    expect(logs.text()).not.toContain(env.REMINDER_SWEEP_SECRET);
    expect(logs.entries().map((entry) => entry.msg)).toEqual([
      "Reminder sweep refused: bad secret",
      "Reminder sweep refused: bad secret",
    ]);
  });

  it("answers 200 with the counts for the right secret, and logs one sweep line", async () => {
    const logs = captureLogs();

    // A body is ignored, never read.
    const response = await post(
      `Bearer ${env.REMINDER_SWEEP_SECRET}`,
      '{"ignored":true}',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      counts: {
        claimed: 0,
        sent: 0,
        skipped: 0,
        skippedByReason: { stale: 0, disabled: 0, no_device: 0 },
        failed: 0,
        held: 0,
        retrying: 0,
      },
      durationMs: expect.any(Number),
    });
    expect(logs.entries()).toEqual([
      expect.objectContaining({
        level: "info",
        requestId: REQUEST_ID,
        source: "reminders",
        msg: "Reminder sweep finished",
        sweepStartedAt: expect.any(String),
        counts: {
          claimed: 0,
          sent: 0,
          skipped: 0,
          skippedByReason: { stale: 0, disabled: 0, no_device: 0 },
          failed: 0,
          held: 0,
          retrying: 0,
        },
        durationMs: expect.any(Number),
      }),
    ]);
    expect(logs.text()).not.toContain(env.REMINDER_SWEEP_SECRET);
  });
});
