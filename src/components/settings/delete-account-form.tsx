"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { focusRing } from "@/components/ui/cx";
import {
  DELETE_ACCOUNT_CONFIRMATION,
  DELETE_ACCOUNT_PATH,
} from "@/lib/account-deletion";
import { authClient } from "@/lib/auth-client";
import type { ProviderId } from "@/server/auth/providers";
import { confirmAccountDeletion } from "@/server/modules/account-deletion/actions";

export function VerifyAccountButtons({
  providers,
  verificationFailed,
}: {
  providers: { id: ProviderId; label: string }[];
  verificationFailed: boolean;
}) {
  const [pending, setPending] = useState<ProviderId | null>(null);
  const [error, setError] = useState(
    verificationFailed
      ? "Verification failed. Try again with a linked account."
      : "",
  );

  async function verify(provider: ProviderId) {
    setPending(provider);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: DELETE_ACCOUNT_PATH,
      });
      if (!result.error) return;
    } catch {
      // The request may fail before Better Auth responds.
    }
    setPending(null);
    setError("Couldn't start verification. Please try again.");
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.length ? (
        <p className="text-muted-fg text-sm">
          Verify your identity with a linked sign-in provider to continue.
        </p>
      ) : (
        <p className="text-muted-fg text-sm">
          No linked sign-in provider is available for verification.
        </p>
      )}
      {providers.map(({ id, label }) => (
        <Button
          key={id}
          variant="secondary"
          disabled={pending !== null}
          onClick={() => verify(id)}
        >
          {pending === id ? `Opening ${label}…` : `Verify with ${label}`}
        </Button>
      ))}
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    </div>
  );
}

export function DeleteAccountForm() {
  const [error, submit, pending] = useActionState(
    async (_previous: string, form: FormData) => {
      const result = await confirmAccountDeletion({
        confirmation: String(form.get("confirmation") ?? ""),
      });
      if (result.ok) return "";
      return result.error.code === "VALIDATION"
        ? (result.error.fieldErrors.confirmation?.[0] ?? result.error.message)
        : result.error.message;
    },
    "",
  );

  return (
    <form action={submit} className="flex flex-col gap-3">
      <label htmlFor="delete-confirmation" className="text-sm font-medium">
        Type {DELETE_ACCOUNT_CONFIRMATION} to confirm
      </label>
      <input
        id="delete-confirmation"
        name="confirmation"
        required
        autoComplete="off"
        aria-describedby={error ? "delete-error" : undefined}
        className={`rounded-md border border-border bg-surface px-3 py-2 ${focusRing}`}
      />
      {error && (
        <p id="delete-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="danger"
        disabled={pending}
        className="self-start"
      >
        {pending ? "Deleting…" : "Permanently delete account"}
      </Button>
    </form>
  );
}
