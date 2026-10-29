"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GOAL_STATUS_LABELS } from "@/lib/goals";
import { TASK_STATUS_LABELS } from "@/lib/task-list";
import {
  priorityKey,
  REVIEW_PRIORITIES_MAX,
  REVIEW_TEXT_MAX,
  type ReviewPriority,
} from "@/lib/weekly-reviews";
import {
  saveWeeklyReviewText,
  setWeeklyReviewPriorities,
} from "@/server/modules/weekly-reviews/actions";
import type {
  PriorityOptions,
  ReviewDetail,
  ReviewPriorityItem,
} from "@/server/modules/weekly-reviews/queries";

import { useStepSave } from "./review-flow";

// Choose priorities (chunk 7.3): up to 10 goals and tasks for the week after
// the reviewed one, in order, and an optional note. Saved, like every step,
// when the user leaves it.

type Chosen = {
  key: string;
  priority: ReviewPriority;
  title: string;
  kind: "Goal" | "Task";
  /** Shown when it isn't an active goal or an open task (it changed since). */
  status: string | null;
};

function chosenFrom(item: ReviewPriorityItem): Chosen {
  const priority: ReviewPriority =
    item.kind === "goal" ? { goalId: item.id } : { taskId: item.id };
  const status =
    item.kind === "goal"
      ? item.status === "active"
        ? null
        : GOAL_STATUS_LABELS[item.status]
      : item.status === "open"
        ? null
        : TASK_STATUS_LABELS[item.status];
  return {
    key: priorityKey(priority),
    priority,
    title: item.title,
    kind: item.kind === "goal" ? "Goal" : "Task",
    status,
  };
}

