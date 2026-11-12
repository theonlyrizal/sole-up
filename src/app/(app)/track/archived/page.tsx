import type { Metadata } from "next";
import { Suspense } from "react";

import { ArchivedHabitsView } from "@/components/habits/archived-habits-view";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getArchivedHabits } from "@/server/modules/habits/queries";

export const metadata: Metadata = { title: "Archived habits · SoleUp" };

export default function ArchivedHabitsPage() {
  return (
    <PageFrame
      title="Archived habits"
      back={{ href: "/track", label: "Track" }}
      description={
        "Out of the way but kept. Restoring a habit makes it active again."
      }
    >
      <Suspense fallback={<LoadingState label="Loading archived habits" />}>
        <ArchivedHabits />
      </Suspense>
    </PageFrame>
  );
}

async function ArchivedHabits() {
  const user = await requireUser();
  const habits = await getArchivedHabits(user.id);
  return <ArchivedHabitsView habits={habits} />;
}
