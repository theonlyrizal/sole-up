import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import type { WeekStart } from "@/lib/dates";
import { recordAudit } from "@/server/audit/record";
import { db, type Db, type DbTransaction } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";
import { syncNudgeReminderInTx } from "@/server/modules/reminders/schedule";

import type {
  SavePreferencesInput,
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
 * Saves the user's preferences and records which fields changed. Changing
 * the time zone never rewrites stored local dates (ADR 0004), and of the
 * reminders it moves only the daily nudge, which follows the user's zone;
 * task and event reminders follow their instants (ADR 0013).
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
    if (changes.timezone) await syncNudgeReminderInTx(tx, userId, updated);
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
