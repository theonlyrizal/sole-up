"use client";

import { useId, useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InlineBanner } from "@/components/ui/inline-banner";
import { SaveStatus } from "@/components/ui/save-status";
import { Select } from "@/components/ui/select";
import type { WeekStart } from "@/lib/dates";
import {
  WEEK_DAYS,
  canonicalLocale,
  localeLabel,
  matchTimeZoneOption,
} from "@/lib/preferences";
import { internalError, type ActionError } from "@/lib/result";
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
    if (pending) return;
    startTransition(async () => {
      setError(null);
      setSaved(false);
      try {
        const result = await savePreferences({ timezone, locale, weekStart });
        if (result.ok) {
          setChosenZone(result.data.timezone);
          setChosenLocale(result.data.locale);
          setSaved(true);
        } else {
          setError(result.error);
        }
      } catch {
        setError(internalError());
      }
    });
  }

  const showDeviceHint =
    mode === "settings" && deviceZone !== null && deviceZone !== timezone;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <FormField
        id={`${ids}-timezone`}
        label="Time zone"
        hint={
          mode === "confirm"
            ? "Suggested from this device. SoleUp uses it to decide what “today” is."
            : "SoleUp uses it to decide what “today” is. Type the start of a time zone name to find it. Changing it doesn't move dates you've already set."
        }
        errors={fieldErrors.timezone}
      >
        {(control) => (
          <Select
            {...control}
            name="timezone"
            disabled={pending}
            value={timezone}
            required
            onChange={(event) => {
              setChosenZone(event.target.value);
              edited();
            }}
          >
            {timezone === "" && <option value="">Choose a time zone</option>}
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zoneLabel(zone)}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      {showDeviceHint && (
        <div className="-mt-3 flex flex-wrap items-center gap-x-2 text-body-medium text-on-surface-variant">
          <p>This device is set to {zoneLabel(deviceZone)}.</p>
          <Button
            variant="text"
            size="xs"
            disabled={pending}
            onClick={() => {
              setChosenZone(deviceZone);
              edited();
            }}
          >
            Use it
          </Button>
        </div>
      )}

      <FormField
        id={`${ids}-locale`}
        label="Language and region"
        hint="Sets how dates and numbers are formatted."
        errors={fieldErrors.locale}
      >
        {(control) => (
          <Select
            {...control}
            name="locale"
            disabled={pending}
            value={locale}
            onChange={(event) => {
              setChosenLocale(event.target.value);
              edited();
            }}
          >
            {localeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <FormField
        id={`${ids}-week-start`}
        label="Week starts on"
        errors={fieldErrors.weekStart}
      >
        {(control) => (
          <Select
            {...control}
            name="weekStart"
            disabled={pending}
            value={weekStart}
            onChange={(event) => {
              setWeekStart(Number(event.target.value) as WeekStart);
              edited();
            }}
          >
            {WEEK_DAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      {error && error.code !== "VALIDATION" && (
        <InlineBanner tone="error">{error.message}</InlineBanner>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          aria-busy={pending || undefined}
          disabled={pending || timezone === ""}
        >
          {pending
            ? "Saving…"
            : mode === "confirm"
              ? "Confirm and continue"
              : "Save"}
        </Button>
        {mode === "settings" && (
          <SaveStatus
            phase={
              pending ? "saving" : error ? "error" : saved ? "saved" : "idle"
            }
          />
        )}
      </div>
    </form>
  );
}
