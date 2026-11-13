"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { formatLocalDate, localDateTimeOf } from "@/lib/dates";
import { planTask, rescheduleTaskDue } from "@/server/modules/tasks/actions";
import type { PlanTaskItem } from "@/server/modules/tasks/queries";
/**
 * Picks a new planned date ("plan") or a new deadline ("due") for one task.
 * A timed deadline keeps its time of day in its own zone. Escape cancels.
 */
export function TodayDateEditor({
  task,
  kind,
  locale,
  timeZone,
  inSheet = false,
  onDone,
}: {
  task: PlanTaskItem;
  kind: "plan" | "due";
  locale: string;
  timeZone: string;
  inSheet?: boolean;
  onDone: () => void;
}) {
  const id = useId();
  const zone = task.dueTz ?? timeZone;
  const timedDue = task.dueAt ? localDateTimeOf(task.dueAt, zone) : null;
  const [date, setDate] = useState(
    kind === "plan"
      ? (task.plannedDate ?? "")
      : (timedDue?.date ?? task.dueDate ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!date) {
      setError("Pick a date.");
      return;
    }
    startTransition(async () => {
      setError(null);
      try {
        const result =
          kind === "plan"
            ? await planTask({ id: task.id, plannedDate: date })
            : await rescheduleTaskDue({
                id: task.id,
                dueDate: date,
                dueTime: timedDue?.time ?? "",
                dueTz: timedDue ? zone : "",
              });
        if (result.ok) {
          toast({
            title:
              kind === "plan"
                ? `Planned for ${formatLocalDate(date, locale)}`
                : `Now due ${formatLocalDate(date, locale)}`,
            variant: "success",
          });
          onDone();
        } else {
          const fieldErrors =
            result.error.code === "VALIDATION" ? result.error.fieldErrors : {};
          setError(
            [
              ...(fieldErrors.plannedDate ?? []),
              ...(fieldErrors.dueDate ?? []),
            ].join(" ") || result.error.message,
          );
        }
      } catch {
        setError("Couldn't save the date. Try again.");
      }
    });
  }

  const label = kind === "plan" ? "Plan for" : "New due date";
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`${label}: ${task.title}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          onDone();
        }
      }}
      aria-busy={pending || undefined}
      className={
        inSheet
          ? "today-quiet-form grid gap-3"
          : "flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-muted p-3"
      }
    >
      <FormField
        id={`${id}-date`}
        label={label}
        hint={
          timedDue && kind === "due"
            ? `Keeps the time, ${timedDue.time} (${zone}).`
            : undefined
        }
        errors={error && !inSheet ? [error] : undefined}
      >
        {(control) => (
          <Input
            {...control}
            type="date"
            name="date"
            aria-invalid={error ? true : undefined}
            aria-describedby={
              inSheet && error
                ? [control["aria-describedby"], `${id}-error`]
                    .filter(Boolean)
                    .join(" ")
                : control["aria-describedby"]
            }
            className="py-1.5 text-sm"
            value={date}
            autoFocus
            onChange={(event) => setDate(event.target.value)}
          />
        )}
      </FormField>
      {inSheet && error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-body-medium text-on-surface-variant"
        >
          {error}
        </p>
      )}
      <div
        className={inSheet ? "flex flex-wrap justify-end gap-2" : "flex gap-2"}
      >
        <Button type="submit" size="xs" aria-disabled={pending || undefined}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant={inSheet ? "text" : "secondary"}
          size="sm"
          disabled={pending}
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
