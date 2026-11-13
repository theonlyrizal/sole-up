"use client";

import { useRef, useState, useTransition } from "react";

import { toast } from "@/components/ui/toast";
import type { LocalDate } from "@/lib/dates";
import type { HabitLogValue } from "@/lib/habits/logging";
import type { ActionError, ActionResult } from "@/lib/result";
import { clearHabitLog, setHabitLog } from "@/server/modules/habits/actions";
import type { HabitLogResult } from "@/server/modules/habits/service";

/** One day's log as it should be: a log to set, or null to clear it. */
export type HabitLogChange = {
  habitId: string;
  /** A local date, or "today" (worked out by the server). */
  localDate: LocalDate | "today";
  log: HabitLogValue | null;
};

function send(change: HabitLogChange): Promise<ActionResult<HabitLogResult>> {
  const day = { habitId: change.habitId, localDate: change.localDate };
  return change.log
    ? setHabitLog({ ...day, ...change.log })
    : clearHabitLog(day);
}

/** The message to show for a failed write: the field's own, if any. */
export function logErrorMessage(error: ActionError): string {
  if (error.code === "VALIDATION") {
    const field = [
      ...(error.fieldErrors.value ?? []),
      ...(error.fieldErrors.localDate ?? []),
      ...(error.fieldErrors.status ?? []),
    ];
    if (field.length > 0) return field.join(" ");
  }
  return error.message;
}

const sameLog = (a: HabitLogValue | null, b: HabitLogValue | null) =>
  a?.status === b?.status && a?.value === b?.value;

/** Puts the day back as it was before `result`, from the toast's Undo. */
async function undo(result: HabitLogResult) {
  try {
    const undone = await send({
      habitId: result.habitId,
      localDate: result.localDate,
      log: result.previous,
    });
    if (undone.ok) toast({ title: "Undone", variant: "success" });
    else
      toast({
        title: "Couldn't undo",
        description: logErrorMessage(undone.error),
        variant: "error",
      });
  } catch {
    toast({
      title: "Couldn't undo",
      description: "Please try again.",
      variant: "error",
    });
  }
}

/**
 * Writes one day's log and confirms it in a toast with Undo, which puts
 * back the log the day had before (or none). `onOptimistic` runs inside
 * the transition, for `useOptimistic` updates.
 */
export function useHabitLog() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const writing = useRef(false);

  function write(
    change: HabitLogChange,
    options: {
      title: string;
      description?: string;
      onOptimistic?: () => void;
      onSaved?: (result: HabitLogResult, changed: boolean) => void;
      onUndoStart?: () => void;
    },
  ) {
    if (writing.current) return;
    writing.current = true;
    startTransition(async () => {
      setError(null);
      options.onOptimistic?.();
      try {
        const result = await send(change);
        if (!result.ok) {
          setError(logErrorMessage(result.error));
          return;
        }
        const changed = !sameLog(result.data.log, result.data.previous);
        options.onSaved?.(result.data, changed);
        toast({
          title: options.title,
          description: options.description,
          variant: "success",
          ...(changed && {
            action: {
              label: "Undo",
              altText: "Undo this log. You can also change the day on Track.",
              onClick: () => {
                options.onUndoStart?.();
                void undo(result.data);
              },
            },
          }),
        });
      } catch {
        setError("Couldn't save the log. Try again.");
      } finally {
        writing.current = false;
      }
    });
  }

  return { pending, error, setError, write };
}
