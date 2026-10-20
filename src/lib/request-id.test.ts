import { describe, expect, it } from "vitest";

import { isRequestId, newRequestId } from "./request-id";

describe("request IDs", () => {
  it("are unique UUIDs that pass isRequestId", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toBe(b);
    expect(isRequestId(a)).toBe(true);
  });

  it.each([
    undefined,
    null,
    "",
    "abc",
    "x".repeat(36),
    `${newRequestId()}\nfake`,
  ])("rejects %j", (value) => {
    expect(isRequestId(value)).toBe(false);
  });
});
