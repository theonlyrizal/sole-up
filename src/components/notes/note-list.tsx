import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import type { NoteListItem } from "@/server/modules/notes/queries";

import { TagChips } from "./tag-chips";

/** A note's title as lists show it. */
export function noteTitle(title: string | null): string {
  return title ?? "Untitled";
}

/**
 * The user's notes (chunk 8.2): title (or "Untitled"), the first line of
 * the body, its tags (chunk 8.5; each opens the list filtered by it) and
 * the date. Active notes show when they were updated, archived ones when
 * they were archived.
 */
export function NoteList({
  notes,
  archived = false,
  filtered = false,
}: {
  notes: NoteListItem[];
  archived?: boolean;
  /** The list is filtered by a tag (chunk 8.5). */
  filtered?: boolean;
}) {
  if (notes.length === 0) {
    if (filtered) {
      return (
        <EmptyState
          title="No notes with this tag"
          description="None of your notes has this tag. Archived notes aren't listed here."
          action={
            <Link
              href="/notes"
              className={buttonClass({ variant: "secondary" })}
            >
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
          <Link href="/notes" className={buttonClass({ variant: "secondary" })}>
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
    <ul
      aria-label={archived ? "Archived notes" : "Notes"}
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
    >
      {notes.map((note) => (
        <li key={note.id} className="flex min-w-0 flex-col gap-1 p-4">
          <h2 className="font-medium break-words">
            <Link
              href={`/notes/${note.id}`}
              className={cx(
                "rounded-sm hover:underline",
                focusRing,
                note.title === null && "text-muted italic",
              )}
            >
              {noteTitle(note.title)}
            </Link>
          </h2>
          {note.preview && (
            <p className="truncate text-sm text-fg">{note.preview}</p>
          )}
          <TagChips tags={note.tags} label="Tags" linked={!archived} />
          <p className="text-sm text-muted">
            {archived && note.archivedLabel
              ? `Archived on ${note.archivedLabel}`
              : `Updated ${note.updatedLabel}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
