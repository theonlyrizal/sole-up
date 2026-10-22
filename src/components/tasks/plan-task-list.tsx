"use client";

import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { toast } from "@/components/ui/toast";
import { formatInstant, formatLocalDate } from "@/lib/dates";
import { PRIORITY_LABELS } from "@/lib/priorities";
import { formatEstimate, TASK_STATUS_LABELS } from "@/lib/task-list";
import type { TaskStatus } from "@/lib/tasks";
import { changeTaskStatus } from "@/server/modules/tasks/actions";
import type {
  PlanTaskItem,
  TaskParentOption,
} from "@/server/modules/tasks/queries";

import { TaskFormDialog } from "./task-form";
import { TaskScheduleEditor } from "./task-schedule-editor";

type PlanTaskListProps = {
  tasks: PlanTaskItem[];
  parentOptions: TaskParentOption[];
  locale: string;
  timeZone: string;
};

export function PlanTaskList({
  tasks,
  parentOptions,
  locale,
  timeZone,
}: PlanTaskListProps) {
  return (
    <ul
      aria-label="Tasks"
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
    >
      {tasks.map((task) => (
        <PlanTaskRow
          key={task.id}
          task={task}
          parentOptions={parentOptions}
          locale={locale}
          timeZone={timeZone}
        />
      ))}
    </ul>
  );
}

type PlanTaskRowProps = Omit<PlanTaskListProps, "tasks"> & {
  task: PlanTaskItem;
};

function PlanTaskRow({
  task,
  parentOptions,
  locale,
  timeZone,
}: PlanTaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // The checkbox follows the click at once, not after the refresh.
  const [status, setStatus] = useOptimistic(task.status);
  const scheduleButton = useRef<HTMLButtonElement>(null);

  function toggleComplete(checked: boolean) {
    const to: TaskStatus = checked ? "completed" : "open";
    startTransition(async () => {
      setError(null);
      setStatus(to);
      const result = await changeTaskStatus({ id: task.id, status: to });
      if (result.ok) {
        toast({
          title: to === "completed" ? "Task completed" : "Task reopened",
          variant: "success",
        });
      } else {
        setError(result.error.message);
      }
    });
  }

  function closeEditor() {
    setEditing(false);
    // The editor unmounts; put focus back where it came from.
    requestAnimationFrame(() => scheduleButton.current?.focus());
  }

  const details = taskDetails(task, locale, timeZone);
  return (
    <li className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={`Complete: ${task.title}`}
          checked={status === "completed"}
          onChange={(event) => toggleComplete(event.target.checked)}
          className={cx("mt-1 size-4 shrink-0 accent-accent", focusRing)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                "min-w-0 font-medium break-words",
                status !== "open" && "text-muted",
              )}
            >
              {task.title}
            </span>
            {task.priority && (
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted">
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
            {status !== "open" && (
              <span className="rounded-sm bg-surface-muted px-1.5 py-0.5 text-xs text-muted">
                {TASK_STATUS_LABELS[status]}
              </span>
            )}
          </div>
          {task.goal && (
            <p className="text-sm break-words text-muted">
              <Link
                href={`/goals/${task.goal.id}`}
                className={cx("rounded-sm hover:underline", focusRing)}
              >
                {task.goal.title}
              </Link>
              {task.milestone && <> › {task.milestone.title}</>}
            </p>
          )}
          {details.length > 0 && (
            <p className="text-sm text-muted">{details.join(" · ")}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-7">
        <Button
          ref={scheduleButton}
          variant="secondary"
          size="sm"
          aria-expanded={editing}
          aria-label={`Dates and goal: ${task.title}`}
          onClick={() => (editing ? closeEditor() : setEditing(true))}
        >
          Dates and goal
        </Button>
        <TaskFormDialog
          task={task}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Edit: ${task.title}`}
            >
              Edit
            </Button>
          }
        />
      </div>
      <p role="alert" className="pl-7 text-sm text-danger empty:hidden">
        {error}
      </p>
      {editing && (
        <div className="pl-7">
          <TaskScheduleEditor
            task={task}
            parentOptions={parentOptions}
            timeZone={timeZone}
            onDone={closeEditor}
          />
        </div>
      )}
    </li>
  );
}

/** Planned date, deadline and estimate, for the row's detail line. */
function taskDetails(
  task: PlanTaskItem,
  locale: string,
  timeZone: string,
): string[] {
  const details: string[] = [];
  if (task.plannedDate) {
    details.push(`Planned ${formatLocalDate(task.plannedDate, locale)}`);
  }
  if (task.dueAt) {
    details.push(`Due ${formatInstant(task.dueAt, locale, timeZone)}`);
  } else if (task.dueDate) {
    details.push(`Due ${formatLocalDate(task.dueDate, locale)}`);
  }
  if (task.estimatedMinutes) {
    details.push(formatEstimate(task.estimatedMinutes));
  }
  return details;
}
