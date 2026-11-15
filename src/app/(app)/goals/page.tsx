import type { Metadata } from "next";
import { Suspense } from "react";

import { GoalsView } from "@/components/goals/goals-view";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { goalListStatus } from "@/lib/goals";
import { requireUser } from "@/server/auth/session";
import { getGoalsView } from "@/server/modules/goals/queries";

export const metadata: Metadata = { title: "Goals · SoleUp" };

export default function GoalsPage({ searchParams }: PageProps<"/goals">) {
  return (
    <Suspense
      fallback={
        <PageFrame title="Goals">
          <LoadingState label="Loading goals" />
        </PageFrame>
      }
    >
      <Goals searchParams={searchParams} />
    </Suspense>
  );
}

async function Goals({
  searchParams,
}: {
  searchParams: PageProps<"/goals">["searchParams"];
}) {
  const user = await requireUser();
  const { status } = await searchParams;
  const view = await getGoalsView(user.id, goalListStatus(status));
  return <GoalsView view={view} />;
}
