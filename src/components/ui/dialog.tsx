"use client";

import { Dialog as DialogPrimitive } from "radix-ui";

import { cx } from "./cx";
import { IconButton } from "./icon-button";
import { useOverlayContainer } from "./overlay-container";

/**
 * A modal dialog (Radix): focus moves in and is trapped, Escape and the
 * close button dismiss it, and focus returns to the trigger.
 *
 * ```tsx
 * <Dialog>
 *   <DialogTrigger asChild><Button>Edit</Button></DialogTrigger>
 *   <DialogContent title="Edit goal">…</DialogContent>
 * </Dialog>
 * ```
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const overlayClass = "dialog-scrim fixed inset-0 z-40 bg-scrim/32";

export const contentClass =
  "dialog-panel fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl bg-surface-container-high p-6 text-on-surface shadow-3 focus-visible:outline-none";

/** A snackbar can register its Radix layer after the focused dialog opens. */
export function closeDialogOnEscape(
  event: React.KeyboardEvent<HTMLDivElement>,
) {
  const { currentTarget, target } = event;
  if (
    event.key !== "Escape" ||
    event.defaultPrevented ||
    !(target instanceof Element) ||
    target.closest('[role="dialog"], [role="alertdialog"]') !== currentTarget
  )
    return;

  const close = currentTarget.querySelector<HTMLButtonElement>(
    "[data-dialog-close]",
  );
  if (!close || close.disabled) return;
  event.preventDefault();
  close.click();
}

export function DialogSurface({
  description,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  description?: React.ReactNode;
}) {
  const container = useOverlayContainer();
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          closeDialogOnEscape(event);
        }}
      />
    </DialogPrimitive.Portal>
  );
}

export function DialogHeading({
  title,
  description,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="dialog-heading flex items-center justify-between gap-2">
        <DialogPrimitive.Title className="min-w-0 text-headline-small wrap-anywhere">
          {title}
        </DialogPrimitive.Title>
        <DialogClose asChild>
          <IconButton
            data-dialog-close=""
            icon="close"
            label="Close"
            tooltip={false}
          />
        </DialogClose>
      </div>
      {description && (
        <DialogPrimitive.Description asChild>
          <div className="text-body-medium text-on-surface-variant">
            {description}
          </div>
        </DialogPrimitive.Description>
      )}
    </div>
  );
}

type DialogContentProps = {
  title: string;
  size?: "m" | "l";
  /** Read out when the dialog opens. Omit only if the title says it all. */
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /**
   * Where focus goes on close. Call `preventDefault()` and move focus
   * yourself when the opening element may have been re-rendered (a dialog
   * opened from a calendar item); otherwise focus returns to the trigger.
   */
  onCloseAutoFocus?: (event: Event) => void;
};

export function DialogContent({
  title,
  size = "m",
  description,
  children,
  className,
  onCloseAutoFocus,
}: DialogContentProps) {
  return (
    <DialogSurface
      data-size={size}
      className={cx(contentClass, className)}
      onCloseAutoFocus={onCloseAutoFocus}
      description={description}
    >
      <DialogHeading title={title} description={description} />
      {children}
    </DialogSurface>
  );
}
