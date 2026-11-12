import { Icon, type IconName } from "@/components/icons/icon";
import { cx } from "./cx";
import { SHAPES } from "./shapes";

type StateArt = {
  icon: IconName;
  shape?: "soft-burst" | "arch";
  tone?: "neutral" | "error";
};

type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  /** A next step, such as a "New goal" button. */
  action?: React.ReactNode;
  /** Heading level, so the state fits the page outline. Defaults to 2. */
  headingLevel?: 1 | 2 | 3 | 4;
  art?: StateArt;
  compact?: boolean;
};

/** Shown when a list or page has nothing in it yet. */
export function EmptyState({
  title,
  description,
  action,
  headingLevel = 2,
  art,
  compact = false,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      className={cx(
        "items-center gap-3 wrap-anywhere",
        compact
          ? "flex flex-wrap p-4"
          : "grid justify-items-center p-6 text-center",
      )}
    >
      {art && (
        <span
          aria-hidden="true"
          className={cx(
            "relative grid shrink-0 place-items-center",
            compact ? "size-12" : "size-24",
            art.tone === "error"
              ? "text-on-error-container"
              : "text-on-secondary-container",
          )}
        >
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 size-full"
            focusable="false"
          >
            <path
              d={SHAPES[art.shape ?? "soft-burst"]}
              className={
                art.tone === "error"
                  ? "fill-error-container"
                  : "fill-secondary-container"
              }
            />
          </svg>
          <Icon name={art.icon} size={compact ? 24 : 40} className="relative" />
        </span>
      )}
      <div className={cx("grid gap-1", compact && "min-w-36 flex-1")}>
        <Heading className={compact ? "text-title-medium" : "text-title-large"}>
          {title}
        </Heading>
        {description && (
          <div className="max-w-prose text-body-medium text-on-surface-variant">
            {description}
          </div>
        )}
      </div>
      {action && (
        <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
}
