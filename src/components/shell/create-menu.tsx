"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import { FabMenu } from "@/components/ui/fab";

export type OpenQuickAdd = (origin?: HTMLElement | null) => void;

export function CreateMenu({
  onQuickAdd,
  rail,
}: {
  onQuickAdd: OpenQuickAdd;
  rail?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const note = {
    label: "New note",
    icon: "note_add",
    href: "/notes/new",
  } as const;
  const task = {
    label: "New task",
    icon: "add_task",
    shortcut: "Q",
    onSelect: () => onQuickAdd(trigger.current),
  } as const;
  return (
    <FabMenu
      triggerRef={trigger}
      triggerProps={{
        "aria-keyshortcuts": "Q Alt+Enter",
        onKeyDown: (event) => {
          if (
            event.key !== "q" ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.repeat
          )
            return;
          if (event.currentTarget.getAttribute("aria-expanded") === "true")
            return;
          event.preventDefault();
          onQuickAdd(event.currentTarget);
        },
      }}
      label="Create"
      placement={rail ? "inline" : "shell"}
      side={rail ? "bottom" : "top"}
      align={rail ? "start" : "end"}
      extended={rail}
      items={!rail && pathname === "/notes" ? [note, task] : [task, note]}
    />
  );
}
