"use client";

import { AlertDialog } from "radix-ui";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/result";

import { Button } from "./button";
import { contentClass, overlayClass } from "./dialog";

type ConfirmDialogProps = {
  /** The element that opens the dialog, usually a `<Button>`. */
  trigger: React.ReactElement;
  title: string;
  /** Say exactly what will happen, and whether it can be undone. */
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * Runs on confirm. The dialog stays open, with both buttons disabled,
   * until it settles. A failed `ActionResult` keeps the dialog open and
   * shows its message.
   */
  onConfirm: () => Promise<ActionResult<unknown> | void> | void;
  /** Destructive styling for the confirm button. Defaults to true. */
  destructive?: boolean;
};

/**
 * Asks before a destructive or hard-to-undo action. An alert dialog: focus
 * starts on Cancel, Escape cancels, and clicking outside does nothing.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  destructive = true,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeOpen(next: boolean) {
    if (pending) return;
    setError(null);
    setOpen(next);
  }

  function confirm() {
    startTransition(async () => {
      setError(null);
      try {
        const result = await onConfirm();
        if (result && !result.ok) {
          setError(result.error.message);
          return;
        }
        setOpen(false);
      } catch {
        setError("That didn't work. Please try again.");
      }
    });
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={changeOpen}>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content className={contentClass}>
          <AlertDialog.Title className="text-lg font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-muted">
            {description}
          </AlertDialog.Description>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? "danger" : "primary"}
              disabled={pending}
              onClick={confirm}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
