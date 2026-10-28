"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { ReminderSelect } from "@/components/reminders/reminder-select";
import { ReminderStatus } from "@/components/reminders/reminder-status";
import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  CALENDAR_EVENT_DESCRIPTION_MAX,
  CALENDAR_EVENT_LOCATION_MAX,
  CALENDAR_EVENT_TITLE_MAX,
  type CalendarEventOccurrence,
  type CalendarEventScope,
} from "@/lib/calendar-events";
import { originalStartParam } from "@/lib/calendar-list";
import {
  type EventFormValues,
  eventFormValuesOf,
  eventPayload,
  newEventValues,
  readRepeat,
  type RepeatErrors,
  thisEventBlocker,
  timesInZone,
  withAllDay,
  withStart,
} from "@/lib/event-form";
import type { ActionError, ActionResult } from "@/lib/result";
import {
  createCalendarEvent,
  editCalendarEventOccurrence,
  previewCalendarEventOccurrenceEdit,
  updateCalendarEvent,
} from "@/server/modules/calendar-events/actions";
import type { EventLinkOptions } from "@/server/modules/calendar-events/queries";

import { DeleteEventDialog } from "./delete-event-dialog";
import { RepeatBuilder } from "./repeat-builder";
import { type ScopeOption, ScopeChooser } from "./scope-chooser";

/** What every event dialog needs from the page. */
export type EventFormContext = {
  options: EventLinkOptions;
  /** The server's zone list, for the time-zone picker. */
  timeZones: string[];
  /** The user's saved zone: new events start in it. */
  userTimeZone: string;
  locale: string;
};

type EventFormDialogProps = EventFormContext & {
  /** The event or occurrence to edit; omit to create one. */
  event?: CalendarEventOccurrence;
} & (
    | {
        /** The element that opens the dialog, usually a `<Button>`. */
        trigger: React.ReactElement;
        open?: undefined;
        onOpenChange?: undefined;
        onCloseAutoFocus?: undefined;
      }
    | {
        /** Controlled: the page opens it, e.g. from a clicked Agenda item. */
        trigger?: undefined;
        open: boolean;
        onOpenChange: (open: boolean) => void;
        /** Where focus goes on close (see `DialogContent`). */
        onCloseAutoFocus?: (event: Event) => void;
      }
  );

/**
 * Creates or edits a calendar event in a dialog (chunk 4.4). Saving one
 * occurrence of a repeating event first asks which occurrences the change
 * applies to.
 */
export function EventFormDialog({
  trigger,
  event,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
  ...context
}: EventFormDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        title={event ? "Edit event" : "New event"}
        className="max-w-xl"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <EventForm
          event={event}
          {...context}
          onCancel={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
        {event && <ReminderStatus item={{ kind: "event", id: event.id }} />}
      </DialogContent>
    </Dialog>
  );
}

/** Field errors the form shows next to a control. */
const SHOWN_FIELDS = new Set([
  "title",
  "allDay",
  "startDate",
  "startTime",
  "endDate",
  "endTime",
  "tz",
  "location",
  "description",
  "goalId",
  "lifeAreaId",
  "rrule",
  "reminderOffsetMinutes",
]);

type Step =
  | { kind: "form" }
  | {
      kind: "scope";
      scope: CalendarEventScope;
      options: Partial<Record<CalendarEventScope, ScopeOption>>;
    };

type EventFormProps = EventFormContext & {
  event?: CalendarEventOccurrence;
  onCancel: () => void;
  onSaved: () => void;
};

