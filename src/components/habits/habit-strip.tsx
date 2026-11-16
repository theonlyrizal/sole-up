"use client";

import { useRef } from "react";
import type { LocalDate, WeekStart } from "@/lib/dates";
import { WEEKDAY_NAMES, weekdaysFrom } from "@/lib/habits/habit-form";
import type { TrackRange } from "@/lib/habits/track-range";
import type { TrackHabit } from "@/server/modules/habits/queries";
import { Disclosure } from "@/components/ui/disclosure";
import { cx, focusRing } from "@/components/ui/cx";

import { DayLogDialog, HabitDayCell } from "./day-log-dialog";
import { habitDayLegend } from "./habit-day-appearance";
import "./habit-history.css";

export function HabitStripLegend({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Disclosure
      id="track-legend"
      title="Legend"
      open={open}
      onOpenChange={onOpenChange}
    >
      <ul
        aria-label="What the days show"
        className="flex flex-wrap gap-x-4 gap-y-2 pb-2 text-body-small text-on-surface-variant"
      >
        {habitDayLegend.map(({ className, glyph, label }) => (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cx("habit-mark habit-legend-mark", className)}
            >
              {glyph}
            </span>
            {label}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

type HistoryProps = {
  habit: TrackHabit;
  weekStart: WeekStart;
  today: LocalDate;
  locale: string;
};

export function HabitStrip({
  range,
  ...props
}: HistoryProps & { range: TrackRange }) {
  if (range === "week") return <HabitWeekChart {...props} />;
  if (range === "12w") return <DotMatrix {...props} />;
  return <HabitHistoryGrid {...props} layout="calendar" />;
}

function HabitWeekChart(props: HistoryProps) {
  return <HabitHistoryGrid {...props} layout="week" />;
}

function DotMatrix(props: HistoryProps) {
  return <HabitHistoryGrid {...props} layout="matrix" />;
}

function HabitHistoryGrid({
  habit,
  weekStart,
  today,
  locale,
  layout,
}: HistoryProps & { layout: "calendar" | "week" | "matrix" }) {
  const grid = useRef<HTMLDivElement>(null);
  const weekdays = weekdaysFrom(weekStart);
  const weekly = layout === "week";
  return (
    <div className="habit-history" data-layout={layout}>
      <div
        ref={grid}
        role="group"
        aria-label={habit.title + " history"}
        tabIndex={0}
        className={cx("habit-history-scroll", focusRing)}
        onFocus={({ target, currentTarget }) => {
          if (!target.matches(".habit-day-button")) return;
          const viewport = currentTarget.getBoundingClientRect();
          const cell = target.getBoundingClientRect();
          if (cell.right > viewport.right) {
            currentTarget.scrollLeft += cell.right - viewport.right;
          } else if (cell.left < viewport.left) {
            currentTarget.scrollLeft += cell.left - viewport.left;
          }
        }}
      >
        <div className="habit-history-grid">
          {!weekly && (
            <div
              className="habit-history-weekdays grid grid-cols-7 text-center text-label-small text-on-surface-variant"
              aria-hidden="true"
            >
              {weekdays.map((weekday) => (
                <span key={weekday}>
                  {WEEKDAY_NAMES[weekday]![0].slice(0, 1)}
                </span>
              ))}
            </div>
          )}
          {habit.history.weeks.map((week) => (
            <div key={week.from} className="habit-history-row">
              {!weekly && (
                <span
                  className="habit-history-row-label text-label-small text-on-surface-variant"
                  aria-hidden="true"
                >
                  {week.shortLabel}
                </span>
              )}
              <ol
                aria-label={habit.title + ": " + week.label}
                className="habit-history-days grid grid-cols-7"
              >
                {week.days.map((day, index) => {
                  const weekday = weekly
                    ? WEEKDAY_NAMES[weekdays[index]!]![0]
                    : undefined;
                  const cell = {
                    day,
                    layout,
                    today: day.date === today,
                    weekday,
                  };
                  return (
                    <li key={day.date}>
                      {day.loggable ? (
                        <DayLogDialog
                          {...cell}
                          habit={habit}
                          locale={locale}
                          onRemoved={() => grid.current?.focus()}
                        />
                      ) : (
                        <HabitDayCell {...cell} />
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </div>
      <p className="habit-history-overflow text-label-small text-on-surface-variant">
        Scroll to see more days
      </p>
    </div>
  );
}
