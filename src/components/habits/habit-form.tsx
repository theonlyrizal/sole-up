"use client";

import { useId, useState, useTransition } from "react";

import { ChoiceGroup, Radio } from "@/components/calendar/choices";
import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { LocalDate, WeekStart } from "@/lib/dates";
import { GOAL_STATUS_LABELS } from "@/lib/goals";
import {
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

type HabitFormDialogProps = {
  /** The element that opens the dialog, usually a `<Button>`. */
  trigger: React.ReactElement;
  /** The habit to edit; omit to create one. */
  habit?: HabitListItem;
  context: HabitFormContext;
};

/**
 * Creates or edits a habit in a dialog (ADR 0014): what it is, how it is
 * measured (fixed once created), how often, and when it runs. A cadence or
 * target edit applies from the start of this week.
 */
export function HabitFormDialog({
  trigger,
  habit,
  context,
}: HabitFormDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={habit ? "Edit habit" : "New habit"}
        className="max-w-lg"
      >
        <HabitForm
          habit={habit}
          context={context}
          onCancel={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

const CADENCE_LABELS: Record<HabitCadenceType, string> = {
  daily: "Every day",
  weekly_days: "On chosen days",
  times_per_week: "A number of times a week",
};

const MEASURE_CHOICES: Record<
  HabitMeasure,
  { label: string; description: string }
> = {
  check: { label: "Done or not", description: "Tick it off when it's done." },
  quantity: {
    label: "An amount",
    description: "Log how much, toward a target each day.",
  },
};

type HabitFormProps = {
  habit?: HabitListItem;
  context: HabitFormContext;
  onCancel: () => void;
  onSaved: () => void;
};

function HabitForm({ habit, context, onCancel, onSaved }: HabitFormProps) {
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
  const [pending, startTransition] = useTransition();

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
        onSaved();
      } else {
        setError(result.error);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  const isQuantity = (habit?.measure ?? measure) === "quantity";
  const unitLabel = habit?.unit ?? unit.trim();
  return (
    <form
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
        <ChoiceGroup
          id={`${id}-measure`}
          legend="How is it measured?"
          errors={fieldErrors.measure}
        >
          <p className="-mt-1 text-sm text-muted">
            This can&apos;t be changed later.
          </p>
          {(Object.keys(MEASURE_CHOICES) as HabitMeasure[]).map((value) => (
            <Radio
              key={value}
              name={`${id}-measure`}
              value={value}
              checked={measure === value}
              onChange={() => setMeasure(value)}
              label={MEASURE_CHOICES[value].label}
              description={MEASURE_CHOICES[value].description}
            />
          ))}
        </ChoiceGroup>
      )}

      {isQuantity && (
        <div className="grid gap-4 sm:grid-cols-2">
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
          <FormField
            id={`${id}-target`}
            label={
              unitLabel ? `Target per day (${unitLabel})` : "Target per day"
            }
            hint={habit ? "A change applies from this week." : undefined}
            errors={fieldErrors.target}
          >
            {(control) => (
              <Input
                {...control}
                name="target"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="any"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            )}
          </FormField>
        </div>
      )}

      <CadencePicker
        id={`${id}-cadence`}
        value={cadence}
        onChange={setCadence}
        weekStart={context.weekStart}
        errors={fieldErrors}
        note={
          habit &&
          `Changes to how often or the target apply from the start of this week, ${context.thisWeekStartLabel}. Earlier weeks keep their schedule.`
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${id}-start`}
          label="Start date"
          errors={fieldErrors.startDate}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              name="startDate"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          id={`${id}-end`}
          label="End date"
          hint="Optional. The last day it counts."
          errors={fieldErrors.endDate}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              name="endDate"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
            />
          )}
        </FormField>
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
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : habit ? "Save" : "Add habit"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const TIMES_PER_WEEK_OPTIONS = Array.from(
  { length: HABIT_TIMES_PER_WEEK_MAX - HABIT_TIMES_PER_WEEK_MIN + 1 },
  (_, index) => HABIT_TIMES_PER_WEEK_MIN + index,
);

type CadencePickerProps = {
  id: string;
  value: CadencePickerValue;
  onChange: (next: CadencePickerValue) => void;
  weekStart: WeekStart;
  /** The form's field errors; the cadence's are picked out here. */
  errors: FieldErrors;
  /** Shown under the legend, such as when an edit takes effect. */
  note?: string;
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
  note,
}: CadencePickerProps) {
  const set = (patch: Partial<CadencePickerValue>) =>
    onChange({ ...value, ...patch });
  const cadenceErrors = [
    ...(errors.cadenceType ?? []),
    ...(errors.cadenceConfig ?? []),
  ];

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-4">
      <ChoiceGroup
        id={`${id}-type`}
        legend="How often"
        errors={cadenceErrors.length > 0 ? cadenceErrors : undefined}
      >
        {note && <p className="-mt-1 text-sm text-muted">{note}</p>}
        {(Object.keys(CADENCE_LABELS) as HabitCadenceType[]).map((type) => (
          <Radio
            key={type}
            name={`${id}-type`}
            value={type}
            checked={value.cadenceType === type}
            onChange={() => set({ cadenceType: type })}
            label={CADENCE_LABELS[type]}
          />
        ))}
      </ChoiceGroup>

      {value.cadenceType === "weekly_days" && (
        <ChoiceGroup
          id={`${id}-days`}
          legend="On these days"
          errors={errors["cadenceConfig.days"]}
        >
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {weekdaysFrom(weekStart).map((day) => (
              <label key={day} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={value.days.includes(day)}
                  aria-label={WEEKDAY_NAMES[day]![1]}
                  onChange={(event) =>
                    set({
                      days: event.target.checked
                        ? [...value.days, day]
                        : value.days.filter((other) => other !== day),
                    })
                  }
                  className={cx("size-4 accent-accent", focusRing)}
                />
                <span aria-hidden="true">{WEEKDAY_NAMES[day]![0]}</span>
              </label>
            ))}
          </div>
          {isEveryDay(value) && (
            <p className="text-sm text-muted">
              Every day of the week: this is saved as a daily habit.
            </p>
          )}
        </ChoiceGroup>
      )}

      {value.cadenceType === "times_per_week" && (
        <FormField
          id={`${id}-times`}
          label="Times a week"
          hint="Any days you like, counted from the start of your week."
          errors={errors["cadenceConfig.timesPerWeek"]}
        >
          {(control) => (
            <Select
              {...control}
              value={value.timesPerWeek}
              className="w-auto"
              onChange={(event) => set({ timesPerWeek: event.target.value })}
            >
              {TIMES_PER_WEEK_OPTIONS.map((times) => (
                <option key={times} value={String(times)}>
                  {times === 1 ? "Once" : `${times} times`}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      )}
    </div>
  );
}
