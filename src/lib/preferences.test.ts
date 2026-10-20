import { describe, expect, it } from "vitest";

import {
  COMMON_LOCALES,
  canonicalLocale,
  canonicalTimeZone,
  localeLabel,
  matchTimeZoneOption,
  supportedTimeZones,
} from "./preferences";

describe("time zones", () => {
  it("lists the runtime's zones plus UTC, sorted", () => {
    const zones = supportedTimeZones();
    expect(zones).toContain("UTC");
    expect(zones).toContain("Europe/Berlin");
    expect(zones).toEqual([...zones].sort());
  });

  it("accepts IANA zones and resolves aliases", () => {
    expect(canonicalTimeZone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(canonicalTimeZone("US/Pacific")).toBe("America/Los_Angeles");
    expect(canonicalTimeZone("utc")).toBe("UTC");
    expect(canonicalTimeZone("Etc/UTC")).toBe("UTC");
    // Both spellings resolve to whatever this runtime calls it.
    expect(canonicalTimeZone("Asia/Kolkata")).toBe(
      canonicalTimeZone("Asia/Calcutta"),
    );
    expect(supportedTimeZones()).toContain(canonicalTimeZone("Asia/Kolkata"));
  });

  it("rejects unknown zones and fixed offsets", () => {
    for (const value of [
      "",
      "Mars/Olympus_Mons",
      "+05:00",
      "Etc/GMT+5",
      "x".repeat(65),
    ]) {
      expect(canonicalTimeZone(value)).toBeNull();
    }
  });

  it("matches a zone to an option spelled differently", () => {
    const options = supportedTimeZones();
    expect(matchTimeZoneOption("Europe/Berlin", options)).toBe("Europe/Berlin");
    expect(matchTimeZoneOption("Asia/Kolkata", options)).toBe(
      canonicalTimeZone("Asia/Kolkata"),
    );
    expect(matchTimeZoneOption("Mars/Olympus_Mons", options)).toBeNull();
    expect(matchTimeZoneOption("Asia/Tokyo", ["Europe/Berlin"])).toBeNull();
  });
});

describe("locales", () => {
  it("canonicalizes supported locales", () => {
    expect(canonicalLocale("en-gb")).toBe("en-GB");
    expect(canonicalLocale("de")).toBe("de");
    expect(canonicalLocale("pt-BR")).toBe("pt-BR");
  });

  it("rejects malformed or unsupported locales", () => {
    for (const value of ["", "e", "not a locale", "zz-ZZ", "x".repeat(36)]) {
      expect(canonicalLocale(value)).toBeNull();
    }
  });

  it("offers only valid, canonical locales", () => {
    for (const locale of COMMON_LOCALES) {
      expect(canonicalLocale(locale)).toBe(locale);
    }
  });

  it("labels locales in English", () => {
    expect(localeLabel("en-GB")).toBe("British English");
    expect(localeLabel("de-DE")).toBe("German (Germany)");
  });
});
