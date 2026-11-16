"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { AlertDialog } from "radix-ui";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { PageContainer } from "@/components/shell/page-container";
import { Chip } from "@/components/ui/chip";
import { InlineBanner } from "@/components/ui/inline-banner";
import { SaveStatus } from "@/components/ui/save-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cx, focusRing } from "@/components/ui/cx";
import { contentClass, overlayClass } from "@/components/ui/dialog";

import { toast } from "@/components/ui/toast";
import {
  EMPTY_NOTE_DOCUMENT,
  toBodyText,
  type NoteDocument,
} from "@/lib/notes/document";
import { NOTE_TITLE_MAX } from "@/lib/notes/note";
import { archiveNote, loadNote } from "@/server/modules/notes/actions";
import type { LinkTarget } from "@/server/modules/notes/queries";

import { NoteHeader } from "./note-header";
import { NoteOptions } from "./note-options";
import { useUpdateNotesPane } from "./notes-layout";
import { noteEditorExtensions } from "./note-extensions";
import { NoteLinks } from "./note-links";
import { NoteTags } from "./note-tags";
import { NoteToolbar } from "./note-toolbar";
import { useNoteAutosave, useSaveBeforeLeaving } from "./use-note-autosave";

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
  const updatePane = useUpdateNotesPane();
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
    onSaved: ({ id, updatedAt }, snapshot, created) => {
      showSavedInPane(id, updatedAt, snapshot.title, snapshot.body);
      if (created) {
        setSavedId(id);
        // Keep the draft mounted when its first save gives it a URL.
        window.history.replaceState(null, "", `/notes/${id}`);
      }
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
        class: bodyClass,
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

  function showSavedInPane(
    id: string,
    updatedAt: Date,
    title: string | null,
    body: NoteDocument,
  ) {
    updatePane(id, {
      saved: {
        updatedAt,
        title: title?.trim() || null,
        preview: toBodyText(body).split("\n", 1)[0],
      },
    });
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
    showSavedInPane(
      id,
      result.data.updatedAt,
      result.data.title,
      result.data.body,
    );
    toast({ title: "Loaded the saved version", variant: "success" });
  }

  async function archive() {
    if (!savedId || !(await autosave.flush())) return;
    const result = await archiveNote({ id: savedId });
    if (!result.ok) {
      toast({ title: result.error.message, variant: "error" });
      return;
    }
    autosave.stop();
    updatePane(savedId, null);
    toast({ title: "Note archived", variant: "success" });
    router.push("/notes");
    router.refresh();
  }

  const state = autosave.state;
  const savePhase = state.kind === "conflict" ? "error" : state.kind;
  return (
    <PageContainer width="reading" className="note-editor !pt-0 medium:!pt-5">
      <div data-note-editor="" data-hide-create="">
        <NoteHeader>
          <SaveStatus
            phase={savePhase}
            onRetry={
              state.kind === "error" ? () => void autosave.flush() : undefined
            }
          />
          {savedId && (
            <NoteOptions
              noteId={savedId}
              onArchive={archive}
              beforeDelete={autosave.stop}
              afterFailure={autosave.resume}
            />
          )}
        </NoteHeader>
        <div className="rounded-lg bg-resting-surface p-3 text-on-resting-surface medium:p-5">
          {!savedId && linkTo && (
            <div className="mb-3">
              <Chip
                type="input"
                icon="link"
                label={`Will link to: ${linkTo.title}`}
              />
            </div>
          )}
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
            className={cx(
              "mb-3 w-full min-w-0 rounded-xs px-2 py-2 text-headline-medium placeholder:text-on-surface-variant",
              focusRing,
            )}
          />
          <NoteToolbar
            editor={editor}
            linkOpen={linkOpen}
            setLinkOpen={setLinkOpen}
          />

          {state.kind === "error" && (
            <div className="mt-3">
              <InlineBanner tone="error">{state.message}</InlineBanner>
            </div>
          )}
          {state.kind === "conflict" && (
            <div className="mt-3">
              <InlineBanner
                tone="warning"
                title="This note changed somewhere else."
                action={
                  <ConfirmDialog
                    destructive={false}
                    trigger={
                      <Button variant="text">Load the saved version</Button>
                    }
                    title="Load the saved version?"
                    description="What's on screen is replaced by the version saved elsewhere. Your unsaved changes here are lost."
                    confirmLabel="Load the saved version"
                    onConfirm={loadSaved}
                  />
                }
              >
                Your changes are still here, but they aren&apos;t saved. Copy
                anything you want to keep, then load the saved version.
              </InlineBanner>
            </div>
          )}

          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div aria-hidden="true" className={bodyClass} />
          )}
        </div>

        <NoteLinks noteId={savedId} pendingLink={linkTo}>
          <NoteTags noteId={savedId} />
        </NoteLinks>

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
    </PageContainer>
  );
}

const bodyClass = cx(
  "note-content mt-2 min-h-64 rounded-xs px-2 py-3",
  focusRing,
);

/**
 * The editor's document as plain JSON. ProseMirror builds attributes as
 * objects without a prototype, which a Server Action can't receive as
 * data, so they are copied into ordinary objects.
 */
function plainDocument(editor: Editor | null): NoteDocument {
  if (!editor) return EMPTY_NOTE_DOCUMENT;
  return JSON.parse(JSON.stringify(editor.getJSON())) as NoteDocument;
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
