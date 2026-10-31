"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { NoteDocument } from "@/lib/notes/document";
import type { TagSummary } from "@/lib/notes/tags";
import { restoreNote } from "@/server/modules/notes/actions";

import { DeleteNoteDialog } from "./delete-note-dialog";
import { NoteContent } from "./note-content";
import { noteTitle } from "./note-list";
import { TagChips } from "./tag-chips";

/**
 * An archived note, read-only (ADR 0016): Restore brings back the editor,
 * Delete is confirmed.
 */
export function ArchivedNote({
  note,
}: {
  note: {
    id: string;
    title: string | null;
    body: NoteDocument;
    archivedLabel: string | null;
    tags: TagSummary[];
  };
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-muted p-4">
        <p>
          Archived{note.archivedLabel ? ` on ${note.archivedLabel}` : ""}.
          Restore it to change it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await restoreNote({ id: note.id });
                toast(
                  result.ok
                    ? { title: "Note restored", variant: "success" }
                    : { title: result.error.message, variant: "error" },
                );
              })
            }
          >
            {pending ? "Restoring…" : "Restore"}
          </Button>
          <DeleteNoteDialog noteId={note.id} returnTo="/notes/archived" />
        </div>
      </div>
      <h2
        className={
          note.title === null
            ? "text-xl font-semibold text-muted italic"
            : "text-xl font-semibold break-words"
        }
      >
        {noteTitle(note.title)}
      </h2>
      <TagChips tags={note.tags} label="Tags on this note" />
      <NoteContent document={note.body} />
    </div>
  );
}
