"use client";

import { useRef, useState, useTransition } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import {
  goalStatusActions,
  type Goal,
  type GoalStatusAction,
} from "@/lib/goals";
import type { LifeArea } from "@/lib/life-areas";
import { changeGoalStatus } from "@/server/modules/goals/actions";

import { DeleteGoalDialog } from "./delete-goal-dialog";
import { GoalFormDialog } from "./goal-form";

type DeleteOptions = Omit<
  React.ComponentProps<typeof DeleteGoalDialog>,
  "goal" | "open" | "onOpenChange" | "onCloseAutoFocus"
>;

export function GoalActions({
  goal,
  areas,
  deletion,
}: {
  goal: Goal;
  areas?: LifeArea[];
  deletion?: DeleteOptions;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog(next: "edit" | "delete") {
    openingDialog.current = true;
    setDialog(next);
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    trigger.current?.focus();
  }

  function changeStatus(action: GoalStatusAction) {
    startTransition(async () => {
      setError(null);
      try {
        const result = await changeGoalStatus({
          id: goal.id,
          status: action.to,
        });
        if (result.ok) toast({ title: action.done, variant: "success" });
        else setError(result.error.message);
      } catch {
        setError("Couldn't change the goal status. Try again.");
      }
    });
  }

  return (
    <>
      <Menu modal={false}>
        <MenuTrigger asChild>
          <IconButton
            ref={trigger}
            icon="more_vert"
            label={`Actions for ${goal.title}`}
            tooltip={false}
            aria-busy={pending || undefined}
          />
        </MenuTrigger>
        <MenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (openingDialog.current) event.preventDefault();
            openingDialog.current = false;
          }}
        >
          {areas && (
            <>
              <MenuItem icon="edit" onSelect={() => openDialog("edit")}>
                Edit
              </MenuItem>
              {goalStatusActions(goal.status).map((action) => (
                <MenuItem
                  key={action.to}
                  disabled={pending}
                  onSelect={() => changeStatus(action)}
                >
                  {action.label}
                </MenuItem>
              ))}
            </>
          )}
          {deletion && (
            <MenuItem
              icon="delete"
              destructive
              onSelect={() => openDialog("delete")}
            >
              Delete…
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
      {areas && (
        <GoalFormDialog
          goal={goal}
          areas={areas}
          open={dialog === "edit"}
          onOpenChange={(open) => setDialog(open ? "edit" : null)}
          onCloseAutoFocus={restoreFocus}
        />
      )}
      {deletion && (
        <DeleteGoalDialog
          {...deletion}
          goal={goal}
          open={dialog === "delete"}
          onOpenChange={(open) => setDialog(open ? "delete" : null)}
          onCloseAutoFocus={restoreFocus}
        />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-sm bg-error-container p-2 text-body-small wrap-anywhere text-on-error-container"
        >
          {error}
        </p>
      )}
    </>
  );
}
