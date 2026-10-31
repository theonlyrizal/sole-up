"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";

import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  normalizeTagName,
  TAG_NAME_EMPTY,
  TAG_NAME_MAX,
  tagNoteCount,
} from "@/lib/notes/tags";
import type { ActionError } from "@/lib/result";
import { deleteTag, renameTag } from "@/server/modules/tags/actions";
import type { TagWithCount } from "@/server/modules/tags/queries";

function errorMessage(error: ActionError): string {
  if (error.code === "VALIDATION") {
    const field = error.fieldErrors.name?.[0];
    if (field) return field;
  }
  return error.message;
}

/**
 * The user's tags with how many notes carry each (chunk 8.5): rename in
 * place (a name another tag has, ignoring case, is refused), and delete
 * behind a confirmation naming the number of notes, which are only
 * untagged.
 */
export function TagManager({ tags }: { tags: TagWithCount[] }) {
  if (tags.length === 0) {
    return (
      <EmptyState
        title="No tags yet"
        description="Add a tag to a note from its editor: type a name, and it's created as you tag."
        action={
          <Link href="/notes" className={buttonClass({ variant: "secondary" })}>
            Back to notes
          </Link>
        }
      />
    );
  }
  return (
    <ul
      aria-label="Tags"
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
    >
      {tags.map((tag) => (
        <TagRow key={tag.id} tag={tag} />
      ))}
    </ul>
  );
}

function TagRow({ tag }: { tag: TagWithCount }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const renameButton = useRef<HTMLButtonElement>(null);

  function stopEditing() {
    setEditing(false);
    setError(null);
    setName(tag.name);
    // Back to the button that opened the form, once it renders again.
    requestAnimationFrame(() => renameButton.current?.focus());
  }

  function save() {
    const normalized = normalizeTagName(name);
    if (!normalized) return setError(TAG_NAME_EMPTY);
    startTransition(async () => {
      let result;
      try {
        result = await renameTag({ id: tag.id, name: normalized });
      } catch {
        setError(
          "Couldn't reach SoleUp. Check your connection, then try again.",
        );
        return;
      }
      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }
      toast({ title: "Tag renamed", variant: "success" });
      setEditing(false);
      setError(null);
      setName(result.data.name);
      requestAnimationFrame(() => renameButton.current?.focus());
    });
  }

  const count = tagNoteCount(tag.noteCount);

  if (editing) {
    return (
      <li className="p-4">
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            Tag name
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${id}-name`}
              value={name}
              autoFocus
              maxLength={TAG_NAME_MAX}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  stopEditing();
                }
              }}
              aria-describedby={error ? `${id}-error` : undefined}
              aria-invalid={error ? true : undefined}
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={stopEditing}
            >
              Cancel
            </Button>
          </div>
          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-4">
      <div className="flex min-w-0 flex-col">
        {tag.noteCount > 0 ? (
          <Link
            href={`/notes?tag=${tag.id}`}
            className={cx(
              "self-start rounded-sm font-medium break-all hover:underline",
              focusRing,
            )}
          >
            {tag.name}
          </Link>
        ) : (
          <span className="font-medium break-all">{tag.name}</span>
        )}
        <span className="text-sm text-muted">On {count}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={renameButton}
          variant="secondary"
          size="sm"
          aria-label={`Rename ${tag.name}`}
          onClick={() => setEditing(true)}
        >
          Rename
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" aria-label={`Delete ${tag.name}`}>
              Delete
            </Button>
          }
          title={`Delete the tag “${tag.name}”?`}
          description={
            tag.noteCount === 0
              ? "It isn't on any notes. This can't be undone."
              : `It's on ${count}. ${tag.noteCount === 1 ? "That note is" : "Those notes are"} kept, only untagged. This can't be undone.`
          }
          confirmLabel="Delete tag"
          onConfirm={async () => {
            const result = await deleteTag({ id: tag.id });
            if (result.ok) toast({ title: "Tag deleted", variant: "success" });
            return result;
          }}
        />
      </div>
    </li>
  );
}
