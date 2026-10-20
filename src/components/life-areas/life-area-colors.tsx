import { cx } from "@/components/ui/cx";
import type { LifeAreaColor } from "@/lib/life-areas";

// Literal class names, so Tailwind generates them.
const swatchClasses: Record<LifeAreaColor, string> = {
  gray: "bg-gray-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-400",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
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
