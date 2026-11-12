import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdjustStepView } from "@/components/reviews/adjust-step";
import { LookBack } from "@/components/reviews/look-back";
import { PrioritiesStep } from "@/components/reviews/priorities-step";
import { ReadOnlyReview } from "@/components/reviews/read-only-review";
import { ReflectStep } from "@/components/reviews/reflect-step";
import { ReviewFlow } from "@/components/reviews/review-flow";
import { PageFrame } from "@/components/shell/page-frame";
import { ReviewHeader } from "@/components/reviews/review-header";
import { StartReview } from "@/components/reviews/start-review";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { addDays, formatLocalDate } from "@/lib/dates";
import { formatDateSpan } from "@/lib/habits/track-range";
import {
  parseReviewStep,
  parseReviewWeek,
  type ReviewStep,
} from "@/lib/review-flow";
import { todayClock } from "@/lib/today";
import { requireUser } from "@/server/auth/session";
import { weeklySummary } from "@/server/modules/metrics/review";
import {
  getAdjustStep,
  getPriorityOptions,
  getReviewPage,
  type ReviewDetail,
  type ReviewPage as ReviewPageData,
} from "@/server/modules/weekly-reviews/queries";

export const metadata: Metadata = { title: "Review · SoleUp" };

export default function ReviewPage({ searchParams }: PageProps<"/review">) {
  return (
    <PageFrame
      title="Weekly review"
      description="Look back on a week, note what you learned, make a few changes, and choose what matters next week. Every step is optional."
      subnav={
        <nav aria-label="Review pages" className="flex flex-wrap gap-4">
          {[
            { href: "/review/history", label: "Past reviews" },
            { href: "/review/insights", label: "Insights" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cx(
                "rounded-sm text-sm font-medium underline underline-offset-2",
                focusRing,
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      }
    >
      <Suspense fallback={<LoadingState label="Loading your review" />}>
        <Review searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function Review({
  searchParams,
}: {
  searchParams: PageProps<"/review">["searchParams"];
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page = await getReviewPage(user.id, parseReviewWeek(params.week));
  const header = <ReviewHeader page={page} />;

  // Opening an open week starts its review (ADR 0015). The page itself
  // writes nothing; the client starts it once and the page refreshes.
  if (!page.review) {
    return (
      <>
        {header}
        <StartReview week={page.periodStart} />
      </>
    );
  }

  if (!page.open) {
    return (
      <>
        {header}
        <ReadOnlyReview
          review={page.review}
          lookBack={await lookBack(user.id, page)}
        />
      </>
    );
  }

  const step = parseReviewStep(params.step);
  return (
    <>
      {header}
      <ReviewFlow
        reviewId={page.review.id}
        week={page.periodStart}
        step={step}
        finished={page.review.completedAt !== null}
      >
        {await stepContent(user.id, step, page, page.review)}
      </ReviewFlow>
    </>
  );
}

async function lookBack(userId: string, page: ReviewPageData) {
  const summary = await weeklySummary(userId, {
    periodStart: page.periodStart,
    clock: todayClock(page.timeZone),
    timeZone: page.timeZone,
    weekStart: page.weekStart,
  });
  return <LookBack summary={summary} today={page.today} locale={page.locale} />;
}

async function stepContent(
  userId: string,
  step: ReviewStep,
  page: ReviewPageData,
  review: ReviewDetail,
) {
  switch (step) {
    case "look-back":
      return lookBack(userId, page);
    case "reflect":
      return <ReflectStep review={review} />;
    case "adjust": {
      const data = await getAdjustStep(userId, page);
      const { start, end, days } = data.nextWeek;
      return (
        <AdjustStepView
          data={data}
          labels={{
            week: formatDateSpan(
              { from: start, to: addDays(end, -1) },
              page.locale,
            ),
            days: days.map((day) => ({
              value: day,
              label: formatLocalDate(day, page.locale, "full"),
            })),
          }}
          today={page.today}
          locale={page.locale}
          timeZone={page.timeZone}
        />
      );
    }
    case "priorities":
      return (
        <PrioritiesStep
          review={review}
          options={await getPriorityOptions(userId, page.timeZone)}
        />
      );
  }
}
