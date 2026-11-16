import { ReviewNavigation } from "@/components/reviews/review-navigation";
import { NotFoundState } from "@/components/ui/not-found-state";

export default function InsightNotFound() {
  return (
    <div className="grid gap-4 px-4 py-6">
      <ReviewNavigation current="insights" />
      <NotFoundState
        description="This insight or its date range is unavailable."
        href="/review/insights"
        label="Back to Insights"
      />
    </div>
  );
}
