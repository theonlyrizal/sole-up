"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { MenuItem } from "@/components/ui/menu";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({
  variant = "button",
}: {
  variant?: "button" | "icon" | "menu";
}) {
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

  const label = pending ? "Signing out…" : "Sign out";
  const error = failed && (
    <span role="alert" className="text-body-medium text-error">
      Sign-out failed. Try again.
    </span>
  );
  if (variant === "menu") {
    return (
      <>
        <MenuItem
          icon="logout"
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          {label}
        </MenuItem>
        {error && <div className="px-3 pb-2">{error}</div>}
      </>
    );
  }
  return (
    <div className="flex max-w-full flex-col items-end gap-1">
      {variant === "icon" ? (
        <IconButton
          icon="logout"
          label={label}
          onClick={signOut}
          disabled={pending}
        />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={signOut}
          disabled={pending}
        >
          {label}
        </Button>
      )}
      {error}
    </div>
  );
}
