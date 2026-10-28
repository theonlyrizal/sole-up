import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ArchivedHabitsView } from "@/components/habits/archived-habits-view";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getArchivedHabits } from "@/server/modules/habits/queries";

export const metadata: Metadata = { title: "Archived habits · SoleUp" };

export default function ArchivedHabitsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/track"
          className={cx(
            "self-start rounded-sm text-sm text-muted hover:text-fg",
            focusRing,
          )}
        >
          ← Track
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Archived habits
        </h1>
        <p className="text-muted">
          Out of the way but kept. Restoring a habit makes it active again.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading archived habits" />}>
        <ArchivedHabits />
      </Suspense>
    </div>
  );
}

async function ArchivedHabits() {
  const user = await requireUser();
  const habits = await getArchivedHabits(user.id);
  return <ArchivedHabitsView habits={habits} />;
}
