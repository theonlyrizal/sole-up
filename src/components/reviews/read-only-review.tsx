import { Card } from "@/components/ui/card";
import { InlineBanner } from "@/components/ui/inline-banner";
import { ListGroup, ListItem } from "@/components/ui/list";
import { GOAL_STATUS_LABELS } from "@/lib/goals";
import { TASK_STATUS_LABELS } from "@/lib/task-list";
import type { ReviewDetail } from "@/server/modules/weekly-reviews/queries";

const TEXT_SECTIONS = [
  { field: "wins", label: "Wins" },
  { field: "blockers", label: "Blockers" },
  { field: "lessons", label: "Lessons" },
] as const;

export function ReadOnlyReview({
  review,
  lookBack,
  closed,
}: {
  review: ReviewDetail;
  lookBack: React.ReactNode;
  closed: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-8">
      {closed && (
        <InlineBanner tone="info">
          This week has closed, so the review is read-only.
        </InlineBanner>
      )}
      <section aria-labelledby="review-look-back" className="grid gap-3">
        <h2 id="review-look-back" className="text-headline-small">
          Look back
        </h2>
        {lookBack}
      </section>

      <section aria-labelledby="review-reflect" className="grid gap-3">
        <h2 id="review-reflect" className="text-headline-small">
          Reflect
        </h2>
        {TEXT_SECTIONS.map(({ field, label }) => (
          <Card key={field} as="div" className="grid gap-2">
            <h3 className="text-title-medium">{label}</h3>
            <p className="text-body-large wrap-anywhere whitespace-pre-wrap text-on-surface-variant">
              {review[field] ?? "Nothing written."}
            </p>
          </Card>
        ))}
      </section>

      <section aria-labelledby="review-priorities" className="grid gap-3">
        <h2 id="review-priorities" className="text-headline-small">
          Priorities
        </h2>
        {review.priorities.length === 0 ? (
          <p className="text-body-medium text-on-surface-variant">
            None chosen.
          </p>
        ) : (
          <ListGroup as="ol" label="Priorities for next week">
            {review.priorities.map((item, index) => (
              <ListItem
                key={`${item.kind}:${item.id}`}
                leading={
                  <span className="text-label-large text-on-surface-variant tabular-nums">
                    {index + 1}.
                  </span>
                }
                headline={item.title}
                supporting={
                  item.kind === "goal"
                    ? `Goal · ${GOAL_STATUS_LABELS[item.status]}`
                    : `Task · ${TASK_STATUS_LABELS[item.status]}`
                }
              />
            ))}
          </ListGroup>
        )}
        {review.prioritiesNote && (
          <Card as="div" className="grid gap-2">
            <h3 className="text-title-medium">Note</h3>
            <p className="text-body-large wrap-anywhere whitespace-pre-wrap text-on-surface-variant">
              {review.prioritiesNote}
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}
