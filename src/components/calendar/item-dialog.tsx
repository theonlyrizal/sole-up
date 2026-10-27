"use client";

import { useRef, useState } from "react";

import { TaskFormDialog } from "@/components/tasks/task-form";
import type { AgendaEntry } from "@/lib/agenda";
import type { PlanTaskItem } from "@/server/modules/tasks/queries";

import { BlockDialog } from "./block-dialog";
import { type EventFormContext, EventFormDialog } from "./event-dialog";

/** One item of the calendar page, in any view. */
export type CalendarEntry = AgendaEntry<PlanTaskItem>;

/**
 * Opens a clicked calendar item's dialog, and afterwards returns focus to
 * the button that opened it. FullCalendar may re-render the items while a
 * dialog is open, replacing the button itself, so the button is found
 * again by its position among the `selector` buttons in `containerRef`.
 */
export function useItemDialog(selector: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The clicked item stays selected while its dialog closes, so the dialog
  // can finish closing and return focus to the item's button.
  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  const [open, setOpen] = useState(false);
  const openerIndex = useRef(-1);
  const buttons = () =>
    Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(selector) ?? [],
    );
  const openItem = (entry: CalendarEntry, opener: HTMLElement) => {
    openerIndex.current = buttons().indexOf(opener);
    setSelected(entry);
    setOpen(true);
  };
  const returnFocus = (event: Event) => {
    const opener = buttons()[openerIndex.current];
    if (!opener) return;
    event.preventDefault();
    opener.focus();
  };
  return {
    containerRef,
    buttons,
    openItem,
    dialog: { selected, open, onOpenChange: setOpen, returnFocus },
  };
}

/** The selected item's dialog: the event form, the block's, or the task form. */
export function ItemDialog({
  selected,
  open,
  onOpenChange,
  returnFocus,
  context,
}: ReturnType<typeof useItemDialog>["dialog"] & {
  context: EventFormContext;
}) {
  if (selected?.kind === "event") {
    return (
      <EventFormDialog
        key={selected.id}
        {...context}
        event={selected.event}
        open={open}
        onOpenChange={onOpenChange}
        onCloseAutoFocus={returnFocus}
      />
    );
  }
  if (selected?.kind === "block") {
    return (
      <BlockDialog
        key={selected.id}
        block={selected.block}
        userTimeZone={context.userTimeZone}
        locale={context.locale}
        open={open}
        onOpenChange={onOpenChange}
        onCloseAutoFocus={returnFocus}
      />
    );
  }
  if (selected?.kind === "task") {
    return (
      <TaskFormDialog
        key={selected.id}
        task={selected.task}
        open={open}
        onOpenChange={onOpenChange}
        onCloseAutoFocus={returnFocus}
      />
    );
  }
  return null;
}
