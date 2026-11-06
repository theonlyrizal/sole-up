import { createAuthEndpoint } from "better-auth/api";
import { handleOAuthUserInfo } from "better-auth/oauth2";

import { auth } from "@/server/auth/auth";

// The upstream exchange is already complete in these tests. Run the rest
// inside an endpoint so Better Auth can invoke its user validation hooks.
export async function signInWithOAuthProfile(
  profile: Parameters<typeof handleOAuthUserInfo>[1],
) {
  const signIn = createAuthEndpoint({ method: "POST" }, (ctx) =>
    handleOAuthUserInfo(ctx, profile),
  );
  return signIn({ context: await auth.$context });
}
