"use client";

import { ErrorReference, errorDigest } from "@/components/ui/error-reference";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Keeps the shell when the archive fails to load. Fixed text only, plus the
 * error's reference (see src/app/error.tsx).
 */
export default function ArchivedGoalsError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <ErrorState
        headingLevel={1}
        title="Archived goals couldn't load"
        description={
          <>
            <p>
              Your data is safe. Try again, and if it keeps happening, reload
              the page.
            </p>
            <ErrorReference id={errorDigest(error)} />
          </>
        }
        onRetry={retry}
      />
    </div>
  );
}
