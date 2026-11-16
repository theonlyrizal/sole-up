import { ReviewNavigation } from "@/components/reviews/review-navigation";
import { NotFoundState } from "@/components/ui/not-found-state";

export default function ReviewNotFound() {
  return (
    <div className="grid gap-4 px-4 py-6">
      <ReviewNavigation current="history" />
      <NotFoundState
        description="This review may have been deleted."
        href="/review/history"
        label="Back to past reviews"
      />
    </div>
  );
}
