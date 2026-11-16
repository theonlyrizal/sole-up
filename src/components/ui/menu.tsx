"use client";

import { DropdownMenu } from "radix-ui";
import { Icon, type IconName } from "@/components/icons/icon";
import { cx } from "./cx";
import { useOverlayContainer } from "./overlay-container";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuSeparator = DropdownMenu.Separator;

export function MenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Content>) {
  const container = useOverlayContainer();
  return (
    <DropdownMenu.Portal container={container}>
      <DropdownMenu.Content
        {...props}
        sideOffset={sideOffset}
        className={cx(
          "menu-panel z-50 grid max-h-(--radix-dropdown-menu-content-available-height) w-max max-w-[min(17.5rem,calc(100vi-2rem))] min-w-28 gap-1 overflow-y-auto overscroll-contain rounded-lg bg-surface-container-low p-1 text-on-surface shadow-2",
          className,
        )}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  icon,
  shortcut,
  destructive,
  children,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item> & {
  icon?: IconName;
  shortcut?: string;
  destructive?: boolean;
}) {
  return (
    <>
      {destructive && (
        <MenuSeparator className="mx-3 my-1 border-t border-outline-variant" />
      )}
      <DropdownMenu.Item
        {...props}
        className={cx(
          "menu-item state-layer flex min-h-11 cursor-default items-center gap-3 rounded-md px-3 py-2 text-body-medium",
          destructive && "text-error",
          className,
        )}
      >
        {icon && <Icon name={icon} size={20} className="shrink-0" />}
        <span className="min-w-0 flex-1 wrap-anywhere">{children}</span>
        {shortcut && (
          <kbd aria-hidden="true" className="text-label-medium">
            {shortcut}
          </kbd>
        )}
      </DropdownMenu.Item>
    </>
  );
}
