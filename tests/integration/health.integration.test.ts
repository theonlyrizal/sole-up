import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("GET /api/health against the real database", () => {
  it("reports the database as ok", async () => {
    const response = await GET(new Request("http://localhost:3000/api/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  });
});
