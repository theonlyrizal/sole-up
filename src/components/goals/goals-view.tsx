"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ColorSwatch } from "@/components/life-areas/life-area-colors";
import { Button, buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import {
  GOAL_LIST_STATUSES,
  GOAL_PRIORITY_LABELS,
  GOAL_STATUS_LABELS,
  goalStatusActions,
  type GoalListStatus,
  type GoalStatusAction,
} from "@/lib/goals";
import type { LifeArea } from "@/lib/life-areas";
import { milestoneProgressLabel } from "@/lib/milestones";
import { changeGoalStatus } from "@/server/modules/goals/actions";
import type {
  GoalGroup,
  GoalListItem,
  GoalsView as GoalsViewData,
} from "@/server/modules/goals/queries";

import { GoalFormDialog } from "./goal-form";

const EMPTY_STATES: Record<
  GoalListStatus,
  { title: string; description: string }
> = {
  active: {
    title: "No active goals",
    description:
      "A goal only needs a title to start. Add why it matters, dates or an area whenever you like.",
  },
  paused: {
    title: "Nothing paused",
    description:
      "Goals you pause wait here, unchanged, until you want to resume them.",
  },
  completed: {
    title: "No completed goals",
    description: "Goals you mark complete are kept here.",
  },
  dropped: {
    title: "Nothing dropped",
    description:
      "When priorities change, dropped goals are kept here. You can reopen them any time.",
  },
};

function filterHref(status: GoalListStatus) {
  return status === "active" ? "/goals" : `/goals?status=${status}`;
}

export function GoalsView({ view }: { view: GoalsViewData }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeStatus(goal: GoalListItem, action: GoalStatusAction) {
    startTransition(async () => {
      setError(null);
      const result = await changeGoalStatus({ id: goal.id, status: action.to });
      if (result.ok) toast({ title: action.done, variant: "success" });
      else setError(result.error.message);
    });
  }

  const newGoalButton = (
    <GoalFormDialog
      areas={view.areas}
      trigger={<Button>New goal</Button>}
      // A new goal is active; show it if another filter is open.
      onSaved={() => {
        if (view.status !== "active") router.push(filterHref("active"));
      }}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {newGoalButton}
        <Link href="/goals/areas" className={buttonClass({ variant: "ghost" })}>
          Life areas
        </Link>
      </div>

      <nav aria-label="Filter goals by status">
        <ul className="flex flex-wrap gap-1 border-b border-border">
          {GOAL_LIST_STATUSES.map((status) => {
            const current = status === view.status;
            return (
              <li key={status}>
                <Link
                  href={filterHref(status)}
                  aria-current={current ? "page" : undefined}
                  className={cx(
                    "-mb-px inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm",
                    current
                      ? "border-accent font-medium text-fg"
                      : "border-transparent text-muted hover:text-fg",
                    focusRing,
                  )}
                >
                  {GOAL_STATUS_LABELS[status]}
                  <span className="text-muted tabular-nums">
                    ({view.counts[status]})
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p role="alert" className="text-sm text-danger empty:hidden">
        {error}
      </p>

      {view.groups.length === 0 ? (
        <EmptyState
          title={EMPTY_STATES[view.status].title}
          description={EMPTY_STATES[view.status].description}
          action={view.status === "active" ? newGoalButton : undefined}
        />
      ) : (
        view.groups.map((group) => (
          <GoalGroupSection
            key={group.area?.id ?? "none"}
            group={group}
            areas={view.areas}
            pending={pending}
            onChangeStatus={changeStatus}
          />
        ))
      )}
    </div>
  );
}

type GroupProps = {
  group: GoalGroup;
  areas: LifeArea[];
  pending: boolean;
  onChangeStatus: (goal: GoalListItem, action: GoalStatusAction) => void;
};

function GoalGroupSection({
  group,
  areas,
  pending,
  onChangeStatus,
}: GroupProps) {
  const headingId = `goal-group-${group.area?.id ?? "none"}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2
        id={headingId}
        className="flex items-center gap-2 text-lg font-semibold"
      >
        {group.area && <ColorSwatch color={group.area.color} />}
        {group.area?.name ?? "No area"}
        {group.area?.status === "archived" && (
          <span className="text-sm font-normal text-muted">
            (archived area)
          </span>
        )}
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {group.goals.map((goal) => (
          <li key={goal.id} className="flex flex-col gap-3 p-4">
            <GoalSummary goal={goal} />
            <div className="flex flex-wrap items-center gap-1">
              {goalStatusActions(goal.status).map((action) => (
                <Button
                  key={action.to + action.label}
                  variant="secondary"
                  size="sm"
                  aria-label={`${action.label}: ${goal.title}`}
                  disabled={pending}
                  onClick={() => onChangeStatus(goal, action)}
                >
                  {action.label}
                </Button>
              ))}
              <GoalFormDialog
                goal={goal}
                areas={areas}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit: ${goal.title}`}
                  >
                    Edit
                  </Button>
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GoalSummary({ goal }: { goal: GoalListItem }) {
  const details = [
    goal.startDateLabel && `Starts ${goal.startDateLabel}`,
    goal.targetDateLabel && `Target ${goal.targetDateLabel}`,
    milestoneProgressLabel(goal.progress),
  ].filter(Boolean);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium break-words">
          <Link
            href={`/goals/${goal.id}`}
            className={cx("rounded-sm hover:underline", focusRing)}
          >
            {goal.title}
          </Link>
        </h3>
        {goal.priority && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted">
            {GOAL_PRIORITY_LABELS[goal.priority]}
          </span>
        )}
      </div>
      {goal.reason && (
        <p className="line-clamp-2 text-sm break-words whitespace-pre-line text-muted">
          {goal.reason}
        </p>
      )}
      {details.length > 0 && (
        <p className="text-sm text-muted">{details.join(" · ")}</p>
      )}
    </div>
  );
}
