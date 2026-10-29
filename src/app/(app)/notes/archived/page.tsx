import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { NoteList } from "@/components/notes/note-list";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { listNotes } from "@/server/modules/notes/queries";

export const metadata: Metadata = { title: "Archived notes · SoleUp" };

export default function ArchivedNotesPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/notes"
          className={cx(
            "self-start rounded-sm text-sm text-muted hover:text-fg",
            focusRing,
          )}
        >
          ← Notes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Archived notes
        </h1>
        <p className="text-muted">
          Out of the way and read-only. Open one to restore or delete it.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading archived notes" />}>
        <ArchivedNotes />
      </Suspense>
    </div>
  );
}

async function ArchivedNotes() {
  const user = await requireUser();
  return (
    <NoteList notes={await listNotes(user.id, { archived: true })} archived />
  );
}
