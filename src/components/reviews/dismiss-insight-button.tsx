"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { toast } from "@/components/ui/toast";
import type { LocalDate } from "@/lib/dates";
import type { InsightKey } from "@/lib/insights";
import { dismissInsight } from "@/server/modules/insights/actions";

export function DismissInsightButton({
  insightKey,
  start,
  title,
}: {
  insightKey: InsightKey;
  start: LocalDate;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label =
    insightKey === "goal_inactivity"
      ? "Dismiss for this week"
      : "Dismiss for this period";

  function dismiss() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await dismissInsight({ key: insightKey, start });
        if (result.ok) {
          toast({ title: "Insight dismissed", variant: "success" });
        } else {
          setError(result.error.message);
        }
      } catch {
        setError("The insight couldn't be dismissed. Try again.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="text"
        size="xs"
        pending={pending}
        onClick={dismiss}
        aria-label={`${label}: ${title}`}
      >
        {pending ? "Dismissing…" : label}
      </Button>
      {error && (
        <div className="w-full">
          <InlineBanner tone="error">{error}</InlineBanner>
        </div>
      )}
    </>
  );
}
