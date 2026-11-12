"use client";

import { Tooltip as Primitive } from "radix-ui";
import { useState, type ReactElement } from "react";
import { useOverlayContainer } from "./overlay-container";

/** Supplementary help for a trigger that already has an accessible name. */
export function Tooltip({
  label,
  enabled = true,
  children,
}: {
  label: string;
  enabled?: boolean;
  children: ReactElement;
}) {
  const container = useOverlayContainer();
  const [open, setOpen] = useState(false);
  return (
    <Primitive.Provider delayDuration={500}>
      <Primitive.Root
        open={enabled && open}
        onOpenChange={(next) => setOpen(enabled && next)}
      >
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal container={container}>
          <Primitive.Content
            sideOffset={4}
            className="tooltip-panel floating-panel z-50 max-w-xs rounded-xs bg-inverse-surface px-2 py-1 text-body-small text-inverse-on-surface"
          >
            {label}
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
