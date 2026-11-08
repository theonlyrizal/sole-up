import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { ACCOUNT_RECOVERY_DAYS } from "@/lib/account-deletion";
import { formatInstant } from "@/lib/dates";
import { signInErrorMessage } from "@/lib/sign-in-errors";
import { configuredProviders } from "@/server/auth/providers";
import { getSignedInAccount } from "@/server/auth/session";
import { env } from "@/server/env";
import { confirmAccountReactivation } from "@/server/modules/account-deletion/actions";

export const metadata: Metadata = { title: "Sign in · SoleUp" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in to SoleUp
        </h1>
        <p className="text-sm text-muted">
          Use your Google or GitHub account. SoleUp never sees your password.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <SignInOptions searchParams={searchParams} />
      </Suspense>
      <Link
        href="/privacy"
        className="text-sm text-accent underline underline-offset-4"
      >
        Privacy notes
      </Link>
    </main>
  );
}

async function SignInOptions({
  searchParams,
}: Pick<PageProps<"/sign-in">, "searchParams">) {
  const account = await getSignedInAccount();
  if (account?.status === "active") redirect("/home");
  if (account?.status === "recoverable") {
    const { recoverUntil } = account;
    return (
      <section
        aria-labelledby="reactivate-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="reactivate-heading" className="text-lg font-semibold">
          Reactivate your account
        </h2>
        <p className="text-sm text-muted">
          You can restore access until{" "}
          <time dateTime={recoverUntil.toISOString()}>
            {formatInstant(recoverUntil, "en-US", "UTC")} UTC
          </time>
          .
        </p>
        <form action={confirmAccountReactivation}>
          <Button type="submit">Reactivate account</Button>
        </form>
        <SignOutButton />
      </section>
    );
  }

  const { error, closure } = await searchParams;
  const errorMessage = signInErrorMessage(
    account?.status === "closed"
      ? "account_closed"
      : typeof error === "string"
        ? error
        : undefined,
  );
  // Only the label and ID reach the client, never the credentials.
  const providers = configuredProviders(env).map(({ id, label }) => ({
    id,
    label,
  }));

  return (
    <div className="flex flex-col gap-4">
      {closure === "scheduled" && (
        <p role="status" className="text-sm text-muted">
          Your account is scheduled to close. Sign in within{" "}
          {ACCOUNT_RECOVERY_DAYS} days to reactivate it.
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="rounded-md border border-danger px-4 py-3 text-sm text-danger"
        >
          {errorMessage}
        </p>
      )}
      {providers.length > 0 ? (
        <SignInButtons providers={providers} />
      ) : (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted">
          Sign-in isn&apos;t available yet: no sign-in provider is configured.
          See README &gt; Authentication.
        </p>
      )}
    </div>
  );
}
