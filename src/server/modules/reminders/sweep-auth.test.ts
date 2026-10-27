import { describe, expect, it } from "vitest";

import { hasSweepSecret } from "./sweep-auth";

const SECRET = "unit-tests-only-sweep-secret-0123456789abcdef";

function headers(authorization?: string): Headers {
  return new Headers(authorization ? { authorization } : {});
}

describe("hasSweepSecret", () => {
  it("accepts the secret as a Bearer token, in any scheme case", () => {
    expect(hasSweepSecret(headers(`Bearer ${SECRET}`), SECRET)).toBe(true);
    expect(hasSweepSecret(headers(`bearer ${SECRET}`), SECRET)).toBe(true);
  });

  it("refuses a missing or empty header", () => {
    expect(hasSweepSecret(headers(), SECRET)).toBe(false);
    expect(hasSweepSecret(headers("Bearer "), SECRET)).toBe(false);
  });

  it("refuses a wrong secret, including a prefix or a longer value", () => {
    expect(hasSweepSecret(headers("Bearer nope"), SECRET)).toBe(false);
    expect(
      hasSweepSecret(headers(`Bearer ${SECRET.slice(0, -1)}`), SECRET),
    ).toBe(false);
    expect(hasSweepSecret(headers(`Bearer ${SECRET}x`), SECRET)).toBe(false);
  });

  it("refuses the secret under another scheme or with extra parts", () => {
    expect(hasSweepSecret(headers(SECRET), SECRET)).toBe(false);
    expect(hasSweepSecret(headers(`Basic ${SECRET}`), SECRET)).toBe(false);
    expect(hasSweepSecret(headers(`Bearer ${SECRET} extra`), SECRET)).toBe(
      false,
    );
  });
});
