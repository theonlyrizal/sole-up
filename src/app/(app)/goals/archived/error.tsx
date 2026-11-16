"use client";

import {
  RouteErrorState,
  type RouteErrorProps,
} from "@/components/ui/route-error-state";

/**
 * Keeps the shell when the archive fails to load. Fixed text only, plus the
 * error's reference (see src/app/error.tsx).
 */
export default function ArchivedGoalsError(props: RouteErrorProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <RouteErrorState {...props} title="Archived goals couldn't load" />
    </div>
  );
}
