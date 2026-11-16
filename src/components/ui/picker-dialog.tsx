"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { Fragment, useState } from "react";
import { useDialogViewport } from "@/components/hooks/use-dialog-viewport";
import { Button } from "./button";
import { cx } from "./cx";
import {
  Dialog,
  DialogClose,
  DialogSurface,
  DialogTrigger,
  contentClass,
} from "./dialog";
import "./picker-dialog.css";

export const PickerTitle = DialogPrimitive.Title;

export function PickerDialog({
  trigger,
  children,
  className,
}: {
  trigger: React.ReactElement;
  children: React.ReactNode;
  className: string;
}) {
  const trackViewport = useDialogViewport(true);
  const [session, setSession] = useState(0);
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setSession((value) => value + 1);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogSurface
        ref={trackViewport}
        className={cx(
          contentClass,
          "dialog-fit-keyboard picker-dialog",
          className,
        )}
      >
        <Fragment key={session}>{children}</Fragment>
      </DialogSurface>
    </Dialog>
  );
}

export function PickerActions({
  onConfirm,
  onClear,
  confirmRef,
  disabled,
  children,
}: {
  onConfirm: () => void;
  onClear?: () => void;
  confirmRef?: React.Ref<HTMLButtonElement>;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="picker-actions">
      {children}
      <div className="ms-auto flex flex-wrap justify-end gap-2">
        {onClear && (
          <DialogClose asChild>
            <Button variant="text" onClick={onClear}>
              Clear
            </Button>
          </DialogClose>
        )}
        <DialogClose asChild>
          <Button variant="text" data-dialog-close="">
            Cancel
          </Button>
        </DialogClose>
        <DialogClose asChild>
          <Button
            ref={confirmRef}
            variant="text"
            disabled={disabled}
            onClick={onConfirm}
          >
            OK
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}
