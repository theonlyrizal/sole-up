"use client";

import { useId, useRef, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  PickerActions,
  PickerDialog,
  PickerTitle,
} from "@/components/ui/picker-dialog";
import {
  isLocalDate,
  todayFor,
  type LocalDate,
  type WeekStart,
} from "@/lib/dates";
import { MonthGrid } from "./month-grid";

type DateSelectionProps = {
  trigger: React.ReactElement;
  value: string;
  timeZone: string;
  locale: string;
  weekStart?: WeekStart;
  min?: LocalDate;
  onChange: (value: LocalDate) => void;
  onClear?: () => void;
};

export function DateSelectionDialog({ trigger, ...props }: DateSelectionProps) {
  return (
    <PickerDialog trigger={trigger} className="date-selection-dialog">
      <DateSelection {...props} />
    </PickerDialog>
  );
}

function DateSelection({
  value,
  timeZone,
  locale,
  weekStart = 0,
  min,
  onChange,
  onClear,
}: Omit<DateSelectionProps, "trigger">) {
  const inputId = useId();
  const confirm = useRef<HTMLButtonElement>(null);
  const [today] = useState(() => todayFor(timeZone));
  const initial = isLocalDate(value) ? value : today;
  const firstDay = min && initial < min ? min : initial;
  const [date, setDate] = useState(firstDay);
  const [typing, setTyping] = useState(false);
  const valid = isLocalDate(date) && (!min || date >= min);
  const headline = valid
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        calendar: "gregory",
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00Z`))
    : "Enter a date";
  return (
    <>
      <header className="picker-date-header">
        <PickerTitle className="text-label-large text-on-surface-variant">
          {typing ? "Enter date" : "Select date"}
        </PickerTitle>
        <div className="flex min-h-12 items-center justify-between gap-2">
          <div className="text-headline-large wrap-anywhere">{headline}</div>
          <IconButton
            icon={typing ? "calendar_month" : "edit"}
            label={typing ? "Use calendar" : "Enter date with keyboard"}
            tooltip={false}
            onClick={() => {
              if (typing && !valid) setDate(firstDay);
              setTyping(!typing);
            }}
          />
        </div>
      </header>
      {typing ? (
        <div className="px-6 pt-4">
          <FormField
            id={inputId}
            label="Date"
            hint={
              min ? `Use YYYY-MM-DD, on or after ${min}.` : "Use YYYY-MM-DD."
            }
          >
            {(control) => (
              <Input
                {...control}
                autoFocus
                type="text"
                autoComplete="off"
                maxLength={10}
                placeholder="YYYY-MM-DD"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirm.current?.click();
                  }
                }}
              />
            )}
          </FormField>
        </div>
      ) : (
        <MonthGrid
          picker
          selected={valid ? date : firstDay}
          today={today}
          locale={locale}
          weekStart={weekStart}
          min={min}
          onSelect={setDate}
        />
      )}
      <PickerActions
        confirmRef={confirm}
        disabled={!valid}
        onClear={onClear}
        onConfirm={() => onChange(date)}
      />
    </>
  );
}
