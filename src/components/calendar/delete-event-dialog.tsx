"use client";

import { AlertDialog } from "radix-ui";
import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { contentClass, overlayClass } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type {
  CalendarEventOccurrence,
  CalendarEventScope,
} from "@/lib/calendar-events";
import { originalStartParam } from "@/lib/calendar-list";
import {
  deleteCalendarEvent,
  deleteCalendarEventOccurrence,
  previewCalendarEventOccurrenceDelete,
} from "@/server/modules/calendar-events/actions";

import { type ScopeOption, ScopeChooser } from "./scope-chooser";

type DeleteEventDialogProps = {
  event: CalendarEventOccurrence;
  locale: string;
  timeZone: string;
  /** Called once the event is deleted, e.g. to close the edit dialog. */
  onDeleted?: () => void;
};

/**
 * Deletes an event after confirming. A one-off event is deleted outright;
 * for an occurrence of a repeating event the user chooses this event, this
 * and following, or all events, and sees which separately changed
 * occurrences go with them.
 */
export function DeleteEventDialog({
  event,
  locale,
  timeZone,
  onDeleted,
}: DeleteEventDialogProps) {
  const trigger = (
    <Button variant="ghost" size="sm" aria-label={`Delete: ${event.title}`}>
      Delete
    </Button>
  );
  const originalStart = originalStartParam(event);
  if (originalStart === null) {
    return (
      <ConfirmDialog
        trigger={trigger}
        title={`Delete “${event.title}”?`}
        description="This permanently deletes the event and its history. It can't be undone."
        confirmLabel="Delete event"
        onConfirm={async () => {
          const result = await deleteCalendarEvent({ id: event.id });
          if (result.ok) {
            toast({ title: "Event deleted", variant: "success" });
            onDeleted?.();
          }
          return result;
        }}
      />
    );
  }
  return (
    <DeleteOccurrenceDialog
      trigger={trigger}
      event={event}
      originalStart={originalStart}
      locale={locale}
      timeZone={timeZone}
      onDeleted={onDeleted}
    />
  );
}

function DeleteOccurrenceDialog({
  trigger,
  event,
  originalStart,
  locale,
  timeZone,
  onDeleted,
}: {
  trigger: React.ReactElement;
  event: CalendarEventOccurrence;
  originalStart: string;
  locale: string;
  timeZone: string;
  onDeleted?: () => void;
}) {
  const id = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<CalendarEventScope>("this");
  const [options, setOptions] = useState<
    Partial<Record<CalendarEventScope, ScopeOption>>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = { id: event.id, originalStart };

  async function loadPreviews() {
    setLoading(true);
    const [following, all] = await Promise.all([
      previewCalendarEventOccurrenceDelete({ ...key, scope: "following" }),
      previewCalendarEventOccurrenceDelete({ ...key, scope: "all" }),
    ]);
    setLoading(false);
    if (!following.ok) return setError(following.error.message);
    if (!all.ok) return setError(all.error.message);
    setOptions({
      following: { dropped: following.data.dropped },
      all: { dropped: all.data.dropped },
    });
  }

  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setScope("this");
      setOptions({});
      setError(null);
      void loadPreviews();
    }
  }

  function confirm() {
    startTransition(async () => {
      setError(null);
      const result = await deleteCalendarEventOccurrence({ ...key, scope });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast({
        title: scope === "this" ? "Event deleted" : "Events deleted",
        variant: "success",
      });
      setOpen(false);
      onDeleted?.();
    });
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={changeOpen}>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content
          ref={contentRef}
          className={contentClass}
          onOpenAutoFocus={(focusEvent) => {
            // Start on the choice rather than Cancel: it's the question.
            const radio =
              contentRef.current?.querySelector<HTMLInputElement>(
                "input:checked",
              );
            if (radio) {
              focusEvent.preventDefault();
              radio.focus();
            }
          }}
        >
          <AlertDialog.Title className="text-lg font-semibold">
            {`Delete “${event.title}”?`}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-muted">
            This event repeats. Deleted events can&apos;t be brought back.
          </AlertDialog.Description>
          <ScopeChooser
            id={`${id}-scope`}
            legend="Delete"
            action="delete"
            value={scope}
            onChange={setScope}
            options={options}
            loading={loading}
            locale={locale}
            timeZone={timeZone}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="danger"
              disabled={pending || loading}
              onClick={confirm}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
