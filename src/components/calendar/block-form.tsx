"use client";

import "./calendar-form.css";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  type BlockFormValues,
  blockTimesPayload,
  blockValuesAt,
  defaultBlockMinutes,
  newBlockValues,
  withBlockStartDate,
} from "@/lib/block-form";
import { formatInstant, instantFromLocal, isLocalDate } from "@/lib/dates";
import { readRepeat, type RepeatErrors } from "@/lib/event-form";
import type { ActionError } from "@/lib/result";
import { formatEstimate } from "@/lib/task-list";
import type { Task } from "@/lib/tasks";
import {
  TIME_BLOCK_MAX_MINUTES,
  TIME_BLOCK_MIN_MINUTES,
  type TimeBlockScope,
} from "@/lib/time-blocks";
import { createTimeBlock } from "@/server/modules/time-blocks/actions";

import { RepeatBuilder } from "./repeat-builder";
import { PickerField } from "./picker-field";
import { type ScopeOption, ScopeChooser } from "./scope-chooser";

/** A task a block can be made for: what the forms and the panel read. */
export type BlockableTask = Pick<Task, "id" | "title" | "estimatedMinutes">;

/** Field errors the block forms show next to a control. */
export const BLOCK_SHOWN_FIELDS = new Set([
  "taskId",
  "startDate",
  "startTime",
  "durationMinutes",
  "tz",
  "rrule",
]);

/** The validation errors not shown next to a field, as one list. */
export function otherBlockErrors(error: ActionError | null): string[] {
  if (error?.code !== "VALIDATION") return [];
  return Object.entries(error.fieldErrors)
    .filter(([field]) => !BLOCK_SHOWN_FIELDS.has(field))
    .flatMap(([, messages]) => messages);
}

/**
 * Moves focus to the first invalid field each time `attempt` goes up (a
 * failed save), as the event form does.
 */
export function useFocusFirstInvalid(attempt: number) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (attempt === 0) return;
    formRef.current
      ?.querySelector<HTMLElement>(
        '[aria-invalid="true"], fieldset[data-invalid] input',
      )
      ?.focus();
  }, [attempt]);
  return formRef;
}

/**
 * A block's date, start time, length and repeat. The zone isn't editable
 * here: a new block is in the user's zone, and an existing one keeps its own.
 */
export function BlockTimesFields({
  id,
  values,
  onChange,
  onRepeatChange,
  onDurationChange,
  fieldErrors,
  repeatErrors,
  userTimeZone,
  locale,
}: {
  /** Prefix for the controls' ids (from `useId()`). */
  id: string;
  values: BlockFormValues;
  onChange: (update: (current: BlockFormValues) => BlockFormValues) => void;
  /** Called when the user changes the repeat (to block "This block"). */
  onRepeatChange?: () => void;
  /** Called when the user types a length (so it stops following the task). */
  onDurationChange?: () => void;
  fieldErrors: Record<string, string[] | undefined>;
  repeatErrors: RepeatErrors;
  userTimeZone: string;
  locale: string;
}) {
  const minutes = Number(values.duration);
  const lengthHint =
    Number.isInteger(minutes) &&
    minutes >= TIME_BLOCK_MIN_MINUTES &&
    minutes <= TIME_BLOCK_MAX_MINUTES
      ? `${formatEstimate(minutes)}. Up to 24 hours.`
      : "Up to 24 hours (1440 minutes).";
  const end = blockEnd(values);
  return (
    <>
      <div className="calendar-time-fields">
        <fieldset className="calendar-time-group">
          <legend>Start</legend>
          <PickerField
            id={`${id}-date`}
            label="Date"
            name="startDate"
            type="date"
            value={values.startDate}
            locale={locale}
            errors={fieldErrors.startDate}
            timeZone={values.tz}
            onChange={(startDate) =>
              onChange((current) => withBlockStartDate(current, startDate))
            }
          />
          <PickerField
            id={`${id}-start`}
            label="Start time"
            name="startTime"
            type="time"
            value={values.startTime}
            locale={locale}
            errors={fieldErrors.startTime}
            onChange={(startTime) =>
              onChange((current) => ({ ...current, startTime }))
            }
          />
        </fieldset>
        <fieldset className="calendar-time-group">
          <legend>End</legend>
          <FormField
            id={`${id}-length`}
            label="Length (minutes)"
            hint={lengthHint}
            errors={fieldErrors.durationMinutes}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                name="durationMinutes"
                min={TIME_BLOCK_MIN_MINUTES}
                max={TIME_BLOCK_MAX_MINUTES}
                step={1}
                value={values.duration}
                onChange={(change) => {
                  onDurationChange?.();
                  onChange((current) => ({
                    ...current,
                    duration: change.target.value,
                  }));
                }}
              />
            )}
          </FormField>
          {end && (
            <p className="text-body-medium">
              Ends {formatInstant(end, locale, values.tz)}
            </p>
          )}
        </fieldset>
      </div>
      <p className="text-sm text-muted">
        {values.tz === userTimeZone
          ? `Times are in your time zone, ${userTimeZone}.`
          : `Times are in this block's time zone, ${values.tz}.`}
      </p>
      {fieldErrors.tz && (
        <p className="text-sm text-danger">{fieldErrors.tz.join(" ")}</p>
      )}
      <RepeatBuilder
        id={`${id}-repeat`}
        value={values.repeat}
        onChange={(repeat) => {
          onRepeatChange?.();
          onChange((current) => ({ ...current, repeat }));
        }}
        startDate={values.startDate}
        locale={locale}
        timeZone={values.tz}
        errors={repeatErrors}
        ruleErrors={fieldErrors.rrule}
      />
    </>
  );
}

