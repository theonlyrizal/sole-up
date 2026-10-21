import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { GoalDetailView } from "@/components/goals/goal-detail";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getGoalDetail } from "@/server/modules/goals/queries";

// A fixed title: goal titles are personal and would end up in browser
// history and tab lists.
export const metadata: Metadata = { title: "Goal · SoleUp" };

export default function GoalPage({ params }: PageProps<"/goals/[goalId]">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<LoadingState label="Loading goal" />}>
        <Goal params={params} />
      </Suspense>
    </div>
  );
}

async function Goal({
  params,
}: {
  params: PageProps<"/goals/[goalId]">["params"];
}) {
  const user = await requireUser();
  const { goalId } = await params;
  // Not a UUID can't be a goal; don't send it to the database.
  if (!z.uuid().safeParse(goalId).success) notFound();
  const detail = await getGoalDetail(user.id, goalId);
  if (!detail) notFound();
  return <GoalDetailView detail={detail} />;
}
