"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { deleteWeeklyReview } from "@/server/modules/weekly-reviews/actions";

export function DeleteReviewDialog({
  reviewId,
  weekLabel,
}: {
  reviewId: string;
  weekLabel: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Menu modal={false}>
        <MenuTrigger asChild>
          <IconButton
            ref={trigger}
            icon="more_vert"
            label="Review options"
            tooltip={false}
          />
        </MenuTrigger>
        <MenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (confirming) event.preventDefault();
          }}
        >
          <MenuItem
            icon="delete"
            destructive
            onSelect={() => setConfirming(true)}
          >
            Delete…
          </MenuItem>
        </MenuContent>
      </Menu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
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
    </>
  );
}
