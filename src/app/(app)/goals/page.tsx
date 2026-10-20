import type { Metadata } from "next";
import { Suspense } from "react";

import { GoalsView } from "@/components/goals/goals-view";
import { LoadingState } from "@/components/ui/skeleton";
import { goalListStatus } from "@/lib/goals";
import { requireUser } from "@/server/auth/session";
import { getGoalsView } from "@/server/modules/goals/queries";

export const metadata: Metadata = { title: "Goals · SoleUp" };

export default function GoalsPage({ searchParams }: PageProps<"/goals">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
        <p className="text-muted">
          What you&apos;re working toward, grouped by area of your life.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading goals" />}>
        <Goals searchParams={searchParams} />
      </Suspense>
    </div>
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
