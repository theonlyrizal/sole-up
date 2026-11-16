"use client";

import Link from "next/link";

import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItem } from "@/components/ui/list";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { toast } from "@/components/ui/toast";
import { restoreHabit } from "@/server/modules/habits/actions";
import type { ArchivedHabitItem } from "@/server/modules/habits/queries";

import { HabitActions } from "./habit-actions";

export function ArchivedHabitsView({
  habits,
}: {
  habits: ArchivedHabitItem[];
}) {
  if (habits.length === 0) {
    return (
      <EmptyState
        art={{ icon: "archive" }}
        title="Nothing archived"
        description="Habits you archive are kept here, with their history, until you restore or delete them."
        action={
          <Link href="/track" className={buttonClass({ variant: "tonal" })}>
            Back to Track
          </Link>
        }
      />
    );
  }

  return (
    <ListGroup label="Archived habits">
      {habits.map((habit) => (
        <ListItem
          key={habit.id}
          wrapActions
          wrapSupporting
          leading={
            <ShapeAvatar
              id={habit.id}
              entityType="habit"
              label={habit.title}
              size={40}
            />
          }
          headline={<h2 className="text-title-medium">{habit.title}</h2>}
          supporting={`Archived on ${habit.archivedAtLabel}`}
          trailing={
            <div className="flex items-center">
              <RestoreHabitDialog habit={habit} />
              <HabitActions habit={habit} />
            </div>
          }
        />
      ))}
    </ListGroup>
  );
}

function RestoreHabitDialog({ habit }: { habit: ArchivedHabitItem }) {
  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="tonal"
          size="xs"
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
        if (result.ok)
          toast({ title: "Restored and active again.", variant: "success" });
        return result;
      }}
    />
  );
}
