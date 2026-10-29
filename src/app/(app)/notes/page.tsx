import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { NoteList } from "@/components/notes/note-list";
import { buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { listNotes } from "@/server/modules/notes/queries";

export const metadata: Metadata = { title: "Notes · SoleUp" };

export default function NotesPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="text-muted">Most recently updated first.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/notes/archived"
            className={cx(
              "rounded-sm text-sm text-muted hover:text-fg",
              focusRing,
            )}
          >
            Archived notes
          </Link>
          <Link href="/notes/new" className={buttonClass()}>
            New note
          </Link>
        </div>
      </div>
      <Suspense fallback={<LoadingState label="Loading your notes" />}>
        <Notes />
      </Suspense>
    </div>
  );
}

async function Notes() {
  const user = await requireUser();
  return <NoteList notes={await listNotes(user.id, { archived: false })} />;
}
