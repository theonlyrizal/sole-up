"use client";

import { useId, useRef, useState, useTransition } from "react";

import {
  PlanTaskList,
  TaskListRow,
  TaskListScope,
  taskDetails,
} from "@/components/tasks/plan-task-list";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ListGroup } from "@/components/ui/list";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { groupGoalTasks } from "@/lib/goal-tasks";
import type { Milestone } from "@/lib/milestones";
import type { ActionError } from "@/lib/result";
import { TASK_TITLE_MAX } from "@/lib/tasks";
import { createTask } from "@/server/modules/tasks/actions";
import type {
  PlanTaskItem,
  TaskParentOption,
} from "@/server/modules/tasks/queries";

const CLOSED_MILESTONE_LABELS: Record<Milestone["status"], string | undefined> =
  {
    open: undefined,
    completed: "Milestone completed",
    dropped: "Milestone dropped",
  };

type GoalTasksProps = {
  goalId: string;
  milestones: Milestone[];
  tasks: PlanTaskItem[];
  addTaskId: string;
  parentOptions: TaskParentOption[];
  locale: string;
  timeZone: string;
};

/**
 * A goal's tasks (chunk 2.7): its next action, then the tasks directly
 * under it and under each milestone, each group with an add form. Task
 * status never changes the goal's progress or its milestones (ADR 0010).
 */
export function GoalTasks({
  goalId,
  milestones,
  tasks,
  addTaskId,
  parentOptions,
  locale,
  timeZone,
}: GoalTasksProps) {
  const [showClosed, setShowClosed] = useState(false);
  const closedCount = tasks.filter((task) => task.status !== "open").length;
  const shown = showClosed
    ? tasks
    : tasks.filter((task) => task.status === "open");
  const { direct, byMilestone } = groupGoalTasks(shown, timeZone);

  // Open milestones always get a group to add to; others only with tasks.
  const milestoneGroups = milestones.filter(
    (milestone) =>
      milestone.status === "open" ||
      tasks.some((task) => task.milestoneId === milestone.id),
  );
  const listProps = {
    parentOptions,
    locale,
    timeZone,
    showGoal: false,
    wrapActions: true,
  };

  return (
    <div className="flex flex-col gap-6">
      {closedCount > 0 && (
        <Checkbox
          label={`Show completed and cancelled (${closedCount})`}
          checked={showClosed}
          onCheckedChange={(checked) => setShowClosed(checked === true)}
        />
      )}

      <TaskGroup title="Directly under this goal">
        {direct.length > 0 ? (
          <PlanTaskList
            tasks={direct}
            label="Tasks directly under this goal"
            {...listProps}
          />
        ) : (
          <p className="text-sm text-muted">No tasks directly under it.</p>
        )}
        <AddTaskForm
          parent={{ goalId }}
          id={addTaskId}
          label="New task"
          placeholder="e.g. Book a first lesson"
        />
      </TaskGroup>

      {milestoneGroups.map((milestone) => {
        const groupTasks = byMilestone.get(milestone.id) ?? [];
        return (
          <TaskGroup
            key={milestone.id}
            title={milestone.title}
            status={CLOSED_MILESTONE_LABELS[milestone.status]}
          >
            {groupTasks.length > 0 ? (
              <PlanTaskList
                tasks={groupTasks}
                label={`Tasks under ${milestone.title}`}
                {...listProps}
              />
            ) : (
              <p className="text-sm text-muted">
                {tasks.some((task) => task.milestoneId === milestone.id)
                  ? "Every task here is completed or cancelled."
                  : "No tasks under this milestone yet."}
              </p>
            )}
            {milestone.status === "open" && (
              <AddMilestoneTask milestone={milestone} />
            )}
          </TaskGroup>
        );
      })}
    </div>
  );
}

