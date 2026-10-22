import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ArchivedGoalsView } from "@/components/goals/archived-goals-view";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getArchivedGoals } from "@/server/modules/goals/queries";

export const metadata: Metadata = { title: "Archived goals · SoleUp" };

export default function ArchivedGoalsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/goals"
          className={cx(
            "self-start rounded-sm text-sm text-muted hover:text-fg",
            focusRing,
          )}
        >
          ← Goals
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Archived goals
        </h1>
        <p className="text-muted">
          Out of the way but kept. Restoring a goal moves it back to Active.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading archived goals" />}>
        <ArchivedGoals />
      </Suspense>
    </div>
  );
}

async function ArchivedGoals() {
  const user = await requireUser();
  const goals = await getArchivedGoals(user.id);
  return <ArchivedGoalsView goals={goals} />;
}
