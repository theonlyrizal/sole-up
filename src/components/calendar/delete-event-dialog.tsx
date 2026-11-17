"use client";

import { useId, useRef, useState, useTransition } from "react";

import { InlineBanner } from "@/components/ui/inline-banner";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { CalendarConfirmDialog } from "./calendar-confirm-dialog";
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
    <Button variant="text" size="xs" aria-label={`Delete: ${event.title}`}>
      Delete
    </Button>
  );
  const originalStart = originalStartParam(event);
  if (originalStart === null) {
    return (
      <CalendarConfirmDialog
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
  const contentRef = useRef<HTMLFormElement>(null);
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
    <FormDialog
      alert
      title={`Delete “${event.title}”?`}
      description={"This event repeats. Deleted events can’t be brought back."}
      trigger={trigger}
      open={open}
      onOpenChange={changeOpen}
      formId={id}
      submitLabel={pending ? "Deleting…" : "Delete"}
      submitVariant="danger"
      pending={pending}
      submitDisabled={loading}
      onOpenAutoFocus={(focusEvent) => {
        // Start on the choice rather than Cancel: it's the question.
        const radio =
          contentRef.current?.querySelector<HTMLInputElement>("input:checked");
        if (radio) {
          focusEvent.preventDefault();
          radio.focus();
        }
      }}
    >
      <form
        id={id}
        ref={contentRef}
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!pending && !loading) confirm();
        }}
      >
        <ScopeChooser
          id={`${id}-scope`}
          noun="event"
          legend="Delete"
          action="delete"
          value={scope}
          onChange={setScope}
          options={options}
          loading={loading}
          locale={locale}
          timeZone={timeZone}
        />
        {error && <InlineBanner tone="error">{error}</InlineBanner>}
      </form>
    </FormDialog>
  );
}
