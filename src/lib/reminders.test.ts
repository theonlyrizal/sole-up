import { describe, expect, it } from "vitest";

import {
  isSweepOverdue,
  REMINDER_EARLY_HINT,
  REMINDER_OFFSET_LABELS,
  REMINDER_OFFSETS,
  skippedLabel,
} from "./reminders";

describe("reminder labels", () => {
  it("names every offset the forms offer", () => {
    expect(
      REMINDER_OFFSETS.map((offset) => REMINDER_OFFSET_LABELS[offset]),
    ).toEqual([
      "At the time",
      "10 minutes before",
      "30 minutes before",
      "1 hour before",
      "1 day before",
    ]);
  });

  it("warns that reminders can come early, never late", () => {
    expect(REMINDER_EARLY_HINT).toBe(
      "Reminders may arrive up to 15 minutes early.",
    );
  });

  it("says why a reminder was skipped, blaming quiet hours for one they held", () => {
    expect(skippedLabel("stale", true)).toBe("Skipped: quiet hours");
    expect(skippedLabel("stale", false)).toBe("Skipped: too late");
    expect(skippedLabel("disabled", false)).toBe("Skipped: reminders were off");
    expect(skippedLabel("no_device", false)).toBe(
      "Skipped: no device was set up",
    );
  });
});

describe("isSweepOverdue", () => {
  const now = new Date("2027-01-11T15:00:00.000Z");
  const minutesAgo = (minutes: number) =>
    new Date(now.getTime() - minutes * 60_000);

  it("is overdue when no sweep has run, or none for more than an hour", () => {
    expect(isSweepOverdue(null, now)).toBe(true);
    expect(isSweepOverdue(minutesAgo(61), now)).toBe(true);
  });

  it("isn't overdue within the hour", () => {
    expect(isSweepOverdue(minutesAgo(0), now)).toBe(false);
    expect(isSweepOverdue(minutesAgo(45), now)).toBe(false);
    expect(isSweepOverdue(minutesAgo(60), now)).toBe(false);
  });
});
