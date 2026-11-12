"use client";

import Link from "next/link";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useLayoutEffect, useRef, useState } from "react";

type Tab = { value: string; label: string };
type TabsProps = { label: string } & (
  | { mode: "link"; items: readonly (Tab & { href: string })[]; value: string }
  | {
      mode: "panel";
      items: readonly (Tab & { panel: React.ReactNode; disabled?: boolean })[];
      value?: string;
      defaultValue?: string;
      onValueChange?: (value: string) => void;
    }
);

const stripClass =
  "tab-strip relative flex max-w-full overflow-x-auto border-b border-outline-variant";
const tabClass =
  "ui-tab state-layer inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center px-4 text-label-large";

function TabLabel({ label }: { label: string }) {
  return (
    <span className="tab-label relative">
      <span
        aria-hidden="true"
        className="invisible block text-label-large-emphasized"
      >
        {label}
      </span>
      <span className="absolute inset-0">{label}</span>
    </span>
  );
}

export function Tabs(props: TabsProps) {
  const [internalValue, setValue] = useState(
    props.mode === "panel"
      ? (props.defaultValue ??
          props.items.find((item) => !item.disabled)?.value)
      : undefined,
  );
  const value = props.value ?? internalValue;
  const strip = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = strip.current;
    const label = element?.querySelector<HTMLElement>(
      ":is([aria-current=page], [aria-selected=true]) > .tab-label",
    );
    if (!element || !label) return;
    function positionIndicator() {
      if (!element || !label) return;
      const x =
        label.getBoundingClientRect().left -
        element.getBoundingClientRect().left +
        element.scrollLeft;
      element.style.setProperty("--tab-x", `${x}px`);
      element.style.setProperty("--tab-width", `${label.offsetWidth}px`);
    }
    positionIndicator();
    const observer = new ResizeObserver(positionIndicator);
    for (const tab of element.querySelectorAll(".ui-tab"))
      observer.observe(tab);
    return () => observer.disconnect();
  }, [value]);

  if (props.mode === "link") {
    return (
      <nav ref={strip} className={stripClass} aria-label={props.label}>
        {props.items.map(({ href, value, label }) => (
          <Link
            key={value}
            href={href}
            className={tabClass}
            aria-current={props.value === value ? "page" : undefined}
          >
            <TabLabel label={label} />
          </Link>
        ))}
        <span aria-hidden="true" className="tab-indicator" />
      </nav>
    );
  }

  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(next) => {
        setValue(next);
        props.onValueChange?.(next);
      }}
    >
      <TabsPrimitive.List
        ref={(element) => {
          strip.current = element;
        }}
        aria-label={props.label}
        className={stripClass}
      >
        {props.items.map(({ value, label, disabled }) => (
          <TabsPrimitive.Trigger
            key={value}
            value={value}
            disabled={disabled}
            className={tabClass}
          >
            <TabLabel label={label} />
          </TabsPrimitive.Trigger>
        ))}
        <span aria-hidden="true" className="tab-indicator" />
      </TabsPrimitive.List>
      {props.items.map(({ value, panel }) => (
        <TabsPrimitive.Content
          key={value}
          value={value}
          className="rounded-sm p-4 text-body-medium"
        >
          {panel}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
