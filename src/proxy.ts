import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { isAppPath, SIGN_IN_PATH } from "@/lib/protected-paths";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

/**
 * Runs before every page, Server Action and API route.
 *
 * 1. Gives the request a fresh ID (`x-request-id`), on the request for
 *    server code to log and on the response. An ID sent by the client is
 *    always replaced, so it can't be forged into the logs.
 * 2. Sends visitors without a session cookie away from (app) routes before
 *    any rendering. This is a convenience only: it checks that a cookie
 *    exists, not that it is valid. The real checks are requireUser() in
 *    pages and authedAction() in Server Actions, which look the session up
 *    in the database.
 */
export function proxy(request: NextRequest) {
  const requestId = newRequestId();

  if (isAppPath(request.nextUrl.pathname)) {
    // Same prefix as `advanced.cookiePrefix` in src/server/auth/auth.ts. The
    // `__Secure-` variant used over HTTPS is found too.
    const sessionCookie = getSessionCookie(request, { cookiePrefix: "soleup" });
    if (!sessionCookie) {
      const response = NextResponse.redirect(
        new URL(SIGN_IN_PATH, request.url),
      );
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    }
  }

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Skip Next.js internals and files with an extension; the proxy itself
  // decides which of the remaining paths are protected. `[.]`, not `\.`:
  // the escaped form lost its backslash when compiled, which made the
  // pattern skip every path except `/`.
  matcher: ["/((?!_next/|.*[.].*).*)"],
};
