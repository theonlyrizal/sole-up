"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
      <Button
        variant="secondary"
        size="sm"
        onClick={signOut}
        disabled={pending}
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
