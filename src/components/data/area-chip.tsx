import type { LifeAreaColor } from "@/lib/life-areas";

import { ColorSwatch } from "@/components/life-areas/life-area-colors";
import { Chip } from "@/components/ui/chip";

export type CalendarAreaColors = Record<
  string,
  LifeAreaColor | null | undefined
>;

export function AreaChip({
  name,
  color,
  archived,
}: {
  name: string;
  color: LifeAreaColor;
  archived?: boolean;
}) {
  const palette = {
    backgroundColor: `var(--area-${color}-container)`,
    color: `var(--area-${color}-on)`,
  };

  return (
    <span className="inline-flex max-w-full">
      <span className="relative inline-flex min-w-0 items-center rounded-sm">
        {!archived && (
          <span className="pointer-events-none absolute start-2 flex">
            <ColorSwatch color={color} />
          </span>
        )}
        <Chip
          type="status"
          icon={archived ? "archive" : undefined}
          label={archived ? `${name} (archived)` : name}
          style={palette}
          className={archived ? undefined : "ps-7"}
        />
      </span>
    </span>
  );
}
