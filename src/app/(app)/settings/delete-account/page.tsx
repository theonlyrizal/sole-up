import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { eq } from "drizzle-orm";

import {
  DeleteAccountForm,
  VerifyAccountButtons,
} from "@/components/settings/delete-account-form";
import { buttonClass } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/skeleton";
import { auth } from "@/server/auth/auth";
import {
  DELETION_PROOF_COOKIE,
  hasDeletionProof,
} from "@/server/auth/deletion-reauth";
import { configuredProviders } from "@/server/auth/providers";
import { db } from "@/server/db/client";
import { accounts } from "@/server/db/schema";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Delete account · SoleUp" };

export default function DeleteAccountPage({
  searchParams,
}: PageProps<"/settings/delete-account">) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Delete account</h1>
      <p className="text-muted-fg text-sm">
        This permanently deletes your SoleUp data, signs you out on every
        device, and stops push reminders. You cannot undo it.
      </p>
      <Suspense fallback={<LoadingState label="Checking verification" />}>
        <DeleteAccountStep searchParams={searchParams} />
      </Suspense>
      <Link
        href="/settings"
        className={buttonClass({
          variant: "secondary",
          className: "self-start",
        })}
      >
        Back to Settings
      </Link>
    </div>
  );
}

async function DeleteAccountStep({
  searchParams,
}: Pick<PageProps<"/settings/delete-account">, "searchParams">) {
  const current = await auth.api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  });
  if (!current) redirect("/sign-in");

  const context = await auth.$context;
  const proof = context.createAuthCookie(DELETION_PROOF_COOKIE);
  const { verification } = await searchParams;
  const verified = await hasDeletionProof(
    (await cookies()).get(proof.name)?.value,
    current.session.id,
    context.secret,
  );
  if (verified && verification !== "failed") return <DeleteAccountForm />;

  const linked = await db
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, current.user.id));
  const providers = configuredProviders(env)
    .filter(({ id }) => linked.some(({ providerId }) => providerId === id))
    .map(({ id, label }) => ({ id, label }));

  return (
    <VerifyAccountButtons
      providers={providers}
      verificationFailed={verification === "failed"}
    />
  );
}
