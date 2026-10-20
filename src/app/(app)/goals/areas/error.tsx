"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Keeps the shell when the list fails to load. Fixed text only. */
export default function LifeAreasError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <ErrorState
        headingLevel={1}
        title="Life areas couldn't load"
        onRetry={retry}
      />
    </div>
  );
}
