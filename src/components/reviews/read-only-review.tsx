import { GOAL_STATUS_LABELS } from "@/lib/goals";
import { TASK_STATUS_LABELS } from "@/lib/task-list";
import type { ReviewDetail } from "@/server/modules/weekly-reviews/queries";

// A review read-only (ADR 0015): its text and priorities as written, and
// the look-back summary as computed now. No adjust actions and no editing.
// Shown for a closed week in the flow, and for any review in its history
// view (chunk 7.4).

const TEXT_SECTIONS = [
  { field: "wins", label: "Wins" },
  { field: "blockers", label: "Blockers" },
  { field: "lessons", label: "Lessons" },
] as const;

export function ReadOnlyReview({
  review,
  lookBack,
}: {
  review: ReviewDetail;
  lookBack: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby="review-look-back"
        className="flex flex-col gap-3"
      >
        <h2 id="review-look-back" className="text-xl font-semibold">
          Look back
        </h2>
        {lookBack}
      </section>

      <section aria-labelledby="review-reflect" className="flex flex-col gap-3">
        <h2 id="review-reflect" className="text-xl font-semibold">
          Reflect
        </h2>
        <dl className="flex flex-col gap-3">
          {TEXT_SECTIONS.map(({ field, label }) => (
            <div key={field} className="flex flex-col gap-1">
              <dt className="text-sm font-medium">{label}</dt>
              <dd className="whitespace-pre-wrap text-muted">
                {review[field] ?? "Nothing written."}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="review-priorities"
        className="flex flex-col gap-3"
      >
        <h2 id="review-priorities" className="text-xl font-semibold">
          Priorities
        </h2>
        {review.priorities.length === 0 ? (
          <p className="text-muted">None chosen.</p>
        ) : (
          <ol
            aria-label="Priorities for next week"
            className="flex list-decimal flex-col gap-1 pl-6"
          >
            {review.priorities.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <span className="font-medium">{item.title}</span>{" "}
                <span className="text-sm text-muted">
                  ({item.kind === "goal" ? "Goal" : "Task"},{" "}
                  {item.kind === "goal"
                    ? GOAL_STATUS_LABELS[item.status].toLowerCase()
                    : TASK_STATUS_LABELS[item.status].toLowerCase()}
                  )
                </span>
              </li>
            ))}
          </ol>
        )}
        {review.prioritiesNote && (
          <p className="whitespace-pre-wrap text-muted">
            {review.prioritiesNote}
          </p>
        )}
      </section>
    </div>
  );
}
