"use client";

import {
  RouteErrorState,
  type RouteErrorProps,
} from "@/components/ui/route-error-state";

/**
 * Catches unexpected errors in any page. Shows fixed text only: an error's
 * message can carry user content or internals, so it is never displayed.
 * The reference is the error's digest, which the server logs with the
 * request ID (src/instrumentation-node.ts).
 */
export default function RootError(props: RouteErrorProps) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16"
    >
      <RouteErrorState {...props} />
    </main>
  );
}
