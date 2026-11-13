import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/priorities";
import { cx } from "@/components/ui/cx";

export function PriorityMark({ priority }: { priority: Priority }) {
  const count = PRIORITIES.indexOf(priority) + 1;
  return (
    <span
      role="img"
      aria-label={PRIORITY_LABELS[priority]}
      className="inline-flex items-center gap-1 text-label-small text-on-surface-variant"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-3 items-end gap-0.5 text-secondary-ink"
      >
        {["h-1", "h-2", "h-3"].slice(0, count).map((height) => (
          <span
            key={height}
            className={cx("w-0.5 rounded-full bg-current", height)}
          />
        ))}
      </span>
      <span aria-hidden="true" className="hidden capitalize medium:inline">
        {priority}
      </span>
    </span>
  );
}
