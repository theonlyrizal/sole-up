"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  isInQuietHours,
  type QuietHours,
  SUGGESTED_QUIET_HOURS,
} from "@/lib/quiet-hours";
import { NUDGE_TIME_PATTERN } from "@/lib/reminders";
import type { ActionError } from "@/lib/result";
import { saveReminderSettings } from "@/server/modules/preferences/actions";
import type { ReminderSettings } from "@/server/modules/preferences/service";

type Props = {
  initial: ReminderSettings;
  /** False when no device is subscribed: nothing could be delivered. */
  hasDevice: boolean;
};

/**
 * Settings' "Reminders" section (chunk 5.6, ADR 0013): the global switch,
 * private mode, quiet hours (off by default, suggesting 22:00–07:00) and
 * the daily planning nudge (off until a time is chosen). Saved together.
 */
export function ReminderSettingsForm({ initial, hasDevice }: Props) {
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [enabled, setEnabled] = useState(initial.remindersEnabled);
  const [isPrivate, setIsPrivate] = useState(initial.remindersPrivate);
  const [quiet, setQuiet] = useState(initial.quietHours !== null);
  const [quietHours, setQuietHours] = useState<QuietHours>(
    initial.quietHours ?? SUGGESTED_QUIET_HOURS,
  );
  const [nudge, setNudge] = useState(initial.dailyNudgeTime ?? "");
  const [error, setError] = useState<ActionError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  // Bumped on each failed save, so focus moves to the first invalid field.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [attempt]);

  function edited() {
    setSaved(false);
    setError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const result = await saveReminderSettings({
        remindersEnabled: enabled,
        remindersPrivate: isPrivate,
        quietHours: quiet,
        quietHoursStart: quietHours.start,
        quietHoursEnd: quietHours.end,
        dailyNudgeTime: nudge,
      });
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
        setAttempt((count) => count + 1);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  const nudgeInQuietHours =
    quiet &&
    NUDGE_TIME_PATTERN.test(nudge) &&
    quietHours.start !== quietHours.end &&
    NUDGE_TIME_PATTERN.test(quietHours.end) &&
    isInQuietHours(nudge, quietHours);

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      aria-label="Reminder settings"
      className="flex flex-col gap-5"
    >
      {!hasDevice && (
        <p className="rounded-md border border-border bg-surface p-3 text-sm">
          No device is set up for notifications yet, so reminders can&apos;t
          reach you. Turn them on under Notifications below.
        </p>
      )}

      <Checkbox
        id={`${ids}-enabled`}
        label="Send reminders"
        hint={
          enabled
            ? "Task deadlines, events and the daily nudge, as you set them."
            : "Off: nothing is sent, and reminders that come due are skipped, not saved for later."
        }
        checked={enabled}
        errors={fieldErrors.remindersEnabled}
        onChange={(checked) => {
          setEnabled(checked);
          edited();
        }}
      />

      <Checkbox
        id={`${ids}-private`}
        label="Private mode"
        hint="Notifications say “You have a reminder” and the time, never the title."
        checked={isPrivate}
        errors={fieldErrors.remindersPrivate}
        onChange={(checked) => {
          setIsPrivate(checked);
          edited();
        }}
      />

      <div className="flex flex-col gap-3">
        <Checkbox
          id={`${ids}-quiet`}
          label="Quiet hours"
          hint="Reminders due in quiet hours wait until they end, together in one notification, unless they've passed by then."
          checked={quiet}
          errors={fieldErrors.quietHours}
          onChange={(checked) => {
            setQuiet(checked);
            edited();
          }}
        />
        {quiet && (
          <div className="grid gap-4 pl-6 sm:grid-cols-2">
            <FormField
              id={`${ids}-quiet-start`}
              label="From"
              errors={fieldErrors.quietHoursStart}
            >
              {(control) => (
                <Input
                  {...control}
                  type="time"
                  name="quietHoursStart"
                  value={quietHours.start}
                  onChange={(event) => {
                    setQuietHours({ ...quietHours, start: event.target.value });
                    edited();
                  }}
                />
              )}
            </FormField>
            <FormField
              id={`${ids}-quiet-end`}
              label="Until"
              errors={fieldErrors.quietHoursEnd}
            >
              {(control) => (
                <Input
                  {...control}
                  type="time"
                  name="quietHoursEnd"
                  value={quietHours.end}
                  onChange={(event) => {
                    setQuietHours({ ...quietHours, end: event.target.value });
                    edited();
                  }}
                />
              )}
            </FormField>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FormField
          id={`${ids}-nudge`}
          label="Daily planning nudge"
          hint="“Time to plan your day”, at this time each day. Leave it empty to turn it off."
          errors={fieldErrors.dailyNudgeTime}
        >
          {(control) => (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                {...control}
                type="time"
                name="dailyNudgeTime"
                value={nudge}
                className="w-auto"
                onChange={(event) => {
                  setNudge(event.target.value);
                  edited();
                }}
              />
              {nudge !== "" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNudge("");
                    edited();
                  }}
                >
                  Turn off the nudge
                </Button>
              )}
            </div>
          )}
        </FormField>
        {nudgeInQuietHours && (
          <p className="text-sm font-medium">
            This time is inside your quiet hours, so the nudge will wait until
            they end at {quietHours.end}.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save reminders"}
        </Button>
        <p role="status" className="text-sm text-success">
          {saved ? "Saved." : null}
        </p>
      </div>
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error && error.code !== "VALIDATION" ? error.message : null}
      </p>
    </form>
  );
}

function Checkbox({
  id,
  label,
  hint,
  checked,
  errors,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  errors?: string[];
  onChange: (checked: boolean) => void;
}) {
  const errorId = errors?.length ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-describedby={[`${id}-hint`, errorId].filter(Boolean).join(" ")}
          aria-invalid={errorId ? true : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className={cx("mt-1 size-4 shrink-0 accent-accent", focusRing)}
        />
        <span className="font-medium">{label}</span>
      </label>
      <p id={`${id}-hint`} className="pl-6 text-sm text-muted">
        {hint}
      </p>
      {errorId && (
        <p id={errorId} className="pl-6 text-sm text-danger">
          {errors!.join(" ")}
        </p>
      )}
    </div>
  );
}
