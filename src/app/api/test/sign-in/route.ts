import { NextResponse } from "next/server";
import { z } from "zod";

import { isTestSignInEnabled } from "@/server/auth/test-sign-in";
import { env } from "@/server/env";

/**
 * TEST-ONLY sign-in shortcut for Playwright. Off unless NODE_ENV is "test"
 * and SOLEUP_TEST_SIGN_IN is "1" (see isTestSignInEnabled); when off it
 * answers 404, exactly like a route that does not exist, and touches nothing
 * else. The session helpers are imported only after that check.
 *
 * POST { email?, name? } signs in as the user with that email, creating it
 * if needed, and sets a real session cookie.
 */

const bodySchema = z.object({
  email: z.email().optional(),
  name: z.string().trim().min(1).max(100).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!isTestSignInEnabled(env)) {
    return new NextResponse(null, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const [{ eq }, { db }, { users }, { createSessionCookie, insertTestUser }] =
    await Promise.all([
      import("drizzle-orm"),
      import("@/server/db/client"),
      import("@/server/db/schema"),
      import("@/server/auth/test-session"),
    ]);

  const email = parsed.data.email?.toLowerCase();
  const [existing] = email
    ? await db.select().from(users).where(eq(users.email, email))
    : [];
  const user = existing ?? (await insertTestUser({ ...parsed.data, email }));

  const cookie = await createSessionCookie(user.id);
  const response = NextResponse.json({ userId: user.id });
  const attributes = [
    `${cookie.name}=${cookie.value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${cookie.maxAge}`,
    ...(cookie.secure ? ["Secure"] : []),
  ];
  response.headers.append("set-cookie", attributes.join("; "));
  return response;
}
