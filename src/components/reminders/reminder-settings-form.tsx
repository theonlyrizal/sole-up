"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { PickerField } from "@/components/calendar/picker-field";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InlineBanner } from "@/components/ui/inline-banner";
import { SaveStatus } from "@/components/ui/save-status";
import { SwitchRow } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import type { WeekStart } from "@/lib/dates";
import { WEEK_DAYS } from "@/lib/preferences";
import {
  isInQuietHours,
  type QuietHours,
  SUGGESTED_QUIET_HOURS,
} from "@/lib/quiet-hours";
import { NUDGE_TIME_PATTERN } from "@/lib/reminders";
import { DEFAULT_ERROR_MESSAGES, type ActionError } from "@/lib/result";
import { saveReminderSettings } from "@/server/modules/preferences/actions";
import type { ReminderSettings } from "@/server/modules/preferences/service";

type Props = {
  initial: ReminderSettings;
};

/**
 * Settings' "Reminders" section (chunk 5.6, ADR 0013): the global switch,
 * private mode, quiet hours (off by default, suggesting 22:00–07:00), the
 * daily planning nudge (off until a time is chosen) and the weekly review
 * reminder (chunk 7.5, ADR 0015: off until a day is chosen). Saved together.
 */
export function ReminderSettingsForm({ initial }: Props) {
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [enabled, setEnabled] = useState(initial.remindersEnabled);
  const [isPrivate, setIsPrivate] = useState(initial.remindersPrivate);
  const [quiet, setQuiet] = useState(initial.quietHours !== null);
  const [quietHours, setQuietHours] = useState<QuietHours>(
    initial.quietHours ?? SUGGESTED_QUIET_HOURS,
  );
  const [nudgeOn, setNudgeOn] = useState(initial.dailyNudgeTime !== null);
  const [nudge, setNudge] = useState(initial.dailyNudgeTime ?? "");
  const [reviewDay, setReviewDay] = useState<WeekStart | null>(
    initial.weeklyReview?.day ?? null,
  );
  const [reviewTime, setReviewTime] = useState(
    initial.weeklyReview?.time ?? "",
  );
  const [error, setError] = useState<ActionError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  // Bumped on each failed save, so focus moves to the first invalid field.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0 || pending) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [attempt, pending]);

  function edited() {
    setSaved(false);
    setError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (enabled && nudgeOn && nudge === "") {
      setError({
        code: "VALIDATION",
        message: DEFAULT_ERROR_MESSAGES.VALIDATION,
        fieldErrors: {
          dailyNudgeTime: ["Enter a time for the daily planning nudge."],
        },
        formErrors: [],
      });
      setAttempt((count) => count + 1);
      return;
    }
    startTransition(async () => {
      edited();
      // Disabling delivery keeps the saved options available for re-enabling.
      const savedQuiet = initial.quietHours ?? SUGGESTED_QUIET_HOURS;
      try {
        const result = await saveReminderSettings({
          remindersEnabled: enabled,
          remindersPrivate: enabled ? isPrivate : initial.remindersPrivate,
          quietHours: enabled ? quiet : initial.quietHours !== null,
          quietHoursStart: enabled ? quietHours.start : savedQuiet.start,
          quietHoursEnd: enabled ? quietHours.end : savedQuiet.end,
          dailyNudgeTime: enabled
            ? nudgeOn
              ? nudge
              : ""
            : (initial.dailyNudgeTime ?? ""),
          weeklyReviewDay: enabled
            ? reviewDay
            : (initial.weeklyReview?.day ?? null),
          weeklyReviewTime: enabled
            ? reviewTime
            : (initial.weeklyReview?.time ?? ""),
        });
        if (result.ok) {
          if (!enabled) {
            const settings = result.data;
            setIsPrivate(settings.remindersPrivate);
            setQuiet(settings.quietHours !== null);
            setQuietHours(settings.quietHours ?? SUGGESTED_QUIET_HOURS);
            setNudgeOn(settings.dailyNudgeTime !== null);
            setNudge(settings.dailyNudgeTime ?? "");
            setReviewDay(settings.weeklyReview?.day ?? null);
            setReviewTime(settings.weeklyReview?.time ?? "");
          }
          setSaved(true);
        } else {
          setError(result.error);
          setAttempt((count) => count + 1);
        }
      } catch {
        setError({
          code: "INTERNAL",
          message: DEFAULT_ERROR_MESSAGES.INTERNAL,
        });
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  const inQuietHours = (time: string) =>
    quiet &&
    NUDGE_TIME_PATTERN.test(time) &&
    quietHours.start !== quietHours.end &&
    NUDGE_TIME_PATTERN.test(quietHours.end) &&
    isInQuietHours(time, quietHours);
  const nudgeInQuietHours = nudgeOn && inQuietHours(nudge);
  const reviewInQuietHours = reviewDay !== null && inQuietHours(reviewTime);

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      aria-label="Reminder settings"
      className="flex flex-col gap-5"
    >
      <SwitchRow
        id={`${ids}-enabled`}
        name="remindersEnabled"
        label="Reminders"
        description={
          enabled
            ? "Send reminders to your devices."
            : "Off: nothing is sent, and reminders that come due are skipped, not saved for later."
        }
        checked={enabled}
        disabled={pending}
        onCheckedChange={(checked) => {
          setEnabled(checked);
          edited();
        }}
      />

      <fieldset
        disabled={!enabled || pending}
        className="grid min-w-0 gap-4 rounded-xl bg-surface-container-low p-3 disabled:bg-surface-container"
      >
        <legend className="sr-only">Reminder options</legend>
        <SwitchRow
          id={`${ids}-private`}
          name="remindersPrivate"
          label="Private notifications"
          description="Notifications say “You have a reminder” and the time, never the title."
          checked={isPrivate}
          disabled={!enabled || pending}
          onCheckedChange={(checked) => {
            setIsPrivate(checked);
            edited();
          }}
        />

        <div className="grid gap-3 border-t border-outline-variant pt-4">
          <SwitchRow
            id={`${ids}-nudge-on`}
            label="Daily planning nudge"
            description="“Time to plan your day”, at this time each day."
            checked={nudgeOn}
            disabled={!enabled || pending}
            onCheckedChange={(checked) => {
              setNudgeOn(checked);
              edited();
            }}
          />
          <PickerField
            id={`${ids}-nudge`}
            label="Daily planning nudge time"
            type="time"
            value={nudgeOn ? nudge : ""}
            name="dailyNudgeTime"
            errors={fieldErrors.dailyNudgeTime}
            disabled={!enabled || !nudgeOn || pending}
            onChange={(time) => {
              setNudge(time);
              edited();
            }}
          />
          {enabled && nudgeInQuietHours && (
            <p className="text-body-medium text-on-surface-variant">
              This time is inside your quiet hours, so the nudge will wait until
              they end at {quietHours.end}.
            </p>
          )}
        </div>

        <div className="grid gap-3 border-t border-outline-variant pt-4">
          <FormField
            id={`${ids}-review-day`}
            label="Weekly review reminder"
            hint="“Time for your weekly review”, once a week on this day, opening your review. It comes even when that week’s review is finished."
            errors={fieldErrors.weeklyReviewDay}
          >
            {(control) => (
              <Select
                {...control}
                name="weeklyReviewDay"
                disabled={!enabled || pending}
                value={reviewDay ?? ""}
                onChange={(event) => {
                  const { value } = event.target;
                  setReviewDay(
                    value === "" ? null : (Number(value) as WeekStart),
                  );
                  edited();
                }}
              >
                <option value="">Off</option>
                {WEEK_DAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {reviewDay !== null && (
            <PickerField
              id={`${ids}-review-time`}
              label="Weekly review time"
              type="time"
              value={reviewTime}
              name="weeklyReviewTime"
              disabled={!enabled || pending}
              errors={fieldErrors.weeklyReviewTime}
              onChange={(time) => {
                setReviewTime(time);
                edited();
              }}
            />
          )}
          {enabled && reviewInQuietHours && (
            <p className="text-body-medium font-medium">
              This time is inside your quiet hours, so the weekly review
              reminder will wait until they end at {quietHours.end}.
            </p>
          )}
        </div>

        <div className="grid gap-3 border-t border-outline-variant pt-4">
          <SwitchRow
            id={`${ids}-quiet`}
            name="quietHours"
            label="Quiet hours"
            description="Reminders due in quiet hours wait until they end, together in one notification, unless they've passed by then."
            checked={quiet}
            disabled={!enabled || pending}
            onCheckedChange={(checked) => {
              setQuiet(checked);
              edited();
            }}
          />
          {quiet && (
            <div className="grid min-w-0 gap-4 medium:grid-cols-2">
              <PickerField
                id={`${ids}-quiet-start`}
                label="From"
                type="time"
                value={quietHours.start}
                name="quietHoursStart"
                disabled={!enabled || pending}
                errors={fieldErrors.quietHoursStart}
                onChange={(start) => {
                  setQuietHours((hours) => ({ ...hours, start }));
                  edited();
                }}
              />
              <PickerField
                id={`${ids}-quiet-end`}
                label="Until"
                type="time"
                value={quietHours.end}
                name="quietHoursEnd"
                disabled={!enabled || pending}
                errors={fieldErrors.quietHoursEnd}
                onChange={(end) => {
                  setQuietHours((hours) => ({ ...hours, end }));
                  edited();
                }}
              />
            </div>
          )}
        </div>
      </fieldset>

      {error && error.code !== "VALIDATION" && (
        <InlineBanner tone="error">{error.message}</InlineBanner>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <SaveStatus
          phase={
            pending ? "saving" : error ? "error" : saved ? "saved" : "idle"
          }
        />
      </div>
    </form>
  );
}
