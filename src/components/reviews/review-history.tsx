import Link from "next/link";

import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItem } from "@/components/ui/list";
import { addDays, formatLocalDate, localDateOf } from "@/lib/dates";
import type { ReviewHistory } from "@/server/modules/weekly-reviews/queries";

import { reviewWeekLabel, reviewWeekName } from "./review-header";

export function ReviewHistoryList({ history }: { history: ReviewHistory }) {
  const { reviews, locale, timeZone } = history;
  if (reviews.length === 0) {
    return (
      <EmptyState
        title="No reviews yet"
        description="Reviews you start show here."
        action={
          <Link href="/review" className={buttonClass({ variant: "tonal" })}>
            Review a week
          </Link>
        }
      />
    );
  }

  return (
    <ListGroup label="Past reviews">
      {reviews.map((review) => {
        const name = reviewWeekName(history, review.periodStart);
        const status = review.completedAt
          ? `Finished on ${formatLocalDate(localDateOf(review.completedAt, timeZone), locale)}`
          : "Not finished";
        const editable = review.open
          ? `Open until ${formatLocalDate(addDays(review.closesOn, -1), locale)}`
          : `Closed on ${formatLocalDate(review.closesOn, locale)}`;
        return (
          <ListItem
            key={review.id}
            href={`/review/history/${review.id}`}
            headline={`${name ? `${name}: ` : ""}${reviewWeekLabel(review.periodStart, review.periodEnd, locale)}`}
            supporting={
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                <Chip
                  type="status"
                  label={status}
                  icon={review.completedAt ? "check" : undefined}
                />
                <span>{editable}</span>
              </div>
            }
            wrapSupporting
            trailing={<Icon name="chevron_right" size={20} />}
          />
        );
      })}
    </ListGroup>
  );
}
