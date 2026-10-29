"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/skeleton";
import type { LocalDate } from "@/lib/dates";
import { startWeeklyReview } from "@/server/modules/weekly-reviews/actions";

/**
 * Starts the week's review once, on opening the flow (ADR 0015). The
 * action refreshes the page, which then finds the review and shows its
 * first step. Starting again returns the same review, so a second call
 * (a retry, or a double effect in development) changes nothing.
 */
export function StartReview({ week }: { week: LocalDate }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const started = useRef(false);

  function start() {
    startTransition(async () => {
      setError(null);
      const result = await startWeeklyReview({ periodStart: week });
      if (!result.ok) setError(result.error.message);
    });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
    // Started once per mount; a retry goes through the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <ErrorState
        title="The review couldn't start"
        description={error}
        onRetry={start}
      />
    );
  }
  return <LoadingState label="Starting your review" />;
}
