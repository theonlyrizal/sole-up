import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/auth/[...all]/route";
import { db } from "@/server/db/client";

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

    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map((arg) => String(arg)).join(" "));
    };
    vi.spyOn(console, "error").mockImplementation(capture);
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "log").mockImplementation(capture);

    // Make the session lookup fail inside Better Auth.
    await db.$client.query(
      "ALTER TABLE sessions RENAME TO sessions_unavailable",
    );

    const response = await GET(
      new Request("http://localhost:3000/api/auth/get-session", { headers }),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(token);
    expect(lines.length).toBeGreaterThan(0);
    const output = lines.join("\n");
    expect(output).not.toContain(token);
    expect(output).not.toMatch(/params:/i);
    expect(output).toContain("42P01");
  });
});
