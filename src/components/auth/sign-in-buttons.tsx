"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

type Provider = { id: string; label: string };

/** One button per configured provider. Starts the OAuth redirect. */
export function SignInButtons({ providers }: { providers: Provider[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: Provider) {
    setPending(provider.id);
    setError(null);
    const result = await authClient.signIn.social({
      provider: provider.id,
      callbackURL: "/home",
      errorCallbackURL: "/sign-in",
    });
    // On success the browser is already leaving for the provider.
    if (result.error) {
      setPending(null);
      setError(
        result.error.status === 429
          ? "Too many sign-in attempts. Please wait a minute and try again."
          : `Couldn't start sign-in with ${provider.label}. Please try again.`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => signIn(provider)}
          disabled={pending !== null}
          className="rounded-md border border-border bg-surface px-4 py-3 text-base font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === provider.id
            ? `Redirecting to ${provider.label}…`
            : `Continue with ${provider.label}`}
        </button>
      ))}
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error}
      </p>
    </div>
  );
}
