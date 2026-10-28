import type { Metadata } from "next";
import { Suspense } from "react";

import { TrackView } from "@/components/habits/track-view";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getTrackView } from "@/server/modules/habits/queries";

export const metadata: Metadata = { title: "Track · SoleUp" };

export default function TrackPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Track</h1>
        <p className="text-muted">
          The habits you&apos;re building, and how often you want to do them.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading habits" />}>
        <Habits />
      </Suspense>
    </div>
  );
}

async function Habits() {
  const user = await requireUser();
  const view = await getTrackView(user.id);
  return <TrackView view={view} />;
}
