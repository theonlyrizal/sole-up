"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import {
  goalDeleteConsequences,
  type GoalStatus,
  type GoalTaskCounts,
} from "@/lib/goals";
import { linkedNotesKept } from "@/lib/notes/note";
import { deleteGoal } from "@/server/modules/goals/actions";

type DeleteGoalDialogProps = {
  goal: { id: string; title: string; status: GoalStatus };
  /** Every milestone of the goal, any status. */
  milestoneCount: number;
  /** The goal's tasks, direct or under a milestone, by where they end up. */
  taskCounts: GoalTaskCounts;
  /** Notes linked to the goal, archived too: the delete only unlinks them. */
  noteLinkCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
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
  taskCounts,
  noteLinkCount,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onDeleted,
}: DeleteGoalDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      title={`Delete “${goal.title}”?`}
      description={
        <>
          This permanently deletes the goal and its history.{" "}
          <strong className="font-medium text-fg">
            {goalDeleteConsequences(milestoneCount, taskCounts)}
            {noteLinkCount > 0 && ` ${linkedNotesKept(noteLinkCount)}`}
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
