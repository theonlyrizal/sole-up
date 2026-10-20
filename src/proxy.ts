import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { isAppPath, SIGN_IN_PATH } from "@/lib/protected-paths";

/**
 * Sends visitors without a session cookie away from (app) routes before any
 * rendering. This is a convenience only: it checks that a cookie exists, not
 * that it is valid. The real checks are requireUser() in pages and
 * authedAction() in Server Actions, which look the session up in the
 * database.
 */
export function proxy(request: NextRequest) {
  if (!isAppPath(request.nextUrl.pathname)) return NextResponse.next();

  // Same prefix as `advanced.cookiePrefix` in src/server/auth/auth.ts. The
  // `__Secure-` variant used over HTTPS is found too.
  const sessionCookie = getSessionCookie(request, { cookiePrefix: "soleup" });
  if (sessionCookie) return NextResponse.next();

  return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
}

export const config = {
  // Skip API routes, Next.js internals and files with an extension; the
  // proxy itself decides which of the remaining paths are protected.
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
