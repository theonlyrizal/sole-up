import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";

import { NoteList } from "@/components/notes/note-list";
import { TagFilter } from "@/components/notes/tag-filter";
import { PageFrame } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { listNotes } from "@/server/modules/notes/queries";
import { getTag, listTags } from "@/server/modules/tags/queries";

export const metadata: Metadata = { title: "Notes · SoleUp" };

export default function NotesPage({ searchParams }: PageProps<"/notes">) {
  return (
    <PageFrame
      title="Notes"
      description="Most recently updated first."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/notes/search"
            className={cx(
              "rounded-sm text-sm text-muted hover:text-fg",
              focusRing,
            )}
          >
            Search notes
          </Link>
          <Link
            href="/notes/tags"
            className={cx(
              "rounded-sm text-sm text-muted hover:text-fg",
              focusRing,
            )}
          >
            Tags
          </Link>
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
      }
    >
      <Suspense fallback={<LoadingState label="Loading your notes" />}>
        <Notes searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

const tagIdSchema = z.uuid();

/**
 * The list, filtered by `?tag=<id>` (chunk 8.5) when that is one of the
 * user's tags. Anything else, someone else's tag included, shows every
 * note, saying the tag is gone when an ID was given.
 */
async function Notes({
  searchParams,
}: {
  searchParams: PageProps<"/notes">["searchParams"];
}) {
  const user = await requireUser();
  const { tag: tagParam } = await searchParams;
  const requested =
    typeof tagParam === "string" && tagParam !== "" ? tagParam : null;
  const [tags, tag] = await Promise.all([
    listTags(user.id),
    requested && tagIdSchema.safeParse(requested).success
      ? getTag(user.id, requested)
      : null,
  ]);
  const notes = await listNotes(user.id, {
    archived: false,
    tagId: tag?.id,
  });
  return (
    <div className="flex flex-col gap-4">
      <TagFilter tags={tags} selected={tag?.id ?? null} />
      {tag ? (
        <p className="text-sm text-muted">
          Showing notes tagged{" "}
          <span className="font-medium text-fg">{tag.name}</span>.{" "}
          <Link
            href="/notes"
            className={cx("rounded-sm underline hover:text-fg", focusRing)}
          >
            Show all notes
          </Link>
        </p>
      ) : (
        requested && (
          <p role="status" className="text-sm text-muted">
            That tag doesn&apos;t exist any more, so all your notes are shown.
          </p>
        )
      )}
      <NoteList notes={notes} filtered={tag !== null} />
    </div>
  );
}
