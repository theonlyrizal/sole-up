"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { toast } from "@/components/ui/toast";
import { formatInstant, formatLocalDate } from "@/lib/dates";
import type { ActionError } from "@/lib/result";
import { planTasksToday } from "@/server/modules/tasks/actions";
import type {
  PlanTaskItem,
  TodaySuggestions,
} from "@/server/modules/tasks/queries";

type AddToTodayProps = {
  suggestions: TodaySuggestions;
  locale: string;
  timeZone: string;
};

const DUE_SOON = "due-soon";

const tasksLabel = (count: number) =>
  `${count} ${count === 1 ? "task" : "tasks"}`;

/**
 * "Add to today": a picker of suggested tasks (due in the next 7 days, and
 * next actions from active goals). The chosen ones are planned for the
 * user's today in one go.
 */
export function AddToToday(props: AddToTodayProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Add to today
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add to today"
        description="Tasks with no plan yet: those due in the next 7 days, and the next steps under your active goals."
      >
        <AddToTodayForm {...props} onAdded={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddToTodayForm({
  suggestions,
  locale,
  timeZone,
  onAdded,
}: AddToTodayProps & { onAdded: () => void }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = [
    ...(suggestions.dueSoon.length > 0
      ? [{ key: DUE_SOON, label: "Due soon", tasks: suggestions.dueSoon }]
      : []),
    ...suggestions.goals.map((goal) => ({
      key: goal.id,
      label: goal.title,
      tasks: goal.tasks,
    })),
  ];

  if (groups.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Nothing to suggest right now.</p>
        <p className="text-sm text-muted">
          Tasks show up here when they have no plan yet and are due in the next
          7 days, or sit under an active goal. Close this and use Add task to
          capture one.
        </p>
      </div>
    );
  }

  function toggle(taskId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      const result = await planTasksToday({ ids: [...selected] });
      if (result.ok) {
        toast({
          title: `${tasksLabel(result.data.count)} planned for today`,
          variant: "success",
        });
        onAdded();
      } else {
        setError(result.error);
      }
    });
  }

  const count = selected.size;
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Suggestions for today"
      className="flex flex-col gap-4"
    >
      {groups.map((group) => (
        <fieldset key={group.key} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold break-words">
            {group.label}
          </legend>
          {group.tasks.map((task) => (
            <SuggestionOption
              key={task.id}
              task={task}
              checked={selected.has(task.id)}
              disabled={pending}
              onChange={(checked) => toggle(task.id, checked)}
              detail={suggestionDetail(
                task,
                group.key === DUE_SOON,
                locale,
                timeZone,
              )}
            />
          ))}
        </fieldset>
      ))}
      <FormError error={error} />
      <div className="flex items-center justify-end gap-3">
        <span aria-live="polite" className="text-sm text-muted">
          {count === 0 ? "None selected" : `${count} selected`}
        </span>
        <Button type="submit" disabled={pending || count === 0}>
          {pending ? "Adding…" : "Add to today"}
        </Button>
      </div>
    </form>
  );
}

function SuggestionOption({
  task,
  checked,
  disabled,
  detail,
  onChange,
}: {
  task: PlanTaskItem;
  checked: boolean;
  disabled: boolean;
  detail: string | null;
  onChange: (checked: boolean) => void;
}) {
  const detailId = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={`${detailId}-box`}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={detail ? detailId : undefined}
        onChange={(event) => onChange(event.target.checked)}
        className={cx("mt-1 size-4 shrink-0 accent-accent", focusRing)}
      />
      <div className="flex min-w-0 flex-col">
        <label htmlFor={`${detailId}-box`} className="break-words">
          {task.title}
        </label>
        {detail && (
          <span id={detailId} className="text-sm text-muted">
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}

/** The deadline and where the task sits, for one suggestion. */
function suggestionDetail(
  task: PlanTaskItem,
  withGoal: boolean,
  locale: string,
  timeZone: string,
): string | null {
  const parts: string[] = [];
  if (task.dueAt) {
    parts.push(`Due ${formatInstant(task.dueAt, locale, timeZone)}`);
  } else if (task.dueDate) {
    parts.push(`Due ${formatLocalDate(task.dueDate, locale)}`);
  }
  // Goal groups already name the goal; "Due soon" doesn't.
  if (withGoal && task.goal) parts.push(task.goal.title);
  if (task.milestone) parts.push(task.milestone.title);
  return parts.length > 0 ? parts.join(" · ") : null;
}
