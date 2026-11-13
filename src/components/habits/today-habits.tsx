"use client";

import { useId, useOptimistic, useRef, useState } from "react";

import { Icon } from "@/components/icons/icon";
import { ActionConfirmation } from "@/components/ui/action-confirmation";
import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { ListGroup, ListItem } from "@/components/ui/list";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
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

export function TodayHabits({
  data,
  locale,
}: {
  data: TodayHabitsData;
  locale: string;
}) {
  const heading = useId();
  if (!data.hasActiveHabits && data.habits.length === 0) return null;
  return (
    <Card headingId={heading} className="grid gap-2">
      <h2 id={heading} className="text-title-medium">
        Habits
      </h2>
      {data.habits.length === 0 ? (
        <p className="text-body-medium text-on-surface-variant">
          No habits are due today.
        </p>
      ) : (
        <ListGroup
          label="Habits"
          className="@container gap-0 divide-y divide-outline-variant"
        >
          {data.habits.map((habit) => (
            <TodayHabitRow key={habit.id} habit={habit} locale={locale} />
          ))}
        </ListGroup>
      )}
    </Card>
  );
}

function TodayHabitRow({
  habit,
  locale,
}: {
  habit: TodayHabit;
  locale: string;
}) {
  const { pending, error, setError, write } = useHabitLog();
  const [editing, setEditing] = useState(false);
  const [confirmationKey, setConfirmationKey] = useState<number>();
  const nextKey = useRef(0);
  const overflow = useRef<HTMLButtonElement>(null);
  const openAmount = useRef(false);
  const quantity = habit.measure === "quantity";
  const log = habit.log;
  const [draftLog, setDraftLog] = useOptimistic(log);
  const logged = log?.status === "completed";
  const partial =
    quantity &&
    logged &&
    (habit.target === null || log.value === null || log.value < habit.target);
  const savedText = log ? describeLog(log, habit, habit.target, locale) : null;

  function save(next: HabitLogValue | null, title: string) {
    write(
      { habitId: habit.id, localDate: "today", log: next },
      {
        title,
        onOptimistic: () => {
          setDraftLog(next);
          setConfirmationKey(undefined);
        },
        onSaved: (result, changed) => {
          if (result.log?.status === "completed" && changed) {
            setConfirmationKey(++nextKey.current);
          }
          setEditing(false);
        },
        onUndoStart: () => setConfirmationKey(undefined),
      },
    );
  }

  const amountText = (value: number) =>
    habit.unit ? formatAmount(value, habit.unit, locale) : String(value);
  const markDone = () => {
    if (logged || pending) return;
    save(
      { status: "completed", value: quantity ? habit.target : null },
      quantity && habit.target !== null
        ? `Logged ${amountText(habit.target)}`
        : "Marked done",
    );
  };
  const skip = () =>
    save({ status: "skipped", value: null }, "Skipped for today");
  const clear = () => save(null, "Log cleared");
  const phase = pending
    ? "pending"
    : error
      ? "error"
      : logged
        ? "confirmed"
        : "idle";

  return (
    <>
      <ListItem
        className="today-habit-row"
        leading={
          <ShapeAvatar
            entityType="habit"
            id={habit.id}
            label={habit.title}
            size={40}
          />
        }
        headline={habit.title}
        wrapSupporting
        supporting={
          <div className="grid gap-0.5 pb-1">
            <span>
              {[habit.scheduleLabel, habit.progressLabel]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {savedText && (quantity || !logged || pending) && (
              <span className="text-label-medium">{savedText}</span>
            )}
            {error && !editing && <span role="alert">{error}</span>}
            {pending && !editing && (
              <span role="status" className="sr-only">
                {draftLog?.value != null
                  ? `Saving ${amountText(draftLog.value)}…`
                  : "Saving…"}
              </span>
            )}
          </div>
        }
        trailing={
          <div className="flex items-center">
            <button
              type="button"
              aria-label={
                logged
                  ? `Logged: ${habit.title}, ${savedText}`
                  : `Done: ${habit.title}`
              }
              aria-busy={pending || undefined}
              aria-disabled={pending || logged || undefined}
              tabIndex={logged && !pending ? -1 : undefined}
              onClick={markDone}
              className={buttonClass({
                variant: logged || pending ? "text" : "tonal",
                size: "xs",
                className: cx(
                  "habit-done",
                  logged && "habit-logged",
                  pending && "habit-pending",
                ),
              })}
            >
              <ActionConfirmation
                phase={phase}
                confirmationKey={confirmationKey}
                confirmedIcon={partial ? "edit" : "check"}
              >
                <Icon name="check" size={20} />
              </ActionConfirmation>
              <span aria-hidden="true" className="inline-grid">
                <span className="invisible col-start-1 row-start-1">
                  Saving…
                </span>
                <span className="col-start-1 row-start-1">
                  {pending
                    ? "Saving…"
                    : logged
                      ? quantity
                        ? "Logged"
                        : "Done"
                      : "Done"}
                </span>
              </span>
            </button>
            <Menu>
              <MenuTrigger asChild>
                <IconButton
                  ref={overflow}
                  icon="more_vert"
                  label={`Actions for ${habit.title}`}
                  tooltip={false}
                />
              </MenuTrigger>
              <MenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (!openAmount.current) return;
                  openAmount.current = false;
                  event.preventDefault();
                  overflow.current?.focus({ preventScroll: true });
                  setError(null);
                  setEditing(true);
                }}
              >
                {log?.status !== "skipped" && (
                  <MenuItem disabled={pending} onSelect={skip}>
                    Skip
                  </MenuItem>
                )}
                {quantity && (
                  <MenuItem
                    disabled={pending}
                    icon="edit"
                    onSelect={() => {
                      openAmount.current = true;
                    }}
                  >
                    Change amount
                  </MenuItem>
                )}
                {log && (
                  <MenuItem disabled={pending} icon="remove" onSelect={clear}>
                    Clear
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          </div>
        }
      />
      {editing && (
        <ResponsiveSheet
          open
          onOpenChange={(open) => {
            if (!open && !pending) setEditing(false);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            overflow.current?.focus({ preventScroll: true });
          }}
          title="Change amount"
          description={habit.title}
        >
          <AmountForm
            habit={habit}
            initial={logged ? log.value : habit.target}
            pending={pending}
            saveError={error}
            onSubmit={(value) =>
              save(
                { status: "completed", value },
                `Logged ${amountText(value)}`,
              )
            }
            onCancel={() => setEditing(false)}
          />
        </ResponsiveSheet>
      )}
    </>
  );
}

function AmountForm({
  habit,
  initial,
  pending,
  saveError,
  onSubmit,
  onCancel,
}: {
  habit: TodayHabit;
  initial: number | null;
  pending: boolean;
  saveError: string | null;
  onSubmit: (value: number) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState(initial === null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);
  const problem = error ?? saveError;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
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
      aria-busy={pending || undefined}
      className="today-quiet-form grid min-w-0 gap-3"
    >
      <FormField id={id} label={`Amount today (${habit.unit})`}>
        {(control) => (
          <Input
            {...control}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${id}-error` : undefined}
            name="value"
            inputMode="decimal"
            value={amount}
            readOnly={pending}
            autoFocus
            onChange={(event) => setAmount(event.target.value)}
          />
        )}
      </FormField>
      {problem && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-body-medium text-on-surface-variant"
        >
          {problem}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="text" size="xs" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="xs" aria-disabled={pending || undefined}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
