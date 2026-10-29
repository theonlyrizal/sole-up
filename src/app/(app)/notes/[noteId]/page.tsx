import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ArchivedNote } from "@/components/notes/archived-note";
import { NoteEditor } from "@/components/notes/note-editor";
import { NotePageHeader } from "@/components/notes/note-page-header";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getNote } from "@/server/modules/notes/queries";

// A fixed title: a note's title is personal and would end up in browser
// history and tab lists.
export const metadata: Metadata = { title: "Note · SoleUp" };

export default function NotePage({ params }: PageProps<"/notes/[noteId]">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <NotePageHeader />
      <Suspense fallback={<LoadingState label="Loading your note" />}>
        <NoteView params={params} />
      </Suspense>
    </div>
  );
}

/** The editor, or the read-only view while the note is archived. */
async function NoteView({
  params,
}: {
  params: PageProps<"/notes/[noteId]">["params"];
}) {
  const user = await requireUser();
  const { noteId } = await params;
  // Not a UUID can't be a note; don't send it to the database.
  if (!z.uuid().safeParse(noteId).success) notFound();
  const note = await getNote(user.id, noteId);
  if (!note) notFound();

  if (note.archivedAt) return <ArchivedNote note={note} />;
  return (
    <NoteEditor
      key={note.id}
      note={{
        id: note.id,
        title: note.title,
        body: note.body,
        updatedAt: note.updatedAt,
      }}
    />
  );
}
