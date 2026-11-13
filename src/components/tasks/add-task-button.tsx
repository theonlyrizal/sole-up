"use client";

import { useOpenQuickAdd } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";

export function AddTaskButton() {
  const open = useOpenQuickAdd();
  return (
    <Button icon="add" onClick={(event) => open(event.currentTarget)}>
      Add task
    </Button>
  );
}
