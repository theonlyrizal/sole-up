"use client";

import { AlertDialog } from "radix-ui";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/result";
import { Icon, type IconName } from "@/components/icons/icon";

import { Button } from "./button";
import { cx } from "./cx";
import { closeDialogOnEscape, contentClass, overlayClass } from "./dialog";
import { InlineBanner } from "./inline-banner";
import { useOverlayContainer } from "./overlay-container";

type ConfirmDialogProps = {
  /** The element that opens the dialog, usually a `<Button>`. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
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
  icon?: IconName;
};

/**
 * Asks before a destructive or hard-to-undo action. An alert dialog: focus
 * starts on Cancel, Escape cancels, and clicking outside does nothing.
 */
export function ConfirmDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  destructive = true,
  icon = destructive ? "delete" : undefined,
}: ConfirmDialogProps) {
  const container = useOverlayContainer();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
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
      {trigger && <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal container={container}>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content
          className={cx(contentClass, "confirm-dialog")}
          onKeyDown={closeDialogOnEscape}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <div className="grid justify-items-center gap-3 text-center">
            {icon && (
              <Icon
                name={icon}
                className={destructive ? "text-error" : "text-primary"}
              />
            )}
            <AlertDialog.Title className="text-headline-small">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description asChild>
              <div className="text-body-medium text-on-surface-variant">
                {description}
              </div>
            </AlertDialog.Description>
          </div>
          {error && <InlineBanner tone="error">{error}</InlineBanner>}
          <div className="flex flex-wrap justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button data-dialog-close="" variant="text" disabled={pending}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? "danger" : "filled"}
              disabled={pending}
              aria-busy={pending || undefined}
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
