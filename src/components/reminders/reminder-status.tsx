"use client";

import { useEffect, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { SNOOZE_MINUTES, type SnoozeMinutes } from "@/lib/reminders";
import {
  getReminderStatus,
  snoozeReminder,
} from "@/server/modules/reminders/actions";
import type { ReminderStatusView } from "@/server/modules/reminders/status";
import type { ReminderItem } from "@/server/modules/reminders/validation";

const SNOOZE_LABELS: Record<SnoozeMinutes, string> = {
  15: "Snooze 15 min",
  60: "Snooze 1 hour",
};

/**
 * An item dialog's "Reminder" section (chunk 5.6): the next reminder, or
 * what happened to the last one ("Skipped: quiet hours"), and snooze for a
 * reminder that went out while its target is still ahead. Read when the
 * dialog opens and again after a snooze. Shows nothing for an item that
 * has never had a reminder.
 */
export function ReminderStatus({ item }: { item: ReminderItem }) {
  const headingId = useId();
  const [status, setStatus] = useState<ReminderStatusView | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped to read the status again (after a snooze).
  const [version, setVersion] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getReminderStatus(item).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setStatus(result.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // The item's kind and ID identify it; a new object each render doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.kind, item.id, version]);

  function snooze(id: string, minutes: SnoozeMinutes) {
    startTransition(async () => {
      const result = await snoozeReminder({ id, minutes });
      if (result.ok) {
        toast({ title: "Reminder snoozed", variant: "success" });
        setVersion((count) => count + 1);
      } else {
        toast({ title: result.error.message, variant: "error" });
      }
    });
  }

  if (failed) {
    return (
      <p role="alert" className="text-sm text-danger">
        Couldn&apos;t load the reminder. Try reopening this dialog.
      </p>
    );
  }
  if (!status || (!status.next && !status.last && !status.snoozeId)) {
    return null;
  }
  const { next, last, snoozeId } = status;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 border-t border-border pt-4"
    >
      <h3 id={headingId} className="font-semibold">
        Reminder
      </h3>
      <p className="text-sm" aria-live="polite">
        {next
          ? `Next reminder: ${next.when}${next.snoozed ? " (snoozed)" : ""}`
          : last}
      </p>
      {snoozeId && (
        <div className="flex flex-wrap gap-2">
          {SNOOZE_MINUTES.map((minutes) => (
            <Button
              key={minutes}
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => snooze(snoozeId, minutes)}
            >
              {SNOOZE_LABELS[minutes]}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
