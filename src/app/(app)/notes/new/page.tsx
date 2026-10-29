import type { Metadata } from "next";

import { NoteEditor } from "@/components/notes/note-editor";
import { NotePageHeader } from "@/components/notes/note-page-header";

export const metadata: Metadata = { title: "Note · SoleUp" };

/**
 * A new, empty note. Nothing is stored until the first save with a title
 * or some text (ADR 0016); then the URL becomes the note's own.
 */
export default function NewNotePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <NotePageHeader />
      <NoteEditor note={null} />
    </div>
  );
}
