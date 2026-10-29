"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { deleteNote } from "@/server/modules/notes/actions";

/**
 * Confirms a note's hard delete (ADR 0006), archived or not, then leaves
 * for `returnTo`. `beforeDelete` stops the editor's autosave; it resumes
 * with `afterFailure` if the delete doesn't go through.
 */
export function DeleteNoteDialog({
  noteId,
  returnTo,
  beforeDelete,
  afterFailure,
}: {
  noteId: string;
  returnTo: string;
  beforeDelete?: () => void;
  afterFailure?: () => void;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" size="sm">
          Delete note
        </Button>
      }
      title="Delete this note?"
      description="This permanently deletes the note. Any goals and tasks it's linked to stay as they are. It can't be undone."
      confirmLabel="Delete note"
      onConfirm={async () => {
        beforeDelete?.();
        const result = await deleteNote({ id: noteId });
        if (!result.ok) {
          afterFailure?.();
          return result;
        }
        toast({ title: "Note deleted", variant: "success" });
        router.replace(returnTo);
      }}
    />
  );
}
