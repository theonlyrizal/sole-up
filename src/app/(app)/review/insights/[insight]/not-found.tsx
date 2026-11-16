import { NotFoundState } from "@/components/ui/not-found-state";

export default function InsightNotFound() {
  return (
    <div className="px-4 py-10">
      <NotFoundState
        description="This insight or its date range is unavailable."
        href="/review/insights"
        label="Back to Insights"
      />
    </div>
  );
}
