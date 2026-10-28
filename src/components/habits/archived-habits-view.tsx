"use client";

import Link from "next/link";

import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { restoreHabit } from "@/server/modules/habits/actions";
import type { ArchivedHabitItem } from "@/server/modules/habits/queries";

import { DeleteHabitDialog } from "./delete-habit-dialog";
import { HabitSummary } from "./track-view";

/** Archived habits, each with Restore (to active, ADR 0014) and Delete. */
export function ArchivedHabitsView({
  habits,
}: {
  habits: ArchivedHabitItem[];
}) {
  if (habits.length === 0) {
    return (
      <EmptyState
        title="Nothing archived"
        description="Habits you archive are kept here, with their history, until you restore or delete them."
        action={
          <Link href="/track" className={buttonClass({ variant: "secondary" })}>
            Back to Track
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
      {habits.map((habit) => (
        <li key={habit.id} className="flex flex-col gap-3 p-4">
          <HabitSummary habit={habit} headingLevel={2} />
          <p className="text-sm text-muted">
            Archived on {habit.archivedAtLabel}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <RestoreHabitDialog habit={habit} />
            <DeleteHabitDialog habit={habit} logCount={habit.logCount} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RestoreHabitDialog({ habit }: { habit: ArchivedHabitItem }) {
  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Restore: ${habit.title}`}
        >
          Restore
        </Button>
      }
      title={`Restore “${habit.title}”?`}
      description="It becomes active again from today, with its schedule and history. The days it was archived don't count."
      confirmLabel="Restore to active"
      destructive={false}
      onConfirm={async () => {
        const result = await restoreHabit({ id: habit.id });
        if (result.ok) {
          toast({ title: "Restored and active again.", variant: "success" });
        }
        return result;
      }}
    />
  );
}
