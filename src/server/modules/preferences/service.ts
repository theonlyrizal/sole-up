import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import type { WeekStart } from "@/lib/dates";
import { type QuietHours, quietHoursOf } from "@/lib/quiet-hours";
import { recordAudit } from "@/server/audit/record";
import { db, type Db, type DbTransaction } from "@/server/db/client";
import { reminders, userPreferences } from "@/server/db/schema";
import {
  syncNudgeReminderInTx,
  syncUserRemindersInTx,
  syncWeeklyReviewReminderInTx,
} from "@/server/modules/reminders/schedule";

import type {
  SavePreferencesInput,
  SaveReminderSettingsInput,
  SetDailyNudgeTimeInput,
} from "./validation";

export type UserPreferences = {
  /** IANA zone, or `null` until the user has confirmed one. */
  timezone: string | null;
  locale: string;
  weekStart: WeekStart;
};

function toPreferences(
  row: typeof userPreferences.$inferSelect,
): UserPreferences {
  return {
    timezone: row.timezone,
    locale: row.locale,
    weekStart: row.weekStart as WeekStart,
  };
}

/**
 * Creates the user's preferences row with defaults (no time zone) if it
 * doesn't exist yet. Idempotent. Runs on first sign-in, and again on read as
 * a safety net, because Better Auth's after-create hook runs after its own
 * transaction has committed.
 */
export async function ensureUserPreferences(
  userId: string,
  executor: Db | DbTransaction = db,
): Promise<void> {
  await executor
    .insert(userPreferences)
    .values({ userId })
    .onConflictDoNothing({ target: userPreferences.userId });
}

/** The user's preferences, creating the default row on first use. */
export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  await ensureUserPreferences(userId);
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  if (!row) throw new Error("User preferences row is missing");
  return toPreferences(row);
}

/**
 * Releases the user's reminders held for quiet hours (5.5's `held_until`)
 * when what the hold was worked out from changes: the quiet hours or the
 * zone. The next sweep sends them, or holds them again for the hours as
 * they now are.
 */
async function releaseHeldRemindersInTx(
  tx: DbTransaction,
  userId: string,
): Promise<void> {
  await tx
    .update(reminders)
    .set({ heldUntil: null })
    .where(
      and(
        eq(reminders.userId, userId),
        eq(reminders.status, "scheduled"),
        isNotNull(reminders.heldUntil),
      ),
    );
}

/**
 * Saves the user's preferences and records which fields changed. Changing
 * the time zone never rewrites stored local dates (ADR 0004), and of the
 * reminders it moves only the daily nudge and the weekly review reminder,
 * which follow the user's zone; task and event reminders follow their
 * instants (ADR 0013, ADR 0015). Reminders held for quiet hours in the old
 * zone are released, so the next sweep sends them or holds them again by
 * the new zone's clock.
 */
export async function savePreferences(
  userId: string,
  input: SavePreferencesInput,
): Promise<UserPreferences> {
  return db.transaction(async (tx) => {
    await ensureUserPreferences(userId, tx);
    const [current] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .for("update");
    if (!current) throw new Error("User preferences row is missing");

    const changes: {
      timezone?: { from: string | null; to: string };
      locale?: { from: string; to: string };
      weekStart?: { from: number; to: number };
    } = {};
    if (current.timezone !== input.timezone) {
      changes.timezone = { from: current.timezone, to: input.timezone };
    }
    if (current.locale !== input.locale) {
      changes.locale = { from: current.locale, to: input.locale };
    }
    if (current.weekStart !== input.weekStart) {
      changes.weekStart = { from: current.weekStart, to: input.weekStart };
    }
    if (Object.keys(changes).length === 0) return toPreferences(current);

    const [updated] = await tx
      .update(userPreferences)
      .set({
        timezone: input.timezone,
        locale: input.locale,
        weekStart: input.weekStart,
      })
      .where(eq(userPreferences.userId, userId))
      .returning();
    if (!updated) throw new Error("User preferences row is missing");

    await recordAudit(tx, {
      type: "user_preferences.updated",
      userId,
      entityId: userId,
      changes,
    });
    if (changes.timezone) {
      await syncUserRemindersInTx(tx, userId, updated);
      await releaseHeldRemindersInTx(tx, userId);
    }
    return toPreferences(updated);
  });
}

/**
 * Sets the daily planning nudge's local time, or turns it off with null,
 * and schedules or removes its reminder (ADR 0013). The same time again is
 * a no-op with no event.
 */
export async function setDailyNudgeTime(
  userId: string,
  { dailyNudgeTime }: SetDailyNudgeTimeInput,
): Promise<{ dailyNudgeTime: string | null }> {
  return db.transaction(async (tx) => {
    await ensureUserPreferences(userId, tx);
    const [current] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .for("update");
    if (!current) throw new Error("User preferences row is missing");
    if (current.dailyNudgeTime === dailyNudgeTime) return { dailyNudgeTime };

    const [updated] = await tx
      .update(userPreferences)
      .set({ dailyNudgeTime })
      .where(eq(userPreferences.userId, userId))
      .returning();
    if (!updated) throw new Error("User preferences row is missing");

    await recordAudit(tx, {
      type: "user_preferences.updated",
      userId,
      entityId: userId,
      changes: {
        dailyNudgeTime: { from: current.dailyNudgeTime, to: dailyNudgeTime },
      },
    });
    await syncNudgeReminderInTx(tx, userId, updated);
    return { dailyNudgeTime };
  });
}

