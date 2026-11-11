import { randomBytes } from "node:crypto";

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { isAppPath, SIGN_IN_PATH } from "@/lib/protected-paths";
import { newRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

const CSP_HEADER = "Content-Security-Policy";

function documentPolicy() {
  const nonce = randomBytes(16).toString("base64");
  const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self'${devEval}`,
    "script-src-attr 'none'",
    // Calendar, the editor and Radix use runtime CSS and style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Runs before every page, Server Action and API route.
 *
 * 1. Gives the request a fresh ID (`x-request-id`), on the request for
 *    server code to log and on the response. An ID sent by the client is
 *    always replaced, so it can't be forged into the logs.
 *    The proxy also supplies Next.js with the document CSP for this request.
 * 2. Sends visitors without a session cookie away from (app) routes before
 *    any rendering. This is a convenience only: it checks that a cookie
 *    exists, not that it is valid. The real checks are requireUser() in
 *    pages and authedAction() in Server Actions, which look the session up
 *    in the database.
 */
export function proxy(request: NextRequest) {
  const requestId = newRequestId();
  const policy = documentPolicy();

  if (isAppPath(request.nextUrl.pathname)) {
    // Same prefix as `advanced.cookiePrefix` in src/server/auth/auth.ts. The
    // `__Secure-` variant used over HTTPS is found too.
    const sessionCookie = getSessionCookie(request, { cookiePrefix: "soleup" });
    if (!sessionCookie) {
      const response = NextResponse.redirect(
        new URL(SIGN_IN_PATH, request.url),
      );
      response.headers.set(REQUEST_ID_HEADER, requestId);
      response.headers.set(CSP_HEADER, policy);
      return response;
    }
  }

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set(CSP_HEADER, policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set(CSP_HEADER, policy);
  return response;
}

export const config = {
  // Keep dotted URLs in the matcher so their HTML 404s also get a nonce.
  // The service worker has its own CSP in next.config.ts.
  matcher: ["/((?!_next/|sw[.]js$).*)"],
};
