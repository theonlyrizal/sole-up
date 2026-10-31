"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { AlertDialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cx } from "@/components/ui/cx";
import { contentClass, overlayClass } from "@/components/ui/dialog";
import { fieldClass } from "@/components/ui/field-styles";
import { toast } from "@/components/ui/toast";
import { EMPTY_NOTE_DOCUMENT, type NoteDocument } from "@/lib/notes/document";
import { NOTE_TITLE_MAX } from "@/lib/notes/note";
import { archiveNote, loadNote } from "@/server/modules/notes/actions";
import type { LinkTarget } from "@/server/modules/notes/queries";

import { DeleteNoteDialog } from "./delete-note-dialog";
import { noteEditorExtensions } from "./note-extensions";
import { NoteLinks } from "./note-links";
import { NoteTags } from "./note-tags";
import { NoteToolbar } from "./note-toolbar";
import {
  useNoteAutosave,
  useSaveBeforeLeaving,
  type SaveState,
} from "./use-note-autosave";

/** What the editor needs of a saved note. Null for a new one. */
export type EditableNote = {
  id: string;
  title: string | null;
  body: NoteDocument;
  updatedAt: Date;
};

/**
 * The note editor (chunk 8.2): a title and a TipTap body limited to the
 * 8.1 allowlist, saved as you go, and the goals and tasks it links to
 * (chunk 8.3). Client-only rendering of the body (`immediatelyRender:
 * false`), so the server never renders the editor. A new note opened from
 * a goal or task gets `linkTo`, and its first save links it.
 */
export function NoteEditor({
  note,
  linkTo = null,
}: {
  note: EditableNote | null;
  linkTo?: LinkTarget | null;
}) {
  const router = useRouter();
  const titleId = useId();
  const [title, setTitle] = useState(note?.title ?? "");
  const [savedId, setSavedId] = useState(note?.id ?? null);
  const [linkOpen, setLinkOpen] = useState(false);
  const titleRef = useRef(title);
  const editorRef = useRef<Editor | null>(null);

  const autosave = useNoteAutosave({
    noteId: note?.id ?? null,
    updatedAt: note?.updatedAt ?? null,
    linkTo: linkTo && {
      targetType: linkTo.targetType,
      targetId: linkTo.targetId,
    },
    read: () => ({
      title: titleRef.current,
      body: plainDocument(editorRef.current),
    }),
    onCreated: (id) => {
      setSavedId(id);
      // The page stays mounted; reloading or sharing the URL opens the note.
      window.history.replaceState(null, "", `/notes/${id}`);
    },
  });
  const leaving = useSaveBeforeLeaving(autosave);

  const editor = useEditor({
    extensions: noteEditorExtensions,
    content: note?.body ?? EMPTY_NOTE_DOCUMENT,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Note",
        class: cx(fieldClass(), "note-content min-h-64"),
      },
      handleKeyDown: (_view, event) => {
        const mod = event.metaKey || event.ctrlKey;
        if (mod && !event.altKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          setLinkOpen(true);
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor: created }) => {
      editorRef.current = created;
    },
    onUpdate: () => autosave.changed(),
    onBlur: () => void autosave.flush(),
  });

  function changeTitle(value: string) {
    titleRef.current = value;
    setTitle(value);
    autosave.changed();
  }

  async function loadSaved() {
    const id = autosave.noteId();
    if (!id) return;
    const result = await loadNote({ id });
    if (!result.ok) return result;
    if (result.data.archived) {
      // The page shows the archived note instead of the editor.
      autosave.stop();
      router.refresh();
      return;
    }
    titleRef.current = result.data.title ?? "";
    setTitle(titleRef.current);
    editorRef.current?.commands.setContent(result.data.body, {
      emitUpdate: false,
    });
    autosave.loadedSaved(result.data.updatedAt);
    toast({ title: "Loaded the saved version", variant: "success" });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SaveIndicator state={autosave.state} onRetry={autosave.flush} />
        {savedId && (
          <div className="flex flex-wrap items-center gap-2">
            <ArchiveButton
              noteId={savedId}
              beforeArchive={autosave.flush}
              afterArchive={autosave.stop}
            />
            <DeleteNoteDialog
              noteId={savedId}
              beforeDelete={autosave.stop}
              afterFailure={autosave.resume}
              returnTo="/notes"
            />
          </div>
        )}
      </div>

      {autosave.state.kind === "conflict" && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-danger p-4"
        >
          <p>
            <span className="font-medium">
              This note changed somewhere else.
            </span>{" "}
            Your changes are still here, but they aren&apos;t saved. Copy
            anything you want to keep, then load the saved version.
          </p>
          <ConfirmDialog
            trigger={
              <Button variant="secondary" size="sm">
                Load the saved version
              </Button>
            }
            title="Load the saved version?"
            description="What's on screen is replaced by the version saved elsewhere. Your unsaved changes here are lost."
            confirmLabel="Load the saved version"
            onConfirm={loadSaved}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleId} className="sr-only">
          Title
        </label>
        <input
          id={titleId}
          value={title}
          onChange={(event) => changeTitle(event.target.value)}
          onBlur={() => void autosave.flush()}
          maxLength={NOTE_TITLE_MAX}
          placeholder="Untitled"
          autoComplete="off"
          className={fieldClass("text-xl font-semibold")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <NoteToolbar
          editor={editor}
          linkOpen={linkOpen}
          setLinkOpen={setLinkOpen}
        />
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div
            aria-hidden="true"
            className={fieldClass("note-content min-h-64")}
          />
        )}
      </div>

      <NoteTags noteId={savedId} />

      <NoteLinks noteId={savedId} pendingLink={linkTo} />

      <LeaveWithoutSavingDialog
        target={leaving.leaveTarget}
        onStay={leaving.stay}
        onLeave={(target) => {
          autosave.stop();
          leaving.stay();
          router.push(target);
        }}
      />
    </div>
  );
}