export function PrioritiesStep({
  review,
  options,
}: {
  review: ReviewDetail;
  options: PriorityOptions;
}) {
  const id = useId();
  const [saved, setSaved] = useState(() => ({
    keys: review.priorities.map((item) => chosenFrom(item).key).join(),
    note: review.prioritiesNote ?? "",
  }));
  const [chosen, setChosen] = useState(() => review.priorities.map(chosenFrom));
  const [note, setNote] = useState(saved.note);
  const [adding, setAdding] = useState("");
  const [errors, setErrors] = useState<{
    priorities?: string[];
    note?: string[];
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement | null>());

  const chosenKeys = new Set(chosen.map((item) => item.key));
  const goalOptions = options.goals.filter(
    (goal) => !chosenKeys.has(`goal:${goal.id}`),
  );
  const taskOptions = options.tasks.filter(
    (task) => !chosenKeys.has(`task:${task.id}`),
  );
  const full = chosen.length >= REVIEW_PRIORITIES_MAX;

  useStepSave(async () => {
    const keys = chosen.map((item) => item.key).join();
    if (keys === saved.keys && note === saved.note) return true;
    setErrors({});
    setFormError(null);
    if (keys !== saved.keys) {
      const result = await setWeeklyReviewPriorities({
        id: review.id,
        priorities: chosen.map((item) => item.priority),
      });
      if (!result.ok) {
        const fieldErrors =
          result.error.code === "VALIDATION" ? result.error.fieldErrors : {};
        setErrors({ priorities: fieldErrors.priorities });
        setFormError(result.error.message);
        return false;
      }
      setSaved((current) => ({ ...current, keys }));
    }
    if (note !== saved.note) {
      const result = await saveWeeklyReviewText({
        id: review.id,
        prioritiesNote: note,
      });
      if (!result.ok) {
        const fieldErrors =
          result.error.code === "VALIDATION" ? result.error.fieldErrors : {};
        setErrors({ note: fieldErrors.prioritiesNote });
        setFormError(result.error.message);
        return false;
      }
      setSaved((current) => ({ ...current, note }));
    }
    return true;
  });

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [kind, targetId] = adding.split(":");
    if (!targetId) {
      setErrors({ priorities: ["Choose a goal or a task."] });
      return;
    }
    const item: ReviewPriorityItem | undefined =
      kind === "goal"
        ? options.goals
            .filter((goal) => goal.id === targetId)
            .map((goal) => ({ kind: "goal" as const, ...goal }))[0]
        : options.tasks
            .filter((task) => task.id === targetId)
            .map((task) => ({
              kind: "task" as const,
              ...task,
              status: "open" as const,
            }))[0];
    if (!item) return;
    setErrors({});
    setChosen((current) => [...current, chosenFrom(item)]);
    setAdding("");
  }

  /** Moves a row and keeps focus on the button that moved it, if it can. */
  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= chosen.length) return;
    const next = [...chosen];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setChosen(next);
    // At either end the button just used is disabled; focus the other one.
    const key = next[target]!.key;
    const edge = target === 0 || target === next.length - 1;
    const keep = by === -1 ? "up" : "down";
    const other = by === -1 ? "down" : "up";
    requestAnimationFrame(() => {
      rowButtons.current.get(`${key}:${edge ? other : keep}`)?.focus();
    });
  }

  function remove(index: number) {
    const next = chosen.filter((_, itemIndex) => itemIndex !== index);
    setChosen(next);
    // Focus the row that took its place, or the add field.
    const neighbour = next[Math.min(index, next.length - 1)];
    requestAnimationFrame(() => {
      const button = neighbour
        ? rowButtons.current.get(`${neighbour.key}:remove`)
        : document.getElementById(`${id}-add`);
      button?.focus();
    });
  }

  const ref = (key: string) => (element: HTMLButtonElement | null) => {
    rowButtons.current.set(key, element);
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted">
        Pick up to {REVIEW_PRIORITIES_MAX} goals and tasks that matter most for
        the week after this one, in order. You can leave this empty.
      </p>

      <section aria-labelledby={`${id}-chosen`} className="flex flex-col gap-3">
        <h3 id={`${id}-chosen`} className="text-lg font-semibold">
          Priorities ({chosen.length} of {REVIEW_PRIORITIES_MAX})
        </h3>
        {chosen.length === 0 ? (
          <p className="text-sm text-muted">None chosen yet.</p>
        ) : (
          <ol
            aria-label="Priorities for next week"
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
          >
            {chosen.map((item, index) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-sm text-muted tabular-nums">
                    {index + 1}.
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium break-words">
                      {item.title}
                    </span>
                    <span className="text-sm text-muted">
                      {[item.kind, item.status].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    ref={ref(`${item.key}:up`)}
                    variant="secondary"
                    size="sm"
                    disabled={index === 0}
                    aria-label={`Move up: ${item.title}`}
                    onClick={() => move(index, -1)}
                  >
                    Up
                  </Button>
                  <Button
                    ref={ref(`${item.key}:down`)}
                    variant="secondary"
                    size="sm"
                    disabled={index === chosen.length - 1}
                    aria-label={`Move down: ${item.title}`}
                    onClick={() => move(index, 1)}
                  >
                    Down
                  </Button>
                  <Button
                    ref={ref(`${item.key}:remove`)}
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove: ${item.title}`}
                    onClick={() => remove(index)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <form
          onSubmit={add}
          noValidate
          aria-label="Add a priority"
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <FormField
              id={`${id}-add`}
              label="Goal or task"
              hint={
                full
                  ? `That's ${REVIEW_PRIORITIES_MAX}, the most a review holds. Remove one to add another.`
                  : undefined
              }
              errors={errors.priorities}
            >
              {(control) => (
                <Select
                  {...control}
                  name="priority"
                  value={adding}
                  disabled={full}
                  onChange={(event) => setAdding(event.target.value)}
                >
                  <option value="">Choose a goal or task</option>
                  {goalOptions.length > 0 && (
                    <optgroup label="Goals">
                      {goalOptions.map((goal) => (
                        <option key={goal.id} value={`goal:${goal.id}`}>
                          {goal.status === "paused"
                            ? `${goal.title} (paused)`
                            : goal.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {taskOptions.length > 0 && (
                    <optgroup label="Tasks">
                      {taskOptions.map((task) => (
                        <option key={task.id} value={`task:${task.id}`}>
                          {task.goalTitle
                            ? `${task.title} (${task.goalTitle})`
                            : task.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              )}
            </FormField>
          </div>
          <Button type="submit" variant="secondary" disabled={full}>
            Add
          </Button>
        </form>
      </section>

      <FormField
        id={`${id}-note`}
        label="Note (optional)"
        hint="Anything to remember about next week's priorities."
        errors={errors.note}
      >
        {(control) => (
          <Textarea
            {...control}
            name="prioritiesNote"
            rows={3}
            maxLength={REVIEW_TEXT_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>

      <p role="alert" className="text-sm text-danger empty:hidden">
        {formError}
      </p>
    </div>
  );
}
