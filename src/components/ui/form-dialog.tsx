"use client";

import { useCallback, type ReactElement, type ReactNode } from "react";
import { useMediaQuery } from "@/components/hooks/use-media-query";
import { Button } from "./button";
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
  destructive,
  trigger,
  open,
  onOpenChange,
  onCloseAutoFocus,
  size = "m",
  children,
}: FormDialogProps) {
  const compact = useMediaQuery("medium") === false;
  const trackViewport = useCallback(
    (panel: HTMLDivElement | null) => {
      if (!panel || !compact || !window.visualViewport) return;
      const viewport = window.visualViewport;
      function update() {
        // At normal zoom the visual viewport follows the keyboard and its pan.
        panel?.style.setProperty(
          "--form-viewport-height",
          viewport.scale === 1 ? `${viewport.height}px` : "100dvh",
        );
        panel?.style.setProperty(
          "--form-viewport-top",
          viewport.scale === 1 ? `${viewport.offsetTop}px` : "0px",
        );
      }
      update();
      viewport.addEventListener("resize", update);
      viewport.addEventListener("scroll", update);
      return () => {
        viewport.removeEventListener("resize", update);
        viewport.removeEventListener("scroll", update);
        panel.style.removeProperty("--form-viewport-height");
        panel.style.removeProperty("--form-viewport-top");
      };
    },
    [compact],
  );

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
          {!compact && (
            <DialogClose asChild>
              <Button variant="text">Cancel</Button>
            </DialogClose>
          )}
          <Button
            type="submit"
            form={formId}
            pending={pending}
            fullWidth={compact}
          >
            {submitLabel}
          </Button>
        </footer>
      </DialogSurface>
    </Dialog>
  );
}
