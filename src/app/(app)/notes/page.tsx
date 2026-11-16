import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/icons/icon";
import { NotesCollection } from "@/components/notes/notes-collection";
import { NotesIndexMenu } from "@/components/notes/notes-index-menu";
import { PageFrame } from "@/components/shell/page-frame";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconLink } from "@/components/ui/icon-button";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";

import { listNotesForRequest, listNoteTagsForRequest } from "./notes-data";

export const metadata: Metadata = { title: "Notes · SoleUp" };

export default function NotesPage({ searchParams }: PageProps<"/notes">) {
  return (
    <div data-notes-index="" className="min-w-0">
      <div className="large:hidden">
        <PageFrame
          title="Notes"
          width="reading"
          compactActions={false}
          mobileHeader={
            <TopAppBar title="Notes" actions={<NotesIndexMenu />} />
          }
          actions={
            <>
              <IconLink
                href="/notes/search"
                icon="search"
                label="Search notes"
              />
              <NotesIndexMenu />
              <Link href="/notes/new" className={buttonClass({ icon: "add" })}>
                <Icon name="add" size={20} />
                New note
              </Link>
            </>
          }
        >
          <Suspense fallback={<LoadingState label="Loading your notes" />}>
            <Notes searchParams={searchParams} />
          </Suspense>
        </PageFrame>
      </div>
      <div className="hidden p-8 large:block">
        <EmptyState
          title="Select a note"
          description="Open a note from the list or start a new one."
          className="rounded-lg bg-resting-surface"
        />
      </div>
    </div>
  );
}

async function Notes({
  searchParams,
}: {
  searchParams: PageProps<"/notes">["searchParams"];
}) {
  const user = await requireUser();
  const [{ tag }, notes, tags] = await Promise.all([
    searchParams,
    listNotesForRequest(user.id),
    listNoteTagsForRequest(user.id),
  ]);
  return (
    <NotesCollection
      notes={notes}
      tags={tags}
      requested={typeof tag === "string" ? tag : null}
    />
  );
}
