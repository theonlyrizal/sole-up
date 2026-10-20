import type { WeekStart } from "./dates";

// Pure helpers for user preferences, shared by the settings form (browser)
// and validation (server). Each runtime checks values against its own
// Intl data, and the server's answer is the one that counts.

/**
 * The runtime's IANA zone list, plus "UTC" (V8 leaves it out). Sorted.
 * Node 24's ICU uses some older canonical names (e.g. "Asia/Calcutta",
 * "Europe/Kiev"); browsers accept either spelling.
 */
export function supportedTimeZones(): string[] {
  const zones = new Set(Intl.supportedValuesOf("timeZone"));
  zones.add("UTC");
  return [...zones].sort();
}

let zoneSet: Set<string> | undefined;

/**
 * The runtime's canonical name for an IANA zone, or `null` if it isn't one.
 * Aliases resolve to their canonical zone ("US/Pacific" →
 * "America/Los_Angeles"); offsets ("+05:00") and "Etc/GMT+5"-style zones
 * are rejected because they don't follow anyone's local DST rules.
 */
export function canonicalTimeZone(value: string): string | null {
  if (value.length === 0 || value.length > 64) return null;
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  zoneSet ??= new Set(supportedTimeZones());
  return zoneSet.has(resolved) ? resolved : null;
}

/**
 * The option in `options` that names the same zone as `zone`, or `null`.
 * Used to pre-select the browser's zone when the browser and the server
 * spell it differently ("Asia/Kolkata" vs "Asia/Calcutta").
 */
export function matchTimeZoneOption(
  zone: string,
  options: readonly string[],
): string | null {
  if (options.includes(zone)) return zone;
  const target = canonicalTimeZone(zone);
  if (!target) return null;
  return options.find((option) => canonicalTimeZone(option) === target) ?? null;
}

/** The canonical form of a BCP 47 locale the runtime can format dates in. */
export function canonicalLocale(value: string): string | null {
  if (value.length < 2 || value.length > 35) return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    if (!canonical) return null;
    const [supported] = Intl.DateTimeFormat.supportedLocalesOf(canonical, {
      localeMatcher: "lookup",
    });
    return supported ? canonical : null;
  } catch {
    return null;
  }
}

/** Locales offered in the settings form. Any supported locale is accepted. */
export const COMMON_LOCALES = [
  "en-US",
  "en-GB",
  "en-AU",
  "en-CA",
  "en-IN",
  "de-DE",
  "es-ES",
  "es-MX",
  "fr-FR",
  "id-ID",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "nl-NL",
  "pt-BR",
  "pt-PT",
  "sv-SE",
  "zh-CN",
] as const;

export const DEFAULT_LOCALE = "en-US";
export const DEFAULT_WEEK_START: WeekStart = 1;

export const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A locale's display name in English, e.g. "English (United Kingdom)". */
export function localeLabel(locale: string): string {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale
    );
  } catch {
    return locale;
  }
}

/**
 * The locale options for the settings form: the common list plus `current`,
 * labelled and sorted by label.
 */
export function localeOptions(
  current: string,
): { value: string; label: string }[] {
  return [...new Set<string>([...COMMON_LOCALES, current])]
    .map((value) => ({ value, label: localeLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}
