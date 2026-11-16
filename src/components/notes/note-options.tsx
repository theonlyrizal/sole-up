"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { deleteNote } from "@/server/modules/notes/actions";

import { useUpdateNotesPane } from "./notes-layout";

/** Archive is reversible. Hard delete always requires confirmation. */
export function NoteOptions({
  noteId,
  archived = false,
  onArchive,
  beforeDelete,
  afterFailure,
}: {
  noteId: string;
  archived?: boolean;
  onArchive?: () => Promise<void>;
  beforeDelete?: () => void;
  afterFailure?: () => void;
}) {
  const router = useRouter();
  const updatePane = useUpdateNotesPane();
  const [confirming, setConfirming] = useState(false);
  const [archiving, startArchive] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Menu modal={false}>
        <MenuTrigger asChild>
          <IconButton
            ref={trigger}
            icon="more_vert"
            label="Note options"
            tooltip={false}
            aria-busy={archiving || undefined}
          />
        </MenuTrigger>
        <MenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (confirming) event.preventDefault();
          }}
        >
          {onArchive && (
            <MenuItem
              icon="archive"
              disabled={archiving}
              onSelect={() => startArchive(onArchive)}
            >
              {archiving ? "Archiving…" : "Archive"}
            </MenuItem>
          )}
          <MenuItem
            icon="delete"
            destructive
            disabled={archiving}
            onSelect={() => setConfirming(true)}
          >
            Delete…
          </MenuItem>
        </MenuContent>
      </Menu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
        title="Delete this note?"
        description="This permanently deletes the note. Any goals and tasks it's linked to stay as they are. It can't be undone."
        confirmLabel="Delete note"
        onConfirm={async () => {
          beforeDelete?.();
          try {
            const result = await deleteNote({ id: noteId });
            if (!result.ok) {
              afterFailure?.();
              return result;
            }
          } catch (error) {
            afterFailure?.();
            throw error;
          }
          updatePane(noteId, null);
          toast({ title: "Note deleted", variant: "success" });
          router.replace(archived ? "/notes/archived" : "/notes");
          router.refresh();
        }}
      />
    </>
  );
}
