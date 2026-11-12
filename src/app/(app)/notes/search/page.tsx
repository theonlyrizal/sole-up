import type { Metadata } from "next";
import { Suspense } from "react";

import { SearchView } from "@/components/search/search-view";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { listTags } from "@/server/modules/tags/queries";

export const metadata: Metadata = { title: "Search · SoleUp" };

/**
 * Search (chunk 8.4): the user's notes, goals and tasks. The page holds no
 * search terms: the field calls a Server Action (ADR 0016).
 */
export default function SearchPage() {
  return (
    <PageFrame
      title="Search"
      back={{ href: "/notes", label: "Notes" }}
      description={
        "Your notes, and the titles of your goals and tasks. Archived notes aren't searched."
      }
    >
      <Suspense fallback={<LoadingState label="Loading search" />}>
        <Search />
      </Suspense>
    </PageFrame>
  );
}

async function Search() {
  const user = await requireUser();
  const tags = await listTags(user.id);
  return (
    <SearchView tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))} />
  );
}
