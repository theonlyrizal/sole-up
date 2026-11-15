"use client";

import Link from "next/link";
import { ToggleGroup } from "radix-ui";
import { useLayoutEffect, useRef } from "react";
import { Icon, type IconName } from "@/components/icons/icon";
import { cx } from "./cx";

type Item = {
  value: string;
  label: string;
  icon?: IconName;
  href?: string;
  disabled?: boolean;
  className?: string;
};

type ConnectedButtonGroupProps = {
  label: string;
  items: readonly Item[];
  value: string;
  onValueChange?: (value: string) => void;
  size?: "xs" | "s";
  compactLabels?: boolean;
};

const groupClass =
  "flex w-fit max-w-full gap-0.5 overflow-x-auto [scrollbar-width:none]";

export function ConnectedButtonGroup({
  label,
  items,
  value,
  onValueChange,
  size = "s",
  compactLabels = false,
}: ConnectedButtonGroupProps) {
  const group = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const container = group.current;
    const active = container?.querySelector(
      "[aria-current=page], [data-state=on]",
    );
    if (!container || !active) return;
    const bounds = container.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < bounds.left)
      container.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right)
      container.scrollLeft += item.right - bounds.right;
  }, [value]);

  const itemClass = cx(
    "ui-action connected-item state-layer inline-flex min-w-12 shrink-0 items-center justify-center gap-2 text-label-large",
    compactLabels ? "connected-compact whitespace-nowrap" : "px-4",
    size === "xs" ? "action-xs" : "action-s",
  );
  const content = ({ icon, label, value: itemValue }: Item) => (
    <>
      {(!compactLabels || icon) && (
        <span
          className="grid size-5 shrink-0 place-items-center"
          aria-hidden="true"
        >
          {(icon || itemValue === value) && (
            <Icon name={icon ?? "check"} size={20} />
          )}
        </span>
      )}
      {label}
    </>
  );
  if (items.every((item) => item.href !== undefined)) {
    return (
      <nav aria-label={label} className={groupClass} ref={group}>
        {items.map((item) => (
          <Link
            key={item.value}
            href={item.href!}
            className={cx(itemClass, item.className)}
            aria-current={item.value === value ? "page" : undefined}
          >
            {content(item)}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <ToggleGroup.Root
      ref={(element) => {
        group.current = element;
      }}
      type="single"
      role="radiogroup"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange?.(next);
      }}
      className={groupClass}
    >
      {items.map((item) => (
        <ToggleGroup.Item
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          className={cx(itemClass, item.className)}
        >
          {content(item)}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
