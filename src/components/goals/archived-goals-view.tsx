"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ColorSwatch } from "@/components/life-areas/life-area-colors";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { changeGoalStatus } from "@/server/modules/goals/actions";
import type { ArchivedGoalItem } from "@/server/modules/goals/queries";

import { DeleteGoalDialog } from "./delete-goal-dialog";

/** Archived goals, each with Restore (to Active, ADR 0010) and Delete. */
export function ArchivedGoalsView({ goals }: { goals: ArchivedGoalItem[] }) {
  const router = useRouter();

  if (goals.length === 0) {
    return (
      <EmptyState
        title="Nothing archived"
        description="Goals you archive are kept here, out of the way, until you restore or delete them."
        action={
          <Link href="/goals" className={buttonClass({ variant: "secondary" })}>
            Back to goals
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
      {goals.map((goal) => (
        <li key={goal.id} className="flex flex-col gap-3 p-4">
          <ArchivedGoalSummary goal={goal} />
          <div className="flex flex-wrap items-center gap-1">
            <RestoreGoalDialog goal={goal} />
            <DeleteGoalDialog
              goal={goal}
              milestoneCount={goal.milestoneCount}
              triggerLabel={`Delete: ${goal.title}`}
              onDeleted={() => router.refresh()}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ArchivedGoalSummary({ goal }: { goal: ArchivedGoalItem }) {
  const details = [
    goal.completedAtLabel && `Completed on ${goal.completedAtLabel}`,
    `Archived on ${goal.archivedAtLabel}`,
  ].filter(Boolean);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 className="font-medium break-words">
        <Link
          href={`/goals/${goal.id}`}
          className={cx("rounded-sm hover:underline", focusRing)}
        >
          {goal.title}
        </Link>
      </h2>
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        {goal.area && <ColorSwatch color={goal.area.color} />}
        {goal.area?.name ?? "No area"}
        <span aria-hidden="true">·</span>
        {details.join(" · ")}
      </p>
    </div>
  );
}

function RestoreGoalDialog({ goal }: { goal: ArchivedGoalItem }) {
  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Restore: ${goal.title}`}
        >
          Restore
        </Button>
      }
      title={`Restore “${goal.title}”?`}
      description={
        goal.completedAtLabel
          ? "It moves back to Active, with its milestones and history. Its completed date is cleared, so mark it complete again if it's still done."
          : "It moves back to Active, with its milestones and history."
      }
      confirmLabel="Restore to Active"
      destructive={false}
      onConfirm={async () => {
        const result = await changeGoalStatus({
          id: goal.id,
          status: "active",
        });
        if (result.ok) {
          toast({ title: "Restored and back in Active.", variant: "success" });
        }
        return result;
      }}
    />
  );
}
