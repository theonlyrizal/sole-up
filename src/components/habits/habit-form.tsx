"use client";

import { useId, useState, useTransition } from "react";

import { PickerField } from "@/components/calendar/picker-field";
import { Button } from "@/components/ui/button";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { FormDialog } from "@/components/ui/form-dialog";
import { InlineBanner } from "@/components/ui/inline-banner";
import { NumberStepper } from "@/components/ui/number-stepper";
import { RadioRow } from "@/components/ui/radio-group";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { LocalDate, WeekStart } from "@/lib/dates";
import { GOAL_STATUS_LABELS } from "@/lib/goals";
import {
  HABIT_AMOUNT_MAX,
  HABIT_DESCRIPTION_MAX,
  HABIT_TIMES_PER_WEEK_MAX,
  HABIT_TIMES_PER_WEEK_MIN,
  HABIT_TITLE_MAX,
  HABIT_UNIT_MAX,
  type HabitCadenceType,
  type HabitMeasure,
} from "@/lib/habits/habit";
import {
  cadenceInput,
  isEveryDay,
  pickerValueOf,
  WEEKDAY_NAMES,
  weekdaysFrom,
  type CadencePickerValue,
} from "@/lib/habits/habit-form";
import type { ActionError, FieldErrors } from "@/lib/result";
import { createHabit, editHabit } from "@/server/modules/habits/actions";
import type {
  HabitGoalOption,
  HabitListItem,
} from "@/server/modules/habits/queries";

/** What the form needs from the page, besides the habit itself. */
export type HabitFormContext = {
  goals: HabitGoalOption[];
  today: LocalDate;
  weekStart: WeekStart;
  /** Where a schedule edit takes effect, for the note in edit mode. */
  thisWeekStartLabel: string;
};

const CADENCE_LABELS: Record<HabitCadenceType, string> = {
  daily: "Every day",
  weekly_days: "On chosen days",
  times_per_week: "A number of times a week",
};

const measures = [
  { value: "check", label: "Check" },
  { value: "quantity", label: "Quantity" },
];

