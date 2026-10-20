import { cx } from "./cx";

/**
 * A placeholder block shown while content loads. Decorative: label the
 * surrounding region for screen readers (see `LoadingState`).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** A labelled loading region with a few skeleton lines. */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-4 w-full max-w-sm" />
    </div>
  );
}
