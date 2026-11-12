import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ArchivedNote } from "@/components/notes/archived-note";
import { NoteEditor } from "@/components/notes/note-editor";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getNote } from "@/server/modules/notes/queries";
import { listNoteTags } from "@/server/modules/tags/queries";

// A fixed title: a note's title is personal and would end up in browser
// history and tab lists.
export const metadata: Metadata = { title: "Note · SoleUp" };

export default function NotePage({ params }: PageProps<"/notes/[noteId]">) {
  return (
    <PageFrame
      title="Note"
      width="reading"
      back={{ href: "/notes", label: "Notes" }}
    >
      <Suspense fallback={<LoadingState label="Loading your note" />}>
        <NoteView params={params} />
      </Suspense>
    </PageFrame>
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

  if (note.archivedAt) {
    const tags = await listNoteTags(user.id, note.id);
    return <ArchivedNote note={{ ...note, tags }} />;
  }
  return (
    <div className="contents" data-hide-create>
      <NoteEditor
        key={note.id}
        note={{
          id: note.id,
          title: note.title,
          body: note.body,
          updatedAt: note.updatedAt,
        }}
      />
    </div>
  );
}
