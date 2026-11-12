import type { CSSProperties } from "react";
import { cx } from "./cx";
import { SHAPES } from "./shapes";

const shapePaths = {
  "--loading-circle": `path("${SHAPES.circle}")`,
  "--loading-sunny": `path("${SHAPES.sunny}")`,
  "--loading-cookie": `path("${SHAPES["cookie-9"]}")`,
  "--loading-pill": `path("${SHAPES.pill}")`,
  "--loading-burst": `path("${SHAPES["soft-burst"]}")`,
} as CSSProperties;

export function LoadingIndicator({
  label = "Loading",
  size = 48,
  contained = false,
  decorative = false,
  className,
}: {
  label?: string;
  size?: 18 | 24 | 38 | 48;
  contained?: boolean;
  decorative?: boolean;
  className?: string;
}) {
  const diameter = contained ? Math.min(size, 38) : size;
  return (
    <span
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "progressbar", "aria-label": label })}
      className={cx(
        "inline-grid shrink-0 place-items-center text-primary",
        contained &&
          "size-12 rounded-full bg-primary-container text-on-primary-container",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 100 100"
        width={diameter}
        height={diameter}
        className="loading-indicator"
        style={shapePaths}
      >
        <rect width="100" height="100" fill="currentColor" />
      </svg>
    </span>
  );
}
