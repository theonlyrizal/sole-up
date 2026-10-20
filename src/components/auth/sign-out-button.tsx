"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    const result = await authClient.signOut();
    if (result.error) {
      setPending(false);
      setFailed(true);
      return;
    }
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {failed && (
        <span role="alert" className="text-sm text-danger">
          Sign-out failed. Try again.
        </span>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
