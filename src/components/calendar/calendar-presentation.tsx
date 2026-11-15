"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "@/components/icons/icon";
import { startOfLocalDay, type LocalDate } from "@/lib/dates";
import type { LifeAreaColor } from "@/lib/life-areas";
import type { TimeBlockStatus } from "@/lib/time-blocks";

export function areaItemStyle(color: LifeAreaColor) {
  return {
    backgroundColor: `var(--area-${color}-container)`,
    color: `var(--area-${color}-on)`,
    borderInlineStartColor: `var(--area-${color}-dot)`,
  } satisfies CSSProperties;
}

export function BlockStatusIcon({ status }: { status: TimeBlockStatus }) {
  return (
    <Icon
      name={
        status === "done"
          ? "check_circle"
          : status === "skipped"
            ? "block"
            : "schedule"
      }
      size={14}
      className="shrink-0"
    />
  );
}

export function useNowOffset(
  start: LocalDate,
  end: LocalDate,
  timeZone: string,
) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const startAt = startOfLocalDay(start, timeZone).getTime();
  const endAt = startOfLocalDay(end, timeZone).getTime();
  return now >= startAt && now < endAt
    ? (now - startAt) / (endAt - startAt)
    : null;
}
