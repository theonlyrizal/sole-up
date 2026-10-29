import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { DeleteReviewDialog } from "@/components/reviews/delete-review-dialog";
import { LookBack } from "@/components/reviews/look-back";
import { ReadOnlyReview } from "@/components/reviews/read-only-review";
import {
  ReviewHeader,
  reviewWeekLabel,
} from "@/components/reviews/review-header";
import { buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { reviewHref } from "@/lib/review-flow";
import { todayClock } from "@/lib/today";
import { requireUser } from "@/server/auth/session";
import { weeklySummary } from "@/server/modules/metrics/review";
import { getReviewView } from "@/server/modules/weekly-reviews/queries";

// A fixed title: review text is personal and would end up in browser
// history and tab lists.
export const metadata: Metadata = { title: "Weekly review · SoleUp" };

export default function ReviewViewPage({
  params,
}: PageProps<"/review/history/[reviewId]">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/review/history"
          className={cx(
            "self-start rounded-sm text-sm text-muted hover:text-fg",
            focusRing,
          )}
        >
          ← Past reviews
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly review</h1>
      </div>
      <Suspense fallback={<LoadingState label="Loading your review" />}>
        <ReviewView params={params} />
      </Suspense>
    </div>
  );
}

/**
 * One review, read-only (chunk 7.4): its text, its priorities as they are
 * now, and the summary computed now. Edit reopens the flow only while the
 * week is open (ADR 0015); delete is always offered.
 */
async function ReviewView({
  params,
}: {
  params: PageProps<"/review/history/[reviewId]">["params"];
}) {
  const user = await requireUser();
  const { reviewId } = await params;
  // Not a UUID can't be a review; don't send it to the database.
  if (!z.uuid().safeParse(reviewId).success) notFound();
  const page = await getReviewView(user.id, reviewId);
  if (!page) notFound();

  const summary = await weeklySummary(user.id, {
    periodStart: page.periodStart,
    clock: todayClock(page.timeZone),
    timeZone: page.timeZone,
    weekStart: page.weekStart,
  });
  return (
    <>
      <ReviewHeader page={page} />
      <div className="flex flex-wrap items-center gap-2">
        {page.open && (
          <Link
            href={reviewHref(page.periodStart)}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Edit review
          </Link>
        )}
        <DeleteReviewDialog
          reviewId={page.review.id}
          weekLabel={reviewWeekLabel(
            page.periodStart,
            page.periodEnd,
            page.locale,
          )}
        />
      </div>
      <ReadOnlyReview
        review={page.review}
        lookBack={
          <LookBack summary={summary} today={page.today} locale={page.locale} />
        }
      />
    </>
  );
}
