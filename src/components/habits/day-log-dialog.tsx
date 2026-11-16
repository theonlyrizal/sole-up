"use client";

import {
  useId,
  useOptimistic,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import { ActionConfirmation } from "@/components/ui/action-confirmation";
import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { InlineBanner } from "@/components/ui/inline-banner";
import { NumberStepper } from "@/components/ui/number-stepper";
import { RadioRow } from "@/components/ui/radio-group";
import { HABIT_AMOUNT_MAX, type HabitLogStatus } from "@/lib/habits/habit";
import { formatAmount, type HabitLogValue } from "@/lib/habits/logging";
import type {
  HabitHistoryDay,
  TrackHabit,
} from "@/server/modules/habits/queries";

import { habitDayAppearance } from "./habit-day-appearance";
import { useHabitLog } from "./use-habit-log";

type CellProps = {
  day: HabitHistoryDay;
  layout: "calendar" | "week" | "matrix";
  today: boolean;
  weekday?: string;
};

const dayLabel = (day: HabitHistoryDay) =>
  day.dateLabel + ": " + day.stateLabel;

export function HabitDayCell({ day, layout, today, weekday }: CellProps) {
  return (
    <span
      role="img"
      aria-label={dayLabel(day)}
      aria-current={today ? "date" : undefined}
      title={dayLabel(day)}
      className="habit-day-target"
    >
      <DayFace day={day} layout={layout} weekday={weekday} />
    </span>
  );
}

function DayFace({
  day,
  layout,
  weekday,
  feedback,
}: Pick<CellProps, "day" | "layout" | "weekday"> & {
  feedback?: ReactElement;
}) {
  const { className, glyph } = habitDayAppearance(day);
  return (
    <>
      <span
        aria-hidden="true"
        className={cx("habit-mark", className)}
        style={{ "--day-credit": day.credit } as CSSProperties}
      >
        <span className="habit-mark-fill" />
        {layout === "calendar" && (
          <span className="habit-date-number">{day.dayOfMonth}</span>
        )}
        {glyph && <span className="habit-mark-glyph">{glyph}</span>}
        {feedback}
      </span>
      {layout === "week" && (
        <span aria-hidden="true" className="grid gap-0.5 text-center">
          <span className="text-label-small text-on-surface-variant">
            {weekday}
          </span>
          <span className="text-label-medium tabular-nums">
            {day.dayOfMonth}
          </span>
        </span>
      )}
    </>
  );
}

type Choice = HabitLogStatus | "none";

const choices: [Choice, string][] = [
  ["completed", "Done"],
  ["skipped", "Skip"],
  ["none", "Clear"],
];

export function DayLogDialog({
  day,
  habit,
  locale,
  layout,
  today,
  weekday,
  onRemoved,
}: CellProps & { habit: TrackHabit; locale: string; onRemoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<number>();
  const nextKey = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const { pending, error, setError, write } = useHabitLog();
  const [draft, setDraft] = useOptimistic(day.log);

  const pressed = pending && draft?.status === "completed";
  const confirmed =
    !pending && confirmation !== undefined && day.log?.status === "completed";
  const feedback = (
    <span
      className="habit-day-feedback"
      data-confirmed={confirmed || undefined}
    >
      <ActionConfirmation
        phase={pending ? "pending" : confirmed ? "confirmed" : "idle"}
        confirmationKey={confirmation}
      >
        {null}
      </ActionConfirmation>
    </span>
  );

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setError(null);
          setOpen(next);
        }
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (trigger.current?.isConnected) trigger.current.focus();
        else onRemoved();
      }}
      fitKeyboard
      title={day.dateLabel}
      description={habit.title}
      trigger={
        <button
          ref={trigger}
          type="button"
          aria-label={dayLabel(day)}
          aria-current={today ? "date" : undefined}
          aria-busy={pending || undefined}
          aria-disabled={pending || undefined}
          title={dayLabel(day)}
          data-pending-completion={pressed || undefined}
          className="habit-day-target habit-day-button state-layer"
        >
          <DayFace
            day={day}
            layout={layout}
            weekday={weekday}
            feedback={feedback}
          />
        </button>
      }
    >
      <DayLogForm
        habit={habit}
        day={day}
        locale={locale}
        pending={pending}
        error={error}
        onCancel={() => setOpen(false)}
        onInvalid={setError}
        onSubmit={(log) => {
          setConfirmation(undefined);
          write(
            { habitId: habit.id, localDate: day.date, log },
            {
              title: log ? "Day saved" : "Log removed",
              description: day.dateLabel,
              onOptimistic: () => setDraft(log),
              onSaved: (result, changed) => {
                if (
                  changed &&
                  !result.previous &&
                  result.log?.status === "completed"
                ) {
                  setConfirmation(++nextKey.current);
                }
                setOpen(false);
              },
              onUndoStart: () => setConfirmation(undefined),
            },
          );
        }}
      />
    </ResponsiveSheet>
  );
}

function DayLogForm({
  habit,
  day,
  locale,
  pending,
  error,
  onInvalid,
  onCancel,
  onSubmit,
}: {
  habit: TrackHabit;
  day: HabitHistoryDay;
  locale: string;
  pending: boolean;
  error: string | null;
  onInvalid: (message: string) => void;
  onCancel: () => void;
  onSubmit: (log: HabitLogValue | null) => void;
}) {
  const id = useId();
  const quantity = habit.measure === "quantity";
  const [choice, setChoice] = useState<Choice>(
    day.active ? (day.log?.status ?? "completed") : "none",
  );
  const [amount, setAmount] = useState(() =>
    String(day.log?.value ?? day.target ?? ""),
  );
  const target =
    day.target === null || !habit.unit
      ? null
      : formatAmount(day.target, habit.unit, locale);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (choice === "none") {
      onSubmit(null);
      return;
    }

    const value = choice === "completed" && quantity ? Number(amount) : null;
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      onInvalid("Enter an amount above 0, or choose Skip or Clear.");
      return;
    }
    onSubmit({ status: choice, value });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Day log"
      aria-busy={pending || undefined}
      className="grid min-w-0 gap-4"
    >
      <p className="text-body-medium text-on-surface-variant">
        {day.stateLabel}
      </p>
      {!day.active && (
        <p className="text-body-medium text-on-surface-variant">
          This day is paused or outside the habit&apos;s dates. Its log is kept
          unless you clear it.
        </p>
      )}
      <fieldset disabled={pending} className="min-w-0">
        <legend className="sr-only">This day</legend>
        {choices
          .filter(([value]) => day.active || value === "none")
          .map(([value, label]) => (
            <RadioRow
              native
              key={value}
              name={id + "-choice"}
              value={value}
              label={label}
              checked={choice === value}
              onChange={() => setChoice(value)}
            />
          ))}
      </fieldset>
      {quantity && choice === "completed" && (
        <div className="grid justify-items-start gap-2">
          <NumberStepper
            id={id}
            name="value"
            label={`Amount (${habit.unit})`}
            min={0.01}
            max={HABIT_AMOUNT_MAX}
            value={amount}
            onValueChange={setAmount}
            readOnly={pending}
            aria-invalid={error ? true : undefined}
          />
          {day.target !== null && target && (
            <Button
              variant="tonal"
              disabled={pending}
              onClick={() => setAmount(String(day.target))}
            >
              Full target ({target})
            </Button>
          )}
        </div>
      )}
      {error && <InlineBanner tone="error">{error}</InlineBanner>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="text" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" pending={pending}>
          {error ? "Retry" : "Save"}
        </Button>
      </div>
    </form>
  );
}
