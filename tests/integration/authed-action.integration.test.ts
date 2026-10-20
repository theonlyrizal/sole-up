import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { authedAction } from "@/server/auth/authed-action";
import { proxy } from "@/proxy";

import { REQUEST_ID_HEADER } from "@/lib/request-id";
import { DEFAULT_ERROR_MESSAGES } from "@/lib/result";

import { captureLogs } from "../helpers/logs";
import { asUser, createTestUser } from "./helpers/users";

// Server Actions read the session from the request's headers. Outside a
// Next.js request, supply them here.
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const schema = z.object({ title: z.string().min(1, "Enter a title.") });

function protectedAction() {
  const handler = vi.fn(
    async (_input: { title: string }, ctx: { userId: string }) => ctx.userId,
  );
  return { handler, action: authedAction(schema, handler) };
}

beforeEach(() => {
  requestHeaders.current = new Headers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authedAction with real sessions", () => {
  it("rejects a call with no session cookie", async () => {
    const { action, handler } = protectedAction();

    const result = await action({ title: "Run a 10k" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a forged session cookie", async () => {
    requestHeaders.current = new Headers({
      cookie: "soleup.session_token=forged.signature",
    });
    const { action, handler } = protectedAction();

    const result = await action({ title: "Run a 10k" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler as the signed-in user", async () => {
    const user = await createTestUser();
    requestHeaders.current = (await asUser(user.id)).headers;
    const { action } = protectedAction();

    const result = await action({ title: "Run a 10k" });

    expect(result).toEqual({ ok: true, data: user.id });
  });

  it("returns field errors for a signed-in user's invalid input", async () => {
    const user = await createTestUser();
    requestHeaders.current = (await asUser(user.id)).headers;
    const { action, handler } = protectedAction();

    const result = await action({ title: "" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { title: ["Enter a title."] } },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("shows and logs the same request ID for an unexpected error, never its message", async () => {
    const user = await createTestUser();
    const requestId = "3d1f8c2a-5b6e-4f70-9a81-b2c3d4e5f607";
    requestHeaders.current = new Headers((await asUser(user.id)).headers);
    requestHeaders.current.set(REQUEST_ID_HEADER, requestId);
    const logs = captureLogs();
    const action = authedAction(schema, async () => {
      throw new Error("insert failed: title 'My private goal'");
    });

    const result = await action({ title: "My private goal" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INTERNAL",
        message: `${DEFAULT_ERROR_MESSAGES.INTERNAL} Reference: ${requestId}`,
        requestId,
      },
    });
    expect(logs.entries()).toEqual([
      expect.objectContaining({
        level: "error",
        requestId,
        source: "action",
        msg: "Unexpected error in a Server Action",
      }),
    ]);
    expect(logs.text()).not.toContain("private goal");
  });
});

describe("proxy with a real session cookie", () => {
  it("lets a signed-in user's request reach (app) routes", async () => {
    const user = await createTestUser();
    const { headers } = await asUser(user.id);

    const response = proxy(
      new NextRequest("http://localhost:3000/home", { headers }),
    );

    expect(response.headers.get("location")).toBeNull();
  });
});
