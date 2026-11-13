"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { StatusChip } from "@/components/data/status-chip";
import { useLinkedNotes } from "@/components/notes/linked-notes";
import { ReminderSelect } from "@/components/reminders/reminder-select";
import { ReminderStatus } from "@/components/reminders/reminder-status";
import { Button } from "@/components/ui/button";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { localDateTimeOf } from "@/lib/dates";
import { type Priority, PRIORITIES } from "@/lib/priorities";
import type { ActionError } from "@/lib/result";
import {
  parentFromChoice,
  taskParentChoice,
  type Task,
  type TaskStatus,
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_ESTIMATE_MIN_MINUTES,
  TASK_NOTES_MAX,
  TASK_TITLE_MAX,
} from "@/lib/tasks";
import {
  changeTaskStatus,
  getTaskParentOptions,
  scheduleTask,
  updateTask,
} from "@/server/modules/tasks/actions";
import type {
  PlanTaskItem,
  TaskParentOption,
} from "@/server/modules/tasks/queries";

import { DeleteTaskDialog } from "./delete-task-dialog";
import { TaskBlocks } from "./task-blocks";
import { TaskNotes } from "./task-notes";
import { TaskParentSelect } from "./task-parent-select";
import { currentParent } from "./task-schedule-editor";

const priorityItems = [
  { value: "none", label: "None" },
  ...PRIORITIES.map((value) => ({
    value,
    label: value[0].toUpperCase() + value.slice(1),
  })),
];

