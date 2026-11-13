"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { PriorityMark } from "@/components/data/priority-mark";
import { StatusChip } from "@/components/data/status-chip";
import { Checkbox } from "@/components/ui/checkbox";
import { cx, focusRing } from "@/components/ui/cx";
import { ListItem } from "@/components/ui/list";
import { toast } from "@/components/ui/toast";
import { formatInstant, formatLocalDate } from "@/lib/dates";
import { formatEstimate } from "@/lib/task-list";
import type { TaskStatus } from "@/lib/tasks";
import { changeTaskStatus } from "@/server/modules/tasks/actions";
import type { PlanTaskItem } from "@/server/modules/tasks/queries";

type TaskRowProps = {
  task: PlanTaskItem;
  locale: string;
  timeZone: string;
  actions?: React.ReactNode;
  onOpen: (trigger: HTMLButtonElement) => void;
  selection?: {
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
  };
  details?: React.ReactNode;
  showGoal?: boolean;
};

export function TaskRow({
  task,
  locale,
  timeZone,
  actions,
  onOpen,
  selection,
  details = taskDetails(task, locale, timeZone).map((detail) => (
    <span key={detail}>{detail}</span>
  )),
  showGoal = true,
}: TaskRowProps) {
  const status = task.status;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const writing = useRef(false);
  const goal = showGoal ? task.goal : null;

  function complete(checked: boolean) {
    if (writing.current) return;
    writing.current = true;
    const next: TaskStatus = checked ? "completed" : "open";
    startTransition(async () => {
      setError(null);
      try {
        const result = await changeTaskStatus({ id: task.id, status: next });
        if (result.ok) {
          toast({
            title: next === "completed" ? "Task completed" : "Task reopened",
            variant: "success",
          });
        } else {
          setError(result.error.message);
        }
      } catch {
        setError("Couldn't update the task. Try again.");
      } finally {
        writing.current = false;
      }
    });
  }

  return (
    <ListItem
      className="gap-2 px-2 medium:gap-3"
      leading={
        selection ? (
          <Checkbox
            labelHidden
            label={`Select ${task.title}`}
            checked={selection.checked}
            aria-disabled={selection.disabled || undefined}
            onCheckedChange={(checked) => {
              if (!selection.disabled) selection.onChange(checked === true);
            }}
          />
        ) : (
          <Checkbox
            labelHidden
            shape="round"
            label={`Complete ${task.title}`}
            checked={status === "completed"}
            aria-busy={pending || undefined}
            aria-disabled={pending || undefined}
            onCheckedChange={(checked) => complete(checked === true)}
            className="task-complete shrink-0"
          />
        )
      }
      headline={
        <button
          type="button"
          data-today-task={task.id}
          onClick={(event) => onOpen(event.currentTarget)}
          className={cx(
            "min-h-12 cursor-pointer rounded-xs text-start wrap-anywhere hover:underline",
            focusRing,
            status === "completed" && "text-on-surface-variant line-through",
          )}
        >
          {task.title}
        </button>
      }
      supporting={
        <>
          {(goal || details || task.priority || status !== "open") && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 empty:hidden">
              {goal && (
                <span>
                  <Link
                    href={`/goals/${goal.id}`}
                    className={cx(
                      "inline-flex min-h-12 items-center rounded-xs text-primary hover:underline",
                      focusRing,
                    )}
                  >
                    {goal.title}
                  </Link>
                  {task.milestone && <> › {task.milestone.title}</>}
                </span>
              )}
              {details}
              {task.priority && <PriorityMark priority={task.priority} />}
              {status !== "open" && <StatusChip status={status} />}
            </div>
          )}
          {pending && (
            <span className="block pb-2 text-body-small" role="status">
              Saving task…
            </span>
          )}
          {error && (
            <p role="alert" className="pb-2">
              {error}
            </p>
          )}
        </>
      }
      wrapSupporting
      trailing={actions}
      selected={selection?.checked}
    />
  );
}

/** Planned date, deadline and estimate, for the row's detail line. */
export function taskDetails(
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
  if (task.estimatedMinutes)
    details.push(formatEstimate(task.estimatedMinutes));
  return details;
}
