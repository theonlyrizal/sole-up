import type { Metadata } from "next";
import { Suspense } from "react";

import { ArchivedGoalsView } from "@/components/goals/archived-goals-view";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getArchivedGoals } from "@/server/modules/goals/queries";

export const metadata: Metadata = { title: "Archived goals · SoleUp" };

export default function ArchivedGoalsPage() {
  return (
    <PageFrame
      title="Archived goals"
      back={{ href: "/goals", label: "Goals" }}
      description={
        "Out of the way but kept. Restoring a goal moves it back to Active."
      }
    >
      <Suspense fallback={<LoadingState label="Loading archived goals" />}>
        <ArchivedGoals />
      </Suspense>
    </PageFrame>
  );
}

async function ArchivedGoals() {
  const user = await requireUser();
  const goals = await getArchivedGoals(user.id);
  return <ArchivedGoalsView goals={goals} />;
}
