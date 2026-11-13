"use client";

import { useId, useLayoutEffect, useRef, useState, useTransition } from "react";

import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/shell/page-header";
import { PlanTabs } from "@/components/shell/plan-tabs";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup } from "@/components/ui/list";
import { toast } from "@/components/ui/toast";
import type { ActionError, ActionResult } from "@/lib/result";
import { parentFromChoice, type Task } from "@/lib/tasks";
import { moveTasks, planTasksToday } from "@/server/modules/tasks/actions";
import type { TaskParentOption } from "@/server/modules/tasks/queries";

import { TaskListRow, TaskListScope } from "./plan-task-list";
import { TaskParentSelect } from "./task-parent-select";

const tasksLabel = (count: number) =>
  `${count} ${count === 1 ? "task" : "tasks"}`;

export function InboxView({
  tasks,
  parentOptions,
  locale,
  timeZone,
}: {
  tasks: Task[];
  parentOptions: TaskParentOption[];
  locale: string;
  timeZone: string;
}) {
  const id = useId();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [parent, setParent] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [assignError, setAssignError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const writing = useRef(false);
  const selectAll = useRef<HTMLButtonElement>(null);
  const assignButton = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);

  const ids = tasks
    .filter((task) => selected.has(task.id))
    .map((task) => task.id);
  const count = ids.length;
  const allSelected = tasks.length > 0 && count === tasks.length;

  function restoreFocus() {
    (selectAll.current ?? summary.current)?.focus();
  }

  useLayoutEffect(() => {
    if (!pending && !count && returnFocus.current) {
      returnFocus.current = false;
      restoreFocus();
    }
  }, [count, pending]);

  function toggle(taskId: string, checked: boolean) {
    if (writing.current) return;
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }

  function clear() {
    if (writing.current) return;
    restoreFocus();
    setSelected(new Set());
    setParent("");
    setError(null);
    setAssignError(null);
  }

  function run(
    action: () => Promise<ActionResult<{ count: number }>>,
    done: (count: number) => string,
    assigning = false,
  ) {
    if (writing.current || count === 0) return;
    writing.current = true;
    const report = assigning ? setAssignError : setError;
    report(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          returnFocus.current = true;
          setAssignOpen(false);
          setSelected(new Set());
          setParent("");
          setError(null);
          toast({ title: done(result.data.count), variant: "success" });
        } else {
          report(result.error);
        }
      } catch {
        report({
          code: "INTERNAL",
          message: "Couldn't update the selected tasks. Try again.",
        });
      } finally {
        writing.current = false;
      }
    });
  }

  const fields =
    assignError?.code === "VALIDATION" ? assignError.fieldErrors : {};
  return (
    <div className="relative min-w-0">
      <div className={count ? "hidden" : "contents"}>
        <TopAppBar title="Inbox" />
      </div>
      <PageContainer className="grid min-w-0 gap-5 max-medium:pt-0">
        <div className="order-2 max-medium:pt-4 medium:order-1">
          <PageHeader title="Inbox" subnav={<PlanTabs />} />
          <div
            ref={summary}
            id={id}
            tabIndex={-1}
            className="mt-4 text-body-medium text-on-surface-variant"
            aria-live="polite"
          >
            {tasksLabel(tasks.length)} with no goal and no plan
          </div>
        </div>

        {count > 0 && (
          <div
            role="group"
            aria-label="Selected tasks"
            aria-busy={pending || undefined}
            className="sticky top-0 z-20 -mx-4 grid gap-1 bg-secondary-container px-4 pt-[env(safe-area-inset-top)] pb-2 text-on-secondary-container medium:order-2 medium:mx-0 medium:rounded-lg medium:py-2"
          >
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="flex-1 text-title-medium" aria-live="polite">
                {count} selected
              </span>
              <IconButton
                icon="close"
                label="Clear selection"
                className="medium:order-last"
                disabled={pending}
                onClick={clear}
              />
              <div className="flex w-full flex-wrap gap-x-2 medium:w-auto">
                <Button
                  size="xs"
                  pending={pending && !assignOpen}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => planTasksToday({ ids }),
                      (planned) => `${tasksLabel(planned)} planned for today`,
                    )
                  }
                >
                  Plan for today
                </Button>
                <Button
                  ref={assignButton}
                  size="xs"
                  variant="text"
                  trailingIcon="expand_more"
                  aria-haspopup="dialog"
                  aria-expanded={assignOpen}
                  disabled={pending}
                  onClick={() => {
                    setAssignError(null);
                    setAssignOpen(true);
                  }}
                >
                  Assign to goal
                </Button>
              </div>
            </div>
            <FormError error={error} />
          </div>
        )}

        <div className="order-3 grid min-w-0 gap-2">
          {tasks.length > 0 && (
            <Checkbox
              ref={selectAll}
              label="Select all"
              checked={allSelected || (count > 0 ? "indeterminate" : false)}
              aria-disabled={pending || undefined}
              className="w-auto justify-self-start"
              onCheckedChange={(checked) => {
                if (!writing.current)
                  setSelected(
                    new Set(checked ? tasks.map((task) => task.id) : []),
                  );
              }}
            />
          )}
          <TaskListScope
            locale={locale}
            timeZone={timeZone}
            parentOptions={parentOptions}
            fallbackId={id}
          >
            {tasks.length > 0 ? (
              <ListGroup label="Inbox tasks">
                {tasks.map((task) => (
                  <TaskListRow
                    key={task.id}
                    task={{ ...task, goal: null, milestone: null }}
                    selection={{
                      checked: selected.has(task.id),
                      disabled: pending,
                      onChange: (checked) => toggle(task.id, checked),
                    }}
                  />
                ))}
              </ListGroup>
            ) : (
              <EmptyState
                title="Your inbox is clear"
                description="Tasks you capture without a goal or a plan wait here until you decide what to do with them."
              />
            )}
          </TaskListScope>
        </div>
      </PageContainer>

      <ResponsiveSheet
        title="Assign to goal"
        open={assignOpen}
        onOpenChange={(next) => {
          if (!writing.current) setAssignOpen(next);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (assignButton.current?.isConnected) assignButton.current.focus();
          else restoreFocus();
        }}
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (parent)
              run(
                () => moveTasks({ ids, ...parentFromChoice(parent) }),
                (moved) => `${tasksLabel(moved)} assigned`,
                true,
              );
          }}
        >
          <FormField
            id={`${id}-parent`}
            label="Goal or milestone"
            errors={[...(fields.goalId ?? []), ...(fields.milestoneId ?? [])]}
          >
            {(control) => (
              <TaskParentSelect
                {...control}
                autoFocus
                options={parentOptions}
                value={parent}
                onChange={(event) => setParent(event.target.value)}
                noneLabel={
                  parentOptions.length
                    ? "Choose a goal…"
                    : "No active goals yet"
                }
                disabled={!parentOptions.length || pending}
              />
            )}
          </FormField>
          <FormError error={assignError} />
          <Button
            type="submit"
            pending={pending}
            disabled={!parent || !count}
            className="justify-self-end"
          >
            Assign to goal
          </Button>
        </form>
      </ResponsiveSheet>
    </div>
  );
}
