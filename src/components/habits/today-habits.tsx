"use client";

import { useEffect, useId, useOptimistic, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  describeLog,
  formatAmount,
  type HabitLogValue,
} from "@/lib/habits/logging";
import type {
  TodayHabit,
  TodayHabits as TodayHabitsData,
} from "@/server/modules/habits/queries";

import { useHabitLog } from "./use-habit-log";

/**
 * Today's Habits section (chunk 6.4): the habits that are due today, plus
 * any already logged, each done or skipped in one tap with Undo in the
 * toast. A quantity habit's Done logs its full target; "Change amount"
 * takes another. Shown once the user has an active habit.
 */
export function TodayHabits({
  data,
  locale,
}: {
  data: TodayHabitsData;
  locale: string;
}) {
  const headingId = useId();
  if (!data.hasActiveHabits && data.habits.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold">
          Habits
        </h2>
        <p className="text-sm text-muted">
          One tap each. Past days can be changed on Track.
        </p>
      </div>
      {data.habits.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          No habits are due today.
        </p>
      ) : (
        <ul
          aria-label="Habits"
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {data.habits.map((habit) => (
            <TodayHabitRow key={habit.id} habit={habit} locale={locale} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TodayHabitRow({
  habit,
  locale,
}: {
  habit: TodayHabit;
  locale: string;
}) {
  const { pending, error, write } = useHabitLog();
  // The row follows the tap at once, not after the refresh.
  const [log, setLog] = useOptimistic(habit.log);
  const [editingAmount, setEditingAmount] = useState(false);
  const amountButton = useRef<HTMLButtonElement>(null);
  const refocusAmountButton = useRef(false);
  const quantity = habit.measure === "quantity";

  // The form unmounts; put focus back where it came from once the button
  // is enabled again (it is disabled while a save is pending).
  useEffect(() => {
    if (pending || editingAmount || !refocusAmountButton.current) return;
    refocusAmountButton.current = false;
    amountButton.current?.focus();
  }, [pending, editingAmount]);

  function save(next: HabitLogValue | null, title: string) {
    write(
      { habitId: habit.id, localDate: "today", log: next },
      { title, onOptimistic: () => setLog(next), onSaved: closeAmount },
    );
  }

  function closeAmount() {
    if (!editingAmount) return;
    refocusAmountButton.current = true;
    setEditingAmount(false);
  }

  const amountText = (value: number) =>
    habit.unit ? formatAmount(value, habit.unit, locale) : String(value);
  const markDone = () =>
    save(
      { status: "completed", value: quantity ? habit.target : null },
      quantity && habit.target !== null
        ? `Logged ${amountText(habit.target)}`
        : "Marked done",
    );
  const skip = () =>
    save({ status: "skipped", value: null }, "Skipped for today");
  const clear = () => save(null, "Log cleared");

  return (
    <li className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium break-words">{habit.title}</span>
          <p className="text-sm text-muted">
            {[habit.scheduleLabel, habit.progressLabel]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {log && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-sm">
            {describeLog(log, habit, habit.target, locale)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {log?.status !== "completed" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            aria-label={`Done: ${habit.title}`}
            onClick={markDone}
          >
            Done
          </Button>
        )}
        {log?.status !== "skipped" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            aria-label={`Skip: ${habit.title}`}
            onClick={skip}
          >
            Skip
          </Button>
        )}
        {quantity && (
          <Button
            ref={amountButton}
            variant="secondary"
            size="sm"
            disabled={pending}
            aria-expanded={editingAmount}
            aria-label={`Change amount: ${habit.title}`}
            onClick={() =>
              editingAmount ? closeAmount() : setEditingAmount(true)
            }
          >
            Change amount
          </Button>
        )}
        {log && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`Clear: ${habit.title}`}
            onClick={clear}
          >
            Clear
          </Button>
        )}
      </div>
      <p role="alert" className="text-sm text-danger empty:hidden">
        {error}
      </p>
      {editingAmount && (
        <AmountForm
          habit={habit}
          initial={
            log?.status === "completed" ? log.value : (habit.target ?? null)
          }
          pending={pending}
          onSubmit={(value) =>
            save({ status: "completed", value }, `Logged ${amountText(value)}`)
          }
          onCancel={closeAmount}
        />
      )}
    </li>
  );
}

/** Today's amount for a quantity habit. Escape cancels. */
function AmountForm({
  habit,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  habit: TodayHabit;
  initial: number | null;
  pending: boolean;
  onSubmit: (value: number) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState(initial === null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount.trim());
    if (amount.trim() === "" || !Number.isFinite(value) || value <= 0) {
      setError("Enter an amount above 0. To log nothing, skip or clear.");
      return;
    }
    setError(null);
    onSubmit(value);
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`Amount today: ${habit.title}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
      className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-muted p-3"
    >
      <FormField
        id={`${id}-amount`}
        label={`Amount today (${habit.unit})`}
        errors={error ? [error] : undefined}
      >
        {(control) => (
          <Input
            {...control}
            name="value"
            inputMode="decimal"
            className="w-32 py-1.5 text-sm"
            value={amount}
            autoFocus
            onChange={(event) => setAmount(event.target.value)}
          />
        )}
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