/** Preview the end in the block's zone from its elapsed length. */
function blockEnd({ startDate, startTime, duration, tz }: BlockFormValues) {
  const minutes = Number(duration);
  if (
    !isLocalDate(startDate) ||
    !startTime ||
    !Number.isInteger(minutes) ||
    minutes < TIME_BLOCK_MIN_MINUTES ||
    minutes > TIME_BLOCK_MAX_MINUTES
  )
    return null;
  try {
    const start = instantFromLocal(startDate, startTime, tz);
    return new Date(start.getTime() + minutes * 60_000);
  } catch {
    return null;
  }
}

/** Reads the form's rule, or returns the builder's errors. */
export function readBlockRepeat(values: BlockFormValues) {
  return readRepeat(values.repeat, values.startDate);
}

type BlockTimeDialogProps = {
  /** The user's saved zone: new blocks are in it. */
  timeZone: string;
  locale: string;
  /** The task to block time for; omit to choose one from `tasks`. */
  task?: BlockableTask;
  /** The tasks to choose from when there is no `task`. */
  tasks?: BlockableTask[];
  /** A selected slot of the grid: the block's start and end. */
  slot?: { start: Date; end: Date };
  /** A task chosen beforehand from the picker's list (a drop). */
  initialTaskId?: string;
  /** Called after the block is created. */
  onCreated?: () => void;
} & (
  | {
      /** The element that opens the dialog, usually a `<Button>`. */
      trigger: React.ReactElement;
      open?: undefined;
      onOpenChange?: undefined;
      onCloseAutoFocus?: undefined;
    }
  | {
      /** Controlled: the grid opens it from a selected slot. */
      trigger?: undefined;
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onCloseAutoFocus?: (event: Event) => void;
    }
);

/**
 * "Block time" (chunk 4.8): a date, start time, length (the task's
 * estimate, else 60 minutes) and repeat for a block for one task. From a
 * task it blocks time for that task; from the calendar it first asks which
 * task.
 */
export function BlockTimeDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
  ...props
}: BlockTimeDialogProps) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  return (
    <FormDialog
      title="Block time"
      description={
        props.task
          ? `For “${props.task.title}”.`
          : "Set time aside for one of your tasks."
      }
      formId={formId}
      submitLabel={pending ? "Saving…" : "Block time"}
      pending={pending}
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      trigger={trigger}
    >
      <BlockTimeForm
        {...props}
        formId={formId}
        startTransition={startTransition}
        onSaved={() => {
          setOpen(false);
          props.onCreated?.();
        }}
      />
    </FormDialog>
  );
}

