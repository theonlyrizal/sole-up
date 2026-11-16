import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlineBanner } from "@/components/ui/inline-banner";
import { LoadingState } from "@/components/ui/skeleton";
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
    <main
      id="main"
      className="header-wash grid w-full flex-1 place-items-center px-4 py-10"
    >
      <Card as="div" padding="l" className="grid w-full max-w-100 gap-5">
        <div className="grid gap-2">
          <Link
            href="/"
            className="rond-title-large-emphasized justify-self-start text-title-large-emphasized text-primary"
          >
            SoleUp
          </Link>
          <h1 className="text-headline-small">Sign in to SoleUp</h1>
          <p className="text-body-medium text-on-surface-variant">
            SoleUp never sees your password.
          </p>
        </div>
        <Suspense fallback={<LoadingState label="Loading sign-in options" />}>
          <SignInOptions searchParams={searchParams} />
        </Suspense>
        <Link
          href="/privacy"
          className={buttonClass({
            variant: "text",
            size: "xs",
            className: "justify-self-start",
          })}
        >
          Privacy notes
        </Link>
      </Card>
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
        <h2 id="reactivate-heading" className="text-title-large">
          Reactivate your account
        </h2>
        <p className="text-body-medium text-on-surface-variant">
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
        <p role="status" className="text-body-medium text-on-surface-variant">
          Your account is scheduled to close. Sign in within{" "}
          {ACCOUNT_RECOVERY_DAYS} days to reactivate it.
        </p>
      )}
      {errorMessage && <InlineBanner tone="error">{errorMessage}</InlineBanner>}
      {providers.length > 0 ? (
        <SignInButtons providers={providers} />
      ) : (
        <InlineBanner tone="info" title="No sign-in provider is configured">
          Sign-in is currently unavailable. See the Authentication section of
          the README for setup.
        </InlineBanner>
      )}
    </div>
  );
}
