"use client";

import { useTransition } from "react";

import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { cx } from "@/components/ui/cx";
import { toast } from "@/components/ui/toast";
import type { NoteDocument } from "@/lib/notes/document";
import type { TagSummary } from "@/lib/notes/tags";
import { restoreNote } from "@/server/modules/notes/actions";

import { NoteContent } from "./note-content";
import { NoteHeader } from "./note-header";
import { noteTitle } from "./note-list";
import { NoteOptions } from "./note-options";
import { TagChips } from "./tag-chips";

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
    <PageContainer width="reading" className="!pt-0 medium:!pt-5">
      <NoteHeader archived>
        <NoteOptions noteId={note.id} archived />
      </NoteHeader>
      <div className="grid min-w-0 gap-4">
        <InlineBanner
          tone="info"
          action={
            <Button
              disabled={pending}
              aria-busy={pending || undefined}
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
          }
        >
          Archived{note.archivedLabel ? ` on ${note.archivedLabel}` : ""}.
          Restore it to edit.
        </InlineBanner>
        <div className="grid min-w-0 gap-4 rounded-lg bg-resting-surface p-5 text-on-resting-surface">
          <h2
            className={cx(
              "text-headline-medium wrap-anywhere",
              !note.title && "text-on-surface-variant italic",
            )}
          >
            {noteTitle(note.title)}
          </h2>
          <TagChips tags={note.tags} label="Tags on this note" />
          <NoteContent document={note.body} />
        </div>
      </div>
    </PageContainer>
  );
}
