import type { Metadata } from "next";
import { Suspense } from "react";

import { ReviewHistoryList } from "@/components/reviews/review-history";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getReviewHistory } from "@/server/modules/weekly-reviews/queries";

export const metadata: Metadata = { title: "Past reviews · SoleUp" };

export default function ReviewHistoryPage() {
  return (
    <PageFrame
      title="Past reviews"
      back={{ href: "/review", label: "Weekly review" }}
      description={
        "A review can be changed during its week and the week after. Then it's kept as you wrote it."
      }
    >
      <Suspense fallback={<LoadingState label="Loading past reviews" />}>
        <History />
      </Suspense>
    </PageFrame>
  );
}

async function History() {
  const user = await requireUser();
  return <ReviewHistoryList history={await getReviewHistory(user.id)} />;
}
