import { Icon } from "@/components/icons/icon";
import { Button } from "./button";
import { LoadingIndicator } from "./loading-indicator";

export function SaveStatus({
  phase,
  onRetry,
}: {
  phase: "saving" | "saved" | "error";
  onRetry?: () => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="inline-flex min-h-8 items-center gap-2 rounded-full bg-surface-container px-3 py-1 text-label-medium text-on-surface"
      >
        {phase === "saving" && (
          <>
            <LoadingIndicator decorative size={18} />
            Saving…
          </>
        )}
        {phase === "saved" && (
          <>
            <Icon name="check" size={18} className="text-success" />
            Saved
          </>
        )}
        {phase === "error" && (
          <>
            <Icon name="error" size={18} className="text-error" />
            Not saved
          </>
        )}
      </span>
      {phase === "error" && onRetry && (
        <Button variant="text" size="xs" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
