import { NotFoundState } from "@/components/ui/not-found-state";

export default function ReviewNotFound() {
  return (
    <div className="px-4 py-10">
      <NotFoundState
        description="This review may have been deleted."
        href="/review/history"
        label="Back to past reviews"
      />
    </div>
  );
}
