"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { forceActionError } from "../actions";

export function ForcedActionError() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await forceActionError({});
            setError(result.ok ? null : result.error.message);
          })
        }
      >
        Fail on purpose
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
