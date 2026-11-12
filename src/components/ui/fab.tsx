"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons/icon";
import { cx, filledFocusRing } from "./cx";

type FabProps = Omit<React.ComponentProps<"button">, "children"> & {
  label: string;
  icon?: IconName;
  extended?: boolean;
  placement?: "shell" | "inline";
};

export function Fab({
  label,
  icon = "add",
  extended,
  placement = "shell",
  className,
  type = "button",
  ...props
}: FabProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      className={cx(
        "fab state-layer inline-flex min-h-14 max-w-full min-w-14 items-center justify-center gap-2 morph-press bg-primary-container text-title-medium text-on-primary-container shadow-3 not-disabled:hover:shadow-4 disabled:cursor-not-allowed",
        filledFocusRing,
        extended ? "ps-4 pe-5" : "size-14",
        placement === "shell" && "fab-shell",
        className,
      )}
    >
      <span className="fab-icon inline-grid size-6 shrink-0 place-items-center">
        <Icon name={icon} className="fab-icon-rest" />
        {props["aria-expanded"] !== undefined && (
          <Icon name="close" className="fab-icon-close" />
        )}
      </span>
      {extended && <span className="wrap-anywhere">{label}</span>}
    </button>
  );
}

type FabMenuItem = {
  icon: IconName;
  label: string;
  shortcut?: string;
  disabled?: boolean;
} & (
  { href: string; onSelect?: never } | { href?: never; onSelect: () => void }
);

type FabMenuProps = Pick<
  FabProps,
  "placement" | "label" | "extended" | "disabled"
> & {
  items: readonly FabMenuItem[];
};

export function FabMenu({
  items,
  label,
  placement,
  extended,
  disabled,
}: FabMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Fab
          label={label}
          placement={placement}
          extended={extended}
          disabled={disabled}
          aria-expanded={open}
        />
      </DropdownMenu.Trigger>
      {open && (
        <DropdownMenu.Portal>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-40 bg-scrim/16"
          />
        </DropdownMenu.Portal>
      )}
      <DropdownMenu.Content
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={8}
        className="fab-menu z-50 flex max-w-[calc(100vw-1rem)] flex-col items-end gap-2 focus-visible:outline-none"
      >
        {items.map(
          ({ icon, label, shortcut, href, onSelect, disabled }, index) => {
            const content = (
              <>
                <Icon name={icon} className="shrink-0" />
                <span className="wrap-anywhere">{label}</span>
                {shortcut && (
                  <kbd className="text-label-medium" aria-hidden="true">
                    {shortcut}
                  </kbd>
                )}
              </>
            );
            return (
              <DropdownMenu.Item
                key={label}
                asChild
                disabled={disabled}
                onSelect={onSelect}
                textValue={label}
              >
                {href ? (
                  <Link
                    href={href}
                    className="fab-menu-item"
                    style={
                      {
                        "--fab-index": items.length - 1 - index,
                      } as React.CSSProperties
                    }
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="fab-menu-item"
                    style={
                      {
                        "--fab-index": items.length - 1 - index,
                      } as React.CSSProperties
                    }
                  >
                    {content}
                  </button>
                )}
              </DropdownMenu.Item>
            );
          },
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
