"use client";

import { Dialog as DialogPrimitive } from "radix-ui";

import { cx, focusRing } from "./cx";

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

export const overlayClass = "fixed inset-0 z-40 bg-black/40";

export const contentClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg focus-visible:outline-none";

type DialogContentProps = {
  title: string;
  /** Read out when the dialog opens. Omit only if the title says it all. */
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function DialogContent({
  title,
  description,
  children,
  className,
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content
        className={cx(contentClass, className)}
        // Without a description Radix warns unless this is explicitly unset.
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <div className="flex items-start justify-between gap-4">
          <DialogPrimitive.Title className="text-lg font-semibold">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close"
            className={cx(
              "-m-1 rounded-md p-1 text-muted hover:bg-surface-muted hover:text-fg",
              focusRing,
            )}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </DialogPrimitive.Close>
        </div>
        {description && (
          <DialogPrimitive.Description className="text-muted">
            {description}
          </DialogPrimitive.Description>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
