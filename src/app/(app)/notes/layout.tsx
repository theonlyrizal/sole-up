import { Suspense, type ReactNode } from "react";

import { NotesLayout, NotesPane } from "@/components/notes/notes-layout";
import { LoadingState } from "@/components/ui/skeleton";
import { NOTE_PREVIEW_MAX } from "@/server/modules/notes/queries";
import { requireUser } from "@/server/auth/session";

import { listNotesForRequest, listNoteTagsForRequest } from "./notes-data";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <NotesLayout
      previewLimit={NOTE_PREVIEW_MAX}
      pane={
        <Suspense fallback={<LoadingState label="Loading your notes" />}>
          <LoadNotesPane />
        </Suspense>
      }
    >
      {children}
    </NotesLayout>
  );
}

async function LoadNotesPane() {
  const user = await requireUser();
  const [notes, archived, tags] = await Promise.all([
    listNotesForRequest(user.id),
    listNotesForRequest(user.id, true),
    listNoteTagsForRequest(user.id),
  ]);
  return <NotesPane notes={notes} tags={tags} archiveCount={archived.length} />;
}
