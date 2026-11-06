"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
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
      const result = await dismissInsight({ key: insightKey, start });
      if (result.ok) {
        toast({ title: "Insight dismissed", variant: "success" });
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={dismiss}
        aria-label={`${label}: ${title}`}
      >
        {pending ? "Dismissing…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
