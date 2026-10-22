"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ColorSwatch } from "@/components/life-areas/life-area-colors";
import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { toast } from "@/components/ui/toast";
import {
  GOAL_LIST_STATUSES,
  GOAL_PRIORITY_LABELS,
  GOAL_STATUS_LABELS,
  goalStatusActions,
  type GoalStatusAction,
} from "@/lib/goals";
import { changeGoalStatus } from "@/server/modules/goals/actions";
import type { GoalHistoryEntry } from "@/server/modules/goals/history";
import type { GoalDetail } from "@/server/modules/goals/queries";

import { DeleteGoalDialog } from "./delete-goal-dialog";
import { GoalFormDialog } from "./goal-form";
import { MilestoneList } from "./milestone-list";

/** The goal's own page: header, reason, what's coming, and its history. */
export function GoalDetailView({ detail }: { detail: GoalDetail }) {
  const { goal, area, areas, history, milestones, progress } = detail;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeStatus(action: GoalStatusAction) {
    startTransition(async () => {
      setError(null);
      const result = await changeGoalStatus({ id: goal.id, status: action.to });
      if (result.ok) toast({ title: action.done, variant: "success" });
      else setError(result.error.message);
    });
  }

  // Back to the filter this goal is listed under, or the archive view.
  const listStatus = GOAL_LIST_STATUSES.find(
    (status) => status === goal.status,
  );
  const backHref =
    goal.status === "archived"
      ? "/goals/archived"
      : listStatus && listStatus !== "active"
        ? `/goals?status=${listStatus}`
        : "/goals";
  const dates = [
    goal.startDateLabel && `Starts ${goal.startDateLabel}`,
    goal.targetDateLabel && `Target ${goal.targetDateLabel}`,
    goal.completedAtLabel && `Completed on ${goal.completedAtLabel}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href={backHref}
          className={cx(
            "self-start rounded-sm text-sm text-muted hover:text-fg",
            focusRing,
          )}
        >
          ← Goals
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {goal.title}
          </h1>
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex gap-1">
              <dt className="text-muted">Status</dt>
              <dd className="font-medium">{GOAL_STATUS_LABELS[goal.status]}</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="text-muted">Area</dt>
              <dd className="flex items-center gap-1.5">
                {area && <ColorSwatch color={area.color} />}
                {area?.name ?? "No area"}
                {area?.status === "archived" && (
                  <span className="text-muted">(archived area)</span>
                )}
              </dd>
            </div>
            {goal.priority && (
              <div>
                <dt className="sr-only">Priority</dt>
                <dd className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted">
                  {GOAL_PRIORITY_LABELS[goal.priority]}
                </dd>
              </div>
            )}
          </dl>
          {dates.length > 0 && (
            <p className="text-sm text-muted">{dates.join(" · ")}</p>
          )}
          {goal.description && (
            <p className="break-words whitespace-pre-line">
              {goal.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {goalStatusActions(goal.status).map((action) => (
            <Button
              key={action.to + action.label}
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => changeStatus(action)}
            >
              {action.label}
            </Button>
          ))}
          <GoalFormDialog
            goal={goal}
            areas={areas}
            trigger={
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            }
          />
          <DeleteGoalDialog
            goal={goal}
            milestoneCount={milestones.length}
            // This page is gone; go where the goal was listed.
            onDeleted={() => router.replace(backHref)}
          />
        </div>
        <p role="alert" className="text-sm text-danger empty:hidden">
          {error}
        </p>
      </div>

      <Section title="Why it matters">
        {goal.reason ? (
          <p className="break-words whitespace-pre-line">{goal.reason}</p>
        ) : (
          <p className="text-muted">
            Not written yet. Edit the goal to add it whenever you like.
          </p>
        )}
      </Section>

      <Section title="Milestones">
        <MilestoneList
          goalId={goal.id}
          goalStatus={goal.status}
          milestones={milestones}
          progress={progress}
        />
      </Section>

      <Section title="Tasks">
        <p className="text-muted">
          Tasks that move this goal forward will appear here.
        </p>
      </Section>

      <Section title="History">
        <GoalHistory history={history} />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const headingId = `goal-section-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function GoalHistory({ history }: { history: GoalHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-muted">No changes recorded yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-3 border-l border-border pl-4">
      {history.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{entry.summary}</span>
            <time
              dateTime={entry.occurredAt.toISOString()}
              className="text-sm text-muted"
            >
              {entry.occurredAtLabel}
            </time>
          </div>
          {entry.details.length > 0 && (
            <ul className="text-sm text-muted">
              {entry.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
