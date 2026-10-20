"use server";

import { z } from "zod";

import { authedAction } from "@/server/auth/authed-action";
import { isTestSignInEnabled } from "@/server/auth/test-sign-in";
import { env } from "@/server/env";
import { NotFoundError } from "@/server/errors";

/**
 * TEST-ONLY: fails on purpose, so e2e tests can check that the user sees a
 * generic message with the request ID that the log line carries. Off (like
 * the page) unless the test-support switch is on. The thrown message stands
 * in for user content and must never reach the log or the browser.
 */
export const forceActionError = authedAction(z.object({}), async () => {
  if (!isTestSignInEnabled(env)) throw new NotFoundError();
  throw new Error("Forced test error: private note text");
});
