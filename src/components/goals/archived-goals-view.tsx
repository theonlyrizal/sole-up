"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AreaChip } from "@/components/data/area-chip";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItem } from "@/components/ui/list";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { toast } from "@/components/ui/toast";
import { changeGoalStatus } from "@/server/modules/goals/actions";
import type { ArchivedGoalItem } from "@/server/modules/goals/queries";

import { GoalActions } from "./goal-actions";

export function ArchivedGoalsView({ goals }: { goals: ArchivedGoalItem[] }) {
  const router = useRouter();
  if (goals.length === 0) {
    return (
      <EmptyState
        art={{ icon: "archive" }}
        title="Nothing archived"
        description="Goals you archive are kept here, out of the way, until you restore or delete them."
        action={
          <Link href="/goals" className={buttonClass({ variant: "tonal" })}>
            Back to goals
          </Link>
        }
      />
    );
  }

  return (
    <ListGroup label="Archived goals">
      {goals.map((goal) => {
        const tasks =
          goal.taskCounts.toInbox +
          goal.taskCounts.planned +
          goal.taskCounts.closed;
        const counts = [
          `${goal.milestoneCount} ${goal.milestoneCount === 1 ? "milestone" : "milestones"}`,
          `${tasks} ${tasks === 1 ? "task" : "tasks"}`,
          `${goal.noteLinkCount} ${goal.noteLinkCount === 1 ? "linked note" : "linked notes"}`,
        ];
        return (
          <ListItem
            key={goal.id}
            className="max-medium:gap-x-2 max-medium:py-2"
            wrapActions
            lines={3}
            leading={
              <ShapeAvatar
                id={goal.id}
                entityType="goal"
                label={goal.title}
                area={goal.area?.color}
                size={40}
              />
            }
            headline={<h2 className="text-title-medium">{goal.title}</h2>}
            href={`/goals/${goal.id}`}
            supporting={
              <div className="grid gap-1">
                {goal.area && (
                  <AreaChip
                    name={goal.area.name}
                    color={goal.area.color}
                    archived={goal.area.status === "archived"}
                  />
                )}
                <span>
                  {[
                    goal.completedAtLabel &&
                      `Completed on ${goal.completedAtLabel}`,
                    `Archived on ${goal.archivedAtLabel}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="text-body-small">{counts.join(" · ")}</span>
              </div>
            }
            wrapSupporting
            trailing={
              <div className="flex flex-wrap items-center justify-end">
                <RestoreGoalDialog goal={goal} />
                <GoalActions
                  goal={goal}
                  deletion={{
                    milestoneCount: goal.milestoneCount,
                    taskCounts: goal.taskCounts,
                    noteLinkCount: goal.noteLinkCount,
                    onDeleted: () => router.refresh(),
                  }}
                />
              </div>
            }
          />
        );
      })}
    </ListGroup>
  );
}

function RestoreGoalDialog({ goal }: { goal: ArchivedGoalItem }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="tonal" size="xs" aria-label={`Restore: ${goal.title}`}>
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
