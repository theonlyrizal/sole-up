"use client";

import { Collapsible } from "radix-ui";
import { useState } from "react";
import { Icon } from "@/components/icons/icon";
import { Button } from "./button";

export function Disclosure({
  title,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof Collapsible.Root> & { title: string }) {
  const [localOpen, setOpen] = useState(defaultOpen);
  const expanded = open ?? localOpen;
  return (
    <Collapsible.Root
      {...props}
      open={expanded}
      onOpenChange={(next) => {
        if (open === undefined) setOpen(next);
        onOpenChange?.(next);
      }}
    >
      <Collapsible.Trigger asChild>
        <Button variant="text" className="disclosure-trigger">
          {title}
          <Icon name="expand_more" size={20} />
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content forceMount>
        {/* Radix measures its content with transitions disabled. */}
        <div className="disclosure-content">
          <div
            inert={!expanded}
            aria-hidden={!expanded || undefined}
            className="min-h-0 overflow-hidden"
          >
            {children}
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
