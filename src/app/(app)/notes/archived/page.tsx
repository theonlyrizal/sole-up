import type { Metadata } from "next";
import { Suspense } from "react";

import { NoteList } from "@/components/notes/note-list";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { listNotes } from "@/server/modules/notes/queries";

export const metadata: Metadata = { title: "Archived notes · SoleUp" };

export default function ArchivedNotesPage() {
  return (
    <PageFrame
      title="Archived notes"
      back={{ href: "/notes", label: "Notes" }}
      description={
        "Out of the way and read-only. Open one to restore or delete it."
      }
    >
      <Suspense fallback={<LoadingState label="Loading archived notes" />}>
        <ArchivedNotes />
      </Suspense>
    </PageFrame>
  );
}

async function ArchivedNotes() {
  const user = await requireUser();
  return (
    <NoteList notes={await listNotes(user.id, { archived: true })} archived />
  );
}
