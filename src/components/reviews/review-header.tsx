import Link from "next/link";

import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  addDays,
  formatLocalDate,
  localDateOf,
  type LocalDate,
} from "@/lib/dates";
import { formatDateSpan } from "@/lib/habits/track-range";
import { reviewHref } from "@/lib/review-flow";
import type { ReviewPage } from "@/server/modules/weekly-reviews/queries";

export function reviewWeekName(
  page: Pick<ReviewPage, "thisWeek" | "lastWeek">,
  week: LocalDate,
) {
  if (week === page.thisWeek) return "This week";
  if (week === page.lastWeek) return "Last week";
  return null;
}

export function reviewWeekLabel(
  periodStart: LocalDate,
  periodEnd: LocalDate,
  locale: string,
): string {
  return formatDateSpan(
    { from: periodStart, to: addDays(periodEnd, -1) },
    locale,
  );
}

export function ReviewHeader({
  page,
  actions,
}: {
  page: ReviewPage;
  actions?: React.ReactNode;
}) {
  const { review, locale } = page;
  const name = reviewWeekName(page, page.periodStart);
  return (
    <Card headingId="reviewed-week" padding="l" className="grid gap-4">
      <span id="reviewed-week" className="sr-only">
        Reviewed week
      </span>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="grid min-w-0 flex-1 gap-2">
          {name && (
            <p className="text-label-large text-on-surface-variant">{name}</p>
          )}
          <h2 className="text-headline-small wrap-anywhere medium:text-headline-medium">
            {reviewWeekLabel(page.periodStart, page.periodEnd, locale)}
          </h2>
        </div>
        {actions}
      </div>
      {review && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Chip
            type="status"
            label={
              review.completedAt
                ? `Finished on ${formatLocalDate(localDateOf(review.completedAt, page.timeZone), locale)}`
                : "Not finished"
            }
            tone={review.completedAt ? "success" : "neutral"}
            icon={review.completedAt ? "check" : undefined}
          />
          <p className="text-body-medium text-on-surface-variant">
            {page.open
              ? `Open until ${formatLocalDate(addDays(review.closesOn, -1), locale)}`
              : `Closed on ${formatLocalDate(review.closesOn, locale)}`}
          </p>
        </div>
      )}
      {page.otherWeek && (
        <Link
          href={reviewHref(page.otherWeek)}
          className={buttonClass({
            variant: "text",
            className: "-ms-3 w-fit max-w-full gap-1 text-start",
          })}
        >
          <span className="min-w-0 wrap-anywhere">
            Review {reviewWeekName(page, page.otherWeek)?.toLowerCase()} instead
          </span>
          <Icon name="chevron_right" size={20} className="shrink-0" />
        </Link>
      )}
    </Card>
  );
}
