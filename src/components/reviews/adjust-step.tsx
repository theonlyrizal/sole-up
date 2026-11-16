"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";

import { StatusChip } from "@/components/data/status-chip";
import { TodayDateEditor } from "@/components/tasks/today-date-editor";
import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cx, focusRing } from "@/components/ui/cx";
import { FormField } from "@/components/ui/form-field";
import { InlineBanner } from "@/components/ui/inline-banner";
import { ListGroup, ListItem } from "@/components/ui/list";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { formatInstant, formatLocalDate, type LocalDate } from "@/lib/dates";
import { goalStatusActions } from "@/lib/goals";
import { changeGoalStatus } from "@/server/modules/goals/actions";
import { changeTaskStatus, planTask } from "@/server/modules/tasks/actions";
import type {
  AdjustGoal,
  AdjustStep,
  StalledTask,
} from "@/server/modules/weekly-reviews/queries";

type Context = { locale: string; timeZone: string };

// Date labels are formatted on the server so Node and the browser agree.
type NextWeekLabels = {
  week: string;
  days: { value: LocalDate; label: string }[];
};

export function AdjustStepView({
  data,
  labels,
  ...context
}: Context & { data: AdjustStep; labels: NextWeekLabels }) {
  const goalsId = useId();
  const stalledId = useId();
  return (
    <div className="grid min-w-0 gap-6">
      <p className="text-body-medium text-on-surface-variant">
        Changes here save as you make them.
      </p>
      <section aria-labelledby={goalsId} className="grid gap-2">
        <h3
          className={cx("w-fit rounded-xs text-title-large", focusRing)}
          id={goalsId}
          tabIndex={-1}
        >
          Goals
        </h3>
        {data.goals.length ? (
          <ListGroup label="Active and paused goals">
            {data.goals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} headingId={goalsId} />
            ))}
          </ListGroup>
        ) : (
          <Empty>No active or paused goals.</Empty>
        )}
      </section>
      <section aria-labelledby={stalledId} className="grid gap-2">
        <h3
          className={cx("w-fit rounded-xs text-title-large", focusRing)}
          id={stalledId}
          tabIndex={-1}
        >
          Stalled tasks
        </h3>
        {data.stalled.length ? (
          <ListGroup label="Stalled tasks">
            {data.stalled.map((item) => (
              <StalledRow
                key={item.task.id}
                item={item}
                headingId={stalledId}
                {...context}
              />
            ))}
          </ListGroup>
        ) : (
          <Empty>Nothing has stalled.</Empty>
        )}
      </section>
      <NextWeekSection data={data} labels={labels} locale={context.locale} />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-body-medium text-on-surface-variant">{children}</p>;
}

const goalConsequences = {
  paused:
    "This moves the goal to Paused. You can resume it from Goals whenever you're ready.",
  active: "This moves the goal back to Active.",
  dropped: "This moves the goal to Dropped. You can reopen it from Goals.",
} as const;

function GoalRow({ goal, headingId }: { goal: AdjustGoal; headingId: string }) {
  return (
    <ListItem
      headline={
        <Link
          href={`/goals/${goal.id}`}
          className={cx(
            "inline-flex min-h-12 items-center rounded-xs hover:underline",
            focusRing,
          )}
        >
          {goal.title}
        </Link>
      }
      supporting={goal.status === "paused" && <StatusChip status="paused" />}
      wrapActions
      wrapSupporting
      trailing={
        <div className="flex flex-wrap justify-end gap-1">
          {goalStatusActions(goal.status).map((action) => {
            if (
              action.to !== "paused" &&
              action.to !== "active" &&
              action.to !== "dropped"
            )
              return null;
            return (
              <ConfirmDialog
                key={action.to === "dropped" ? "drop" : "pause-resume"}
                trigger={
                  <Button
                    variant="tonal"
                    size="xs"
                    aria-label={`${action.label}: ${goal.title}`}
                  >
                    {action.label}
                  </Button>
                }
                title={`${action.label} ${goal.title}?`}
                description={goalConsequences[action.to]}
                destructive={action.to === "dropped"}
                icon={action.to === "dropped" ? "block" : undefined}
                confirmLabel={action.label}
                onConfirm={async () => {
                  const result = await changeGoalStatus({
                    id: goal.id,
                    status: action.to,
                  });
                  if (result.ok) {
                    toast({ title: action.done, variant: "success" });
                    if (action.to === "dropped")
                      document.getElementById(headingId)?.focus();
                  }
                  return result;
                }}
              />
            );
          })}
        </div>
      }
    />
  );
}

