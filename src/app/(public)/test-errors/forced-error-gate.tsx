import { connection } from "next/server";
import { notFound } from "next/navigation";

import { isTestSignInEnabled } from "@/server/auth/test-sign-in";
import { env } from "@/server/env";

/**
 * TEST-ONLY pages under /test-errors exist only when the test-support
 * switch is on (NODE_ENV "test" and SOLEUP_TEST_SIGN_IN "1", the same switch
 * as the test sign-in route); otherwise they are not found. The check runs
 * per request, not at build. Render inside <Suspense>.
 */
export async function requireTestErrorPages(): Promise<void> {
  await connection();
  if (!isTestSignInEnabled(env)) notFound();
}
