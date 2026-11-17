"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import type { ActionError } from "@/lib/result";
import {
  normalizeTagName,
  NOTE_TAGS_FULL,
  NOTE_TAGS_MAX,
  TAG_NAME_EMPTY,
  TAG_NAME_MAX,
  TAG_NAME_TOO_LONG,
  tagNameKey,
  type TagSummary,
} from "@/lib/notes/tags";
import {
  getNoteTags,
  listTags,
  setNoteTags,
} from "@/server/modules/tags/actions";
import { useUpdateNotesPane } from "./notes-layout";

/** The first message an action error carries, field messages first. */
function errorMessage(error: ActionError): string {
  if (error.code === "VALIDATION") {
    const field = Object.values(error.fieldErrors).flat()[0];
    if (field) return field;
  }
  return error.message;
}

/**
 * The editor's "Tags" section (chunk 8.5): the note's tags as chips with
 * Remove, and a field to add one. Typing suggests the user's tags; a name
 * matching one ignoring case uses it, any other creates a tag. A note that
 * isn't saved yet can't be tagged. Tags never move the note's updated date
 * or disturb its autosave.
 */
export function NoteTags({ noteId }: { noteId: string | null }) {
  const id = useId();
  const updatePane = useUpdateNotesPane();
  const [tags, setTags] = useState<TagSummary[] | null>(null);
  const [allTags, setAllTags] = useState<TagSummary[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // How many tag saves are running; tagsRef is the latest saved list.
  const [saving, setSaving] = useState(0);
  const tagsRef = useRef<TagSummary[] | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // Bumped to read the user's tags again after one is created.
  const [allVersion, setAllVersion] = useState(0);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    getNoteTags({ id: noteId }).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          tagsRef.current = result.data;
          setTags(result.data);
        } else {
          setLoadFailed(true);
        }
      },
      () => {
        if (!cancelled) setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    listTags({}).then(
      (result) => {
        if (!cancelled && result.ok) setAllTags(result.data);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [noteId, allVersion]);

  /**
   * Queues one change to the note's tags. Changes run one at a time, each
   * from the tags the previous one saved, so adding quickly never drops a
   * tag. `change` returns the new names, or null to change nothing.
   */
  function enqueue(
    change: (current: TagSummary[]) => string[] | null,
    after?: (saved: TagSummary[]) => void,
    onFailure?: () => void,
  ) {
    if (!noteId) return;
    queue.current = queue.current.then(async () => {
      const current = tagsRef.current;
      if (!current) return;
      const names = change(current);
      if (!names) return;
      setSaving((count) => count + 1);
      try {
        const result = await setNoteTags({ id: noteId, names });
        if (!result.ok) {
          setError(errorMessage(result.error));
          onFailure?.();
          return;
        }
        setError(null);
        tagsRef.current = result.data;
        setTags(result.data);
        updatePane(noteId, { tags: result.data });
        after?.(result.data);
      } catch {
        setError(
          "Couldn't reach SoleUp. Check your connection, then try again.",
        );
        onFailure?.();
      } finally {
        setSaving((count) => count - 1);
      }
    });
  }

  function add() {
    const normalized = normalizeTagName(name);
    if (!normalized) return setError(TAG_NAME_EMPTY);
    if (normalized.length > TAG_NAME_MAX) return setError(TAG_NAME_TOO_LONG);
    const key = tagNameKey(normalized);
    const known = allTags.some((tag) => tagNameKey(tag.name) === key);
    // The field is ready for the next tag at once; a failure puts it back.
    setName("");
    setError(null);
    enqueue(
      (current) => {
        if (current.some((tag) => tagNameKey(tag.name) === key)) return null;
        if (current.length >= NOTE_TAGS_MAX) {
          setError(NOTE_TAGS_FULL);
          setName((typed) => typed || normalized);
          return null;
        }
        return [...current.map((tag) => tag.name), normalized];
      },
      () => {
        if (!known) setAllVersion((count) => count + 1);
      },
      () => setName((typed) => typed || normalized),
    );
  }

  function remove(removed: TagSummary) {
    enqueue(
      (current) =>
        current.filter((tag) => tag.id !== removed.id).map((tag) => tag.name),
      () => document.getElementById(`${id}-name`)?.focus(),
    );
  }

  const onNote = new Set((tags ?? []).map((tag) => tag.id));
  const suggestions = allTags.filter((tag) => !onNote.has(tag.id));

  return (
    <section
      aria-labelledby={`${id}-heading`}
      aria-busy={saving > 0 || undefined}
      className="flex flex-col gap-2 border-t border-outline-variant pt-3"
    >
      <h2 id={`${id}-heading`} className="text-title-small">
        Tags
      </h2>
      {!noteId ? (
        <p className="text-body-medium text-on-surface-variant">
          Give the note a title or some text, then tag it.
        </p>
      ) : loadFailed ? (
        <p role="alert" className="text-body-medium text-error">
          Couldn&apos;t load the tags. Try reloading the note.
        </p>
      ) : !tags ? (
        <p className="text-body-medium text-on-surface-variant">
          Loading tags…
        </p>
      ) : (
        <>
          {tags.length === 0 ? (
            <p className="text-body-medium text-on-surface-variant">
              No tags yet.
            </p>
          ) : (
            <ul
              aria-label="Tags on this note"
              className="flex flex-wrap gap-1.5"
            >
              {tags.map((tag) => (
                <li key={tag.id} className="max-w-full">
                  <Chip
                    type="input"
                    label={tag.name}
                    removeLabel={`Remove tag ${tag.name}`}
                    onRemove={() => remove(tag)}
                  />
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <label htmlFor={`${id}-name`} className="text-label-large">
              Add a tag
            </label>
            <div className="flex gap-2">
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                list={`${id}-suggestions`}
                maxLength={TAG_NAME_MAX}
                autoComplete="off"
                enterKeyHint="done"
                aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
                aria-invalid={error ? true : undefined}
                className="min-w-0 flex-1"
              />
              {/* Never disabled: a disabled default button blocks Enter. */}
              <Button type="submit" variant="outlined">
                Add
              </Button>
            </div>
            <datalist id={`${id}-suggestions`}>
              {suggestions.map((tag) => (
                <option key={tag.id} value={tag.name} />
              ))}
            </datalist>
            <p
              id={`${id}-hint`}
              className="text-body-medium text-on-surface-variant"
            >
              Pick one of your tags or type a new one. Up to {NOTE_TAGS_MAX} per
              note.
            </p>
            {error && (
              <p
                id={`${id}-error`}
                role="alert"
                className="text-body-medium text-error"
              >
                {error}
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
