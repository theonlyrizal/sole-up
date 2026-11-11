import { cx } from "@/components/ui/cx";
import type { LifeAreaColor } from "@/lib/life-areas";

// Literal class names, so Tailwind generates them.
const swatchClasses: Record<LifeAreaColor, string> = {
  gray: "bg-area-gray-dot",
  red: "bg-area-red-dot",
  orange: "bg-area-orange-dot",
  amber: "bg-area-amber-dot",
  green: "bg-area-green-dot",
  teal: "bg-area-teal-dot",
  blue: "bg-area-blue-dot",
  violet: "bg-area-violet-dot",
  pink: "bg-area-pink-dot",
};

export function colorLabel(color: LifeAreaColor) {
  return color[0]!.toUpperCase() + color.slice(1);
}

/** A small dot in the area's color. Decorative: the name carries meaning. */
export function ColorSwatch({ color }: { color: LifeAreaColor | null }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "size-3 shrink-0 rounded-full",
        color ? swatchClasses[color] : "border border-border",
      )}
    />
  );
}
