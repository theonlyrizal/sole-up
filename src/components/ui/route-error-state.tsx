"use client";

import { useTransition } from "react";

import { ErrorReference, errorDigest } from "./error-reference";
import { ErrorState } from "./error-state";

export type RouteErrorProps = {
  error: unknown;
  retry: () => void;
};

/** Route failures only render fixed copy and a framework-provided reference. */
export function RouteErrorState({
  error,
  retry,
  title = "Something went wrong",
  headingLevel = 1,
}: RouteErrorProps & { title?: string; headingLevel?: 1 | 2 }) {
  const [retrying, startRetry] = useTransition();

  return (
    <ErrorState
      title={title}
      headingLevel={headingLevel}
      description={
        <div className="grid gap-2">
          <p>Try again, and if it keeps happening, reload the page.</p>
          <ErrorReference id={errorDigest(error)} />
        </div>
      }
      onRetry={() => startRetry(retry)}
      retrying={retrying}
    />
  );
}
