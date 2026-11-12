import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { GoalDetailView } from "@/components/goals/goal-detail";
import { PageContainer } from "@/components/shell/page-container";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { GOAL_LIST_STATUSES } from "@/lib/goals";
import { requireUser } from "@/server/auth/session";
import { getGoalDetail } from "@/server/modules/goals/queries";

// A fixed title: goal titles are personal and would end up in browser
// history and tab lists.
export const metadata: Metadata = { title: "Goal · SoleUp" };

export default function GoalPage({ params }: PageProps<"/goals/[goalId]">) {
  return (
    <Suspense
      fallback={
        <PageContainer width="detail">
          <LoadingState label="Loading goal" />
        </PageContainer>
      }
    >
      <Goal params={params} />
    </Suspense>
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

  // Back to the filter this goal is listed under, or the archive view.
  const listStatus = GOAL_LIST_STATUSES.find(
    (status) => status === detail.goal.status,
  );
  const backHref =
    detail.goal.status === "archived"
      ? "/goals/archived"
      : listStatus && listStatus !== "active"
        ? `/goals?status=${listStatus}`
        : "/goals";
  return (
    <PageFrame
      title={detail.goal.title}
      width="detail"
      back={{ href: backHref, label: "Goals" }}
    >
      <GoalDetailView detail={detail} backHref={backHref} />
    </PageFrame>
  );
}
