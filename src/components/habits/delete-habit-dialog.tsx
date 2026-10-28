"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import type { HabitStatus } from "@/lib/habits/habit";
import { habitDeleteConsequences } from "@/lib/habits/habit-form";
import { deleteHabit } from "@/server/modules/habits/actions";

type DeleteHabitDialogProps = {
  habit: { id: string; title: string; status: HabitStatus };
  /** Every log of the habit, completed or skipped. */
  logCount: number;
};

/**
 * Confirms a habit's hard delete (ADR 0006) and names how many logs go
 * with it. Live habits are pointed at archiving, the reversible option.
 */
export function DeleteHabitDialog({ habit, logCount }: DeleteHabitDialogProps) {
  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="danger"
          size="sm"
          aria-label={`Delete: ${habit.title}`}
        >
          Delete
        </Button>
      }
      title={`Delete “${habit.title}”?`}
      description={
        <>
          This permanently deletes the habit, its schedule and its history.{" "}
          <strong className="font-medium text-fg">
            {habitDeleteConsequences(logCount)}
          </strong>{" "}
          It can&apos;t be undone.
          {habit.status !== "archived" &&
            " To keep it out of the way instead, archive it."}
        </>
      }
      confirmLabel="Delete habit"
      onConfirm={async () => {
        const result = await deleteHabit({ id: habit.id });
        if (result.ok) toast({ title: "Habit deleted", variant: "success" });
        return result;
      }}
    />
  );
}
