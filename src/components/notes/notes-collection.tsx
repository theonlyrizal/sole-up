import Link from "next/link";
import { z } from "zod";

import { cx, focusRing } from "@/components/ui/cx";
import type { TagSummary } from "@/lib/notes/tags";
import type { NoteListItem } from "@/server/modules/notes/queries";

import { NoteList } from "./note-list";
import { TagFilter } from "./tag-filter";

export function NotesCollection({
  notes,
  tags,
  requested,
  selectedId,
}: {
  notes: NoteListItem[];
  tags: TagSummary[];
  requested?: string | null;
  selectedId?: string;
}) {
  const tag =
    requested && z.uuid().safeParse(requested).success
      ? tags.find(({ id }) => id === requested.toLowerCase())
      : undefined;
  const visibleNotes = tag
    ? notes.filter((note) => note.tags.some(({ id }) => id === tag.id))
    : notes;
  return (
    <div className="grid min-w-0 gap-3">
      <TagFilter tags={tags} selected={tag?.id ?? null} />
      {tag ? (
        <p className="text-body-medium text-on-surface-variant">
          Showing notes tagged <strong>{tag.name}</strong>.{" "}
          <Link href="/notes" className={cx("rounded-xs underline", focusRing)}>
            Show all notes
          </Link>
        </p>
      ) : (
        requested && (
          <p role="status" className="text-body-medium text-on-surface-variant">
            That tag doesn&apos;t exist any more, so all your notes are shown.
          </p>
        )
      )}
      <NoteList
        notes={visibleNotes}
        filtered={Boolean(tag)}
        selectedId={selectedId}
      />
    </div>
  );
}