function BlockTimeForm({
  timeZone,
  locale,
  task,
  tasks = [],
  slot,
  initialTaskId,
  formId,
  startTransition,
  onSaved,
}: Omit<BlockTimeDialogProps, "trigger" | "open" | "onOpenChange"> & {
  formId: string;
  startTransition: React.TransitionStartFunction;
  onSaved: () => void;
}) {
  const id = useId();
  const [taskId, setTaskId] = useState(task?.id ?? initialTaskId ?? "");
  const chosen = task ?? tasks.find((option) => option.id === taskId);
  const [values, setValues] = useState<BlockFormValues>(() =>
    slot
      ? blockValuesAt(slot.start, slot.end, timeZone)
      : newBlockValues(new Date(), timeZone, chosen?.estimatedMinutes ?? null),
  );
  // A selected slot sets the length; otherwise it follows the chosen task
  // until the user types one.
  const [lengthTouched, setLengthTouched] = useState(slot !== undefined);
  const [repeatErrors, setRepeatErrors] = useState<RepeatErrors>({});
  const [error, setError] = useState<ActionError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const formRef = useFocusFirstInvalid(attempt);

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};

  function chooseTask(next: string) {
    setTaskId(next);
    const option = tasks.find((candidate) => candidate.id === next);
    if (option && !lengthTouched) {
      setValues((current) => ({
        ...current,
        duration: String(defaultBlockMinutes(option.estimatedMinutes)),
      }));
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const repeat = readBlockRepeat(values);
    if (!repeat.ok) {
      setRepeatErrors(repeat.errors);
      setError(null);
      setAttempt((count) => count + 1);
      return;
    }
    setRepeatErrors({});
    startTransition(async () => {
      const result = await createTimeBlock({
        taskId,
        ...blockTimesPayload(values),
        rrule: repeat.rrule,
      });
      if (result.ok) {
        toast({ title: "Time blocked", variant: "success" });
        onSaved();
      } else {
        setError(result.error);
        if (result.error.code === "VALIDATION") setAttempt((n) => n + 1);
      }
    });
  }

  const otherErrors = otherBlockErrors(error);
  return (
    <form
      id={formId}
      ref={formRef}
      onSubmit={submit}
      noValidate
      aria-label={task ? `Block time for ${task.title}` : "Block time"}
      className="flex flex-col gap-4"
    >
      {!task && (
        <FormField
          id={`${id}-task`}
          label="Task"
          hint={
            tasks.length === 0
              ? "You have no open tasks. Add one first."
              : undefined
          }
          errors={fieldErrors.taskId}
        >
          {(control) => (
            <Select
              {...control}
              name="taskId"
              value={taskId}
              autoFocus
              onChange={(change) => chooseTask(change.target.value)}
            >
              <option value="">Choose a task</option>
              {tasks.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      )}
      <BlockTimesFields
        id={id}
        values={values}
        onChange={setValues}
        onDurationChange={() => setLengthTouched(true)}
        fieldErrors={fieldErrors}
        repeatErrors={repeatErrors}
        userTimeZone={timeZone}
        locale={locale}
      />
      <FormError error={error} />
      {otherErrors.length > 0 && (
        <p role="alert" className="text-sm text-danger">
          {otherErrors.join(" ")}
        </p>
      )}
    </form>
  );
}

/**
 * Asks which occurrences of a repeating block a change applies to, naming
 * the separately changed ones each wider choice would drop. Focus starts on
 * the chosen option.
 */
export function BlockScopeStep({
  id,
  intro,
  scope,
  options,
  loading,
  formId,
  pending,
  error,
  locale,
  timeZone,
  onChange,
  onBack,
  showBack = true,
  onSave,
}: {
  id: string;
  intro: string;
  scope: TimeBlockScope;
  options: Partial<Record<TimeBlockScope, ScopeOption>>;
  loading: boolean;
  formId: string;
  pending: boolean;
  error: ActionError | null;
  locale: string;
  timeZone: string;
  onChange: (scope: TimeBlockScope) => void;
  onBack?: () => void;
  showBack?: boolean;
  onSave: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
  }, []);
  return (
    <form
      id={formId}
      ref={ref}
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && !loading) onSave();
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-muted">{intro}</p>
      <ScopeChooser
        id={id}
        noun="block"
        legend="Save the changes to"
        action="change"
        value={scope}
        onChange={onChange}
        options={options}
        loading={loading}
        locale={locale}
        timeZone={timeZone}
      />
      <FormError error={error} />
      {showBack && (
        <Button
          variant="text"
          className="self-start"
          disabled={pending}
          onClick={onBack}
        >
          Back
        </Button>
      )}
    </form>
  );
}
