import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/auth/[...all]/route";
import { db } from "@/server/db/client";

import { REQUEST_ID_HEADER } from "@/lib/request-id";

import { captureLogs } from "../helpers/logs";
import { asUser, createTestUser } from "./helpers/users";

describe("auth error logging", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.$client.query(
      "ALTER TABLE IF EXISTS sessions_unavailable RENAME TO sessions",
    );
  });

  it("a database failure answers 500 and logs no token or query params", async () => {
    const user = await createTestUser();
    const { headers } = await asUser(user.id);
    const cookie = headers.get("cookie")!;
    const token = decodeURIComponent(cookie.split("=")[1]!).split(".")[0]!;

    const logs = captureLogs();
    const requestId = "0b6f3a4e-2c1d-4e5f-8a9b-1c2d3e4f5a6b";
    headers.set(REQUEST_ID_HEADER, requestId);

    // Make the session lookup fail inside Better Auth.
    await db.$client.query(
      "ALTER TABLE sessions RENAME TO sessions_unavailable",
    );

    const response = await GET(
      new Request("http://localhost:3000/api/auth/get-session", { headers }),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(token);
    const output = logs.text();
    expect(output).not.toContain(token);
    expect(output).not.toMatch(/params:/i);
    expect(output).toContain("42P01");
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ requestId, level: "error" }),
    );
  });
});
