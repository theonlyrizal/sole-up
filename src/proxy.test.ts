import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function redirectLocation(response: Response) {
  return response.headers.get("location");
}

describe("proxy", () => {
  it("redirects a visitor without a session cookie away from (app) routes", () => {
    for (const path of ["/home", "/home/anything"]) {
      const response = proxy(request(path));
      expect(response.status).toBe(307);
      expect(redirectLocation(response)).toBe("http://localhost:3000/sign-in");
    }
  });

  it("ignores cookies that are not the SoleUp session cookie", () => {
    const response = proxy(
      request("/home", "better-auth.session_token=abc; other=1"),
    );
    expect(redirectLocation(response)).toBe("http://localhost:3000/sign-in");
  });

  it.each([
    "soleup.session_token=abc.def",
    "__Secure-soleup.session_token=abc.def",
  ])("lets a request with %s through", (cookie) => {
    const response = proxy(request("/home", cookie));
    expect(redirectLocation(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/", "/sign-in"])("leaves public route %s alone", (path) => {
    const response = proxy(request(path));
    expect(redirectLocation(response)).toBeNull();
  });
});
