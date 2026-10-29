import Link from "next/link";

import { cx, focusRing } from "@/components/ui/cx";
import {
  addDays,
  formatLocalDate,
  localDateOf,
  type LocalDate,
} from "@/lib/dates";
import { formatDateSpan } from "@/lib/habits/track-range";
import { reviewHref } from "@/lib/review-flow";
import type { ReviewPage } from "@/server/modules/weekly-reviews/queries";

/** "This week", "Last week", or nothing for an older week. */
function weekName(page: ReviewPage, week: LocalDate): string | null {
  if (week === page.thisWeek) return "This week";
  if (week === page.lastWeek) return "Last week";
  return null;
}

/** The reviewed week's days, such as "19 – 25 Oct 2026". */
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

/**
 * Which week is being reviewed, whether its review is finished, until when
 * it can be changed, and a link to the other open week.
 */
export function ReviewHeader({ page }: { page: ReviewPage }) {
  const { review, locale } = page;
  const name = weekName(page, page.periodStart);
  const lastOpenDay = review ? addDays(review.closesOn, -1) : null;
  const status = review?.completedAt
    ? `Finished on ${formatLocalDate(localDateOf(review.completedAt, page.timeZone), locale)}`
    : "Not finished";
  return (
    <section
      aria-label="Reviewed week"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
    >
      <p className="text-lg font-semibold">
        {name && <>{name}: </>}
        {reviewWeekLabel(page.periodStart, page.periodEnd, locale)}
      </p>
      {review && (
        <p className="text-sm text-muted">
          {status}
          {" · "}
          {page.open && lastOpenDay
            ? `You can change it until ${formatLocalDate(lastOpenDay, locale)}.`
            : `Closed on ${formatLocalDate(review.closesOn, locale)}; it can't be changed.`}
        </p>
      )}
      {page.otherWeek && (
        <Link
          href={reviewHref(page.otherWeek)}
          className={cx(
            "self-start rounded-sm text-sm font-medium underline underline-offset-2",
            focusRing,
          )}
        >
          Review {weekName(page, page.otherWeek)?.toLowerCase()} instead (
          {reviewWeekLabel(page.otherWeek, addDays(page.otherWeek, 7), locale)})
        </Link>
      )}
    </section>
  );
}