export function HabitFormDialog({
  trigger,
  habit,
  context,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
}: {
  trigger?: React.ReactElement;
  habit?: HabitListItem;
  context: HabitFormContext;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const id = useId();
  const [title, setTitle] = useState(habit?.title ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [measure, setMeasure] = useState<HabitMeasure>(
    habit?.measure ?? "check",
  );
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [target, setTarget] = useState(
    habit?.schedule.target === null || habit?.schedule.target === undefined
      ? ""
      : String(habit.schedule.target),
  );
  const [cadence, setCadence] = useState<CadencePickerValue>(
    habit
      ? pickerValueOf(habit.schedule)
      : { cadenceType: "daily", days: [], timesPerWeek: "3" },
  );
  const [startDate, setStartDate] = useState(habit?.startDate ?? context.today);
  const [endDate, setEndDate] = useState(habit?.endDate ?? "");
  const [goalId, setGoalId] = useState(habit?.goalId ?? "");
  const [error, setError] = useState<ActionError | null>(null);
  const [transportError, setTransportError] = useState(false);
  const [pending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setTitle(habit?.title ?? "");
      setDescription(habit?.description ?? "");
      setMeasure(habit?.measure ?? "check");
      setUnit(habit?.unit ?? "");
      setTarget(String(habit?.schedule.target ?? ""));
      setCadence(
        habit
          ? pickerValueOf(habit.schedule)
          : { cadenceType: "daily", days: [], timesPerWeek: "3" },
      );
      setStartDate(habit?.startDate ?? context.today);
      setEndDate(habit?.endDate ?? "");
      setGoalId(habit?.goalId ?? "");
      setError(null);
      setTransportError(false);
    }
  }

  // Active and paused goals, plus the habit's own goal whatever its status,
  // so editing never silently unlinks it.
  const goalOptions = context.goals.filter(
    (goal) =>
      goal.status === "active" ||
      goal.status === "paused" ||
      goal.id === habit?.goalId,
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setTransportError(false);
    startTransition(async () => {
      const isQuantity = (habit?.measure ?? measure) === "quantity";
      const fields = {
        title,
        description,
        startDate,
        endDate,
        goalId: goalId || null,
        target: isQuantity ? target : null,
        ...cadenceInput(cadence),
      };
      try {
        const result = habit
          ? await editHabit({ id: habit.id, ...fields })
          : await createHabit({
              ...fields,
              measure,
              unit: isQuantity ? unit : null,
            });
        if (result.ok) {
          toast({
            title: habit ? "Habit saved" : "Habit added",
            variant: "success",
          });
          setOpen(false);
        } else {
          setError(result.error);
        }
      } catch {
        setTransportError(true);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  const isQuantity = (habit?.measure ?? measure) === "quantity";
  const unitLabel = habit?.unit ?? unit.trim();
  return (
    <FormDialog
      title={habit ? "Edit habit" : "New habit"}
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      pending={pending}
      formId={id}
      submitLabel={habit ? "Save" : "Add habit"}
    >
      <form
        id={id}
        onSubmit={submit}
        noValidate
        aria-label={habit ? `Edit ${habit.title}` : "New habit"}
        className="flex flex-col gap-4"
      >
        <FormField id={`${id}-title`} label="Title" errors={fieldErrors.title}>
          {(control) => (
            <Input
              {...control}
              name="title"
              value={title}
              maxLength={HABIT_TITLE_MAX}
              autoComplete="off"
              autoFocus
              placeholder="e.g. Stretch in the morning"
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </FormField>

        {habit ? (
          <p className="text-sm text-muted">
            {habit.measure === "quantity"
              ? `Measured as an amount, in ${habit.unit}.`
              : "Measured as done or not."}{" "}
            The measure and unit can&apos;t be changed.
          </p>
        ) : (
          <div className="grid justify-items-start gap-1">
            <ConnectedButtonGroup
              label="How is it measured?"
              items={measures}
              value={measure}
              onValueChange={(value) => setMeasure(value as HabitMeasure)}
              compactLabels
            />
            <p className="text-body-small text-on-surface-variant">
              This can&apos;t be changed later.
            </p>
            {fieldErrors.measure?.map((message) => (
              <p key={message} className="text-body-small text-error">
                {message}
              </p>
            ))}
          </div>
        )}

        {isQuantity && (
          <div className="grid gap-4">
            {!habit && (
              <FormField
                id={`${id}-unit`}
                label="Unit"
                hint="Such as glasses, min or km."
                errors={fieldErrors.unit}
              >
                {(control) => (
                  <Input
                    {...control}
                    name="unit"
                    value={unit}
                    maxLength={HABIT_UNIT_MAX}
                    autoComplete="off"
                    onChange={(event) => setUnit(event.target.value)}
                  />
                )}
              </FormField>
            )}
            <NumberStepper
              id={`${id}-target`}
              label={
                unitLabel ? `Target per day (${unitLabel})` : "Target per day"
              }
              name="target"
              min={0.01}
              max={HABIT_AMOUNT_MAX}
              value={target}
              onValueChange={setTarget}
              errors={fieldErrors.target}
            />
          </div>
        )}

        <CadencePicker
          id={`${id}-cadence`}
          value={cadence}
          onChange={setCadence}
          weekStart={context.weekStart}
          errors={fieldErrors}
        />
        {habit && (
          <InlineBanner tone="info">
            Changes to how often or the target apply from the start of this
            week, {context.thisWeekStartLabel}. Earlier weeks keep their
            schedule.
          </InlineBanner>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <PickerField
            id={`${id}-start`}
            label="Start date"
            type="date"
            value={startDate}
            name="startDate"
            errors={fieldErrors.startDate}
            onChange={setStartDate}
          />
          <PickerField
            id={`${id}-end`}
            label="End date"
            type="date"
            value={endDate}
            name="endDate"
            hint="Optional. The last day it counts."
            errors={fieldErrors.endDate}
            min={startDate || undefined}
            clearable
            onChange={setEndDate}
          />
        </div>

        <FormField
          id={`${id}-goal`}
          label="Goal"
          hint="Optional. The goal this habit supports."
          errors={fieldErrors.goalId}
        >
          {(control) => (
            <Select
              {...control}
              name="goalId"
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
            >
              <option value="">No goal</option>
              {goalOptions.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.status === "active"
                    ? goal.title
                    : `${goal.title} (${GOAL_STATUS_LABELS[goal.status].toLowerCase()})`}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField
          id={`${id}-description`}
          label="Notes"
          hint="Optional. What it involves, or why you want it."
          errors={fieldErrors.description}
        >
          {(control) => (
            <Textarea
              {...control}
              name="description"
              rows={2}
              value={description}
              maxLength={HABIT_DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </FormField>

        <FormError error={error} />
        {transportError && (
          <InlineBanner tone="error">
            Couldn&apos;t save the habit. Try again.
          </InlineBanner>
        )}
      </form>
    </FormDialog>
  );
}

type CadencePickerProps = {
  id: string;
  value: CadencePickerValue;
  onChange: (next: CadencePickerValue) => void;
  weekStart: WeekStart;
  /** The form's field errors; the cadence's are picked out here. */
  errors: FieldErrors;
};

/**
 * Daily, chosen weekdays (in the user's week order) or N times a week.
 * Choosing all seven weekdays saves as daily. Native controls only.
 */
function CadencePicker({
  id,
  value,
  onChange,
  weekStart,
  errors,
}: CadencePickerProps) {
  const set = (patch: Partial<CadencePickerValue>) =>
    onChange({ ...value, ...patch });
  const cadenceErrors = [
    ...(errors.cadenceType ?? []),
    ...(errors.cadenceConfig ?? []),
  ];

  const cadenceErrorId = cadenceErrors.length ? `${id}-errors` : undefined;
  const dayErrors = errors["cadenceConfig.days"];
  const dayErrorId = dayErrors?.length ? `${id}-day-errors` : undefined;

  return (
    <div className="grid min-w-0 gap-2">
      <fieldset className="min-w-0" aria-describedby={cadenceErrorId}>
        <legend className="text-title-small">How often</legend>
        {(Object.keys(CADENCE_LABELS) as HabitCadenceType[]).map((type) => (
          <RadioRow
            native
            key={type}
            name={id}
            value={type}
            label={CADENCE_LABELS[type]}
            checked={value.cadenceType === type}
            onChange={() => set({ cadenceType: type })}
          />
        ))}
      </fieldset>
      {cadenceErrorId && (
        <p id={cadenceErrorId} className="text-body-small text-error">
          {cadenceErrors.join(" ")}
        </p>
      )}
      {value.cadenceType === "weekly_days" && (
        <fieldset className="grid min-w-0 gap-2" aria-describedby={dayErrorId}>
          <legend className="text-label-large">On these days</legend>
          <div className="flex flex-wrap gap-1">
            {weekdaysFrom(weekStart).map((day) => {
              const selected = value.days.includes(day);
              const [short, full] = WEEKDAY_NAMES[day]!;
              return (
                <Button
                  key={day}
                  size="xs"
                  variant={selected ? "tonal" : "outlined"}
                  className="size-12 p-0"
                  aria-label={full}
                  aria-pressed={selected}
                  onClick={() =>
                    set({
                      days: selected
                        ? value.days.filter((other) => other !== day)
                        : [...value.days, day],
                    })
                  }
                >
                  {short.slice(0, 1)}
                </Button>
              );
            })}
          </div>
          {dayErrorId && (
            <p id={dayErrorId} className="text-body-small text-error">
              {dayErrors?.join(" ")}
            </p>
          )}
          {isEveryDay(value) && (
            <p className="text-body-small text-on-surface-variant">
              Every day of the week: this is saved as a daily habit.
            </p>
          )}
        </fieldset>
      )}
      {value.cadenceType === "times_per_week" && (
        <NumberStepper
          id={`${id}-times`}
          label="Times a week"
          min={HABIT_TIMES_PER_WEEK_MIN}
          max={HABIT_TIMES_PER_WEEK_MAX}
          value={value.timesPerWeek}
          onValueChange={(timesPerWeek) => set({ timesPerWeek })}
          hint="Any days you like, counted from the start of your week."
          errors={errors["cadenceConfig.timesPerWeek"]}
        />
      )}
    </div>
  );
}
