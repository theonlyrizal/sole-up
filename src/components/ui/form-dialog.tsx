"use client";

import type { ReactElement, ReactNode } from "react";
import { useDialogViewport } from "@/components/hooks/use-dialog-viewport";
import { useMediaQuery } from "@/components/hooks/use-media-query";
import { Button, type ButtonVariant } from "./button";
import { cx } from "./cx";
import {
  Dialog,
  DialogClose,
  DialogHeading,
  DialogSurface,
  DialogTrigger,
  contentClass,
} from "./dialog";

type FormDialogProps = {
  title: string;
  description?: ReactNode;
  formId: string;
  submitLabel: string;
  pending?: boolean;
  submitVariant?: ButtonVariant;
  submitDisabled?: boolean;
  alert?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
  destructive?: ReactNode;
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  size?: "m" | "l";
  children: ReactNode;
};

export function FormDialog({
  title,
  description,
  formId,
  submitLabel,
  pending = false,
  submitVariant,
  submitDisabled,
  alert = false,
  onOpenAutoFocus,
  destructive,
  trigger,
  open,
  onOpenChange,
  onCloseAutoFocus,
  size = "m",
  children,
}: FormDialogProps) {
  const compact = useMediaQuery("medium") === false;
  const trackViewport = useDialogViewport(compact);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogSurface
        ref={trackViewport}
        data-layout={compact ? "fullscreen" : "centered"}
        data-size={size}
        className={cx(contentClass, "form-dialog")}
        description={description}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={onOpenAutoFocus}
        {...(alert && {
          role: "alertdialog",
          onInteractOutside: (event: Event) => event.preventDefault(),
        })}
      >
        <DialogHeading
          title={title}
          description={description}
          className="form-dialog-header"
        />
        <div className="form-dialog-fields min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
          {destructive && (
            <div className="mt-6 border-t border-outline-variant pt-4">
              {destructive}
            </div>
          )}
        </div>
        <footer className="form-dialog-footer sticky bottom-0 flex shrink-0 flex-wrap items-center justify-end gap-2 bg-surface-container-high">
          {(!compact || alert) && (
            <DialogClose asChild>
              <Button variant="text" data-form-cancel="" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
          )}
          <Button
            type="submit"
            form={formId}
            variant={submitVariant}
            pending={pending}
            disabled={submitDisabled}
            fullWidth={compact && !alert}
          >
            {submitLabel}
          </Button>
        </footer>
      </DialogSurface>
    </Dialog>
  );
}
