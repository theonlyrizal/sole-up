"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { PickerPreferences } from "@/components/calendar/picker-preferences";
import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { IconLink } from "@/components/ui/icon-button";
import { formatLocalDate, localDateOf } from "@/lib/dates";
import type { TagSummary } from "@/lib/notes/tags";
import type { NoteListItem } from "@/server/modules/notes/queries";
import { NotesCollection } from "./notes-collection";
type SavedNoteSnapshot = Pick<NoteListItem, "title" | "preview" | "updatedAt">;

type PanePatch = { saved?: SavedNoteSnapshot; tags?: TagSummary[] };
type SavedNotes = ReadonlyMap<string, PanePatch | null>;
const NotesPaneContext = createContext<SavedNotes>(new Map());
const UpdateNotesPaneContext = createContext<
  (id: string, patch: PanePatch | null) => void
>(() => {});

export function useUpdateNotesPane() {
  return useContext(UpdateNotesPaneContext);
}

export function NotesLayout({
  children,
  pane,
  previewLimit,
}: {
  children: ReactNode;
  pane: ReactNode;
  previewLimit: number;
}) {
  const [saved, setSaved] = useState<SavedNotes>(() => new Map());
  const [source, setSource] = useState(pane);
  if (source !== pane) {
    // A router refresh has supplied a fresh list and tag catalog.
    setSource(pane);
    setSaved(new Map());
  }

  const update = useCallback(
    (id: string, patch: PanePatch | null) => {
      const note = patch?.saved;
      const changes = note
        ? {
            ...patch,
            saved: {
              ...note,
              preview: Array.from(note.preview).slice(0, previewLimit).join(""),
            },
          }
        : patch;
      setSaved((current) => {
        const next = new Map(current);
        next.set(id, changes ? { ...current.get(id), ...changes } : null);
        return next;
      });
    },
    [previewLimit],
  );

  return (
    <UpdateNotesPaneContext.Provider value={update}>
      <div className="notes-layout">
        <aside className="notes-pane" aria-label="Notes list">
          <NotesPaneContext.Provider value={saved}>
            {pane}
          </NotesPaneContext.Provider>
        </aside>
        {children}
      </div>
    </UpdateNotesPaneContext.Provider>
  );
}

export function NotesPane({
  notes,
  tags,
  archiveCount,
}: {
  notes: NoteListItem[];
  tags: TagSummary[];
  archiveCount: number;
}) {
  const pathname = usePathname();
  const selectedId = pathname.split("/")[2];
  const tagQuery = useSearchParams().getAll("tag");
  const requested =
    pathname === "/notes" && tagQuery.length === 1 ? tagQuery[0] : null;
  const saved = useContext(NotesPaneContext);
  const { locale, timeZone } = useContext(PickerPreferences);
  // The first save replaces the URL without remounting the draft. Reflect
  // confirmed writes in the persistent pane while its server data is older.
  const rows = new Map(notes.map((note) => [note.id, note]));
  const catalog = new Map(tags.map((tag) => [tag.id, tag]));
  for (const [id, patch] of saved) {
    if (!patch) {
      rows.delete(id);
      continue;
    }
    const note = patch.saved;
    let row = rows.get(id);
    if (note && (!row || note.updatedAt > row.updatedAt)) {
      row = {
        id,
        title: note.title,
        preview: note.preview,
        updatedAt: note.updatedAt,
        updatedLabel: formatLocalDate(
          localDateOf(note.updatedAt, timeZone),
          locale,
        ),
        archivedLabel: null,
        tags: row?.tags ?? [],
      };
    }
    if (row) rows.set(id, { ...row, tags: patch.tags ?? row.tags });
    patch.tags?.forEach((tag) => catalog.set(tag.id, tag));
  }
  const ordered = [...rows.values()].sort(
    (left, right) =>
      +right.updatedAt - +left.updatedAt || right.id.localeCompare(left.id),
  );

  return (
    <div className="grid min-w-0 gap-4 px-4 py-5">
      <div className="flex flex-wrap items-center gap-2">
        {pathname === "/notes" ? (
          <h1 className="grow text-title-large">Notes</h1>
        ) : (
          <div className="grow text-title-large">Notes</div>
        )}
        <IconLink href="/notes/search" icon="search" label="Search notes" />
        <Link
          href="/notes/new"
          className={buttonClass({ size: "xs", icon: "add" })}
        >
          <Icon name="add" size={18} />
          New note
        </Link>
      </div>
      <NotesCollection
        notes={ordered}
        tags={[...catalog.values()].sort((left, right) =>
          left.name.localeCompare(right.name, locale),
        )}
        requested={requested}
        selectedId={selectedId}
      />
      <div className="flex flex-wrap gap-1">
        <Link
          href="/notes/archived"
          className={buttonClass({ variant: "text", size: "xs" })}
        >
          Archived ({archiveCount})
        </Link>
        <Link
          href="/notes/tags"
          className={buttonClass({ variant: "text", size: "xs" })}
        >
          Manage tags
        </Link>
      </div>
    </div>
  );
}
