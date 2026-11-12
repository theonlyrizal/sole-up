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
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { ACCOUNT_RECOVERY_DAYS } from "@/lib/account-deletion";
import { auth } from "@/server/auth/auth";
import {
  DELETION_PROOF_COOKIE,
  hasDeletionProof,
} from "@/server/auth/deletion-reauth";
import { configuredProviders } from "@/server/auth/providers";
import { db } from "@/server/db/client";
import { accounts } from "@/server/db/schema";
import { env } from "@/server/env";
import { isAccountActive } from "@/server/modules/account-deletion/status";

export const metadata: Metadata = { title: "Delete account · SoleUp" };

export default function DeleteAccountPage({
  searchParams,
}: PageProps<"/settings/delete-account">) {
  return (
    <PageFrame
      title="Delete account"
      width="reading"
      back={{ href: "/settings", label: "Settings" }}
    >
      <p className="text-muted-fg text-sm">
        This suspends your account, signs you out on every device, and pauses
        push reminders. Sign in within {ACCOUNT_RECOVERY_DAYS} days to restore
        access. After that, your account and related data will be permanently
        unavailable.
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
    </PageFrame>
  );
}

async function DeleteAccountStep({
  searchParams,
}: Pick<PageProps<"/settings/delete-account">, "searchParams">) {
  const current = await auth.api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  });
  if (!current || !(await isAccountActive(current.user.id)))
    redirect("/sign-in");

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
