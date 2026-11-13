"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { formatInstant, formatLocalDate } from "@/lib/dates";
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
    <ResponsiveSheet
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="xs" variant="tonal" icon="add">
          Add to today
        </Button>
      }
      title="Add to today"
      description="Tasks with no plan yet: those due in the next 7 days, and the next steps under your active goals."
    >
      <AddToTodayForm {...props} onAdded={() => setOpen(false)} />
    </ResponsiveSheet>
  );
}

function AddToTodayForm({
  suggestions,
  locale,
  timeZone,
  onAdded,
}: AddToTodayProps & { onAdded: () => void }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
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
    if (pending || selected.size === 0) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await planTasksToday({ ids: [...selected] });
        if (result.ok) {
          toast({
            title: `${tasksLabel(result.data.count)} planned for today`,
            variant: "success",
          });
          onAdded();
        } else {
          setError(result.error.message);
        }
      } catch {
        setError("Couldn't add the tasks. Try again.");
      }
    });
  }

  const count = selected.size;
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Suggestions for today"
      aria-busy={pending || undefined}
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
      {error && (
        <p role="alert" className="text-body-medium text-on-surface-variant">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <span aria-live="polite" className="text-sm text-muted">
          {count === 0 ? "None selected" : `${count} selected`}
        </span>
        <Button
          type="submit"
          disabled={count === 0}
          aria-disabled={pending || undefined}
        >
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
  return (
    <Checkbox
      label={task.title}
      description={detail ?? undefined}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(checked) => onChange(checked === true)}
    />
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
