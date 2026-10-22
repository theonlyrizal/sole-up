"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { localDateTimeOf } from "@/lib/dates";
import type { ActionError } from "@/lib/result";
import { parentFromChoice, taskParentChoice } from "@/lib/tasks";
import { scheduleTask } from "@/server/modules/tasks/actions";
import type {
  PlanTaskItem,
  TaskParentOption,
} from "@/server/modules/tasks/queries";

import { TaskParentSelect } from "./task-parent-select";

type TaskScheduleEditorProps = {
  task: PlanTaskItem;
  parentOptions: TaskParentOption[];
  /** The user's zone: a new deadline time is set in it. */
  timeZone: string;
  onDone: () => void;
};

/** The task's current parent as the picker shows it. */
function currentParent(task: PlanTaskItem) {
  if (task.milestone) {
    return {
      value: taskParentChoice(task),
      label: `${task.milestone.title} (milestone)`,
    };
  }
  if (task.goal)
    return { value: taskParentChoice(task), label: task.goal.title };
  return null;
}

/**
 * Inline edit of a task's planned date, deadline and goal or milestone,
 * saved together. A deadline is all-day unless a time is given; the time is
 * in the deadline's own zone when it has one, otherwise the user's.
 * Escape cancels.
 */
export function TaskScheduleEditor({
  task,
  parentOptions,
  timeZone,
  onDone,
}: TaskScheduleEditorProps) {
  const id = useId();
  const zone = task.dueTz ?? timeZone;
  const timedDue = task.dueAt ? localDateTimeOf(task.dueAt, zone) : null;
  const [plannedDate, setPlannedDate] = useState(task.plannedDate ?? "");
  const [dueDate, setDueDate] = useState(timedDue?.date ?? task.dueDate ?? "");
  const [dueTime, setDueTime] = useState(timedDue?.time ?? "");
  const [parent, setParent] = useState<string>(taskParentChoice(task));
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await scheduleTask({
        id: task.id,
        plannedDate,
        dueDate,
        dueTime,
        dueTz: dueTime ? zone : "",
        ...parentFromChoice(parent),
      });
      if (result.ok) {
        toast({ title: "Task updated", variant: "success" });
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
      aria-label={`Dates and goal for ${task.title}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          onDone();
        }
      }}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-muted p-3"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          id={`${id}-planned`}
          label="Plan for"
          errors={fieldErrors.plannedDate}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              name="plannedDate"
              className="py-1.5 text-sm"
              value={plannedDate}
              autoFocus
              onChange={(event) => setPlannedDate(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          id={`${id}-due`}
          label="Due date"
          errors={fieldErrors.dueDate}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              name="dueDate"
              className="py-1.5 text-sm"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          id={`${id}-due-time`}
          label="Due time"
          hint={`Optional. In ${zone}.`}
          errors={[
            ...(fieldErrors.dueTime ?? []),
            ...(fieldErrors.dueTz ?? []),
          ]}
        >
          {(control) => (
            <Input
              {...control}
              type="time"
              name="dueTime"
              className="py-1.5 text-sm"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
            />
          )}
        </FormField>
      </div>
      <FormField
        id={`${id}-parent`}
        label="Goal or milestone"
        errors={[
          ...(fieldErrors.goalId ?? []),
          ...(fieldErrors.milestoneId ?? []),
        ]}
      >
        {(control) => (
          <TaskParentSelect
            {...control}
            name="parent"
            className="py-1.5 text-sm"
            options={parentOptions}
            noneLabel="No goal"
            current={currentParent(task)}
            value={parent}
            onChange={(event) => setParent(event.target.value)}
          />
        )}
      </FormField>
      <FormError error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="secondary"
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
