"use client";

import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
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
};

/** The task's current parent as the picker shows it. */
export function currentParent(task: PlanTaskItem) {
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
 * Edit a task's planned date, deadline and goal or milestone,
 * saved together. A deadline is all-day unless a time is given; the time is
 * in the deadline's own zone when it has one, otherwise the user's.
 * Escape cancels.
 */
export function TaskScheduleEditor({
  open,
  onOpenChange,
  onCloseAutoFocus,
  ...props
}: TaskScheduleEditorProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const writingRef = useRef(false);
  return (
    <ResponsiveSheet
      title="Dates and goal"
      description={props.task.title}
      open={open}
      onOpenChange={(next) => {
        if (!writingRef.current) onOpenChange(next);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <ScheduleForm
        {...props}
        writingRef={writingRef}
        onDone={() => onOpenChange(false)}
      />
    </ResponsiveSheet>
  );
}

function ScheduleForm({
  task,
  parentOptions,
  timeZone,
  onDone,
  writingRef,
}: TaskScheduleEditorProps & {
  onDone: () => void;
  writingRef: React.RefObject<boolean>;
}) {
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
    if (writingRef.current) return;
    writingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
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
      } catch {
        setError({
          code: "INTERNAL",
          message: "Couldn't save the dates and goal. Try again.",
        });
      } finally {
        writingRef.current = false;
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
      className="grid min-w-0 gap-3"
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
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
      <div className="flex flex-wrap items-center justify-end gap-2">
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
