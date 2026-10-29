"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { deleteWeeklyReview } from "@/server/modules/weekly-reviews/actions";

/**
 * Confirms a review's hard delete (ADR 0015), open or closed, then goes
 * back to the list of past reviews. `weekLabel` is formatted on the server.
 */
export function DeleteReviewDialog({
  reviewId,
  weekLabel,
}: {
  reviewId: string;
  weekLabel: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" size="sm">
          Delete review
        </Button>
      }
      title={`Delete the review of ${weekLabel}?`}
      description="This permanently deletes what you wrote and the priorities you chose. The goals and tasks themselves stay as they are. It can't be undone."
      confirmLabel="Delete review"
      onConfirm={async () => {
        const result = await deleteWeeklyReview({ id: reviewId });
        if (result.ok) {
          toast({ title: "Review deleted", variant: "success" });
          router.replace("/review/history");
        }
        return result;
      }}
    />
  );
}
