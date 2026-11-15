"use client";

import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef, useState } from "react";

import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
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

export function DatePicker({
  label,
  shortLabel,
  selected,
  today,
  locale,
  weekStart,
  href,
}: {
  label: string;
  shortLabel: string;
  selected: LocalDate;
  today: LocalDate;
  locale: string;
  weekStart: WeekStart;
  href: (date: LocalDate) => string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <ResponsiveSheet
      title="Go to date"
      anchor={
        <Button
          variant="text"
          size="xs"
          trailingIcon="expand_more"
          className="text-title-medium"
          aria-label={`Go to date, ${shortLabel}`}
          title={label}
        >
          {shortLabel}
        </Button>
      }
      open={open}
      onOpenChange={setOpen}
    >
      {open && (
        <MonthGrid
          selected={selected}
          today={today}
          locale={locale}
          weekStart={weekStart}
          onSelect={(date) => {
            setOpen(false);
            router.push(href(date));
          }}
        />
      )}
    </ResponsiveSheet>
  );
}

function MonthGrid({
  selected,
  today,
  locale,
  weekStart,
  onSelect,
}: {
  selected: LocalDate;
  today: LocalDate;
  locale: string;
  weekStart: WeekStart;
  onSelect: (date: LocalDate) => void;
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
      timeZone: "UTC",
    });

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
    if (next === active || !isLocalDate(next)) return;
    shouldFocus.current = true;
    setActive(next);
  }

  function changeMonth(offset: number) {
    const next = shiftMonth(active, offset);
    if (next !== active) setActive(next);
  }

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 id={id} aria-live="polite" className="text-title-medium">
          {format(active, { month: "long", year: "numeric" })}
        </h3>
        <div className="flex">
          <IconButton
            icon="chevron_left"
            label="Previous month"
            tooltip={false}
            onClick={() => changeMonth(-1)}
          />
          <IconButton
            icon="chevron_right"
            label="Next month"
            tooltip={false}
            onClick={() => changeMonth(1)}
          />
        </div>
      </div>
      <ConnectedButtonGroup
        label="Browse months"
        compactLabels
        value={month}
        items={months.map((date) => ({
          value: date.slice(0, 7),
          label: format(date, { month: "short" }),
        }))}
        onValueChange={(value) => {
          const date = months.find((monthDate) => monthDate.startsWith(value));
          if (date) setActive(date);
        }}
      />
      <div className="max-w-full overflow-x-auto overscroll-x-contain">
        <div
          role="grid"
          aria-labelledby={id}
          className="calendar-month-grid grid min-w-[21rem] grid-cols-7"
        >
          <div role="row" className="col-span-full grid grid-cols-subgrid">
            {days[0]!.map((date) => (
              <span
                role="columnheader"
                aria-label={format(date, { weekday: "long" })}
                key={date}
                className="py-2 text-center text-label-small text-on-surface-variant"
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
                if (!isLocalDate(date))
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
                      aria-label={formatLocalDate(date, locale, "full")}
                      aria-current={current ? "date" : undefined}
                      tabIndex={date === active ? 0 : -1}
                      onKeyDown={(event) => moveFocus(event, date)}
                      onClick={() => onSelect(date)}
                      className={cx(
                        "group grid size-12 place-items-center rounded-full focus-visible:outline-offset-[-2px]",
                        focusRing,
                      )}
                    >
                      <span
                        className={cx(
                          "state-layer grid size-10 place-items-center rounded-full text-label-large tabular-nums",
                          chosen
                            ? "bg-primary text-on-primary"
                            : "text-on-surface group-hover:bg-surface-container-highest",
                          !chosen && !date.startsWith(month) && "bg-hatch",
                          current &&
                            (chosen
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
