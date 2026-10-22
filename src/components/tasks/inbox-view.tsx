"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { toast } from "@/components/ui/toast";
import { formatInstant, formatLocalDate } from "@/lib/dates";
import type { ActionError, ActionResult } from "@/lib/result";
import { parentFromChoice, type Task } from "@/lib/tasks";
import { moveTasks, planTasksToday } from "@/server/modules/tasks/actions";
import type { TaskParentOption } from "@/server/modules/tasks/queries";

import { TaskParentSelect } from "./task-parent-select";

type InboxViewProps = {
  tasks: Task[];
  parentOptions: TaskParentOption[];
  locale: string;
  timeZone: string;
};

const tasksLabel = (count: number) =>
  `${count} ${count === 1 ? "task" : "tasks"}`;

function dueLabel(task: Task, locale: string, timeZone: string) {
  if (task.dueAt) return `Due ${formatInstant(task.dueAt, locale, timeZone)}`;
  if (task.dueDate) return `Due ${formatLocalDate(task.dueDate, locale)}`;
  return null;
}

/**
 * The inbox: open tasks with no goal, no milestone and no plan (ADR 0011).
 * Select tasks, then plan them for today or put them under a goal; either
 * takes them out of the inbox.
 */
export function InboxView({
  tasks,
  parentOptions,
  locale,
  timeZone,
}: InboxViewProps) {
  const id = useId();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [parent, setParent] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Tasks that left the inbox (here or in another tab) drop out of the
  // selection when the refreshed list arrives.
  const visibleSelected = tasks.filter((task) => selected.has(task.id));
  const count = visibleSelected.length;
  const allSelected = tasks.length > 0 && count === tasks.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = count > 0 && !allSelected;
    }
  }, [count, allSelected]);

  function toggle(taskId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(new Set(checked ? tasks.map((task) => task.id) : []));
  }

  function run(
    action: () => Promise<ActionResult<{ count: number }>>,
    done: (count: number) => string,
  ) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) {
        toast({ title: done(result.data.count), variant: "success" });
        setSelected(new Set());
        setParent("");
      } else {
        setError(result.error);
      }
    });
  }

  const ids = visibleSelected.map((task) => task.id);

  function planToday() {
    run(
      () => planTasksToday({ ids }),
      (planned) => `${tasksLabel(planned)} planned for today`,
    );
  }

  function assign() {
    run(
      () => moveTasks({ ids, ...parentFromChoice(parent) }),
      (moved) => `${tasksLabel(moved)} assigned`,
    );
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="Your inbox is clear"
        description="Tasks you capture without a goal or a plan wait here until you decide what to do with them. Press Q or use Add task to capture one."
      />
    );
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  const parentErrors = [
    ...(fieldErrors.goalId ?? []),
    ...(fieldErrors.milestoneId ?? []),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Selected tasks"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              disabled={pending}
              onChange={(event) => toggleAll(event.target.checked)}
              className={cx("size-4 shrink-0 accent-accent", focusRing)}
            />
            Select all
          </label>
          <span aria-live="polite" className="text-sm text-muted">
            {count === 0 ? "None selected" : `${count} selected`}
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || count === 0}
            onClick={planToday}
          >
            Plan for today
          </Button>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label htmlFor={`${id}-goal`} className="sr-only">
              Goal or milestone
            </label>
            <TaskParentSelect
              id={`${id}-goal`}
              className="min-w-0 flex-1 py-1.5 text-sm"
              options={parentOptions}
              noneLabel={
                parentOptions.length === 0
                  ? "No active goals yet"
                  : "Choose a goal…"
              }
              value={parent}
              disabled={pending || parentOptions.length === 0}
              aria-invalid={parentErrors.length ? true : undefined}
              aria-describedby={
                parentErrors.length ? `${id}-goal-error` : undefined
              }
              onChange={(event) => setParent(event.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || count === 0 || parent === ""}
              onClick={assign}
            >
              Assign to goal
            </Button>
          </div>
        </div>
        {parentErrors.length > 0 && (
          <p id={`${id}-goal-error`} className="text-sm text-danger">
            {parentErrors.join(" ")}
          </p>
        )}
        <FormError error={error} />
      </div>

      <ul
        aria-label="Inbox tasks"
        className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
      >
        {tasks.map((task) => {
          const due = dueLabel(task, locale, timeZone);
          return (
            <li key={task.id} className="flex items-center gap-3 p-3">
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(task.id)}
                  disabled={pending}
                  onChange={(event) => toggle(task.id, event.target.checked)}
                  className={cx("size-4 shrink-0 accent-accent", focusRing)}
                />
                <span className="min-w-0 break-words">{task.title}</span>
              </label>
              {due && (
                <span className="shrink-0 text-sm text-muted">{due}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
