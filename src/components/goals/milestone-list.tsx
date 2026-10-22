"use client";

import {
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { GoalStatus } from "@/lib/goals";
import {
  allCountableMilestonesDone,
  MILESTONE_PROGRESS_HELP,
  MILESTONE_TITLE_MAX,
  milestoneProgressLabel,
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
};

/**
 * A goal's checkpoints: add inline, tick off, drop, and reorder with the move
 * buttons (Enter or Space from the keyboard). Progress follows ADR 0010.
 */
export function MilestoneList({
  goalId,
  goalStatus,
  milestones,
  progress,
}: Props) {
  const helpId = useId();
  const [ordered, setOptimisticOrder] = useOptimistic(milestones);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  // Where focus goes once an action re-renders the list.
  const focusTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTarget.current || pending) return;
    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-focus="${focusTarget.current}"]:not(:disabled)`,
      )
      ?.focus();
    focusTarget.current = null;
  }, [pending, ordered]);

  /** Runs a row action; shows its error above the list. */
  function run(
    action: () => Promise<ActionResult<unknown>>,
    before?: () => void,
  ) {
    startTransition(async () => {
      setError(null);
      before?.();
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  function move(index: number, direction: Direction) {
    const target = direction === "up" ? index - 1 : index + 1;
    const next = [...ordered];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const moved = ordered[index]!;
    // Keep focus on the pressed button, or its partner at either end.
    const other = direction === "up" ? "down" : "up";
    const atEnd = target === 0 || target === next.length - 1;
    focusTarget.current = `${moved.id}:${atEnd ? other : direction}`;
    run(
      () => reorderMilestones({ goalId, ids: next.map((item) => item.id) }),
      () => setOptimisticOrder(next),
    );
  }

  function changeStatus(milestone: Milestone, status: MilestoneStatus) {
    focusTarget.current = `${milestone.id}:${status === "dropped" ? "drop" : "check"}`;
    run(
      () => changeMilestoneStatus({ id: milestone.id, status }),
      () =>
        setOptimisticOrder(
          ordered.map((item) =>
            item.id === milestone.id ? { ...item, status } : item,
          ),
        ),
    );
  }

  function completeGoal() {
    startTransition(async () => {
      setError(null);
      const result = await changeGoalStatus({
        id: goalId,
        status: "completed",
      });
      if (result.ok) toast({ title: "Marked complete", variant: "success" });
      else setError(result.error);
    });
  }

  const label = milestoneProgressLabel(progress);
  // Offered, never forced (ADR 0010). Paused goals can be finished too.
  const offerComplete =
    allCountableMilestonesDone(progress) &&
    (goalStatus === "active" || goalStatus === "paused");

  return (
    <div className="flex flex-col gap-4">
      {milestones.length > 0 && (
        <div className="flex flex-col gap-1">
          {label && (
            <p className="font-medium tabular-nums" aria-describedby={helpId}>
              {label}
            </p>
          )}
          <p id={helpId} className="text-sm text-muted">
            {MILESTONE_PROGRESS_HELP}
          </p>
        </div>
      )}

      <p role="alert" className="text-sm text-danger empty:hidden">
        {error?.message}
      </p>

      {ordered.length === 0 ? (
        <p className="text-muted">
          No milestones yet. Add checkpoints if they would help. A goal does not
          need them.
        </p>
      ) : (
        <ol
          ref={listRef}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {ordered.map((milestone, index) => {
            const { id, title, status } = milestone;
            const dropped = status === "dropped";
            const done = status === "completed";
            return (
              <li key={id} className="flex flex-wrap items-center gap-3 p-3">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    data-focus={`${id}:check`}
                    checked={done}
                    disabled={pending || dropped}
                    onChange={(event) =>
                      changeStatus(
                        milestone,
                        event.target.checked ? "completed" : "open",
                      )
                    }
                    className={cx("size-4 shrink-0 accent-accent", focusRing)}
                  />
                  <span
                    className={cx(
                      "break-words",
                      (done || dropped) && "text-muted line-through",
                    )}
                  >
                    {title}
                  </span>
                </label>
                {dropped && <span className="text-xs text-muted">Dropped</span>}
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Move ${title} up`}
                    data-focus={`${id}:up`}
                    disabled={pending || index === 0}
                    onClick={() => move(index, "up")}
                  >
                    <Arrow direction="up" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Move ${title} down`}
                    data-focus={`${id}:down`}
                    disabled={pending || index === ordered.length - 1}
                    onClick={() => move(index, "down")}
                  >
                    <Arrow direction="down" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`${dropped ? "Restore" : "Drop"} ${title}`}
                    data-focus={`${id}:drop`}
                    disabled={pending}
                    onClick={() =>
                      changeStatus(milestone, dropped ? "open" : "dropped")
                    }
                  >
                    {dropped ? "Restore" : "Drop"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {offerComplete && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
          <p className="flex-1">
            Every milestone is done. Mark the goal complete?
          </p>
          <Button size="sm" disabled={pending} onClick={completeGoal}>
            Mark goal complete
          </Button>
        </div>
      )}

      <AddMilestoneForm goalId={goalId} />
    </div>
  );
}

/** Inline form that adds a milestone by title. Enter submits. */
function AddMilestoneForm({ goalId }: { goalId: string }) {
  const id = useId();
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
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <FormField
            id={`${id}-title`}
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
        <Button type="submit" disabled={adding}>
          {adding ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormError error={error} />
    </form>
  );
}

function Arrow({ direction }: { direction: Direction }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "up" ? "M5 12l5-5 5 5" : "M5 8l5 5 5-5"} />
    </svg>
  );
}
