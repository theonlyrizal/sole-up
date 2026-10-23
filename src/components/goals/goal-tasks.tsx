"use client";

import { useId, useRef, useState, useTransition } from "react";

import { PlanTaskList, taskDetails } from "@/components/tasks/plan-task-list";
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
  nextAction: PlanTaskItem | null;
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
  nextAction,
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
  const hasOpenTasks = tasks.some((task) => task.status === "open");

  // Open milestones always get a group to add to; others only with tasks.
  const milestoneGroups = milestones.filter(
    (milestone) =>
      milestone.status === "open" ||
      tasks.some((task) => task.milestoneId === milestone.id),
  );
  const listProps = { parentOptions, locale, timeZone, showGoal: false };

  return (
    <div className="flex flex-col gap-6">
      <NextAction
        task={nextAction}
        hasOpenTasks={hasOpenTasks}
        locale={locale}
        timeZone={timeZone}
      />

      {closedCount > 0 && (
        <label className="flex items-center gap-2 self-start text-sm">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(event) => setShowClosed(event.target.checked)}
            className="size-4 accent-accent"
          />
          Show completed and cancelled ({closedCount})
        </label>
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

function NextAction({
  task,
  hasOpenTasks,
  locale,
  timeZone,
}: {
  task: PlanTaskItem | null;
  hasOpenTasks: boolean;
  locale: string;
  timeZone: string;
}) {
  return (
    <section
      aria-label="Next action"
      className="flex flex-col gap-1 rounded-lg border border-border p-3"
    >
      <h3 className="text-sm text-muted">Next action</h3>
      {task ? (
        <>
          <p className="font-medium break-words">{task.title}</p>
          <p className="text-sm text-muted">
            {[
              task.milestone && `Under ${task.milestone.title}`,
              ...taskDetails(task, locale, timeZone),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      ) : (
        <p className="text-sm">
          {hasOpenTasks
            ? "None yet. Plan one of the tasks below, or give it a due date, and it shows here."
            : "None yet. Add a task for the next step you could take."}
        </p>
      )}
    </section>
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
  label,
  placeholder,
  autoFocus,
  onCancel,
}: {
  parent: { goalId: string } | { milestoneId: string };
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const id = useId();
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
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <FormField
            id={`${id}-title`}
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
        <Button type="submit" disabled={adding}>
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
