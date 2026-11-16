import { NotFoundState } from "@/components/ui/not-found-state";

export default function GoalNotFound() {
  return (
    <div className="px-4 py-10">
      <NotFoundState
        description="This goal may have been deleted."
        href="/goals"
        label="Back to Goals"
      />
    </div>
  );
}
