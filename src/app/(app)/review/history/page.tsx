import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ReviewHistoryList } from "@/components/reviews/review-history";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getReviewHistory } from "@/server/modules/weekly-reviews/queries";

export const metadata: Metadata = { title: "Past reviews · SoleUp" };

export default function ReviewHistoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/review"
          className={cx(
            "self-start rounded-sm text-sm text-muted hover:text-fg",
            focusRing,
          )}
        >
          ← Weekly review
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Past reviews</h1>
        <p className="text-muted">
          A review can be changed during its week and the week after. Then
          it&apos;s kept as you wrote it.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading past reviews" />}>
        <History />
      </Suspense>
    </div>
  );
}

async function History() {
  const user = await requireUser();
  return <ReviewHistoryList history={await getReviewHistory(user.id)} />;
}
