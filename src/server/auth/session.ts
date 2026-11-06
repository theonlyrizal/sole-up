import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  accountStatus,
  isAccountActive,
} from "@/server/modules/account-deletion/status";

import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

/**
 * The signed-in user for a request's headers, or `null`. The session is
 * looked up in the database on every call (no cookie cache), so a revoked
 * session stops working immediately.
 */
export async function getUserFromHeaders(
  requestHeaders: Headers,
): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session || !(await isAccountActive(session.user.id))) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
}

/** The signed-in user for the current request, or `null`. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return getUserFromHeaders(await headers());
}

/** The sign-in page can show recovery without authorizing access to user data. */
export async function getSignedInAccount() {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  });
  if (!session) return null;
  return accountStatus(session.user.id);
}

/**
 * The signed-in user, or a redirect to the sign-in page. Call it first in
 * every authenticated page and route handler. Server Actions use
 * authedAction() (./authed-action.ts), which returns an UNAUTHENTICATED
 * result instead of redirecting.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
