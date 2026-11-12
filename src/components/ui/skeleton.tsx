import { cx } from "./cx";
import { LoadingIndicator } from "./loading-indicator";

const shapes = {
  card: "rounded-2xl",
  "list-item": "rounded-lg",
  text: "rounded-md",
  circle: "rounded-full",
};

/**
 * A placeholder block shown while content loads. Decorative: label the
 * surrounding region for screen readers (see `LoadingState`).
 */
export function Skeleton({
  className,
  shape = "text",
}: {
  className?: string;
  shape?: keyof typeof shapes;
}) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "skeleton bg-surface-container-high",
        shapes[shape],
        className,
      )}
    />
  );
}

/** A labelled loading region for content without a dedicated skeleton. */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      className="grid justify-items-center gap-3 py-6 text-body-medium text-on-surface-variant"
    >
      <LoadingIndicator decorative />
      <span>{label}…</span>
    </div>
  );
}
