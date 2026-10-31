import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { TagManager } from "@/components/notes/tag-manager";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { listTags } from "@/server/modules/tags/queries";

export const metadata: Metadata = { title: "Tags · SoleUp" };

/** The Tags manager on Notes (chunk 8.5): rename and delete tags. */
export default function TagsPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
        <p className="text-muted">
          Rename or delete your tags. Add tags to a note from its editor.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading your tags" />}>
        <Tags />
      </Suspense>
    </div>
  );
}

async function Tags() {
  const user = await requireUser();
  return <TagManager tags={await listTags(user.id)} />;
}
