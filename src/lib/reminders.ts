// Reminder constants shared by the server (schema, validation, scheduling,
// sweep, audit) and the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0013-reminders-sweep-and-delivery.md.

/**
 * How long before its target a reminder fires: at the time, 10 or 30
 * minutes, 1 hour or 1 day before. One reminder per item (ADR 0013).
 */
export const REMINDER_OFFSETS = [0, 10, 30, 60, 1440] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

export function isReminderOffset(value: unknown): value is ReminderOffset {
  return REMINDER_OFFSETS.includes(value as ReminderOffset);
}

/** What a reminder is about: a timed task deadline, a timed event, or the daily nudge. */
export const REMINDER_KINDS = [
  "task_deadline",
  "event",
  "daily_nudge",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/**
 * A delivery's state. `scheduled` waits for its sweep; `sending` is claimed
 * by one; `sent`, `skipped` and `failed` are the record. There is no
 * `cancelled`: removing a reminder deletes its scheduled row (ADR 0013).
 */
export const REMINDER_STATUSES = [
  "scheduled",
  "sending",
  "sent",
  "skipped",
  "failed",
] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

/** Why a reminder was skipped instead of sent (5.5). */
export const REMINDER_SKIP_REASONS = [
  "stale",
  "disabled",
  "no_device",
] as const;
export type ReminderSkipReason = (typeof REMINDER_SKIP_REASONS)[number];

/** The longest error code stored on a reminder (`http_<status>`, `timeout`, …). */
export const REMINDER_ERROR_CODE_MAX = 64;

/**
 * The sweep runs every 15 minutes and sends everything that would fire
 * before the next one, so a reminder is never late, and up to this many
 * minutes early (ADR 0013).
 */
export const SWEEP_INTERVAL_MINUTES = 15;

/** The daily nudge's local wall-clock time, "HH:MM". */
export const NUDGE_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** When a reminder `offsetMinutes` before `target` fires. */
export function fireAtFor(target: Date, offsetMinutes: ReminderOffset): Date {
  return new Date(target.getTime() - offsetMinutes * 60_000);
}

/** Send attempts before a reminder that keeps failing is marked `failed`. */
export const REMINDER_MAX_ATTEMPTS = 3;
