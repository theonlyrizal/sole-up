import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { signInErrorMessage } from "@/lib/sign-in-errors";
import { configuredProviders } from "@/server/auth/providers";
import { getCurrentUser } from "@/server/auth/session";
import { env } from "@/server/env";

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
    </main>
  );
}

async function SignInOptions({
  searchParams,
}: Pick<PageProps<"/sign-in">, "searchParams">) {
  if (await getCurrentUser()) redirect("/home");

  const { error } = await searchParams;
  const errorMessage = signInErrorMessage(
    typeof error === "string" ? error : undefined,
  );
  // Only the label and ID reach the client, never the credentials.
  const providers = configuredProviders(env).map(({ id, label }) => ({
    id,
    label,
  }));

  return (
    <div className="flex flex-col gap-4">
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
