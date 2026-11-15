"use client";

import { useId, useState, useTransition } from "react";
import { FormDialog } from "@/components/ui/form-dialog";
import { InlineBanner } from "@/components/ui/inline-banner";
import type { ActionResult } from "@/lib/result";

/** Calendar's one-off destructive confirmation, with the same form footer. */
export function CalendarConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<ActionResult<unknown>>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <FormDialog
      alert
      title={title}
      description={description}
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setError(null);
        setOpen(next);
      }}
      formId={id}
      submitLabel={pending ? "Working…" : confirmLabel}
      submitVariant="danger"
      pending={pending}
      onOpenAutoFocus={(event) => {
        const panel = event.target as HTMLElement;
        const cancel =
          panel.querySelector<HTMLButtonElement>("[data-form-cancel]");
        if (cancel) {
          event.preventDefault();
          cancel.focus();
        }
      }}
    >
      <form
        id={id}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (pending) return;
          startTransition(async () => {
            setError(null);
            try {
              const result = await onConfirm();
              if (result.ok) setOpen(false);
              else setError(result.error.message);
            } catch {
              setError("That didn't work. Please try again.");
            }
          });
        }}
      >
        {error && <InlineBanner tone="error">{error}</InlineBanner>}
      </form>
    </FormDialog>
  );
}
