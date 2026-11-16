"use client";

import type { ComponentProps } from "react";

import { Icon } from "@/components/icons/icon";
import { IconButton } from "./icon-button";

export function SearchBar({
  onClear,
  value,
  ...input
}: Omit<ComponentProps<"input">, "type" | "name" | "value" | "className"> & {
  value: string;
  onClear: () => void;
}) {
  return (
    <div className="relative flex min-h-14 min-w-0 flex-1 items-center gap-1 rounded-full bg-surface-container-highest ps-4 pe-1 text-on-surface focus-within:outline-2 focus-within:outline-focus">
      <Icon name="search" className="shrink-0 text-on-surface-variant" />
      <input
        {...input}
        type="search"
        value={value}
        className="min-h-14 min-w-0 flex-1 rounded-full px-1 text-body-large outline-none placeholder:text-on-surface-variant [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <IconButton
          icon="close"
          label="Clear search"
          onClick={onClear}
          tooltip={false}
        />
      )}
    </div>
  );
}
