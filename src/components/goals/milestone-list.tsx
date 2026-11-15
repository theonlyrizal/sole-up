"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cx } from "@/components/ui/cx";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { ListGroup, ListItem } from "@/components/ui/list";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import type { GoalStatus } from "@/lib/goals";
import {
  allCountableMilestonesDone,
  MILESTONE_TITLE_MAX,
  type Milestone,
  type MilestoneProgress,
  type MilestoneStatus,
} from "@/lib/milestones";
import type { ActionError, ActionResult } from "@/lib/result";
import { changeGoalStatus } from "@/server/modules/goals/actions";
import {
  changeMilestoneStatus,
  createMilestone,
  reorderMilestones,
} from "@/server/modules/milestones/actions";

type Direction = "up" | "down";

type Props = {
  goalId: string;
  goalStatus: GoalStatus;
  milestones: Milestone[];
  progress: MilestoneProgress | null;
  addInputId: string;
  onProgressChange: (
    before: MilestoneProgress,
    after: MilestoneProgress,
  ) => void;
  onMutationStart: () => void;
};

export function MilestoneList({
  goalId,
  goalStatus,
  milestones,
  progress,
  addInputId,
  onProgressChange,
  onMutationStart,
}: Props) {
  const [ordered, setOptimisticOrder] = useOptimistic(milestones);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const list = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTarget.current || pending) return;
    list.current
      ?.querySelector<HTMLElement>(
        `[data-focus="${focusTarget.current}"]:not(:disabled)`,
      )
      ?.focus();
    focusTarget.current = null;
  }, [pending, ordered]);

  function run(
    action: () => Promise<ActionResult<unknown>>,
    before?: () => void,
  ) {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      before?.();
      try {
        const result = await action();
        if (!result.ok) setError(result.error.message);
      } catch {
        setError("Couldn't save the change. Try again.");
      }
    });
  }

  function move(index: number, direction: Direction) {
    const target = direction === "up" ? index - 1 : index + 1;
    const next = [...ordered];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const moved = ordered[index]!;
    const other = direction === "up" ? "down" : "up";
    const atEnd = target === 0 || target === next.length - 1;
    focusTarget.current = `${moved.id}:${atEnd ? other : direction}`;
    run(
      async () => {
        const result = await reorderMilestones({
          goalId,
          ids: next.map((item) => item.id),
        });
        if (!result.ok) focusTarget.current = `${moved.id}:${direction}`;
        return result;
      },
      () => setOptimisticOrder(next),
    );
  }

  function changeStatus(milestone: Milestone, status: MilestoneStatus) {
    if (pending) return;
    onMutationStart();
    run(async () => {
      const result = await changeMilestoneStatus({ id: milestone.id, status });
      if (
        result.ok &&
        progress &&
        milestone.status !== "dropped" &&
        result.data.status !== "dropped"
      ) {
        const completed =
          progress.completed +
          Number(result.data.status === "completed") -
          Number(milestone.status === "completed");
        if (completed !== progress.completed) {
          onProgressChange(progress, {
            countable: progress.countable,
            completed,
          });
        }
      }
      return result;
    });
  }

  function completeGoal() {
    run(async () => {
      const result = await changeGoalStatus({
        id: goalId,
        status: "completed",
      });
      if (result.ok) toast({ title: "Marked complete", variant: "success" });
      return result;
    });
  }

  const offerComplete =
    allCountableMilestonesDone(progress) &&
    (goalStatus === "active" || goalStatus === "paused");

  return (
    <div ref={list} className="grid gap-3">
      {pending && (
        <p role="status" className="text-body-small text-on-surface-variant">
          Saving change…
        </p>
      )}
      {error && (
        <p role="alert" className="text-body-medium text-error">
          {error}
        </p>
      )}
      {ordered.length === 0 ? (
        <p className="text-body-medium text-on-surface-variant">
          No milestones yet. Add checkpoints if they would help.
        </p>
      ) : (
        <ListGroup label="Goal milestones">
          {ordered.map((milestone, index) => {
            const { id, title, status } = milestone;
            const dropped = status === "dropped";
            const done = status === "completed";
            return (
              <ListItem
                key={id}
                className="gap-0! px-1 medium:gap-2! medium:px-2"
                wrapActions
                leading={
                  <Checkbox
                    labelHidden
                    label={title}
                    shape="round"
                    checked={done}
                    disabled={dropped}
                    aria-busy={pending || undefined}
                    aria-disabled={dropped || pending || undefined}
                    onCheckedChange={(checked) =>
                      changeStatus(
                        milestone,
                        checked === true ? "completed" : "open",
                      )
                    }
                  />
                }
                headline={
                  <span
                    className={cx(
                      (done || dropped) &&
                        "text-on-surface-variant line-through",
                    )}
                    data-milestone-title=""
                  >
                    {title}
                  </span>
                }
                supporting={dropped ? "Dropped" : undefined}
                trailing={
                  <div className="flex flex-wrap justify-end">
                    <IconButton
                      icon="arrow_upward"
                      label={`Move ${title} up`}
                      data-focus={`${id}:up`}
                      disabled={pending || index === 0}
                      onClick={() => move(index, "up")}
                    />
                    <IconButton
                      icon="arrow_downward"
                      label={`Move ${title} down`}
                      data-focus={`${id}:down`}
                      disabled={pending || index === ordered.length - 1}
                      onClick={() => move(index, "down")}
                    />
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton
                          icon="more_vert"
                          label={`Actions for ${title}`}
                          tooltip={false}
                        />
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem
                          disabled={pending}
                          onSelect={() =>
                            changeStatus(
                              milestone,
                              dropped ? "open" : "dropped",
                            )
                          }
                        >
                          {dropped ? "Restore" : "Drop"}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                }
              />
            );
          })}
        </ListGroup>
      )}
      {offerComplete && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary-container p-3 text-body-medium text-on-secondary-container">
          <p>Every milestone is done. Mark the goal complete?</p>
          <Button size="xs" disabled={pending} onClick={completeGoal}>
            Mark goal complete
          </Button>
        </div>
      )}
      <AddMilestoneForm goalId={goalId} inputId={addInputId} />
    </div>
  );
}

/** Inline form that adds a milestone by title. Enter submits. */
function AddMilestoneForm({
  goalId,
  inputId,
}: {
  goalId: string;
  inputId: string;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [adding, startAdding] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startAdding(async () => {
      const result = await createMilestone({ goalId, title });
      if (result.ok) {
        setTitle("");
        setError(null);
        toast({ title: "Milestone added", variant: "success" });
      } else {
        setError(result.error);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="New milestone"
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32 flex-1">
          <FormField
            id={inputId}
            label="New milestone"
            errors={fieldErrors.title}
          >
            {(control) => (
              <Input
                {...control}
                name="title"
                value={title}
                maxLength={MILESTONE_TITLE_MAX}
                autoComplete="off"
                placeholder="e.g. Finish the first draft"
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <Button type="submit" disabled={adding} aria-busy={adding || undefined}>
          {adding ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormError error={error} />
    </form>
  );
}
