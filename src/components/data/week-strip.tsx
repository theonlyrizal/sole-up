"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { cx, filledFocusRing, focusRing } from "@/components/ui/cx";
import type { LocalDate } from "@/lib/dates";
import type { WeekStripDay } from "@/lib/week-strip";

function revealDay(strip: HTMLElement, day: HTMLElement) {
  const viewport = strip.getBoundingClientRect();
  const item = day.getBoundingClientRect();
  const inset = 4; // Leave room for the focus outline.
  const left = item.left - viewport.left - inset;
  const right = item.right - viewport.right + inset;
  if (left < 0 || right > 0) {
    strip.scrollBy({ left: left < 0 ? left : right, behavior: "instant" });
  }
}

export function WeekStrip({
  days,
  today,
  selected,
}: {
  days: WeekStripDay[];
  today: LocalDate;
  selected?: LocalDate;
}) {
  const strip = useRef<HTMLUListElement>(null);
  const active = useRef<HTMLAnchorElement>(null);
  const activeDate = selected ?? today;

  useLayoutEffect(() => {
    if (strip.current && active.current)
      revealDay(strip.current, active.current);
  }, [activeDate]);

  return (
    <nav aria-label="This week" className="min-w-0">
      <ul
        ref={strip}
        className="flex min-w-0 gap-0.5 overflow-x-auto p-1 medium:gap-2"
      >
        {days.map((day) => {
          const current = day.date === today;
          return (
            <li key={day.date} className="shrink-0">
              <Link
                ref={day.date === activeDate ? active : undefined}
                href={day.href}
                aria-label={day.fullLabel}
                aria-current={current ? "date" : undefined}
                onFocus={(event) => {
                  if (strip.current)
                    revealDay(strip.current, event.currentTarget);
                }}
                className={cx(
                  "state-layer flex h-19 w-12 flex-col items-center justify-center gap-1 rounded-4xl shadow-card focus-visible:outline-offset-1 medium:h-21 medium:w-14",
                  current
                    ? "bg-primary text-on-primary"
                    : "bg-resting-surface text-on-resting-surface",
                  !current &&
                    day.date === selected &&
                    "ring-2 ring-primary ring-inset",
                  current ? filledFocusRing : focusRing,
                )}
              >
                <span className="text-label-small">{day.weekdayLetter}</span>
                <span
                  className={cx(
                    "grid size-9 place-items-center rounded-full text-title-medium tabular-nums",
                    current && "bg-resting-surface text-on-resting-surface",
                  )}
                >
                  {day.dayOfMonth}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
