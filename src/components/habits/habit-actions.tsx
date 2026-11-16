"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import {
  archiveHabit,
  pauseHabit,
  resumeHabit,
} from "@/server/modules/habits/actions";
import type { HabitListItem } from "@/server/modules/habits/queries";

import { DeleteHabitDialog } from "./delete-habit-dialog";
import { HabitFormDialog, type HabitFormContext } from "./habit-form";

const statusActions = {
  Pause: {
    run: pauseHabit,
    done: "Paused. Paused days don't count until you resume.",
  },
  Resume: { run: resumeHabit, done: "Resumed" },
  Archive: { run: archiveHabit, done: "Archived. It's kept under Archived." },
};

export function HabitActions({
  habit,
  context,
}: {
  habit: HabitListItem;
  context?: HabitFormContext;
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

  function changeStatus(label: keyof typeof statusActions) {
    const action = statusActions[label];
    setError(null);
    startTransition(async () => {
      try {
        const result = await action.run({ id: habit.id });
        if (result.ok) toast({ title: action.done, variant: "success" });
        else setError(result.error.message);
      } catch {
        setError("Couldn't change the habit status. Try again.");
      }
    });
  }

  const paused = habit.status === "paused";
  const statusLabel = paused ? "Resume" : "Pause";

  return (
    <>
      <div className="col-start-3 row-start-1 flex items-center justify-end">
        <Menu modal={false}>
          <MenuTrigger asChild>
            <IconButton
              ref={trigger}
              icon="more_vert"
              label={`Actions for ${habit.title}`}
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
            {context && (
              <>
                <MenuItem
                  icon="edit"
                  disabled={pending}
                  onSelect={() => openDialog("edit")}
                >
                  Edit
                </MenuItem>
                <MenuItem
                  disabled={pending}
                  onSelect={() => changeStatus(statusLabel)}
                >
                  {statusLabel}
                </MenuItem>
                <MenuItem
                  icon="archive"
                  disabled={pending}
                  onSelect={() => changeStatus("Archive")}
                >
                  Archive
                </MenuItem>
              </>
            )}
            <MenuItem
              icon="delete"
              destructive
              disabled={pending}
              onSelect={() => openDialog("delete")}
            >
              Delete…
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      {context && (
        <HabitFormDialog
          habit={habit}
          context={context}
          open={dialog === "edit"}
          onOpenChange={(open) => setDialog(open ? "edit" : null)}
          onCloseAutoFocus={restoreFocus}
        />
      )}
      <DeleteHabitDialog
        habit={habit}
        logCount={habit.logCount}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        onCloseAutoFocus={restoreFocus}
      />
      {paused && context && (
        <div className="col-span-full">
          <Button
            variant="tonal"
            pending={pending}
            onClick={() => changeStatus("Resume")}
          >
            Resume
          </Button>
        </div>
      )}
      {error && (
        <div className="col-span-full">
          <InlineBanner tone="error">{error}</InlineBanner>
        </div>
      )}
    </>
  );
}
