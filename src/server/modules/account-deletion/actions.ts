"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DELETE_ACCOUNT_CONFIRMATION } from "@/lib/account-deletion";
import { auth } from "@/server/auth/auth";
import { authedAction } from "@/server/auth/authed-action";
import {
  DELETION_PROOF_COOKIE,
  hasDeletionProof,
} from "@/server/auth/deletion-reauth";
import { ConflictError } from "@/server/errors";

import { deleteAccount } from "./service";

export const confirmAccountDeletion = authedAction(
  z.object({
    confirmation: z
      .string()
      .refine(
        (value) => value === DELETE_ACCOUNT_CONFIRMATION,
        `Type ${DELETE_ACCOUNT_CONFIRMATION} exactly to confirm.`,
      ),
  }),
  async (_, { userId }) => {
    const current = await auth.api.getSession({
      headers: await headers(),
      query: { disableRefresh: true },
    });
    const context = await auth.$context;
    const jar = await cookies();
    const proof = context.createAuthCookie(DELETION_PROOF_COOKIE);
    if (
      current?.user.id !== userId ||
      !(await hasDeletionProof(
        jar.get(proof.name)?.value,
        current.session.id,
        context.secret,
      ))
    ) {
      throw new ConflictError("Verify your account again before deleting it.");
    }

    await deleteAccount(userId, current.session.id);
    for (const cookie of [proof, context.authCookies.sessionToken]) {
      jar.set(cookie.name, "", {
        path: cookie.attributes.path,
        secure: cookie.attributes.secure,
        httpOnly: true,
        sameSite: "lax",
        maxAge: 0,
      });
    }
    redirect("/sign-in?deleted=1");
  },
);
