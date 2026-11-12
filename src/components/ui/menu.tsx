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
          "menu-panel floating-panel z-50 max-h-(--radix-dropdown-menu-content-available-height) max-w-70 min-w-28 overflow-y-auto rounded-md bg-surface-container py-2 text-on-surface shadow-2",
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
          "menu-item state-layer flex min-h-12 cursor-default items-center gap-3 px-3 text-body-large",
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
