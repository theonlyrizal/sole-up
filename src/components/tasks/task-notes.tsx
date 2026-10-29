"use client";

import { useId } from "react";

import { LinkedNotesList } from "@/components/notes/linked-notes";
import type { Task } from "@/lib/tasks";
import type { LinkedNotes } from "@/server/modules/notes/queries";

/**
 * The task dialog's "Linked notes" section (chunk 8.3). Named apart from
 * the task's own Notes field above it. The dialog reads the list, since
 * its delete confirmation counts the links too.
 */
export function TaskNotes({
  task,
  data,
  failed,
  onChanged,
}: {
  task: Pick<Task, "id" | "title">;
  data: LinkedNotes | null;
  failed: boolean;
  onChanged: () => void;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 border-t border-border pt-4"
    >
      <h3 id={headingId} className="font-semibold">
        Linked notes
      </h3>
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t load the linked notes. Try reopening the task.
        </p>
      ) : !data ? (
        <p className="text-sm text-muted">Loading linked notes…</p>
      ) : (
        <LinkedNotesList
          owner={{ targetType: "task", targetId: task.id, title: task.title }}
          notes={data.notes}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}
