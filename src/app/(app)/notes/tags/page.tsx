import type { Metadata } from "next";
import { Suspense } from "react";

import { TagManager } from "@/components/notes/tag-manager";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { listTags } from "@/server/modules/tags/queries";

export const metadata: Metadata = { title: "Tags · SoleUp" };

/** The Tags manager on Notes (chunk 8.5): rename and delete tags. */
export default function TagsPage() {
  return (
    <PageFrame
      title="Tags"
      width="detail"
      back={{ href: "/notes", label: "Notes" }}
      description={
        "Rename or delete your tags. Add tags to a note from its editor."
      }
    >
      <Suspense fallback={<LoadingState label="Loading your tags" />}>
        <Tags />
      </Suspense>
    </PageFrame>
  );
}

async function Tags() {
  const user = await requireUser();
  return <TagManager tags={await listTags(user.id)} />;
}
