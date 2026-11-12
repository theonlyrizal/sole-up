import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "./cx";

export function ListGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={cx("grid min-w-0 gap-0.5", className)}>
      {children}
    </ul>
  );
}

export function ListItem({
  leading,
  headline,
  supporting,
  meta,
  trailing,
  href,
  onClick,
  selected,
  lines = supporting ? 2 : 1,
}: {
  leading?: ReactNode;
  headline: string;
  supporting?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  selected?: boolean;
  lines?: 1 | 2 | 3;
}) {
  return (
    <li
      className={cx(
        "segmented-list-row relative flex min-w-0 items-center gap-4 px-4 py-1 wrap-anywhere",
        selected
          ? "rounded-full bg-secondary-container text-on-secondary-container"
          : "rounded-xs bg-resting-surface text-on-resting-surface first:rounded-t-lg last:rounded-b-lg",
        lines === 1 ? "min-h-14" : lines === 2 ? "min-h-18" : "min-h-22",
        Boolean(href || onClick) && "list-interactive state-layer",
      )}
    >
      {leading && <div className="relative z-10 shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className={selected ? "text-title-medium" : "text-body-large"}>
          {href ? (
            <Link
              className="stretched-link"
              href={href}
              aria-current={selected ? "page" : undefined}
            >
              {headline}
            </Link>
          ) : onClick ? (
            <button
              type="button"
              className="stretched-link cursor-pointer text-start"
              onClick={onClick}
              aria-pressed={selected}
            >
              {headline}
            </button>
          ) : (
            headline
          )}
        </div>
        {supporting && (
          <div
            className={cx(
              "line-clamp-2 text-body-medium",
              !selected && "text-on-surface-variant",
            )}
          >
            {supporting}
          </div>
        )}
      </div>
      {meta && (
        <div
          className={cx(
            "max-w-1/3 text-label-medium",
            !selected && "text-on-surface-variant",
          )}
        >
          {meta}
        </div>
      )}
      {trailing && <div className="relative z-10 shrink-0">{trailing}</div>}
    </li>
  );
}
