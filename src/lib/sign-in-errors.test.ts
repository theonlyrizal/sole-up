import { describe, expect, it } from "vitest";

import { signInErrorMessage } from "./sign-in-errors";

describe("signInErrorMessage", () => {
  it("returns nothing when there is no error", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
  });

  it("explains a refused account link", () => {
    expect(signInErrorMessage("account_not_linked")).toMatch(
      /provider you used before/,
    );
  });

  it("never echoes an unknown code", () => {
    const message = signInErrorMessage("<script>alert(1)</script>");
    expect(message).toBe("Sign-in didn't complete. Please try again.");
    expect(signInErrorMessage("toString")).toBe(message);
  });
});
