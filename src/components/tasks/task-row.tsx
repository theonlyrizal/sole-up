"use client";

import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";

import { PriorityMark } from "@/components/data/priority-mark";
import { Checkbox } from "@/components/ui/checkbox";
import { cx, focusRing } from "@/components/ui/cx";
import { ListItem } from "@/components/ui/list";
import { toast } from "@/components/ui/toast";
import type { TaskStatus } from "@/lib/tasks";
import { changeTaskStatus } from "@/server/modules/tasks/actions";
import type { PlanTaskItem } from "@/server/modules/tasks/queries";

import { taskDetails } from "./plan-task-list";

type TaskRowProps = {
  task: PlanTaskItem;
  locale: string;
  timeZone: string;
  actions?: React.ReactNode;
  onOpen: (trigger: HTMLButtonElement) => void;
};

export function TaskRow({
  task,
  locale,
  timeZone,
  actions,
  onOpen,
}: TaskRowProps) {
  const [status, setStatus] = useOptimistic(task.status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const writing = useRef(false);
  const details = taskDetails(task, locale, timeZone);

  function complete(checked: boolean) {
    if (writing.current) return;
    writing.current = true;
    const next: TaskStatus = checked ? "completed" : "open";
    startTransition(async () => {
      setError(null);
      setStatus(next);
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
          {(task.goal || details.length > 0 || task.priority) && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pb-2">
              {task.goal && (
                <span>
                  <Link
                    href={`/goals/${task.goal.id}`}
                    className={cx(
                      "inline-flex min-h-12 items-center rounded-xs text-primary hover:underline",
                      focusRing,
                    )}
                  >
                    {task.goal.title}
                  </Link>
                  {task.milestone && <> › {task.milestone.title}</>}
                </span>
              )}
              {details.map((detail) => (
                <span key={detail}>{detail}</span>
              ))}
              {task.priority && <PriorityMark priority={task.priority} />}
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
    />
  );
}
