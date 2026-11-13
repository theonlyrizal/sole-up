"use client";

import { useTransition } from "react";
import { PageFrame } from "@/components/shell/page-frame";
import { PlanTabs } from "@/components/shell/plan-tabs";
import { Card } from "@/components/ui/card";
import { ErrorReference, errorDigest } from "@/components/ui/error-reference";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Keeps the shell when Today fails to load. Fixed text only, plus the
 * error's reference (see src/app/error.tsx).
 */
export default function TodayError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const [retrying, startRetry] = useTransition();
  return (
    <PageFrame title="Today" subnav={<PlanTabs />}>
      <Card as="div" className="mx-auto w-full max-w-2xl">
        <ErrorState
          tone="neutral"
          title="Today couldn't load"
          description={
            <>
              <p>
                Your data is safe. Try again, and if it keeps happening, reload
                the page.
              </p>
              <ErrorReference id={errorDigest(error)} />
            </>
          }
          onRetry={() => startRetry(retry)}
          retrying={retrying}
        />
      </Card>
    </PageFrame>
  );
}
