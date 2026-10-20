import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { isRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

import { proxy } from "./proxy";

function request(path: string, cookie?: string, extra: HeadersInit = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { ...(cookie ? { cookie } : {}), ...extra },
  });
}

/** The value the proxy set on the request passed on to the app. */
function forwardedRequestId(response: Response) {
  return response.headers.get(`x-middleware-request-${REQUEST_ID_HEADER}`);
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

  describe("request IDs", () => {
    it.each(["/", "/api/health", "/home"])(
      "gives %s a fresh ID on the request and the response",
      (path) => {
        const response = proxy(request(path, "soleup.session_token=abc.def"));
        const id = forwardedRequestId(response);
        expect(isRequestId(id)).toBe(true);
        expect(response.headers.get(REQUEST_ID_HEADER)).toBe(id);
      },
    );

    it("never trusts an ID sent by the client", () => {
      const forged = "11111111-1111-4111-8111-111111111111";
      const response = proxy(
        request("/", undefined, { [REQUEST_ID_HEADER]: forged }),
      );
      expect(forwardedRequestId(response)).not.toBe(forged);
      expect(isRequestId(forwardedRequestId(response))).toBe(true);
    });

    it("gives every request its own ID", () => {
      const ids = new Set(
        [1, 2, 3].map(() => forwardedRequestId(proxy(request("/")))),
      );
      expect(ids.size).toBe(3);
    });

    it("puts the ID on a sign-in redirect too", () => {
      const response = proxy(request("/home"));
      expect(isRequestId(response.headers.get(REQUEST_ID_HEADER))).toBe(true);
    });
  });
});
