"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { type Priority, PRIORITIES } from "@/lib/priorities";
import type { ActionError } from "@/lib/result";
import {
  type Task,
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_ESTIMATE_MIN_MINUTES,
  TASK_NOTES_MAX,
  TASK_TITLE_MAX,
} from "@/lib/tasks";
import { changeTaskStatus, updateTask } from "@/server/modules/tasks/actions";

const PRIORITY_OPTION_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

type TaskFormDialogProps = { task: Task } & (
  | {
      /** The element that opens the dialog, usually a `<Button>`. */
      trigger: React.ReactElement;
      open?: undefined;
      onOpenChange?: undefined;
      onCloseAutoFocus?: undefined;
    }
  | {
      /** Controlled: the page opens it, e.g. from a clicked Agenda item. */
      trigger?: undefined;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      /** Where focus goes on close (see `DialogContent`). */
      onCloseAutoFocus?: (event: Event) => void;
    }
);

/**
 * Edits a task's title, notes, priority and estimate in a dialog. Dates and
 * parent are edited inline on the list; the dialog can also cancel or
 * reopen the task.
 */
export function TaskFormDialog({
  trigger,
  task,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
}: TaskFormDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        title="Edit task"
        className="max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <TaskForm task={task} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const id = useId();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [priority, setPriority] = useState<Priority | "">(task.priority ?? "");
  const [estimate, setEstimate] = useState(
    task.estimatedMinutes?.toString() ?? "",
  );
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateTask({
        id: task.id,
        title,
        notes,
        priority: priority || null,
        estimatedMinutes: estimate.trim(),
      });
      if (result.ok) {
        toast({ title: "Task saved", variant: "success" });
        onDone();
      } else {
        setError(result.error);
      }
    });
  }

  const cancelled = task.status === "cancelled";
  function toggleCancelled() {
    startTransition(async () => {
      const result = await changeTaskStatus({
        id: task.id,
        status: cancelled ? "open" : "cancelled",
      });
      if (result.ok) {
        toast({
          title: cancelled ? "Task reopened" : "Task cancelled",
          variant: "success",
        });
        onDone();
      } else {
        setError(result.error);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`Edit ${task.title}`}
      className="flex flex-col gap-4"
    >
      <FormField id={`${id}-title`} label="Title" errors={fieldErrors.title}>
        {(control) => (
          <Input
            {...control}
            name="title"
            value={title}
            maxLength={TASK_TITLE_MAX}
            autoComplete="off"
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`${id}-notes`}
        label="Notes"
        hint="Optional."
        errors={fieldErrors.notes}
      >
        {(control) => (
          <Textarea
            {...control}
            name="notes"
            rows={3}
            value={notes}
            maxLength={TASK_NOTES_MAX}
            onChange={(event) => setNotes(event.target.value)}
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${id}-priority`}
          label="Priority"
          errors={fieldErrors.priority}
        >
          {(control) => (
            <Select
              {...control}
              name="priority"
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as Priority | "")
              }
            >
              <option value="">None</option>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_OPTION_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField
          id={`${id}-estimate`}
          label="Estimate (minutes)"
          hint="Optional. How long you expect it to take."
          errors={fieldErrors.estimatedMinutes}
        >
          {(control) => (
            <Input
              {...control}
              name="estimatedMinutes"
              type="number"
              inputMode="numeric"
              min={TASK_ESTIMATE_MIN_MINUTES}
              max={TASK_ESTIMATE_MAX_MINUTES}
              step={1}
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
            />
          )}
        </FormField>
      </div>
      <FormError error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onDone}>
          Close
        </Button>
        <Button
          variant="ghost"
          className="ml-auto"
          disabled={pending}
          onClick={toggleCancelled}
        >
          {cancelled ? "Reopen task" : "Cancel task"}
        </Button>
      </div>
    </form>
  );
}