/** Settings' Reminders section (ADR 0013). */
export type ReminderSettings = {
  remindersEnabled: boolean;
  remindersPrivate: boolean;
  /** Null while quiet hours are off. */
  quietHours: QuietHours | null;
  /** The daily nudge's local "HH:MM", or null while it is off. */
  dailyNudgeTime: string | null;
  /** The weekly review reminder's local weekday and "HH:MM", or null while off. */
  weeklyReview: { day: WeekStart; time: string } | null;
};

function toReminderSettings(
  row: typeof userPreferences.$inferSelect,
): ReminderSettings {
  return {
    remindersEnabled: row.remindersEnabled,
    remindersPrivate: row.remindersPrivate,
    quietHours: quietHoursOf(row.quietHoursStart, row.quietHoursEnd),
    dailyNudgeTime: row.dailyNudgeTime,
    weeklyReview:
      row.weeklyReviewDay !== null && row.weeklyReviewTime !== null
        ? { day: row.weeklyReviewDay as WeekStart, time: row.weeklyReviewTime }
        : null,
  };
}

/** The user's reminder settings, creating the default row on first use. */
export async function getReminderSettings(
  userId: string,
): Promise<ReminderSettings> {
  await ensureUserPreferences(userId);
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  if (!row) throw new Error("User preferences row is missing");
  return toReminderSettings(row);
}

const REMINDER_SETTING_FIELDS = [
  "remindersEnabled",
  "remindersPrivate",
  "quietHoursStart",
  "quietHoursEnd",
  "dailyNudgeTime",
  "weeklyReviewDay",
  "weeklyReviewTime",
] as const;

/**
 * Saves Settings' Reminders form and records which settings changed in one
 * `user_preferences.updated` event; saving it unchanged is a no-op.
 *
 * - The nudge time reschedules or removes the nudge's reminder, and the
 *   weekly review day or time the weekly review's (ADR 0015).
 * - Changing quiet hours releases reminders held for the old ones (5.5's
 *   `held_until`): the next sweep sends them, or holds them again for the
 *   new hours.
 * - Turning reminders off leaves the schedule as it is; the sweep skips
 *   what comes due while they're off (`disabled`), and nothing is sent.
 */
export async function saveReminderSettings(
  userId: string,
  input: SaveReminderSettingsInput,
): Promise<ReminderSettings> {
  return db.transaction(async (tx) => {
    await ensureUserPreferences(userId, tx);
    const [current] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .for("update");
    if (!current) throw new Error("User preferences row is missing");

    const changed = REMINDER_SETTING_FIELDS.filter(
      (field) => current[field] !== input[field],
    );
    if (changed.length === 0) return toReminderSettings(current);

    const [updated] = await tx
      .update(userPreferences)
      .set(input)
      .where(eq(userPreferences.userId, userId))
      .returning();
    if (!updated) throw new Error("User preferences row is missing");

    await recordAudit(tx, {
      type: "user_preferences.updated",
      userId,
      entityId: userId,
      changes: Object.fromEntries(
        changed.map((field) => [
          field,
          { from: current[field], to: input[field] },
        ]),
      ),
    });
    if (changed.includes("dailyNudgeTime")) {
      await syncNudgeReminderInTx(tx, userId, updated);
    }
    if (
      changed.includes("weeklyReviewDay") ||
      changed.includes("weeklyReviewTime")
    ) {
      await syncWeeklyReviewReminderInTx(tx, userId, updated);
    }
    if (
      changed.includes("quietHoursStart") ||
      changed.includes("quietHoursEnd")
    ) {
      await releaseHeldRemindersInTx(tx, userId);
    }
    return toReminderSettings(updated);
  });
}

/**
 * Records the user's answer to the one-time starter life areas offer, inside
 * the caller's transaction. Returns false, changing nothing, when the offer
 * was already answered: it is shown once.
 */
export async function answerLifeAreaStarters(
  tx: DbTransaction,
  userId: string,
  answer: "accepted" | "dismissed",
): Promise<boolean> {
  await ensureUserPreferences(userId, tx);
  const [updated] = await tx
    .update(userPreferences)
    .set({ lifeAreaStarters: answer })
    .where(
      and(
        eq(userPreferences.userId, userId),
        isNull(userPreferences.lifeAreaStarters),
      ),
    )
    .returning({ userId: userPreferences.userId });
  if (!updated) return false;

  await recordAudit(tx, {
    type: "user_preferences.updated",
    userId,
    entityId: userId,
    changes: { lifeAreaStarters: { from: null, to: answer } },
  });
  return true;
}
