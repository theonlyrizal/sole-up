import "server-only";

import type { BetterAuthOptions } from "better-auth";
import {
  APIError,
  addOAuthServerContext,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  getOAuthState,
} from "better-auth/api";
import {
  constantTimeEqual,
  makeSignature,
  signJWT,
  verifyJWT,
} from "better-auth/crypto";

import { DELETE_ACCOUNT_PATH } from "@/lib/account-deletion";
import {
  accountStatus,
  isAccountActive,
} from "@/server/modules/account-deletion/status";

const purpose = "account-deletion";
export const DELETION_PROOF_COOKIE = "deletion_proof";
const proofLifetimeSeconds = 5 * 60;

function bindIntent(sessionId: string, secret: string) {
  // OAuth state may be left in verifications if the user abandons the flow.
  return makeSignature(`${purpose}:${sessionId}`, secret);
}

export const deletionReauthHooks: BetterAuthOptions["hooks"] = {
  before: createAuthMiddleware(async (ctx) => {
    // An OAuth session for a pending account is valid only for reactivation
    // or sign-out. Internal app session lookups have their own access gate.
    if (
      ctx.request &&
      ctx.path !== "/sign-out" &&
      ctx.path !== "/sign-in/social" &&
      !ctx.path?.startsWith("/callback/")
    ) {
      const session = await getAuthoritativeSessionFromCtx(ctx);
      if (session && !(await isAccountActive(session.user.id))) {
        throw new APIError("FORBIDDEN", {
          message: "This account is unavailable.",
        });
      }
    }

    if (
      ctx.path !== "/sign-in/social" ||
      ctx.body?.callbackURL !== DELETE_ACCOUNT_PATH
    ) {
      return;
    }
    const current = await getAuthoritativeSessionFromCtx(ctx);
    if (!current || !(await isAccountActive(current.user.id))) {
      throw new APIError("UNAUTHORIZED", {
        message: "Start account verification from a signed-in session.",
      });
    }
    if (ctx.body.idToken || ctx.body.loginHint || ctx.body.additionalParams) {
      throw new APIError("BAD_REQUEST", {
        message: "Start account verification from Settings.",
      });
    }
    await addOAuthServerContext({
      deletionIntent: await bindIntent(current.session.id, ctx.context.secret),
    });
    return {
      context: {
        body: {
          ...ctx.body,
          errorCallbackURL: `${DELETE_ACCOUNT_PATH}?verification=failed`,
          additionalParams: { prompt: "select_account" },
        },
      },
    };
  }),
  after: createAuthMiddleware(async (ctx) => {
    if (!ctx.path?.startsWith("/callback/")) return;
    const next = ctx.context.newSession;
    const state = await getOAuthState();
    if (!next || typeof state?.serverContext?.deletionIntent !== "string") {
      return;
    }

    // The provider callback has passed validateAccountIdentity and minted
    // a new session for the same user. Only that session can use this proof.
    const cookie = ctx.context.createAuthCookie(DELETION_PROOF_COOKIE, {
      maxAge: proofLifetimeSeconds,
    });
    const proof = await signJWT(
      { purpose, sessionId: next.session.id },
      ctx.context.secret,
      proofLifetimeSeconds,
    );
    ctx.setCookie(cookie.name, proof, cookie.attributes);
  }),
};

// This hook runs before Better Auth creates or links an identity, or signs
// in an existing identity. The latter has already resolved the linked user.
export const validateAccountIdentity: NonNullable<
  NonNullable<BetterAuthOptions["user"]>["validateUserInfo"]
> = async ({ user, source }, ctx) => {
  if (source.action !== "create-user" && typeof user.id === "string") {
    const account = await accountStatus(user.id);
    if (account.status === "closed") return { error: "account_closed" };
    if (account.status === "recoverable" && source.action === "link-account") {
      return { error: "account_recovery_linked_provider" };
    }
  }
  if (!ctx.path?.startsWith("/callback/")) return;
  const state = await getOAuthState();
  const intent = state?.serverContext?.deletionIntent;
  if (typeof intent !== "string") return;

  const current = await getAuthoritativeSessionFromCtx(ctx);
  if (
    source.action !== "sign-in" ||
    source.method !== "oauth" ||
    !current ||
    user.id !== current.user.id ||
    !constantTimeEqual(
      intent,
      await bindIntent(current.session.id, ctx.context.secret),
    )
  ) {
    return { error: "deletion_identity_mismatch" };
  }
};

export async function hasDeletionProof(
  value: string | undefined,
  sessionId: string,
  secret: string,
): Promise<boolean> {
  if (!value) return false;
  const proof = await verifyJWT(value, secret);
  return proof?.purpose === purpose && proof.sessionId === sessionId;
}
