import { describe, expect, it, vi } from "vitest";

import { checkDatabase, DatabaseCheckTimeoutError } from "./health";

// The default query uses the real pool; these tests inject their own.
vi.mock("./client", () => ({ db: {} }));

describe("checkDatabase", () => {
  it("is ok when the query answers", async () => {
    expect(await checkDatabase(async () => [{ "?column?": 1 }])).toEqual({
      status: "ok",
    });
  });

  it("is unavailable when the query fails, and never throws", async () => {
    const failure = new Error("connect ECONNREFUSED");
    expect(await checkDatabase(() => Promise.reject(failure))).toEqual({
      status: "unavailable",
      error: failure,
    });
  });

  it("is unavailable when the query takes longer than the timeout", async () => {
    const result = await checkDatabase(() => new Promise(() => {}), 20);
    expect(result.status).toBe("unavailable");
    expect(result.error).toBeInstanceOf(DatabaseCheckTimeoutError);
  });
});
