"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons/icon";
import { cx, filledFocusRing } from "./cx";
import { useOverlayContainer } from "./overlay-container";

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
      {extended && <span className="fab-label wrap-anywhere">{label}</span>}
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
  triggerRef?: React.Ref<HTMLButtonElement>;
  triggerProps?: Pick<FabProps, "onKeyDown" | "aria-keyshortcuts">;
  side?: "top" | "bottom";
  align?: "start" | "end";
};

export function FabMenu({
  items,
  label,
  placement,
  extended,
  disabled,
  triggerRef,
  triggerProps,
  side = "top",
  align = "end",
}: FabMenuProps) {
  const [open, setOpen] = useState(false);
  const selectedAction = useRef<(() => void) | undefined>(undefined);
  const container = useOverlayContainer();
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <Fab
          {...triggerProps}
          ref={triggerRef}
          label={label}
          placement={placement}
          extended={extended}
          disabled={disabled}
          aria-expanded={open}
        />
      </DropdownMenu.Trigger>
      {open && (
        <DropdownMenu.Portal container={container}>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-40 bg-scrim/16"
          />
        </DropdownMenu.Portal>
      )}
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={8}
          onCloseAutoFocus={() => {
            // Let the menu release its focus scope before a selected action opens a dialog.
            const action = selectedAction.current;
            selectedAction.current = undefined;
            action?.();
          }}
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
                  onSelect={() => {
                    selectedAction.current = onSelect;
                  }}
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
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