/**
 * The editor's document as plain JSON. ProseMirror builds attributes as
 * objects without a prototype, which a Server Action can't receive as
 * data, so they are copied into ordinary objects.
 */
function plainDocument(editor: Editor | null): NoteDocument {
  if (!editor) return EMPTY_NOTE_DOCUMENT;
  return JSON.parse(JSON.stringify(editor.getJSON())) as NoteDocument;
}

const SAVE_LABELS: Record<SaveState["kind"], string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
  conflict: "Not saved",
};

/** "Saving…", "Saved" or "Not saved", with the reason and Retry. */
function SaveIndicator({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => Promise<boolean>;
}) {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <p
        role="status"
        className={cx(
          "font-medium",
          state.kind === "error" || state.kind === "conflict"
            ? "text-danger"
            : "text-muted",
        )}
      >
        {SAVE_LABELS[state.kind]}
      </p>
      {state.kind === "error" && (
        <>
          <p className="text-danger">{state.message}</p>
          <Button variant="secondary" size="sm" onClick={() => void onRetry()}>
            Retry
          </Button>
        </>
      )}
    </div>
  );
}

function ArchiveButton({
  noteId,
  beforeArchive,
  afterArchive,
}: {
  noteId: string;
  beforeArchive: () => Promise<boolean>;
  afterArchive: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          // Archived notes are read-only, so save first.
          if (!(await beforeArchive())) return;
          const result = await archiveNote({ id: noteId });
          if (!result.ok) {
            toast({ title: result.error.message, variant: "error" });
            return;
          }
          afterArchive();
          toast({ title: "Note archived", variant: "success" });
          router.push("/notes");
        })
      }
    >
      {pending ? "Archiving…" : "Archive"}
    </Button>
  );
}

/** Asks before leaving when the latest change couldn't be saved. */
function LeaveWithoutSavingDialog({
  target,
  onStay,
  onLeave,
}: {
  target: string | null;
  onStay: () => void;
  onLeave: (target: string) => void;
}) {
  return (
    <AlertDialog.Root
      open={target !== null}
      onOpenChange={(open) => !open && onStay()}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content className={contentClass}>
          <AlertDialog.Title className="text-lg font-semibold">
            Leave without saving?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-muted">
            Your latest changes to this note aren&apos;t saved. If you leave
            now, they&apos;re lost.
          </AlertDialog.Description>
          <div className="flex flex-wrap justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Stay on this note</Button>
            </AlertDialog.Cancel>
            <Button variant="danger" onClick={() => target && onLeave(target)}>
              Leave without saving
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
