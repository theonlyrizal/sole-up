"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Input } from "@/components/ui/input";
import { ListGroup, ListItem } from "@/components/ui/list";
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

function chosenFrom(item: ReviewPriorityItem) {
  const priority: ReviewPriority =
    item.kind === "goal" ? { goalId: item.id } : { taskId: item.id };
  const status =
    item.kind === "goal"
      ? item.status !== "active" && GOAL_STATUS_LABELS[item.status]
      : item.status !== "open" && TASK_STATUS_LABELS[item.status];
  return {
    key: priorityKey(priority),
    priority,
    title: item.title,
    details: [item.kind === "goal" ? "Goal" : "Task", status]
      .filter(Boolean)
      .join(" · "),
  };
}

type Chosen = ReturnType<typeof chosenFrom>;

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
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<{
    priorities?: string[];
    note?: string[];
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const chosenKeys = new Set(chosen.map((item) => item.key));
  const keys = [...chosenKeys].join();
  const full = chosen.length >= REVIEW_PRIORITIES_MAX;
  const term = query.trim().toLocaleLowerCase();
  const candidates = [
    ...options.goals.map((goal) => chosenFrom({ kind: "goal", ...goal })),
    ...options.tasks.map((task) => {
      const item = chosenFrom({ kind: "task", status: "open", ...task });
      return {
        ...item,
        details: [item.details, task.goalTitle].filter(Boolean).join(" · "),
      };
    }),
  ].filter(
    (item) =>
      !chosenKeys.has(item.key) &&
      `${item.title} ${item.details}`.toLocaleLowerCase().includes(term),
  );
  const saveState = useStepSave(
    async () => {
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
    },
    keys !== saved.keys || note !== saved.note,
  );

  function add(item: Chosen) {
    if (full || chosenKeys.has(item.key)) return;
    setChosen((current) => [...current, item]);
    search.current?.focus();
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= chosen.length) return;
    const next = [...chosen];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setChosen(next);
    const key = next[target]!.key;
    const direction =
      target === 0
        ? "down"
        : target === next.length - 1
          ? "up"
          : by === -1
            ? "up"
            : "down";
    requestAnimationFrame(() =>
      rowButtons.current.get(`${key}:${direction}`)?.focus(),
    );
  }

  function remove(index: number) {
    const next = chosen.filter((_, itemIndex) => itemIndex !== index);
    setChosen(next);
    const neighbour = next[Math.min(index, next.length - 1)];
    requestAnimationFrame(() => {
      (neighbour
        ? rowButtons.current.get(`${neighbour.key}:remove`)
        : search.current
      )?.focus();
    });
  }

  const ref = (key: string) => (element: HTMLButtonElement | null) => {
    if (element) rowButtons.current.set(key, element);
    else rowButtons.current.delete(key);
  };

  return (
    <div className="grid min-w-0 gap-6">
      {formError && (
        <InlineBanner
          tone="error"
          action={
            <Button variant="text" onClick={saveState?.retry}>
              Retry
            </Button>
          }
        >
          {formError}
        </InlineBanner>
      )}
      <section aria-labelledby={`${id}-chosen`} className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id={`${id}-chosen`} className="text-title-large">
            Priorities for next week
          </h3>
          <p
            role="status"
            className="text-label-large text-on-surface-variant tabular-nums"
          >
            {chosen.length} of {REVIEW_PRIORITIES_MAX}
          </p>
        </div>
        {chosen.length === 0 ? (
          <p className="text-body-medium text-on-surface-variant">
            None chosen yet.
          </p>
        ) : (
          <ListGroup as="ol" label="Priorities for next week">
            {chosen.map((item, index) => (
              <ListItem
                key={item.key}
                leading={
                  <span
                    aria-hidden="true"
                    className="grid size-8 place-items-center rounded-full bg-surface-container text-label-large tabular-nums"
                  >
                    {index + 1}
                  </span>
                }
                headline={item.title}
                supporting={item.details}
                wrapSupporting
                wrapActions
                className="max-medium:[&>div:last-child]:basis-full"
                trailing={
                  <div className="flex flex-wrap justify-end">
                    <IconButton
                      ref={ref(`${item.key}:up`)}
                      icon="arrow_upward"
                      label={`Move ${item.title} up`}
                      size={40}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <IconButton
                      ref={ref(`${item.key}:down`)}
                      icon="arrow_downward"
                      label={`Move ${item.title} down`}
                      size={40}
                      disabled={index === chosen.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <IconButton
                      ref={ref(`${item.key}:remove`)}
                      icon="close"
                      label={`Remove ${item.title}`}
                      size={40}
                      onClick={() => remove(index)}
                    />
                  </div>
                }
              />
            ))}
          </ListGroup>
        )}
      </section>
      <Card headingId={`${id}-picker`} className="grid gap-3">
        <h3 id={`${id}-picker`} className="text-title-medium">
          Add a priority
        </h3>
        <FormField
          id={`${id}-search`}
          label="Find a goal or task"
          hint={full ? "Remove a priority to add another." : undefined}
          errors={errors.priorities}
        >
          {(control) => (
            <Input
              {...control}
              ref={search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
        </FormField>
        {candidates.length === 0 ? (
          <p className="text-body-medium text-on-surface-variant">
            {term
              ? "No matching goals or tasks."
              : "No more goals or tasks to add."}
          </p>
        ) : (
          <ListGroup
            label="Available goals and tasks"
            className="max-h-80 overflow-y-auto overscroll-y-contain p-1"
          >
            {candidates.map((item) => (
              <ListItem
                key={item.key}
                headline={item.title}
                supporting={item.details}
                className="px-1!"
                wrapSupporting
                wrapActions
                trailing={
                  <Button
                    variant="text"
                    size="xs"
                    disabled={full}
                    aria-label={`Add ${item.title}`}
                    onClick={() => add(item)}
                  >
                    Add
                  </Button>
                }
              />
            ))}
          </ListGroup>
        )}
      </Card>
      <Card as="div">
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
      </Card>
    </div>
  );
}
