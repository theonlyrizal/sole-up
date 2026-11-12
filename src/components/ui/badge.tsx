import { cx } from "./cx";

export function Badge({ count, label }: { count?: number; label?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded-full bg-primary text-on-primary",
        count === undefined
          ? "size-1.5"
          : "min-h-4 min-w-4 px-1 text-label-small",
      )}
    >
      {label && <span className="sr-only">{label}</span>}
      {count !== undefined && (
        <span aria-hidden={label ? true : undefined}>{count}</span>
      )}
    </span>
  );
}
