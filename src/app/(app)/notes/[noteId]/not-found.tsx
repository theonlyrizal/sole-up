import { NotFoundState } from "@/components/ui/not-found-state";

export default function NoteNotFound() {
  return (
    <div className="px-4 py-10">
      <NotFoundState
        description="This note may have been deleted."
        href="/notes"
        label="Back to Notes"
      />
    </div>
  );
}
