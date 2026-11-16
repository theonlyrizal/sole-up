"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { authClient } from "@/lib/auth-client";

import { ProviderMark } from "./provider-mark";

type Provider = { id: "google" | "github"; label: string };

/** One button per configured provider. Starts the OAuth redirect. */
export function SignInButtons({ providers }: { providers: Provider[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: Provider) {
    setPending(provider.id);
    setError(null);
    const unavailable = `Couldn't start sign-in with ${provider.label}. Please try again.`;
    try {
      const result = await authClient.signIn.social({
        provider: provider.id,
        callbackURL: "/home",
        errorCallbackURL: "/sign-in",
      });
      // On success the browser is already leaving for the provider.
      if (!result.error) return;
      setError(
        result.error.status === 429
          ? "Too many sign-in attempts. Please wait a minute and try again."
          : unavailable,
      );
    } catch {
      setError(unavailable);
    }
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.map((provider) => (
        <Button
          key={provider.id}
          variant="outlined"
          size="m"
          onClick={() => signIn(provider)}
          disabled={pending !== null}
          aria-busy={pending === provider.id || undefined}
        >
          <ProviderMark provider={provider.id} />
          {pending === provider.id
            ? `Redirecting to ${provider.label}…`
            : `Continue with ${provider.label}`}
        </Button>
      ))}
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
    </div>
  );
}
