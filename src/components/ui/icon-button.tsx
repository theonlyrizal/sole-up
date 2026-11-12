"use client";

import Link from "next/link";
import { Tooltip } from "radix-ui";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons/icon";
import { useMediaQuery } from "@/components/hooks/use-media-query";
import { cx, focusRing } from "./cx";

const variants = {
  standard: "action-standard",
  filled: "action-filled",
  tonal: "action-tonal",
  outlined: "action-outlined",
};

type IconOptions = {
  icon: IconName;
  label: string;
  variant?: keyof typeof variants;
  size?: 40 | 48;
  selected?: boolean;
  tooltip?: boolean;
};

function iconClass(
  variant: keyof typeof variants,
  size: 40 | 48,
  className?: string,
) {
  return cx(
    "ui-action state-layer morph-press inline-grid size-12 shrink-0 place-items-center",
    size === 40 && "action-icon-dense",
    variants[variant],
    focusRing,
    className,
  );
}

function IconTooltip({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: React.ReactElement;
}) {
  const medium = useMediaQuery("medium");
  const [open, setOpen] = useState(false);
  // Keep the trigger mounted when crossing the breakpoint.
  return (
    <Tooltip.Provider delayDuration={500}>
      <Tooltip.Root
        open={Boolean(enabled && medium && open)}
        onOpenChange={setOpen}
      >
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Content
          sideOffset={4}
          className="z-50 max-w-xs rounded-xs bg-inverse-surface px-2 py-1 text-body-small text-inverse-on-surface"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export type IconButtonProps = Omit<React.ComponentProps<"button">, "children"> &
  IconOptions;

export function IconButton({
  label,
  icon,
  variant = "standard",
  size = 48,
  selected,
  tooltip = true,
  type = "button",
  className,
  ...props
}: IconButtonProps) {
  return (
    <IconTooltip label={label} enabled={tooltip && !props.disabled}>
      <button
        {...props}
        type={type}
        aria-label={label}
        aria-pressed={selected ?? props["aria-pressed"]}
        className={iconClass(variant, size, className)}
      >
        <Icon name={icon} filled={selected} />
      </button>
    </IconTooltip>
  );
}

type IconLinkProps = Omit<React.ComponentProps<typeof Link>, "children"> &
  Omit<IconOptions, "selected">;

export function IconLink({
  label,
  icon,
  variant = "standard",
  size = 48,
  tooltip = true,
  className,
  ...props
}: IconLinkProps) {
  return (
    <IconTooltip label={label} enabled={tooltip}>
      <Link
        {...props}
        aria-label={label}
        className={iconClass(variant, size, className)}
      >
        <Icon
          name={icon}
          filled={Boolean(
            props["aria-current"] && props["aria-current"] !== "false",
          )}
        />
      </Link>
    </IconTooltip>
  );
}
