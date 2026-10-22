"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { goalDeleteConsequences, type GoalStatus } from "@/lib/goals";
import { deleteGoal } from "@/server/modules/goals/actions";

type DeleteGoalDialogProps = {
  goal: { id: string; title: string; status: GoalStatus };
  /** Every milestone of the goal, any status. */
  milestoneCount: number;
  /** Accessible name for the trigger, when the page lists several goals. */
  triggerLabel?: string;
  /** Runs after the goal is gone: refresh the list or leave its page. */
  onDeleted: () => void;
};

/**
 * Confirms a goal's hard delete (ADR 0006) and says exactly what goes with
 * it. Live goals are pointed at archiving, the reversible option.
 */
export function DeleteGoalDialog({
  goal,
  milestoneCount,
  triggerLabel,
  onDeleted,
}: DeleteGoalDialogProps) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" size="sm" aria-label={triggerLabel}>
          Delete
        </Button>
      }
      title={`Delete “${goal.title}”?`}
      description={
        <>
          This permanently deletes the goal and its history.{" "}
          <strong className="font-medium text-fg">
            {goalDeleteConsequences(milestoneCount)}
          </strong>{" "}
          It can&apos;t be undone.
          {goal.status !== "archived" &&
            " To keep it out of the way instead, archive it."}
        </>
      }
      confirmLabel="Delete goal"
      onConfirm={async () => {
        const result = await deleteGoal({ id: goal.id });
        if (result.ok) {
          toast({ title: "Goal deleted", variant: "success" });
          onDeleted();
        }
        return result;
      }}
    />
  );
}