type TaskFormDialogProps = {
  task: Task | PlanTaskItem;
  timeZone: string;
  parentOptions?: TaskParentOption[];
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

export function TaskFormDialog({
  trigger,
  task,
  timeZone,
  parentOptions,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
}: TaskFormDialogProps) {
  const id = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const writing = useRef(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  function run(action: () => Promise<void>) {
    if (writing.current) return;
    writing.current = true;
    startTransition(async () => {
      try {
        await action();
      } finally {
        writing.current = false;
      }
    });
  }

  return (
    <FormDialog
      title="Edit task"
      formId={id}
      submitLabel="Save"
      pending={pending}
      open={open}
      onOpenChange={(next) => {
        if (!writing.current) setOpen(next);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      trigger={trigger}
    >
      <TaskDialogBody
        key={task.id}
        id={id}
        task={task}
        timeZone={timeZone}
        parentOptions={parentOptions}
        pending={pending}
        run={run}
        onDone={() => setOpen(false)}
      />
    </FormDialog>
  );
}

function TaskDialogBody({
  id,
  task,
  timeZone,
  parentOptions,
  pending,
  run,
  onDone,
}: Pick<TaskFormDialogProps, "task" | "timeZone" | "parentOptions"> & {
  id: string;
  pending: boolean;
  run: (action: () => Promise<void>) => void;
  onDone: () => void;
}) {
  const linkedNotes = useLinkedNotes({ targetType: "task", targetId: task.id });
  const form = useRef<HTMLFormElement>(null);
  const saved = useRef(task);
  const zone = task.dueTz ?? timeZone;
  const timedDue = task.dueAt ? localDateTimeOf(task.dueAt, zone) : null;
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [parent, setParent] = useState<string>(taskParentChoice(task));
  const [plannedDate, setPlannedDate] = useState(task.plannedDate ?? "");
  const [dueDate, setDueDate] = useState(timedDue?.date ?? task.dueDate ?? "");
  const [dueTime, setDueTime] = useState(timedDue?.time ?? "");
  const [priority, setPriority] = useState<Priority | "none">(
    task.priority ?? "none",
  );
  const [estimate, setEstimate] = useState(
    task.estimatedMinutes?.toString() ?? "",
  );
  const [reminder, setReminder] = useState(
    task.reminderOffsetMinutes?.toString() ?? "",
  );
  const [loadedParents, setLoadedParents] = useState<TaskParentOption[] | null>(
    null,
  );
  const [parentsFailed, setParentsFailed] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [detailsFailed, setDetailsFailed] = useState(false);
  const [status, setSavedStatus] = useState(task.status);
  const parents = parentOptions ?? loadedParents;

  useEffect(() => {
    if (parentOptions) return;
    let cancelled = false;
    getTaskParentOptions({}).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) setLoadedParents(result.data);
        else setParentsFailed(true);
      },
      () => {
        if (!cancelled) setParentsFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [parentOptions]);

  useLayoutEffect(() => {
    if (error && !pending) {
      const first =
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        form.current?.querySelector<HTMLElement>('[role="alert"]');
      if (first?.getAttribute("role") === "alert") first.tabIndex = -1;
      first?.focus();
    }
  }, [error, pending]);

  function scheduleChanged(current: Task) {
    const previousDue = current.dueAt
      ? localDateTimeOf(current.dueAt, zone)
      : null;
    return (
      parent !== taskParentChoice(current) ||
      plannedDate !== (current.plannedDate ?? "") ||
      dueDate !== (previousDue?.date ?? current.dueDate ?? "") ||
      dueTime !== (previousDue?.time ?? "")
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(async () => {
      setError(null);
      let scheduleSaved = false;
      try {
        const current = saved.current;
        // The existing actions commit separately. Keep the confirmed schedule
        // so retrying the details does not repeat that write.
        if (scheduleChanged(current)) {
          const result = await scheduleTask({
            id: task.id,
            ...parentFromChoice(parent),
            plannedDate,
            dueDate,
            dueTime,
            dueTz: dueTime ? zone : "",
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          saved.current = result.data;
          scheduleSaved = true;
        }
        const result = await updateTask({
          id: task.id,
          title,
          notes,
          priority: priority === "none" ? null : priority,
          estimatedMinutes: estimate.trim(),
          reminderOffsetMinutes: reminder,
        });
        if (!result.ok) {
          setError(result.error);
          if (scheduleSaved) setDetailsFailed(true);
          return;
        }
        toast({ title: "Task saved", variant: "success" });
        onDone();
      } catch {
        if (scheduleSaved) setDetailsFailed(true);
        setError({
          code: "INTERNAL",
          message: "Couldn't save the task. Try again.",
        });
      }
    });
  }

  function setStatus(status: TaskStatus) {
    run(async () => {
      setError(null);
      try {
        const result = await changeTaskStatus({ id: task.id, status });
        if (result.ok) {
          const message =
            status === "open"
              ? "Task reopened"
              : status === "completed"
                ? "Task completed"
                : "Task cancelled";
          toast({ title: message, variant: "success" });
          setSavedStatus(result.data.status);
          const current = saved.current;
          if (
            !scheduleChanged(current) &&
            title === current.title &&
            notes === (current.notes ?? "") &&
            priority === (current.priority ?? "none") &&
            estimate === (current.estimatedMinutes?.toString() ?? "") &&
            reminder === (current.reminderOffsetMinutes?.toString() ?? "")
          )
            onDone();
        } else {
          setError(result.error);
        }
      } catch {
        setError({
          code: "INTERNAL",
          message: "Couldn't update the task status. Try again.",
        });
      }
    });
  }

  const errors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  const parentChoice = taskParentChoice(task);
  const parentLabel =
    ("goal" in task ? currentParent(task) : null) ??
    (parentChoice
      ? {
          value: parentChoice,
          label: task.milestoneId ? "Current milestone" : "Current goal",
        }
      : null);

  return (
    <div className="grid min-w-0 gap-5">
      <form
        ref={form}
        id={id}
        onSubmit={submit}
        noValidate
        aria-label={`Edit ${task.title}`}
        aria-busy={pending || undefined}
        className="grid min-w-0 gap-4"
      >
        {detailsFailed && (
          <p role="status" className="text-body-medium">
            Dates and goal were saved. Review the remaining fields and save
            again.
          </p>
        )}
        <FormError error={error} />
        {pending && (
          <span className="sr-only" role="status">
            Saving task…
          </span>
        )}
        <fieldset disabled={pending} className="grid min-w-0 gap-4">
          <FormField id={`${id}-title`} label="Title" errors={errors.title}>
            {(control) => (
              <Input
                {...control}
                name="title"
                value={title}
                maxLength={TASK_TITLE_MAX}
                autoComplete="off"
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            id={`${id}-parent`}
            label="Goal or milestone"
            hint={
              parentsFailed
                ? "Goals couldn't load. Reopen the task to try again."
                : undefined
            }
            errors={[...(errors.goalId ?? []), ...(errors.milestoneId ?? [])]}
          >
            {(control) => (
              <TaskParentSelect
                {...control}
                name="parent"
                value={parent}
                options={parents ?? []}
                noneLabel="No goal"
                current={parentLabel}
                disabled={!parents}
                onChange={(event) => setParent(event.target.value)}
              />
            )}
          </FormField>
          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-2 text-title-medium">When</legend>
            <div className="grid min-w-0 gap-3 medium:grid-cols-2">
              <FormField
                id={`${id}-due`}
                label="Due date"
                errors={errors.dueDate}
              >
                {(control) => (
                  <Input
                    {...control}
                    name="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                )}
              </FormField>
              <FormField
                id={`${id}-time`}
                label="Due time"
                hint={`Optional. In ${zone}.`}
                errors={[...(errors.dueTime ?? []), ...(errors.dueTz ?? [])]}
              >
                {(control) => (
                  <Input
                    {...control}
                    name="dueTime"
                    type="time"
                    value={dueTime}
                    onChange={(event) => setDueTime(event.target.value)}
                  />
                )}
              </FormField>
            </div>
            <FormField
              id={`${id}-planned`}
              label="Planned date"
              errors={errors.plannedDate}
            >
              {(control) => (
                <Input
                  {...control}
                  name="plannedDate"
                  type="date"
                  value={plannedDate}
                  onChange={(event) => setPlannedDate(event.target.value)}
                />
              )}
            </FormField>
          </fieldset>
          <div className="grid min-w-0 gap-1">
            <span className="text-title-medium">Priority</span>
            <ConnectedButtonGroup
              label="Priority"
              size="xs"
              items={priorityItems}
              value={priority}
              onValueChange={(value) => setPriority(value as typeof priority)}
            />
            {errors.priority?.length ? (
              <p role="alert" className="text-body-small text-error">
                {errors.priority.join(" ")}
              </p>
            ) : null}
          </div>
          <NumberStepper
            label="Estimate (minutes)"
            name="estimatedMinutes"
            min={TASK_ESTIMATE_MIN_MINUTES}
            max={TASK_ESTIMATE_MAX_MINUTES}
            value={estimate}
            onValueChange={setEstimate}
            errors={errors.estimatedMinutes}
          />
          <ReminderSelect
            id={`${id}-reminder`}
            value={reminder}
            onChange={setReminder}
            errors={errors.reminderOffsetMinutes}
            note={
              dueDate && dueTime
                ? "Before the task's due time."
                : "Only a deadline with a time can remind, and this task has none yet."
            }
          />
          <FormField id={`${id}-notes`} label="Notes" errors={errors.notes}>
            {(control) => (
              <Textarea
                {...control}
                name="notes"
                rows={3}
                value={notes}
                maxLength={TASK_NOTES_MAX}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
          </FormField>
        </fieldset>
      </form>
      <ReminderStatus item={{ kind: "task", id: task.id }} />
      <TaskBlocks task={{ ...task, status }} />
      <TaskNotes
        task={task}
        data={linkedNotes.data}
        failed={linkedNotes.failed}
        onChanged={linkedNotes.reload}
      />
      <section
        aria-label="Task actions"
        className="grid gap-2 border-t border-outline-variant pt-3"
      >
        <div className="flex flex-wrap items-center gap-x-3">
          <h3 className="text-title-medium">Task actions</h3>
          <StatusChip status={status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "open" ? (
            <Button
              variant="tonal"
              disabled={pending}
              onClick={() => setStatus("completed")}
            >
              Complete
            </Button>
          ) : (
            <Button
              variant="tonal"
              disabled={pending}
              onClick={() => setStatus("open")}
            >
              Reopen task
            </Button>
          )}
          {status !== "cancelled" && (
            <Button
              variant="text"
              disabled={pending}
              onClick={() => setStatus("cancelled")}
            >
              Cancel task
            </Button>
          )}
          <DeleteTaskDialog
            task={{ ...task, status }}
            noteLinkCount={linkedNotes.data?.linkCount ?? null}
            disabled={pending}
            onDeleted={onDone}
          />
        </div>
      </section>
    </div>
  );
}
