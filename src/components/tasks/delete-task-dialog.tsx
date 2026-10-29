"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { linkedNotesKept } from "@/lib/notes/note";
import type { Task } from "@/lib/tasks";
import { deleteTask } from "@/server/modules/tasks/actions";

/** Said while the dialog hasn't read the task's links. */
const ANY_LINKED_NOTES_KEPT = "Any linked notes will be kept, only unlinked.";

/**
 * Confirms a task's hard delete (ADR 0006, chunk 8.3) and says what goes
 * with it. Open and completed tasks are pointed at cancelling, which keeps
 * the record (ADR 0011).
 */
export function DeleteTaskDialog({
  task,
  noteLinkCount,
  onDeleted,
}: {
  task: Pick<Task, "id" | "title" | "status">;
  /** Notes linked to the task, archived too; null while not known. */
  noteLinkCount: number | null;
  /** Runs after the task is gone: close the dialog. */
  onDeleted: () => void;
}) {
  const notesKept =
    noteLinkCount === null
      ? ANY_LINKED_NOTES_KEPT
      : linkedNotesKept(noteLinkCount);
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" size="sm">
          Delete task
        </Button>
      }
      title={`Delete “${task.title}”?`}
      description={
        <>
          This permanently deletes the task and its history, with its time
          blocks and reminders.{" "}
          {notesKept && (
            <>
              <strong className="font-medium text-fg">{notesKept}</strong>{" "}
            </>
          )}
          It can&apos;t be undone.
          {task.status !== "cancelled" &&
            " To keep a record that you chose not to do it, cancel it instead."}
        </>
      }
      confirmLabel="Delete task"
      onConfirm={async () => {
        const result = await deleteTask({ id: task.id });
        if (result.ok) {
          toast({ title: "Task deleted", variant: "success" });
          onDeleted();
        }
        return result;
      }}
    />
  );
}
