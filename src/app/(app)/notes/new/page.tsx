import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";

import { NoteEditor } from "@/components/notes/note-editor";
import { NoteHeader } from "@/components/notes/note-header";
import { PageContainer } from "@/components/shell/page-container";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getLinkTarget } from "@/server/modules/notes/queries";

export const metadata: Metadata = { title: "Note · SoleUp" };

/**
 * A new, empty note. Nothing is stored until the first save with a title
 * or some text (ADR 0016); then the URL becomes the note's own. "New note"
 * on a goal or task opens `?goal=<id>` or `?task=<id>` (chunk 8.3), and
 * the first save links the note to it.
 */
export default function NewNotePage({ searchParams }: PageProps<"/notes/new">) {
  return (
    <Suspense
      fallback={
        <PageContainer width="reading">
          <NoteHeader />
          <LoadingState label="Loading the editor" />
        </PageContainer>
      }
    >
      <NewNote searchParams={searchParams} />
    </Suspense>
  );
}

const targetIdSchema = z.uuid();

async function NewNote({
  searchParams,
}: {
  searchParams: PageProps<"/notes/new">["searchParams"];
}) {
  const user = await requireUser();
  const { goal, task } = await searchParams;
  // Anything but one UUID of the user's own goal or task links nothing.
  const linkTo =
    typeof goal === "string" && targetIdSchema.safeParse(goal).success
      ? await getLinkTarget(user.id, "goal", goal)
      : typeof task === "string" && targetIdSchema.safeParse(task).success
        ? await getLinkTarget(user.id, "task", task)
        : null;
  return <NoteEditor note={null} linkTo={linkTo} />;
}
