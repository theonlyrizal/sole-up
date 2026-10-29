"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";

import { TodayDateEditor } from "@/components/tasks/today-view";
import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { formatInstant, formatLocalDate, type LocalDate } from "@/lib/dates";
import { goalStatusActions, type GoalStatusAction } from "@/lib/goals";
import type { ActionResult } from "@/lib/result";
import { changeGoalStatus } from "@/server/modules/goals/actions";
import { changeTaskStatus, planTask } from "@/server/modules/tasks/actions";
import type { PlanTaskItem } from "@/server/modules/tasks/queries";
import type {
  AdjustGoal,
  AdjustStep,
  StalledTask,
} from "@/server/modules/weekly-reviews/queries";

// Adjust (chunk 7.3): small changes through the existing goal and task
// actions, each saved at once like anywhere else in the app. Nothing here is
// part of the review's own record (ADR 0015).

type Context = { today: LocalDate; locale: string; timeZone: string };

/**
 * Next week's dates and its days' names, worked out on the server: Node and
 * the browser can word a date range differently, which would not hydrate.
 */
export type NextWeekLabels = {
  week: string;
  days: { value: LocalDate; label: string }[];
};

export function AdjustStepView({
  data,
  labels,
  ...context
}: Context & { data: AdjustStep; labels: NextWeekLabels }) {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted">
        Make any changes the week suggests. Each one is saved straight away, and
        you can skip this step.
      </p>
      <GoalsSection goals={data.goals} />
      <StalledSection stalled={data.stalled} {...context} />
      <NextWeekSection data={data} labels={labels} {...context} />
    </div>
  );
}

function AdjustSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-lg font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

const listClass =
  "flex flex-col divide-y divide-border rounded-lg border border-border bg-surface";

/** Runs one action and toasts its message, or shows its error. */
function useRowAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run<T>(action: () => Promise<ActionResult<T>>, done: string) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) toast({ title: done, variant: "success" });
      else setError(result.error.message);
    });
  }
  return { error, pending, run };
}

/** The status changes the review offers: pause, resume and drop. */
const REVIEW_GOAL_TARGETS = new Set(["paused", "active", "dropped"]);

function GoalsSection({ goals }: { goals: AdjustGoal[] }) {
  return (
    <AdjustSection
      title="Goals"
      hint="Pause a goal you can't give time to right now, or drop one that no longer fits. Either can be picked up again later."
    >
      {goals.length === 0 ? (
        <p className="text-sm text-muted">No active or paused goals.</p>
      ) : (
        <ul aria-label="Active and paused goals" className={listClass}>
          {goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} />
          ))}
        </ul>
      )}
    </AdjustSection>
  );
}