function EventForm({
  event,
  options,
  timeZones,
  userTimeZone,
  locale,
  onCancel,
  onSaved,
}: EventFormProps) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [initial] = useState<EventFormValues>(() =>
    event
      ? eventFormValuesOf(event, userTimeZone)
      : newEventValues(new Date(), userTimeZone),
  );
  const [values, setValues] = useState(initial);
  const [repeatChanged, setRepeatChanged] = useState(false);
  const [showZone, setShowZone] = useState(
    !initial.allDay && initial.tz !== userTimeZone,
  );
  const [repeatErrors, setRepeatErrors] = useState<RepeatErrors>({});
  const [error, setError] = useState<ActionError | null>(null);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [pending, startTransition] = useTransition();
  // Bumped on each failed save, so focus moves to the first invalid field.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"], fieldset[data-invalid] input',
    );
    invalid?.focus();
  }, [attempt]);

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  const otherErrors = Object.entries(fieldErrors)
    .filter(([field]) => !SHOWN_FIELDS.has(field))
    .flatMap(([, messages]) => messages);

  function fail(actionError: ActionError) {
    setError(actionError);
    if (actionError.code === "VALIDATION") {
      if (actionError.fieldErrors.tz) setShowZone(true);
      setStep({ kind: "form" });
      setAttempt((count) => count + 1);
    }
  }

  function saved(message = "Event saved") {
    toast({ title: message, variant: "success" });
    onSaved();
  }

  /** The payload, or null after showing the repeat builder's errors. */
  function readPayload() {
    const repeat = readRepeat(values.repeat, values.startDate);
    if (!repeat.ok) {
      setRepeatErrors(repeat.errors);
      setError(null);
      setAttempt((count) => count + 1);
      return null;
    }
    setRepeatErrors({});
    return { ...eventPayload(values), rrule: repeat.rrule };
  }

  function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const payload = readPayload();
    if (!payload) return;
    startTransition(async () => {
      if (!event) {
        const result = await createCalendarEvent(payload);
        if (result.ok) saved("Event added");
        else fail(result.error);
        return;
      }
      const originalStart = originalStartParam(event);
      if (originalStart === null) {
        const result = await updateCalendarEvent({ id: event.id, ...payload });
        if (result.ok) saved();
        else fail(result.error);
        return;
      }

      // One occurrence of a series: find out what the wider scopes would
      // drop (this also validates), then ask which events to change.
      const key = { id: event.id, originalStart };
      const [following, all] = await Promise.all([
        previewCalendarEventOccurrenceEdit({
          ...key,
          scope: "following",
          ...payload,
        }),
        previewCalendarEventOccurrenceEdit({
          ...key,
          scope: "all",
          ...payload,
        }),
      ]);
      const failed = [following, all].find(
        (result): result is Extract<typeof result, { ok: false }> => !result.ok,
      );
      if (failed) {
        fail(failed.error);
        return;
      }
      setError(null);
      const blocker = thisEventBlocker(initial, values, repeatChanged);
      setStep({
        kind: "scope",
        scope: blocker ? "following" : "this",
        options: {
          this: { blocker },
          following: { dropped: following.ok ? following.data.dropped : [] },
          all: { dropped: all.ok ? all.data.dropped : [] },
        },
      });
    });
  }

  function saveWithScope(scope: CalendarEventScope) {
    if (!event) return;
    const originalStart = originalStartParam(event);
    const payload = readPayload();
    if (originalStart === null || !payload) return;
    // "This event" keeps its series' rule and reminder.
    const { rrule, reminderOffsetMinutes, ...fields } = payload;
    startTransition(async () => {
      const key = { id: event.id, originalStart };
      const result: ActionResult<unknown> =
        scope === "this"
          ? await editCalendarEventOccurrence({ ...key, scope, ...fields })
          : await editCalendarEventOccurrence({
              ...key,
              scope,
              ...fields,
              rrule,
              reminderOffsetMinutes,
            });
      if (result.ok) saved();
      else fail(result.error);
    });
  }

  if (step.kind === "scope") {
    return (
      <ScopeStep
        id={`${id}-scope`}
        step={step}
        pending={pending}
        error={error}
        locale={locale}
        timeZone={userTimeZone}
        onChange={(scope) => setStep({ ...step, scope })}
        onBack={() => {
          setError(null);
          setStep({ kind: "form" });
        }}
        onSave={() => saveWithScope(step.scope)}
      />
    );
  }

  const set = (patch: Partial<EventFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  function chooseGoal(goalId: string) {
    const goal = options.goals.find((option) => option.id === goalId);
    const previous = options.goals.find(
      (option) => option.id === values.goalId,
    );
    // The area follows the goal unless the user chose another one.
    const areaFollows =
      !values.lifeAreaId || values.lifeAreaId === previous?.lifeAreaId;
    set({
      goalId,
      ...(areaFollows && goal?.lifeAreaId && { lifeAreaId: goal.lifeAreaId }),
    });
  }

  const goalOptions = options.goals.filter(
    (goal) =>
      goal.status === "active" ||
      goal.status === "paused" ||
      goal.id === values.goalId,
  );
  const areaOptions = options.areas.filter(
    (area) => area.status === "active" || area.id === values.lifeAreaId,
  );
  const zoneNote = timesInZone(values, userTimeZone, locale);

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      aria-label={event ? `Edit ${event.title}` : "New event"}
      className="flex flex-col gap-4"
    >
      <FormField id={`${id}-title`} label="Title" errors={fieldErrors.title}>
        {(control) => (
          <Input
            {...control}
            name="title"
            value={values.title}
            maxLength={CALENDAR_EVENT_TITLE_MAX}
            autoComplete="off"
            autoFocus
            onChange={(change) => set({ title: change.target.value })}
          />
        )}
      </FormField>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="allDay"
            checked={values.allDay}
            aria-invalid={fieldErrors.allDay ? true : undefined}
            aria-describedby={
              fieldErrors.allDay ? `${id}-all-day-error` : undefined
            }
            onChange={(change) =>
              setValues((current) => withAllDay(current, change.target.checked))
            }
            className={cx("size-4 accent-accent", focusRing)}
          />
          <span className="font-medium">All day</span>
        </label>
        {fieldErrors.allDay && (
          <p id={`${id}-all-day-error`} className="text-sm text-danger">
            {fieldErrors.allDay.join(" ")}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${id}-start-date`}
          label="Start date"
          errors={fieldErrors.startDate}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              name="startDate"
              value={values.startDate}
              onChange={(change) =>
                setValues((current) =>
                  withStart(current, { startDate: change.target.value }),
                )
              }
            />
          )}
        </FormField>
        {!values.allDay && (
          <FormField
            id={`${id}-start-time`}
            label="Start time"
            errors={fieldErrors.startTime}
          >
            {(control) => (
              <Input
                {...control}
                type="time"
                name="startTime"
                value={values.startTime}
                onChange={(change) =>
                  setValues((current) =>
                    withStart(current, { startTime: change.target.value }),
                  )
                }
              />
            )}
          </FormField>
        )}
        <FormField
          id={`${id}-end-date`}
          label="End date"
          hint={values.allDay ? "The last day of the event." : undefined}
          errors={fieldErrors.endDate}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              name="endDate"
              value={values.endDate}
              min={values.startDate || undefined}
              onChange={(change) => set({ endDate: change.target.value })}
            />
          )}
        </FormField>
        {!values.allDay && (
          <FormField
            id={`${id}-end-time`}
            label="End time"
            errors={fieldErrors.endTime}
          >
            {(control) => (
              <Input
                {...control}
                type="time"
                name="endTime"
                value={values.endTime}
                onChange={(change) => set({ endTime: change.target.value })}
              />
            )}
          </FormField>
        )}
      </div>

      {!values.allDay &&
        (showZone ? (
          <FormField
            id={`${id}-tz`}
            label="Time zone"
            hint={
              zoneNote
                ? `In your time zone (${userTimeZone}): ${zoneNote}.`
                : "The same as your time zone."
            }
            errors={fieldErrors.tz}
          >
            {(control) => (
              <Select
                {...control}
                name="tz"
                value={values.tz}
                onChange={(change) => set({ tz: change.target.value })}
              >
                {!timeZones.includes(values.tz) && (
                  <option value={values.tz}>{values.tz}</option>
                )}
                {timeZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>Times are in your time zone, {userTimeZone}.</span>
            <Button variant="ghost" size="sm" onClick={() => setShowZone(true)}>
              Change time zone
            </Button>
          </p>
        ))}

      <RepeatBuilder
        id={`${id}-repeat`}
        value={values.repeat}
        onChange={(repeat) => {
          setRepeatChanged(true);
          set({ repeat });
        }}
        startDate={values.startDate}
        locale={locale}
        errors={repeatErrors}
        ruleErrors={fieldErrors.rrule}
      />

      {!values.allDay && (
        <ReminderSelect
          id={`${id}-reminder`}
          value={values.reminder}
          onChange={(reminder) => set({ reminder })}
          errors={fieldErrors.reminderOffsetMinutes}
          note={
            values.repeat.frequency !== "none"
              ? "Applies to every event in the series."
              : undefined
          }
        />
      )}

      <FormField
        id={`${id}-location`}
        label="Location"
        errors={fieldErrors.location}
      >
        {(control) => (
          <Input
            {...control}
            name="location"
            value={values.location}
            maxLength={CALENDAR_EVENT_LOCATION_MAX}
            onChange={(change) => set({ location: change.target.value })}
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${id}-goal`}
          label="Goal"
          hint="Choosing a goal fills in its life area."
          errors={fieldErrors.goalId}
        >
          {(control) => (
            <Select
              {...control}
              name="goalId"
              value={values.goalId}
              onChange={(change) => chooseGoal(change.target.value)}
            >
              <option value="">No goal</option>
              {goalOptions.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.status === "active" || goal.status === "paused"
                    ? goal.title
                    : `${goal.title} (${goal.status})`}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField
          id={`${id}-area`}
          label="Life area"
          errors={fieldErrors.lifeAreaId}
        >
          {(control) => (
            <Select
              {...control}
              name="lifeAreaId"
              value={values.lifeAreaId}
              onChange={(change) => set({ lifeAreaId: change.target.value })}
            >
              <option value="">No area</option>
              {areaOptions.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.status === "archived"
                    ? `${area.name} (archived)`
                    : area.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>

      <FormField
        id={`${id}-description`}
        label="Description"
        errors={fieldErrors.description}
      >
        {(control) => (
          <Textarea
            {...control}
            name="description"
            rows={3}
            value={values.description}
            maxLength={CALENDAR_EVENT_DESCRIPTION_MAX}
            onChange={(change) => set({ description: change.target.value })}
          />
        )}
      </FormField>

      <FormError error={error} />
      {otherErrors.length > 0 && (
        <p role="alert" className="text-sm text-danger">
          {otherErrors.join(" ")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : event ? "Save" : "Add event"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        {event && (
          <span className="ml-auto">
            <DeleteEventDialog
              event={event}
              locale={locale}
              timeZone={userTimeZone}
              onDeleted={onSaved}
            />
          </span>
        )}
      </div>
    </form>
  );
}

function ScopeStep({
  id,
  step,
  pending,
  error,
  locale,
  timeZone,
  onChange,
  onBack,
  onSave,
}: {
  id: string;
  step: Extract<Step, { kind: "scope" }>;
  pending: boolean;
  error: ActionError | null;
  locale: string;
  timeZone: string;
  onChange: (scope: CalendarEventScope) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
  }, []);
  return (
    <div ref={ref} className="flex flex-col gap-4">
      <p className="text-muted">This event repeats.</p>
      <ScopeChooser
        id={id}
        legend="Save the changes to"
        action="change"
        value={step.scope}
        onChange={onChange}
        options={step.options}
        loading={false}
        locale={locale}
        timeZone={timeZone}
      />
      <FormError error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={onSave}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
