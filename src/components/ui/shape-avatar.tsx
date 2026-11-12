import { entityIdentity } from "@/lib/identity";
import type { LifeAreaColor } from "@/lib/life-areas";
import { cx } from "./cx";
import { SHAPES, type ShapeName } from "./shapes";

type ShapeAvatarProps = {
  id: string;
  entityType: "user" | "goal" | "habit";
  label: string;
  size?: 32 | 40 | 48 | 56 | 72;
  area?: LifeAreaColor | null;
  shape?: ShapeName;
};

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

export function ShapeAvatar({
  id,
  entityType,
  label,
  size = 48,
  area,
  shape,
}: ShapeAvatarProps) {
  const identity = entityIdentity(entityType, id);
  const palette = area ?? identity.palette;
  const user = entityType === "user";
  const initial = graphemes
    .segment(label)
    [Symbol.iterator]()
    .next()
    .value?.segment.toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative inline-grid shrink-0 place-items-center",
        size <= 40
          ? "text-title-medium-emphasized"
          : "text-title-large-emphasized",
      )}
      style={{
        width: size,
        height: size,
        color: user
          ? "var(--md-on-primary-container)"
          : `var(--area-${palette}-on)`,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        focusable="false"
        className="absolute inset-0"
      >
        <path
          d={SHAPES[shape ?? (user ? "cookie-9" : identity.shape)]}
          fill={
            user
              ? "var(--md-primary-container)"
              : `var(--area-${palette}-container)`
          }
        />
      </svg>
      <span className="relative">{initial}</span>
    </span>
  );
}
