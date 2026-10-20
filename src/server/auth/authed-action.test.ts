import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DEFAULT_ERROR_MESSAGES } from "@/lib/result";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import { createAuthedAction } from "./authed-action";

// The default authedAction reads the session through Better Auth and the
// database. These tests inject the user instead; the integration test covers
// the real session path.
vi.mock("./session", () => ({ getCurrentUser: async () => null }));

const USER_ID = "8d5e4b0c-1a2b-4c3d-9e8f-0a1b2c3d4e5f";
const signedIn = createAuthedAction(async () => USER_ID);
const signedOut = createAuthedAction(async () => null);

const renameSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "Enter a title."),
  tags: z.array(z.string().max(5, "Keep tags short.")).default([]),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authedAction", () => {
  it("rejects an unauthenticated call without validating or running the handler", async () => {
    const handler = vi.fn(async () => "renamed");
    const parse = vi.spyOn(renameSchema, "safeParseAsync");
    const action = signedOut(renameSchema, handler);

    const result = await action({ id: "not-a-uuid", title: "" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: DEFAULT_ERROR_MESSAGES.UNAUTHENTICATED,
      },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input and never runs the handler", async () => {
    const handler = vi.fn(async () => "renamed");
    const action = signedIn(renameSchema, handler);

    const result = await action({
      id: "not-a-uuid",
      title: "   ",
      tags: ["ok", "far too long"],
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== "VALIDATION") {
      throw new Error("expected a validation error");
    }
    expect(result.error.message).toBe(DEFAULT_ERROR_MESSAGES.VALIDATION);
    expect(Object.keys(result.error.fieldErrors).sort()).toEqual([
      "id",
      "tags.1",
      "title",
    ]);
    expect(result.error.fieldErrors.title).toEqual(["Enter a title."]);
    expect(result.error.fieldErrors["tags.1"]).toEqual(["Keep tags short."]);
    expect(result.error.formErrors).toEqual([]);
  });

  it("puts errors about the whole input in formErrors", async () => {
    const action = signedIn(renameSchema, async () => "renamed");

    // Server Actions can be called with anything, whatever the types say.
    const result = await action("not an object" as never);

    if (result.ok || result.error.code !== "VALIDATION") {
      throw new Error("expected a validation error");
    }
    expect(result.error.fieldErrors).toEqual({});
    expect(result.error.formErrors).toHaveLength(1);
  });

  it("runs the handler with the parsed input and the user's ID", async () => {
    const handler = vi.fn(async (input: z.output<typeof renameSchema>) => ({
      title: input.title,
    }));
    const action = signedIn(renameSchema, handler);

    const result = await action({ id: USER_ID, title: "  Run a 10k  " });

    expect(result).toEqual({ ok: true, data: { title: "Run a 10k" } });
    expect(handler).toHaveBeenCalledWith(
      { id: USER_ID, title: "Run a 10k", tags: [] },
      { userId: USER_ID },
    );
  });

  it.each([
    [
      new NotFoundError(),
      { code: "NOT_FOUND", message: DEFAULT_ERROR_MESSAGES.NOT_FOUND },
    ],
    [
      new ConflictError("That name is already taken."),
      { code: "CONFLICT", message: "That name is already taken." },
    ],
    [
      new ValidationError({ dueDate: ["Pick a date after the start."] }),
      {
        code: "VALIDATION",
        message: DEFAULT_ERROR_MESSAGES.VALIDATION,
        fieldErrors: { dueDate: ["Pick a date after the start."] },
        formErrors: [],
      },
    ],
  ])("maps %s to a user-safe error", async (thrown, expected) => {
    const action = signedIn(renameSchema, async () => {
      throw thrown;
    });

    const result = await action({ id: USER_ID, title: "x" });

    expect(result).toEqual({ ok: false, error: expected });
  });

  it("hides unexpected errors behind a generic message and logs no details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const action = signedIn(renameSchema, async () => {
      throw new Error('duplicate key: title "My private goal"');
    });

    const result = await action({ id: USER_ID, title: "x" });

    expect(result).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: DEFAULT_ERROR_MESSAGES.INTERNAL },
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private goal");
  });

  it("treats a failing user lookup as unexpected, not as signed in", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(async () => "renamed");
    const action = createAuthedAction(async () => {
      throw new Error("database unavailable");
    })(renameSchema, handler);

    const result = await action({ id: USER_ID, title: "x" });

    expect(result.ok).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets Next.js redirects through", async () => {
    const action = signedIn(renameSchema, async () => redirect("/home"));

    await expect(action({ id: USER_ID, title: "x" })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });
});
