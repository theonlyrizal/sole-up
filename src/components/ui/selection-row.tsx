import { cx } from "./cx";

type SelectionRowProps = {
  id: string;
  label: string;
  description?: string;
  leading?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** The label covers the row. The control remains its own native focus target. */
export function SelectionRow({
  id,
  label,
  description,
  leading,
  className,
  children,
}: SelectionRowProps) {
  return (
    <div
      className={cx(
        "selection-row relative min-w-0",
        leading && "selection-leading",
        className,
      )}
    >
      <label
        htmlFor={id}
        className="selection-label flex min-h-12 cursor-pointer flex-col justify-center py-1"
      >
        <span id={`${id}-label`} className="text-title-medium wrap-anywhere">
          {label}
        </span>
        {description && (
          <span
            id={`${id}-description`}
            className="text-body-medium wrap-anywhere text-on-surface-variant"
          >
            {description}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