function StalledRow({
  item: { task, passed },
  locale,
  timeZone,
  headingId,
}: Context & { item: StalledTask; headingId: string }) {
  const [editing, setEditing] = useState(false);
  const reschedule = useRef<HTMLButtonElement>(null);
  const isDeadline = passed === "deadline";
  const details = isDeadline
    ? `Was due ${task.dueAt ? formatInstant(task.dueAt, locale, timeZone) : formatLocalDate(task.dueDate!, locale)}`
    : `Planned for ${formatLocalDate(task.plannedDate!, locale)}`;

  function restoreFocus(event: Event) {
    event.preventDefault();
    (reschedule.current ?? document.getElementById(headingId))?.focus();
  }

  return (
    <ListItem
      headline={task.title}
      supporting={[task.goal?.title, details].filter(Boolean).join(" · ")}
      wrapActions
      wrapSupporting
      trailing={
        <div className="flex flex-wrap justify-end gap-1">
          <ResponsiveSheet
            open={editing}
            onOpenChange={setEditing}
            onCloseAutoFocus={restoreFocus}
            fitKeyboard
            title={`Reschedule ${task.title}`}
            description={
              isDeadline
                ? "This changes the task’s deadline."
                : "This moves the task to the new day in Plan."
            }
            trigger={
              <Button
                ref={reschedule}
                variant="tonal"
                size="xs"
                aria-label={`Reschedule: ${task.title}`}
              >
                Reschedule
              </Button>
            }
          >
            <TodayDateEditor
              task={task}
              kind={isDeadline ? "due" : "plan"}
              locale={locale}
              timeZone={timeZone}
              inSheet
              onDone={() => setEditing(false)}
            />
          </ResponsiveSheet>
          <ConfirmDialog
            trigger={
              <Button
                variant="text"
                size="xs"
                aria-label={`Cancel task: ${task.title}`}
              >
                Cancel task
              </Button>
            }
            title={`Cancel ${task.title}?`}
            description="This moves the task out of your open lists. You can reopen it from Plan."
            confirmLabel="Cancel task"
            cancelLabel="Keep task"
            icon="close"
            onConfirm={async () => {
              const result = await changeTaskStatus({
                id: task.id,
                status: "cancelled",
              });
              if (result.ok) {
                toast({
                  title: "Task cancelled. You can reopen it from Plan.",
                  variant: "success",
                });
                document.getElementById(headingId)?.focus();
              }
              return result;
            }}
          />
        </div>
      }
    />
  );
}

function NextWeekSection({
  data: { plannedNextWeek, plannable },
  labels,
  locale,
}: {
  data: AdjustStep;
  labels: NextWeekLabels;
  locale: string;
}) {
  const id = useId();
  const [taskId, setTaskId] = useState("");
  const [day, setDay] = useState<LocalDate>(labels.days[0]?.value ?? "");
  const [errors, setErrors] = useState<{ task?: string[]; day?: string[] }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!taskId) {
      setErrors({ task: ["Choose a task."] });
      return;
    }
    startTransition(async () => {
      setErrors({});
      setFormError(null);
      try {
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
      } catch {
        setFormError("Couldn't plan the task. Try again.");
      }
    });
  }

  return (
    <section aria-labelledby={`${id}-next-week`} className="grid gap-3">
      <div>
        <h3 id={`${id}-next-week`} className="text-title-large">
          Plan next week
        </h3>
        <p className="text-body-medium text-on-surface-variant">
          {labels.week}
        </p>
      </div>
      {plannable.length === 0 ? (
        <Empty>No other open tasks to plan.</Empty>
      ) : (
        <Card as="div">
          <form
            onSubmit={submit}
            noValidate
            aria-label="Plan a task for next week"
            className="grid gap-3"
          >
            <div className="grid min-w-0 gap-3 large:grid-cols-2">
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
            </div>
            <p className="text-body-small text-on-surface-variant">
              The task will move to the chosen day in Plan.
            </p>
            {formError && <InlineBanner tone="error">{formError}</InlineBanner>}
            <Button
              type="submit"
              variant="tonal"
              size="xs"
              className="justify-self-start"
              pending={pending}
            >
              Plan
            </Button>
          </form>
        </Card>
      )}
      {plannedNextWeek.length === 0 ? (
        <Empty>Nothing is planned for that week yet.</Empty>
      ) : (
        <ListGroup label="Planned for next week">
          {plannedNextWeek.map((task) => (
            <ListItem
              key={task.id}
              headline={task.title}
              supporting={formatLocalDate(task.plannedDate!, locale, "full")}
              wrapSupporting
            />
          ))}
        </ListGroup>
      )}
    </section>
  );
}