function GoalRow({ goal }: { goal: AdjustGoal }) {
  const { error, pending, run } = useRowAction();
  const actions = goalStatusActions(goal.status).filter((action) =>
    REVIEW_GOAL_TARGETS.has(action.to),
  );
  const change = (action: GoalStatusAction) =>
    run(
      () => changeGoalStatus({ id: goal.id, status: action.to }),
      action.done,
    );
  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/goals/${goal.id}`}
            className={cx(
              "min-w-0 rounded-sm font-medium break-words hover:underline",
              focusRing,
            )}
          >
            {goal.title}
          </Link>
          {goal.status === "paused" && (
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted">
              Paused
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {actions.map((action) => (
            <Button
              key={action.to}
              variant="secondary"
              size="sm"
              disabled={pending}
              aria-label={`${action.label}: ${goal.title}`}
              onClick={() => change(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
      <p role="alert" className="text-sm text-danger empty:hidden">
        {error}
      </p>
    </li>
  );
}

function StalledSection({
  stalled,
  ...context
}: Context & { stalled: StalledTask[] }) {
  return (
    <AdjustSection
      title="Stalled tasks"
      hint="Open tasks whose deadline has passed, or that were planned for an earlier day. Give one a new date, or cancel it if it no longer matters."
    >
      {stalled.length === 0 ? (
        <p className="text-sm text-muted">Nothing has stalled.</p>
      ) : (
        <ul aria-label="Stalled tasks" className={listClass}>
          {stalled.map((item) => (
            <StalledRow key={item.task.id} item={item} {...context} />
          ))}
        </ul>
      )}
    </AdjustSection>
  );
}

function StalledRow({
  item: { task, passed },
  locale,
  timeZone,
}: Context & { item: StalledTask }) {
  const { error, pending, run } = useRowAction();
  const [editing, setEditing] = useState(false);
  const rescheduleButton = useRef<HTMLButtonElement>(null);

  function closeEditor() {
    setEditing(false);
    requestAnimationFrame(() => rescheduleButton.current?.focus());
  }

  const details =
    passed === "deadline"
      ? `Was due ${task.dueAt ? formatInstant(task.dueAt, locale, timeZone) : formatLocalDate(task.dueDate!, locale)}`
      : `Planned for ${formatLocalDate(task.plannedDate!, locale)}`;

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-col gap-1">
        <span className="font-medium break-words">{task.title}</span>
        <p className="text-sm text-muted">
          {[task.goal?.title, details].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          ref={rescheduleButton}
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-expanded={editing}
          aria-label={`Reschedule: ${task.title}`}
          onClick={() => (editing ? closeEditor() : setEditing(true))}
        >
          Reschedule
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label={`Cancel task: ${task.title}`}
          onClick={() =>
            run(
              () => changeTaskStatus({ id: task.id, status: "cancelled" }),
              "Task cancelled. You can reopen it from Plan.",
            )
          }
        >
          Cancel task
        </Button>
      </div>
      <p role="alert" className="text-sm text-danger empty:hidden">
        {error}
      </p>
      {editing && (
        <TodayDateEditor
          task={task}
          kind={passed === "deadline" ? "due" : "plan"}
          locale={locale}
          timeZone={timeZone}
          onDone={closeEditor}
        />
      )}
    </li>
  );
}

function NextWeekSection({
  data: { plannedNextWeek, plannable },
  labels,
  locale,
}: Context & { data: AdjustStep; labels: NextWeekLabels }) {
  const id = useId();
  const [taskId, setTaskId] = useState("");
  const [day, setDay] = useState<LocalDate>(labels.days[0]?.value ?? "");
  const [errors, setErrors] = useState<{ task?: string[]; day?: string[] }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskId) {
      setErrors({ task: ["Choose a task."] });
      return;
    }
    startTransition(async () => {
      setErrors({});
      setFormError(null);
      const result = await planTask({ id: taskId, plannedDate: day });
      if (result.ok) {
        toast({
          title: `Planned for ${formatLocalDate(day, locale, "full")}`,
          variant: "success",
        });
        setTaskId("");
      } else {
        const fieldErrors =
          result.error.code === "VALIDATION" ? result.error.fieldErrors : {};
        setErrors({ day: fieldErrors.plannedDate });
        setFormError(result.error.message);
      }
    });
  }

  return (
    <AdjustSection
      title="Plan next week"
      hint={`Put tasks on a day of the week after this one, ${labels.week}.`}
    >
      {plannable.length === 0 ? (
        <p className="text-sm text-muted">No other open tasks to plan.</p>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          aria-label="Plan a task for next week"
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <FormField id={`${id}-task`} label="Task" errors={errors.task}>
              {(control) => (
                <Select
                  {...control}
                  name="task"
                  value={taskId}
                  onChange={(event) => setTaskId(event.target.value)}
                >
                  <option value="">Choose a task</option>
                  {plannable.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.goalTitle
                        ? `${task.title} (${task.goalTitle})`
                        : task.title}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>
          <FormField id={`${id}-day`} label="Day" errors={errors.day}>
            {(control) => (
              <Select
                {...control}
                name="day"
                value={day}
                onChange={(event) => setDay(event.target.value)}
              >
                {labels.days.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <Button type="submit" disabled={pending}>
            {pending ? "Planning…" : "Plan"}
          </Button>
        </form>
      )}
      <p role="alert" className="text-sm text-danger empty:hidden">
        {formError}
      </p>
      {plannedNextWeek.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing is planned for that week yet.
        </p>
      ) : (
        <ul aria-label="Planned for next week" className={listClass}>
          {plannedNextWeek.map((task) => (
            <PlannedRow key={task.id} task={task} locale={locale} />
          ))}
        </ul>
      )}
    </AdjustSection>
  );
}

function PlannedRow({ task, locale }: { task: PlanTaskItem; locale: string }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 p-3">
      <span className="min-w-0 font-medium break-words">{task.title}</span>
      <span className="text-sm text-muted">
        {formatLocalDate(task.plannedDate!, locale, "full")}
      </span>
    </li>
  );
}
