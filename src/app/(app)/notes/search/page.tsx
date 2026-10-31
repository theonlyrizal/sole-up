import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SearchView } from "@/components/search/search-view";
import { cx, focusRing } from "@/components/ui/cx";
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
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-muted">
          Your notes, and the titles of your goals and tasks. Archived notes
          aren&apos;t searched.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading search" />}>
        <Search />
      </Suspense>
    </div>
  );
}

async function Search() {
  const user = await requireUser();
  const tags = await listTags(user.id);
  return (
    <SearchView tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))} />
  );
}
