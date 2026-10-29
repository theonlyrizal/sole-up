"use client";

import { useId, useState } from "react";

import { ChoiceGroup, Radio } from "@/components/calendar/choices";
import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { WeekStart } from "@/lib/dates";
import type { HabitDayState } from "@/lib/habits/consistency";
import type { HabitLogStatus } from "@/lib/habits/habit";
import { WEEKDAY_NAMES, weekdaysFrom } from "@/lib/habits/habit-form";
import { formatAmount, type HabitLogValue } from "@/lib/habits/logging";
import type {
  HabitHistoryDay,
  TrackHabit,
} from "@/server/modules/habits/queries";

import { useHabitLog } from "./use-habit-log";

/**
 * A habit's last two weeks, one row per week (chunk 6.4), with the figure
 * for them and how it is counted. Each day up to today that counts, or
 * that has a log, opens a dialog to log, correct or clear it. "Missed" is
 * neutral: a dashed outline, never a warning colour.
 */
export function HabitStrip({
  habit,
  weekStart,
  locale,
}: {
  habit: TrackHabit;
  weekStart: WeekStart;
  locale: string;
}) {
  const { history } = habit;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <p>
          <span className="text-muted">Last 2 weeks: </span>
          {history.figure}
        </p>
        {history.progressLabel && (
          <p>
            <span className="text-muted">This week: </span>
            {history.progressLabel}
          </p>
        )}
      </div>
      <details className="text-sm">
        <summary className={cx("w-fit cursor-pointer rounded-sm", focusRing)}>
          How this is counted
        </summary>
        <p className="mt-1 text-muted">{history.definition}</p>
      </details>
      <div className="flex w-full max-w-sm flex-col gap-1">
        <div aria-hidden="true" className="grid grid-cols-7 gap-1">
          {weekdaysFrom(weekStart).map((day) => (
            <span key={day} className="text-center text-xs text-muted">
              {WEEKDAY_NAMES[day]![0]}
            </span>
          ))}
        </div>
        {history.weeks.map((week) => (
          <ol
            key={week.from}
            aria-label={`${habit.title}: ${week.label}`}
            className="grid grid-cols-7 gap-1"
          >
            {week.days.map((day) => (
              <li key={day.date}>
                {day.loggable ? (
                  <DayLogDialog habit={habit} day={day} locale={locale} />
                ) : (
                  <span
                    role="img"
                    aria-label={`${day.dateLabel}: ${day.stateLabel}`}
                    title={day.stateLabel}
                    className={dayClass(day)}
                  >
                    <DayFace day={day} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        ))}
      </div>
    </div>
  );
}

/** What the strip's marks mean, shown once above the habits. */
export function HabitStripLegend() {
  const items: [HabitDayState, number, string][] = [
    ["completed", 1, "Done"],
    ["completed", 0.5, "Partly done"],
    ["skipped", 0, "Skipped"],
    ["missed", 0, "Missed"],
    ["extra", 0, "Extra, not counted"],
    ["inactive", 0, "Not active"],
  ];
  return (
    <ul
      aria-label="What the days show"
      className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted"
    >
      {items.map(([state, credit, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cx(dayClass({ state, credit }), "size-6 text-xs")}
          >
            {MARKS[state] && <span>{markOf({ state, credit })}</span>}
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}

const MARKS: Partial<Record<HabitDayState, string>> = {
  completed: "✓",
  skipped: "–",
  extra: "+",
};

function markOf(day: Pick<HabitHistoryDay, "state" | "credit">) {
  if (day.state === "completed" && day.credit < 1) return "◐";
  return MARKS[day.state] ?? null;
}

/** The day's number and its mark (not read out: the label says it). */
function DayFace({ day }: { day: HabitHistoryDay }) {
  const mark = markOf(day);
  return (
    <>
      <span aria-hidden="true" className="leading-none">
        {day.dayOfMonth}
      </span>
      {mark && (
        <span aria-hidden="true" className="text-xs leading-none">
          {mark}
        </span>
      )}
    </>
  );
}

/** Shape first, colour second: every state differs without colour too. */
function dayClass(day: Pick<HabitHistoryDay, "state" | "credit">) {
  const base =
    "flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-md text-sm tabular-nums";
  switch (day.state) {
    case "completed":
      return cx(
        base,
        day.credit >= 1
          ? "bg-accent text-accent-fg"
          : "border-2 border-accent bg-surface text-fg",
      );
    case "extra":
      return cx(base, "border border-accent bg-surface text-fg");
    case "skipped":
      return cx(base, "border border-border bg-surface-muted text-fg");
    case "missed":
      return cx(base, "border border-dashed border-muted bg-surface text-fg");
    case "unlogged":
      return cx(base, "border border-border bg-surface text-fg");
    case "today":
      return cx(base, "border-2 border-fg bg-surface text-fg");
    case "inactive":
      return cx(base, "bg-surface-muted text-muted line-through");
    case "not_scheduled":
    case "future":
      return cx(base, "text-muted");
  }
}

type Choice = HabitLogStatus | "none";

/** One day of the strip as a button, and the dialog it opens. */
function DayLogDialog({
  habit,
  day,
  locale,
}: {
  habit: TrackHabit;
  day: HabitHistoryDay;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`${day.dateLabel}: ${day.stateLabel}`}
          title={day.stateLabel}
          className={cx(dayClass(day), focusRing)}
        >
          <DayFace day={day} />
        </button>
      </DialogTrigger>
      <DialogContent title={day.dateLabel} description={habit.title}>
        <DayLogForm
          habit={habit}
          day={day}
          locale={locale}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function DayLogForm({
  habit,
  day,
  locale,
  onDone,
}: {
  habit: TrackHabit;
  day: HabitHistoryDay;
  locale: string;
  onDone: () => void;
}) {
  const id = useId();
  const { pending, error, setError, write } = useHabitLog();
  const quantity = habit.measure === "quantity";
  const [choice, setChoice] = useState<Choice>(
    day.active ? (day.log?.status ?? "completed") : "none",
  );
  const [amount, setAmount] = useState(() => {
    const value = day.log?.value ?? day.target;
    return value === null ? "" : String(value);
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let next: HabitLogValue | null = null;
    if (choice !== "none") {
      let value: number | null = null;
      if (choice === "completed" && quantity) {
        value = Number(amount.trim());
        if (amount.trim() === "" || !Number.isFinite(value) || value <= 0) {
          setError("Enter an amount above 0, or choose skipped or no log.");
          return;
        }
      }
      next = { status: choice, value };
    }
    write(
      { habitId: habit.id, localDate: day.date, log: next },
      {
        title: next ? "Day saved" : "Log removed",
        description: day.dateLabel,
        onSaved: onDone,
      },
    );
  }

  const choices: [Choice, string][] = day.active
    ? [
        ["completed", "Done"],
        ["skipped", "Skipped"],
        ["none", "No log"],
      ]
    : [["none", "No log"]];

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {!day.active && (
        <p className="text-sm text-muted">
          This day no longer counts: it&apos;s paused or outside the
          habit&apos;s dates. Its log is kept unless you remove it.
        </p>
      )}
      <ChoiceGroup id={`${id}-status`} legend="This day">
        {choices.map(([value, label]) => (
          <Radio
            key={value}
            name={`${id}-status`}
            value={value}
            checked={choice === value}
            onChange={() => setChoice(value)}
            label={label}
            description={
              value === "skipped" ? (
                <p className="text-sm text-muted">
                  A deliberate &quot;not this time&quot;. Not counted as missed.
                </p>
              ) : undefined
            }
          />
        ))}
      </ChoiceGroup>
      {quantity && choice === "completed" && (
        <FormField
          id={`${id}-amount`}
          label={`Amount (${habit.unit})`}
          hint={
            day.target !== null && habit.unit
              ? `The target is ${formatAmount(day.target, habit.unit, locale)}.`
              : undefined
          }
        >
          {(control) => (
            <Input
              {...control}
              name="value"
              inputMode="decimal"
              className="w-32"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
        </FormField>
      )}
      <p role="alert" className="text-sm text-danger empty:hidden">
        {error}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
