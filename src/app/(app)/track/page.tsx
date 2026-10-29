import type { Metadata } from "next";
import { Suspense } from "react";

import { TrackView } from "@/components/habits/track-view";
import { LoadingState } from "@/components/ui/skeleton";
import { parseTrackRange } from "@/lib/habits/track-range";
import { requireUser } from "@/server/auth/session";
import { getTrackView } from "@/server/modules/habits/queries";

export const metadata: Metadata = { title: "Track · SoleUp" };

export default function TrackPage({ searchParams }: PageProps<"/track">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Track</h1>
        <p className="text-muted">
          The habits you&apos;re building, how often you want to do them, and
          how each has gone week by week.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading habits" />}>
        <Habits searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Habits({
  searchParams,
}: {
  searchParams: PageProps<"/track">["searchParams"];
}) {
  const user = await requireUser();
  const range = parseTrackRange((await searchParams).range);
  // The range's dates are worked out from the saved zone and week start.
  const view = await getTrackView(user.id, new Date(), range);
  return <TrackView view={view} />;
}
