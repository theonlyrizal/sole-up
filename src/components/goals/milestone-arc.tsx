import { useId } from "react";

import { cx } from "@/components/ui/cx";
import {
  milestoneProgressLabel,
  type MilestoneProgress,
} from "@/lib/milestones";

import "./milestone-arc.css";

export type MilestoneArcChange = {
  revision: number;
  before: MilestoneProgress;
  after: MilestoneProgress;
};

const RADIUS = 84;
const MAX_SEGMENTS = 12;

function point(angle: number) {
  const radians = (angle * Math.PI) / 180;
  // Browser and server trig can differ by a few floating-point bits.
  return `${(100 - RADIUS * Math.cos(radians)).toFixed(3)} ${(98 - RADIUS * Math.sin(radians)).toFixed(3)}`;
}

function arcPath(start: number, end: number) {
  return `M ${point(start)} A ${RADIUS} ${RADIUS} 0 0 1 ${point(end)}`;
}

export function MilestoneArc({
  progress,
  size = "full",
  change,
  onChangeAnimationEnd,
}: {
  progress: MilestoneProgress | null;
  size?: "mini" | "full";
  change?: MilestoneArcChange;
  onChangeAnimationEnd?: () => void;
}) {
  const hatchId = useId();
  const label = milestoneProgressLabel(progress);
  if (!progress || !label) return null;

  const { completed, countable } = progress;
  const mini = size === "mini";
  const continuous = countable > MAX_SEGMENTS;
  const step = 180 / countable;
  // Make room for both round caps and the gap as the diagram gets denser.
  const strokeWidth = continuous
    ? 28
    : Math.min(28, (RADIUS * Math.PI * step) / 250);
  const capAngle = (Math.asin(strokeWidth / (2 * RADIUS)) * 180) / Math.PI;
  const inset = capAngle + Math.min(3, step / 10);
  const segments = continuous
    ? [{ start: 0, end: 180 }]
    : Array.from({ length: countable }, (_, index) => ({
        start: step * index + (index === 0 ? 0 : inset),
        end: step * (index + 1) - (index === countable - 1 ? 0 : inset),
      }));
  const previous =
    !mini &&
    change?.after.completed === completed &&
    change.before.countable === countable &&
    change.after.countable === countable
      ? change.before.completed
      : completed;
  const changedIndex = Math.min(previous, completed);
  const fillEnd = (180 * completed) / countable;
  const previousEnd = (180 * previous) / countable;
  const drawing = (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 112"
      className="block w-full overflow-visible"
      fill="none"
      strokeLinecap="round"
      strokeWidth={strokeWidth.toFixed(3)}
    >
      {!mini && (
        <defs>
          <pattern
            id={hatchId}
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <path
              d="M 0 0 V 6"
              className="stroke-outline"
              strokeWidth="2"
              strokeLinecap="butt"
            />
          </pattern>
        </defs>
      )}
      {segments.map(({ start, end }, index) => (
        <path
          key={index}
          data-milestone-segment=""
          d={arcPath(start, end)}
          className={
            !continuous && index < completed
              ? "stroke-primary"
              : "stroke-progress-track"
          }
        />
      ))}
      {!mini &&
        segments.map(
          ({ start, end }, index) =>
            (continuous ? completed < countable : index >= completed) && (
              <path
                key={index}
                d={arcPath(continuous ? fillEnd : start, end)}
                stroke={`url(#${hatchId})`}
                className="milestone-arc-hatch"
              />
            ),
        )}
      {continuous && completed > 0 && (
        <path d={arcPath(0, fillEnd)} className="stroke-primary" />
      )}
      {previous !== completed && (
        <path
          key={change?.revision}
          data-milestone-motion=""
          onAnimationEnd={onChangeAnimationEnd}
          d={
            continuous
              ? arcPath(
                  Math.min(fillEnd, previousEnd),
                  Math.max(fillEnd, previousEnd),
                )
              : arcPath(
                  segments[changedIndex]!.start,
                  segments[changedIndex]!.end,
                )
          }
          className={cx(
            "milestone-arc-change",
            previous < completed ? "stroke-progress-track" : "stroke-primary",
          )}
        />
      )}
    </svg>
  );

  if (mini) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-small text-on-surface-variant">
        <span className="w-18 shrink-0">{drawing}</span>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`${label} completed`}
      className="milestone-arc relative mx-auto w-full max-w-50 expanded:max-w-60"
    >
      {drawing}
      <div
        aria-hidden="true"
        className="relative -mt-[28%] grid justify-items-center px-[14%] pb-1 text-center wrap-anywhere"
      >
        <span className="text-headline-small leading-tight font-semibold tabular-nums large:text-display-small">
          {completed} of {countable}
        </span>
        <span className="text-body-medium leading-tight text-on-surface-variant">
          {countable === 1 ? "milestone" : "milestones"}
        </span>
      </div>
    </div>
  );
}
