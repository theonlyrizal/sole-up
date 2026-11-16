import type { Metadata } from "next";
import { Suspense } from "react";

import { TrackView } from "@/components/habits/track-view";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { parseTrackRange } from "@/lib/habits/track-range";
import { requireUser } from "@/server/auth/session";
import { getTrackView } from "@/server/modules/habits/queries";

export const metadata: Metadata = { title: "Track · SoleUp" };

export default function TrackPage({ searchParams }: PageProps<"/track">) {
  return (
    <Suspense
      fallback={
        <PageFrame title="Track">
          <LoadingState label="Loading habits" />
        </PageFrame>
      }
    >
      <Habits searchParams={searchParams} />
    </Suspense>
  );
}

async function Habits({
  searchParams,
}: {
  searchParams: PageProps<"/track">["searchParams"];
}) {
  const user = await requireUser();
  const range = parseTrackRange((await searchParams).range);
  const view = await getTrackView(user.id, new Date(), range);
  return <TrackView view={view} />;
}