export function GoalNextAction({
  task,
  hasOpenTasks,
  parentOptions,
  locale,
  timeZone,
  addTaskId,
}: Pick<
  GoalTasksProps,
  "parentOptions" | "locale" | "timeZone" | "addTaskId"
> & {
  task: PlanTaskItem | null;
  hasOpenTasks: boolean;
}) {
  const nextActionFallback = useId();
  return (
    <Card
      headingId="goal-next-action"
      className="grid min-w-0 gap-2 expanded:col-span-8"
    >
      <h2 id="goal-next-action" className="text-title-medium">
        Next action
      </h2>
      <TaskListScope
        parentOptions={parentOptions}
        locale={locale}
        timeZone={timeZone}
        fallbackId={nextActionFallback}
      >
        {task ? (
          <ListGroup label="Next task">
            <TaskListRow
              task={task}
              showGoal={false}
              wrapActions
              details={
                <>
                  {task.milestone && <span>Under {task.milestone.title}</span>}
                  {taskDetails(task, locale, timeZone).map((detail) => (
                    <span key={detail}>{detail}</span>
                  ))}
                </>
              }
            />
          </ListGroup>
        ) : (
          <div className="grid gap-2">
            <p className="text-body-medium text-on-surface-variant">
              No next action yet.{" "}
              {hasOpenTasks
                ? "Plan one of the tasks below, or give it a due date, and it shows here."
                : "Add a task for the next step you could take."}
            </p>
            <Button
              id={nextActionFallback}
              variant="tonal"
              size="xs"
              className="justify-self-start"
              onClick={() => document.getElementById(addTaskId)?.focus()}
            >
              Add a task
            </Button>
          </div>
        )}
      </TaskListScope>
    </Card>
  );
}

function TaskGroup({
  title,
  status,
  children,
}: {
  title: string;
  /** Shown beside a closed milestone's title. */
  status?: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3
        id={headingId}
        className="flex flex-wrap items-baseline gap-x-2 font-medium break-words"
      >
        {title}
        {status && (
          <span className="text-xs font-normal text-muted">{status}</span>
        )}
      </h3>
      {children}
    </section>
  );
}

/** "Add task" under a milestone, opening a one-field form in place. */
function AddMilestoneTask({ milestone }: { milestone: Milestone }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    // The form unmounts; put focus back on the button that opened it.
    requestAnimationFrame(() => button.current?.focus());
  }

  if (!open) {
    return (
      <Button
        ref={button}
        variant="ghost"
        size="sm"
        className="self-start"
        aria-label={`Add a task to ${milestone.title}`}
        onClick={() => setOpen(true)}
      >
        + Add task
      </Button>
    );
  }
  return (
    <AddTaskForm
      parent={{ milestoneId: milestone.id }}
      label={`New task under ${milestone.title}`}
      autoFocus
      onCancel={close}
    />
  );
}

/**
 * Adds a task under the goal or one of its milestones by title. Enter
 * submits and the field stays for the next one; Escape cancels when the
 * form can close.
 */
function AddTaskForm({
  parent,
  id,
  label,
  placeholder,
  autoFocus,
  onCancel,
}: {
  parent: { goalId: string } | { milestoneId: string };
  id?: string;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const fallbackId = useId();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [adding, startAdding] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startAdding(async () => {
      const result = await createTask({ title, ...parent });
      if (result.ok) {
        setTitle("");
        setError(null);
        toast({ title: "Task added", variant: "success" });
      } else {
        setError(result.error);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onCancel) {
          event.preventDefault();
          onCancel();
        }
      }}
      noValidate
      aria-label={label}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32 flex-1">
          <FormField
            id={id ?? fallbackId}
            label={label}
            errors={fieldErrors.title}
          >
            {(control) => (
              <Input
                {...control}
                name="title"
                value={title}
                maxLength={TASK_TITLE_MAX}
                autoComplete="off"
                autoFocus={autoFocus}
                placeholder={placeholder}
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <Button type="submit" disabled={adding} aria-busy={adding || undefined}>
          {adding ? "Adding…" : "Add"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <FormError error={error} />
    </form>
  );
}
