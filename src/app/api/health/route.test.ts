import { afterEach, describe, expect, it, vi } from "vitest";

import { REQUEST_ID_HEADER } from "@/lib/request-id";
import { checkDatabase } from "@/server/db/health";

import { captureLogs } from "../../../../tests/helpers/logs";
import { GET } from "./route";

vi.mock("@/server/db/health", () => ({ checkDatabase: vi.fn() }));

const REQUEST_ID = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

function get() {
  return GET(
    new Request("http://localhost:3000/api/health", {
      headers: { [REQUEST_ID_HEADER]: REQUEST_ID },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("answers 200 when the database is ok, and is never cached", async () => {
    vi.mocked(checkDatabase).mockResolvedValue({ status: "ok" });

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("answers 503 without details, and logs the failure with the request ID", async () => {
    const logs = captureLogs();
    vi.mocked(checkDatabase).mockResolvedValue({
      status: "unavailable",
      error: new Error("password authentication failed for user soleup"),
    });

    const response = await get();

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      status: "unavailable",
      database: "unavailable",
    });
    expect(body).not.toContain("password");
    expect(logs.entries()).toEqual([
      expect.objectContaining({
        level: "warn",
        requestId: REQUEST_ID,
        source: "health",
        err: expect.objectContaining({ type: "Error" }),
      }),
    ]);
    expect(logs.text()).not.toContain("password authentication");
  });
});
