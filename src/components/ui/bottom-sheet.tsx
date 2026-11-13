"use client";

import { Dialog as Primitive } from "radix-ui";
import {
  useCallback,
  useRef,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useMediaQuery } from "@/components/hooks/use-media-query";
import { useDialogViewport } from "@/components/hooks/use-dialog-viewport";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogSurface,
  DialogTrigger,
} from "./dialog";
import { IconButton } from "./icon-button";
import {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

type SheetProps = {
  title: string;
  description?: ReactNode;
  trigger?: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  fitKeyboard?: boolean;
  children: ReactNode;
};

export function BottomSheet({
  title,
  description,
  trigger,
  children,
  onCloseAutoFocus,
  fitKeyboard = false,
  ...root
}: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const trackViewport = useDialogViewport(fitKeyboard);
  const setPanel = useCallback(
    (element: HTMLDivElement | null) => {
      panel.current = element;
      return trackViewport(element);
    },
    [trackViewport],
  );
  const close = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    id: number;
    start: number;
    y: number;
    time: number;
    velocity: number;
  } | null>(null);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || !panel.current) return;
    const y = event.clientY;
    drag.current = {
      id: event.pointerId,
      start: y,
      y,
      time: event.timeStamp,
      velocity: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    panel.current.dataset.dragging = "true";
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!panel.current || active?.id !== event.pointerId) return;
    active.velocity =
      (event.clientY - active.y) / Math.max(1, event.timeStamp - active.time);
    active.y = event.clientY;
    active.time = event.timeStamp;
    panel.current.style.setProperty(
      "--sheet-drag",
      `${Math.max(0, active.y - active.start)}px`,
    );
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!panel.current || active?.id !== event.pointerId) return;
    const distance = event.clientY - active.start;
    const flick =
      distance > 24 &&
      active.velocity > 0.65 &&
      event.timeStamp - active.time < 100;
    drag.current = null;
    delete panel.current.dataset.dragging;
    panel.current.style.removeProperty("--sheet-drag");
    if (
      event.type === "pointerup" &&
      (distance > panel.current.offsetHeight * 0.3 || flick)
    ) {
      close.current?.click();
    }
  }

  return (
    <Dialog {...root}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogSurface
        ref={setPanel}
        data-fit-keyboard={fitKeyboard || undefined}
        onCloseAutoFocus={onCloseAutoFocus}
        description={description}
        className="bottom-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl bg-surface-container-low text-on-surface shadow-3"
      >
        <div
          aria-hidden="true"
          className="sheet-handle flex h-10 shrink-0 touch-none justify-center pt-4"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
        >
          <span className="h-1 w-8 rounded-full bg-outline" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4">
          <Primitive.Title className="text-title-large wrap-anywhere">
            {title}
          </Primitive.Title>
          <DialogClose asChild>
            <IconButton
              ref={close}
              data-dialog-close=""
              icon="close"
              label="Close"
              tooltip={false}
            />
          </DialogClose>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {description && (
            <Primitive.Description asChild>
              <div className="text-body-medium text-on-surface-variant">
                {description}
              </div>
            </Primitive.Description>
          )}
          {children}
        </div>
      </DialogSurface>
    </Dialog>
  );
}

export function ResponsiveSheet({
  anchor,
  trigger,
  title,
  description,
  children,
  onCloseAutoFocus,
  ...root
}: SheetProps & { anchor?: ReactElement }) {
  const medium = useMediaQuery("medium");
  if (medium === false) {
    return (
      <BottomSheet
        {...root}
        title={title}
        description={description}
        trigger={trigger ?? anchor}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
      </BottomSheet>
    );
  }
  if (anchor) {
    return (
      <Popover {...root}>
        {trigger && <PopoverAnchor asChild>{anchor}</PopoverAnchor>}
        <PopoverTrigger asChild>{trigger ?? anchor}</PopoverTrigger>
        <PopoverContent onCloseAutoFocus={onCloseAutoFocus}>
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle className="text-title-large">{title}</PopoverTitle>
            <PopoverClose asChild>
              <IconButton icon="close" label="Close" tooltip={false} />
            </PopoverClose>
          </div>
          {description && (
            <PopoverDescription asChild>
              <div className="text-body-medium text-on-surface-variant">
                {description}
              </div>
            </PopoverDescription>
          )}
          {children}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Dialog {...root}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        title={title}
        description={description}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
