import Link from "next/link";

import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItem } from "@/components/ui/list";
import type { NoteListItem } from "@/server/modules/notes/queries";

import { TagChips } from "./tag-chips";

/** A note's title as lists show it. */
export function noteTitle(title: string | null): string {
  return title ?? "Untitled";
}

export function NoteList({
  notes,
  archived = false,
  filtered = false,
  selectedId,
}: {
  notes: NoteListItem[];
  archived?: boolean;
  filtered?: boolean;
  selectedId?: string;
}) {
  if (notes.length === 0) {
    if (filtered) {
      return (
        <EmptyState
          title="No notes with this tag"
          description="None of your notes has this tag. Archived notes aren't listed here."
          action={
            <Link href="/notes" className={buttonClass({ variant: "tonal" })}>
              Show all notes
            </Link>
          }
        />
      );
    }
    return archived ? (
      <EmptyState
        title="Nothing archived"
        description="Notes you archive are kept here, read-only, until you restore or delete them."
        action={
          <Link href="/notes" className={buttonClass({ variant: "tonal" })}>
            Back to notes
          </Link>
        }
      />
    ) : (
      <EmptyState
        title="No notes yet"
        description="Keep what you're thinking, learning or planning here. Notes save as you type."
        action={
          <Link href="/notes/new" className={buttonClass()}>
            New note
          </Link>
        }
      />
    );
  }

  return (
    <ListGroup label={archived ? "Archived notes" : "Notes"}>
      {notes.map((note) => {
        const selected = selectedId === note.id;
        return (
          <ListItem
            key={note.id}
            selected={selected || undefined}
            href={`/notes/${note.id}`}
            className={selected ? "rounded-lg" : undefined}
            leading={
              <span className="grid size-10 place-items-center rounded-md bg-reflection-surface text-on-reflection-surface">
                <Icon name={selected ? "check" : "sticky_note_2"} size={20} />
              </span>
            }
            headline={
              <h2
                className={
                  note.title === null
                    ? "text-on-surface-variant italic"
                    : undefined
                }
              >
                {noteTitle(note.title)}
              </h2>
            }
            supporting={
              <>
                {note.preview && <p className="line-clamp-2">{note.preview}</p>}
                <p className="mt-1 text-label-medium">
                  {archived && note.archivedLabel
                    ? `Archived on ${note.archivedLabel}`
                    : `Updated ${note.updatedLabel}`}
                </p>
                <TagChips tags={note.tags} label="Tags" linked={!archived} />
              </>
            }
            wrapSupporting
          />
        );
      })}
    </ListGroup>
  );
}
