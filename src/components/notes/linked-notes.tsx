"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button, buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { NOTE_LINK_QUERY_MAX, type NoteLinkTargetType } from "@/lib/notes/note";
import {
  findNotesToLink,
  getLinkedNotes,
  linkNote,
  unlinkNote,
} from "@/server/modules/notes/actions";
import type {
  LinkedNoteItem,
  LinkedNotes,
} from "@/server/modules/notes/queries";

import { noteTitle } from "./note-list";
import { usePickerSearch } from "./use-picker-search";

/** The goal or task whose notes are listed. */
export type NoteLinkOwner = {
  targetType: NoteLinkTargetType;
  targetId: string;
  title: string;
};

/**
 * A goal's or task's linked notes (chunk 8.3), not archived ones: each
 * opens the note, with Unlink. Below them, "Link a note" and "New note",
 * which opens the editor with the note linked on its first save.
 * `onChanged` runs after a link or unlink, to read the list again.
 */
export function LinkedNotesList({
  owner,
  notes,
  onChanged,
}: {
  owner: NoteLinkOwner;
  notes: LinkedNoteItem[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function unlink(note: LinkedNoteItem) {
    startTransition(async () => {
      const result = await unlinkNote({
        id: note.id,
        targetType: owner.targetType,
        targetId: owner.targetId,
      });
      if (!result.ok) {
        toast({ title: result.error.message, variant: "error" });
        return;
      }
      toast({ title: "Note unlinked", variant: "success" });
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 ? (
        <p className="text-sm text-muted">No notes linked yet.</p>
      ) : (
        <ul
          aria-label="Linked notes"
          className="flex flex-col divide-y divide-border rounded-lg border border-border"
        >
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <Link
                  href={`/notes/${note.id}`}
                  className={cx(
                    "self-start rounded-sm font-medium break-words hover:underline",
                    focusRing,
                  )}
                >
                  {noteTitle(note.title)}
                </Link>
                <span className="text-sm text-muted">
                  Updated{" "}
                  <time dateTime={note.updatedAt.toISOString()}>
                    {note.updatedLabel}
                  </time>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                aria-label={`Unlink ${noteTitle(note.title)}`}
                onClick={() => unlink(note)}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <LinkNoteDialog owner={owner} onLinked={onChanged} />
        <Link
          href={`/notes/new?${owner.targetType}=${owner.targetId}`}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          New note
        </Link>
      </div>
    </div>
  );
}

/** "Link a note": search the user's notes and link one or more. */
function LinkNoteDialog({
  owner,
  onLinked,
}: {
  owner: NoteLinkOwner;
  onLinked: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Link a note
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Link a note"
        description={`Notes that aren't archived or linked to “${owner.title}” yet.`}
        className="max-w-lg"
      >
        <NotePicker owner={owner} onLinked={onLinked} />
      </DialogContent>
    </Dialog>
  );
}

function NotePicker({
  owner,
  onLinked,
}: {
  owner: NoteLinkOwner;
  onLinked: () => void;
}) {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  // Linked from this picker; they stay listed, marked, until it closes.
  const [linked, setLinked] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const search = usePickerSearch(query, (text) =>
    findNotesToLink({
      targetType: owner.targetType,
      targetId: owner.targetId,
      query: text,
    }),
  );

  function link(noteId: string) {
    startTransition(async () => {
      const result = await linkNote({
        id: noteId,
        targetType: owner.targetType,
        targetId: owner.targetId,
      });
      if (!result.ok) {
        toast({ title: result.error.message, variant: "error" });
        return;
      }
      // "Linked" replaces the button, so focus goes back to the search. No
      // toast: the row says it, and a toast would take the next Escape.
      setLinked((current) => new Set(current).add(noteId));
      searchRef.current?.focus();
      onLinked();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={searchId} className="text-sm font-medium">
          Search notes
        </label>
        <Input
          id={searchId}
          ref={searchRef}
          type="search"
          value={query}
          maxLength={NOTE_LINK_QUERY_MAX}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {search.kind === "loading" ? (
        <p className="text-sm text-muted">Loading notes…</p>
      ) : search.kind === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {search.message}
        </p>
      ) : search.data.length === 0 ? (
        <p className="text-sm text-muted">
          {query.trim()
            ? "No notes match."
            : "No notes to link yet. Use New note to write one."}
        </p>
      ) : (
        <ul
          aria-label="Notes to link"
          className="flex flex-col divide-y divide-border rounded-lg border border-border"
        >
          {search.data.map((note) => (
            <li
              key={note.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium break-words">
                  {noteTitle(note.title)}
                </span>
                {note.preview && (
                  <span className="truncate text-sm text-muted">
                    {note.preview}
                  </span>
                )}
              </div>
              {linked.has(note.id) ? (
                <span className="shrink-0 text-sm text-muted">Linked</span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={pending}
                  aria-label={`Link ${noteTitle(note.title)}`}
                  onClick={() => link(note.id)}
                >
                  Link
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A task dialog's linked notes, read when it opens and again after a
 * change. `data` is null while loading.
 */
export function useLinkedNotes(owner: {
  targetType: NoteLinkTargetType;
  targetId: string;
}) {
  const { targetType, targetId } = owner;
  const [data, setData] = useState<LinkedNotes | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped to read the list again.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getLinkedNotes({ targetType, targetId }).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          setData(result.data);
          setFailed(false);
        } else {
          setFailed(true);
        }
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [targetType, targetId, version]);

  const reload = useCallback(() => setVersion((count) => count + 1), []);
  return { data, failed, reload };
}
