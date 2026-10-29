import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { addDays, formatLocalDate, localDateOf } from "@/lib/dates";
import type { ReviewHistory } from "@/server/modules/weekly-reviews/queries";

import { reviewWeekLabel } from "./review-header";

// Past reviews (chunk 7.4), newest first. Each names its week, whether it
// was finished, and until when it can change or when it closed. Weeks
// without a review aren't listed or counted (ADR 0015).

export function ReviewHistoryList({ history }: { history: ReviewHistory }) {
  const { reviews, locale, timeZone } = history;
  if (reviews.length === 0) {
    return (
      <EmptyState
        title="No reviews yet"
        description="Reviews you start are kept here, newest first."
        action={
          <Link
            href="/review"
            className={buttonClass({ variant: "secondary" })}
          >
            Review a week
          </Link>
        }
      />
    );
  }

  return (
    <ul
      aria-label="Past reviews"
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
    >
      {reviews.map((review) => {
        const name =
          review.periodStart === history.thisWeek
            ? "This week: "
            : review.periodStart === history.lastWeek
              ? "Last week: "
              : "";
        const status = review.completedAt
          ? `Finished on ${formatLocalDate(localDateOf(review.completedAt, timeZone), locale)}`
          : "Not finished";
        const editable = review.open
          ? `Open until ${formatLocalDate(addDays(review.closesOn, -1), locale)}`
          : `Closed on ${formatLocalDate(review.closesOn, locale)}`;
        return (
          <li key={review.id} className="flex flex-col gap-1 p-4">
            <h2 className="font-medium">
              <Link
                href={`/review/history/${review.id}`}
                className={cx("rounded-sm hover:underline", focusRing)}
              >
                {name}
                {reviewWeekLabel(review.periodStart, review.periodEnd, locale)}
              </Link>
            </h2>
            <p className="text-sm text-muted">
              {status} · {editable}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
