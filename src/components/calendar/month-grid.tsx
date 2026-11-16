"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/icon";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { cx, focusRing } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import {
  addDays,
  dayOfWeek,
  formatLocalDate,
  isLocalDate,
  startOfWeek,
  type LocalDate,
  type WeekStart,
} from "@/lib/dates";
import { monthDays, shiftMonth } from "@/lib/calendar-picker";

export function MonthGrid({
  selected,
  today,
  locale,
  weekStart,
  onSelect,
  min,
  picker = false,
}: {
  selected: LocalDate;
  today: LocalDate;
  locale: string;
  weekStart: WeekStart;
  onSelect: (date: LocalDate) => void;
  min?: LocalDate;
  picker?: boolean;
}) {
  const [active, setActive] = useState(selected);
  const id = useId();
  const activeButton = useRef<HTMLButtonElement>(null);
  const shouldFocus = useRef(true);
  const days = monthDays(active, weekStart);
  const month = active.slice(0, 7);
  const months = [
    ...new Set([-2, -1, 0, 1].map((offset) => shiftMonth(active, offset))),
  ];
  const format = (date: LocalDate, options: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
      ...options,
      ...(picker ? { calendar: "gregory" } : {}),
      timeZone: "UTC",
    });
  const year = Number(active.slice(0, 4));
  const firstYear = Math.max(min ? Number(min.slice(0, 4)) : 1, year - 100);
  const lastYear = Math.min(9999, year + 100);

  useLayoutEffect(() => {
    if (shouldFocus.current) {
      activeButton.current?.focus();
      shouldFocus.current = false;
    }
  }, [active]);

  function moveFocus(
    event: React.KeyboardEvent<HTMLButtonElement>,
    date: LocalDate,
  ) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    let next: LocalDate;
    switch (event.key) {
      case "ArrowLeft":
        next = addDays(date, -1);
        break;
      case "ArrowRight":
        next = addDays(date, 1);
        break;
      case "ArrowUp":
        next = addDays(date, -7);
        break;
      case "ArrowDown":
        next = addDays(date, 7);
        break;
      case "PageUp":
        next = shiftMonth(date, -1);
        break;
      case "PageDown":
        next = shiftMonth(date, 1);
        break;
      case "Home":
        next = startOfWeek(date, weekStart);
        break;
      case "End":
        next = addDays(date, 6 - ((dayOfWeek(date) - weekStart + 7) % 7));
        break;
      default:
        return;
    }
    event.preventDefault();
    if (min && next < min) next = min;
    if (next === active || !isLocalDate(next)) return;
    shouldFocus.current = true;
    setActive(next);
  }

  function browseTo(next: LocalDate) {
    setActive(min && next < min ? min : next);
  }

  return (
    <div className={cx("grid min-w-0 gap-2", picker && "picker-month")}>
      <div className="flex min-w-0 items-center justify-between">
        <div
          className={cx(
            picker && "picker-year relative flex items-center gap-1 rounded-sm",
          )}
        >
          <h3
            id={id}
            aria-live="polite"
            className={picker ? "text-label-large" : "text-title-medium"}
          >
            {format(active, { month: "long", year: "numeric" })}
          </h3>
          {picker && (
            <>
              <Icon name="expand_more" size={16} />
              <select
                aria-label="Choose year"
                className="absolute inset-0 w-full cursor-pointer opacity-0"
                value={year}
                onChange={(event) =>
                  browseTo(
                    shiftMonth(
                      active,
                      (Number(event.target.value) - year) * 12,
                    ),
                  )
                }
              >
                {Array.from(
                  { length: lastYear - firstYear + 1 },
                  (_, index) => {
                    const option = firstYear + index;
                    return (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    );
                  },
                )}
              </select>
            </>
          )}
        </div>
        <div className="flex">
          <IconButton
            icon="chevron_left"
            label="Previous month"
            tooltip={false}
            disabled={Boolean(min && month <= min.slice(0, 7))}
            onClick={() => browseTo(shiftMonth(active, -1))}
          />
          <IconButton
            icon="chevron_right"
            label="Next month"
            tooltip={false}
            onClick={() => browseTo(shiftMonth(active, 1))}
          />
        </div>
      </div>
      {!picker && (
        <ConnectedButtonGroup
          label="Browse months"
          compactLabels
          value={month}
          items={months.map((date) => ({
            value: date.slice(0, 7),
            label: format(date, { month: "short" }),
          }))}
          onValueChange={(value) => {
            const date = months.find((monthDate) =>
              monthDate.startsWith(value),
            );
            if (date) setActive(date);
          }}
        />
      )}
      <div
        className={
          picker ? undefined : "max-w-full overflow-x-auto overscroll-x-contain"
        }
      >
        <div
          role="grid"
          aria-labelledby={id}
          className={cx(
            "calendar-month-grid grid grid-cols-7",
            !picker && "min-w-[21rem]",
          )}
        >
          <div role="row" className="col-span-full grid grid-cols-subgrid">
            {days[0]!.map((date) => (
              <span
                role="columnheader"
                aria-label={format(date, { weekday: "long" })}
                key={date}
                className={
                  picker
                    ? "grid h-12 place-items-center text-body-large"
                    : "py-2 text-center text-label-small text-on-surface-variant"
                }
              >
                {format(date, { weekday: "narrow" })}
              </span>
            ))}
          </div>
          {days.map((week) => (
            <div
              role="row"
              key={week[0]}
              className="col-span-full grid grid-cols-subgrid"
            >
              {week.map((date) => {
                if (!isLocalDate(date) || (picker && !date.startsWith(month)))
                  return <div role="gridcell" key={date} />;
                const current = date === today;
                const chosen = date === selected;
                return (
                  <div
                    role="gridcell"
                    aria-selected={chosen}
                    key={date}
                    className="grid justify-items-center"
                  >
                    <button
                      ref={date === active ? activeButton : undefined}
                      type="button"
                      aria-label={
                        picker
                          ? format(date, { dateStyle: "full" })
                          : formatLocalDate(date, locale, "full")
                      }
                      aria-current={current ? "date" : undefined}
                      disabled={Boolean(min && date < min)}
                      tabIndex={date === active ? 0 : -1}
                      onKeyDown={(event) => moveFocus(event, date)}
                      onClick={() => {
                        if (picker) setActive(date);
                        onSelect(date);
                      }}
                      className={cx(
                        "group grid size-12 place-items-center rounded-full focus-visible:outline-offset-[-2px]",
                        picker && "picker-day w-full disabled:opacity-40",
                        focusRing,
                      )}
                    >
                      <span
                        className={cx(
                          "state-layer grid size-10 place-items-center rounded-full tabular-nums",
                          picker
                            ? "max-w-full text-body-large"
                            : "text-label-large",
                          chosen
                            ? "bg-primary text-on-primary"
                            : "text-on-surface group-hover:bg-surface-container-highest",
                          !chosen && !date.startsWith(month) && "bg-hatch",
                          current &&
                            (picker
                              ? chosen
                                ? ""
                                : "ring-1 ring-primary ring-inset"
                              : chosen
                                ? "ring-2 ring-on-primary ring-inset"
                                : "ring-2 ring-primary ring-inset"),
                        )}
                      >
                        {format(date, { day: "numeric" })}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
