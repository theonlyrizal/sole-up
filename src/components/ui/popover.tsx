"use client";

import { Popover as Primitive } from "radix-ui";
import { cx } from "./cx";
import { useOverlayContainer } from "./overlay-container";

export const Popover = Primitive.Root;
export const PopoverAnchor = Primitive.Anchor;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverTitle = Primitive.Title;
export const PopoverDescription = Primitive.Description;
export const PopoverClose = Primitive.Close;

export function PopoverContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  const container = useOverlayContainer();
  return (
    <Primitive.Portal container={container}>
      <Primitive.Content
        {...props}
        sideOffset={sideOffset}
        className={cx(
          "popover-panel floating-panel z-50 grid max-h-(--radix-popover-content-available-height) max-w-[min(24rem,var(--radix-popover-content-available-width))] gap-3 overflow-y-auto rounded-lg bg-surface-container p-4 text-on-surface shadow-2",
          className,
        )}
      />
    </Primitive.Portal>
  );
}
