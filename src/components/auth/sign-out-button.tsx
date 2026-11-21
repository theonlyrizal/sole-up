"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { MenuItem } from "@/components/ui/menu";
import { authClient } from "@/lib/auth-client";
import { clearBrowserNotifications } from "@/lib/sign-out-privacy";

export function SignOutButton({
  variant = "button",
  buttonTone = "outlined",
}: {
  variant?: "button" | "icon" | "menu";
  buttonTone?: "outlined" | "tonal";
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      await clearBrowserNotifications();
      const result = await authClient.signOut();
      if (result.error) throw result.error;
    } catch {
      setPending(false);
      setFailed(true);
      return;
    }
    // Discard this tab's private React state and router cache.
    window.location.replace("/sign-in");
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
          variant={buttonTone}
          size="xs"
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
