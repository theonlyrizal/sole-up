"use client";

import { ErrorReference, errorDigest } from "@/components/ui/error-reference";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Catches unexpected errors in any page. Shows fixed text only: an error's
 * message can carry user content or internals, so it is never displayed.
 * The reference is the error's digest, which the server logs with the
 * request ID (src/instrumentation-node.ts).
 */
export default function RootError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16"
    >
      <ErrorState
        headingLevel={1}
        title="Something went wrong"
        description={
          <>
            <p>
              This page couldn&apos;t load. Your data is safe. Try again, and if
              it keeps happening, reload the page.
            </p>
            <ErrorReference id={errorDigest(error)} />
          </>
        }
        onRetry={retry}
      />
    </main>
  );
}
