"use client";

import { useId, useState, useSyncExternalStore, useTransition } from "react";

import type { WeekStart } from "@/lib/dates";
import {
  WEEK_DAYS,
  canonicalLocale,
  localeLabel,
  matchTimeZoneOption,
} from "@/lib/preferences";
import type { ActionError } from "@/lib/result";
import { savePreferences } from "@/server/modules/preferences/actions";

type Preferences = {
  timezone: string | null;
  locale: string;
  weekStart: WeekStart;
};

type Props = {
  initial: Preferences;
  /** The server's zone list: the stored value is always one of these. */
  timeZones: string[];
  /**
   * Locale options labelled on the server, so the first render matches
   * between server and browser (their Intl data can differ).
   */
  locales: { value: string; label: string }[];
  /**
   * `confirm`: first sign-in. The browser's zone and language are proposed,
   * and nothing is stored until the user saves. `settings`: the saved values
   * are shown, and a different device zone is only pointed out.
   */
  mode: "confirm" | "settings";
};

type Device = { timezone: string; locale: string };

const noSubscription = () => () => {};

let deviceSnapshot: Device | undefined;
function readDevice(): Device {
  deviceSnapshot ??= {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
  };
  return deviceSnapshot;
}

/** The browser's zone and language; `null` while rendering on the server. */
function useDevice(): Device | null {
  return useSyncExternalStore(noSubscription, readDevice, () => null);
}

function zoneLabel(zone: string) {
  return zone.replaceAll("_", " ");
}

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger";

export function PreferencesForm({ initial, timeZones, locales, mode }: Props) {
  const ids = useId();
  const device = useDevice();
  const deviceZone = device
    ? matchTimeZoneOption(device.timezone, timeZones)
    : null;
  const deviceLocale = device ? canonicalLocale(device.locale) : null;

  // `null` means "not touched": show the saved value, or the proposal.
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const [chosenLocale, setChosenLocale] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<WeekStart>(initial.weekStart);
  const [error, setError] = useState<ActionError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const timezone = chosenZone ?? initial.timezone ?? deviceZone ?? "";
  const locale =
    chosenLocale ??
    (mode === "confirm" ? (deviceLocale ?? initial.locale) : initial.locale);

  const localeOptions =
    deviceLocale && !locales.some((option) => option.value === deviceLocale)
      ? [...locales, { value: deviceLocale, label: localeLabel(deviceLocale) }]
      : locales;

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};

  function edited() {
    setSaved(false);
    setError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const result = await savePreferences({ timezone, locale, weekStart });
      if (result.ok) {
        setChosenZone(result.data.timezone);
        setChosenLocale(result.data.locale);
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  const showDeviceHint =
    mode === "settings" && deviceZone !== null && deviceZone !== timezone;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field
        id={`${ids}-timezone`}
        label="Time zone"
        hint={
          mode === "confirm"
            ? "Suggested from this device. SoleUp uses it to decide what “today” is."
            : "SoleUp uses it to decide what “today” is. Changing it doesn't move dates you've already set."
        }
        errors={fieldErrors.timezone}
      >
        {(describedBy, invalid) => (
          <select
            id={`${ids}-timezone`}
            name="timezone"
            value={timezone}
            required
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setChosenZone(event.target.value);
              edited();
            }}
            className={fieldClass}
          >
            {timezone === "" && <option value="">Choose a time zone</option>}
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zoneLabel(zone)}
              </option>
            ))}
          </select>
        )}
      </Field>

      {showDeviceHint && (
        <p className="-mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          This device is set to {zoneLabel(deviceZone)}.
          <button
            type="button"
            onClick={() => {
              setChosenZone(deviceZone);
              edited();
            }}
            className="rounded-sm underline underline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Use it
          </button>
        </p>
      )}

      <Field
        id={`${ids}-locale`}
        label="Language and region"
        hint="Sets how dates and numbers are formatted."
        errors={fieldErrors.locale}
      >
        {(describedBy, invalid) => (
          <select
            id={`${ids}-locale`}
            name="locale"
            value={locale}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setChosenLocale(event.target.value);
              edited();
            }}
            className={fieldClass}
          >
            {localeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        id={`${ids}-week-start`}
        label="Week starts on"
        errors={fieldErrors.weekStart}
      >
        {(describedBy, invalid) => (
          <select
            id={`${ids}-week-start`}
            name="weekStart"
            value={weekStart}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setWeekStart(Number(event.target.value) as WeekStart);
              edited();
            }}
            className={fieldClass}
          >
            {WEEK_DAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || timezone === ""}
          className="rounded-md bg-accent px-4 py-2 text-base font-medium text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? "Saving…"
            : mode === "confirm"
              ? "Confirm and continue"
              : "Save"}
        </button>
        <p role="status" className="text-sm text-success">
          {saved && mode === "settings" ? "Saved." : null}
        </p>
      </div>
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error && error.code !== "VALIDATION" ? error.message : null}
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  children: (
    describedBy: string | undefined,
    invalid: boolean,
  ) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(describedBy, Boolean(errorId))}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {errorId && (
        <p id={errorId} className="text-sm text-danger">
          {errors!.join(" ")}
        </p>
      )}
    </div>
  );
}
