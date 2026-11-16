"use client";

import { Icon } from "@/components/icons/icon";
import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { SHAPES } from "@/components/ui/shapes";

export function ReviewFinishSheet({
  open,
  editableUntil,
  onOpenChange,
  onCloseAutoFocus,
}: {
  open: boolean;
  editableUntil: string;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      title={
        <span className="grid gap-3">
          <span
            aria-hidden="true"
            className="relative grid size-18 place-items-center text-on-reward-container"
          >
            <svg
              focusable="false"
              viewBox="0 0 100 100"
              className="absolute inset-0 size-full fill-reward-container"
            >
              <path d={SHAPES["soft-burst"]} />
            </svg>
            <Icon name="check" size={32} className="relative" />
          </span>
          <span>Your review is saved</span>
        </span>
      }
      description={`You can change it until ${editableUntil}.`}
    >
      <div className="flex justify-end pt-2">
        <DialogClose asChild>
          <Button className="w-full medium:w-auto">Done</Button>
        </DialogClose>
      </div>
    </ResponsiveSheet>
  );
}
