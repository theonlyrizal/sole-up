import "server-only";

import { and, asc, eq, gt, isNull, max, sql } from "drizzle-orm";

import {
  addDays,
  startOfWeek,
  todayFor,
  type LocalDate,
  type WeekStart,
} from "@/lib/dates";
import {
  parseCadence,
  scheduleForWeek,
  type HabitSchedule,
} from "@/lib/habits/cadence";
import { isActiveDay } from "@/lib/habits/consistency";
import {
  closePause,
  HABIT_EDITABLE_FIELDS,
  HABIT_STATUS_ACTIONS,
  habitStatusActionOutcome,
  pauseStartDate,
  type Habit,
  type HabitStatusAction,
} from "@/lib/habits/habit";
import {
  changedLogFields,
  FUTURE_DAY,
  INACTIVE_DAY,
  logValueProblem,
  type HabitLogValue,
} from "@/lib/habits/logging";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { isForeignKeyViolation } from "@/server/db/errors";
import {
  habitLogs,
  habitPauses,
  habits,
  habitSchedules,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getUserPreferences } from "@/server/modules/preferences/service";

import {
  CHECK_HAS_NO_TARGET,
  TARGET_REQUIRED,
  type ChangeHabitScheduleInput,
  type ClearHabitLogInput,
  type CreateHabitInput,
  type EditHabitInput,
  type HabitIdInput,
  type SetHabitLogInput,
  type UpdateHabitInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A habit
// that is missing or belongs to someone else is the same NotFoundError.
// Each mutation writes its audit event in the same transaction.
// Rules: ADR 0014. Consistency is the 6.2 engine's; nothing here counts.

const GOAL_KEY = "habits_goal_id_user_id_fk";

type HabitRow = typeof habits.$inferSelect;
type ScheduleRow = typeof habitSchedules.$inferSelect;
type LogRow = typeof habitLogs.$inferSelect;

export function toHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    measure: row.measure,
    unit: row.unit,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    statusChangedAt: row.statusChangedAt,
    goalId: row.goalId,
  };
}

/** `numeric` comes back from the driver as a string. */
const amountFromRow = (value: string | null) =>
  value === null ? null : Number(value);
const amountToRow = (value: number | null) =>
  value === null ? null : value.toFixed(2);

export function toHabitSchedule(row: ScheduleRow): HabitSchedule {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    ...parseCadence(row),
    target: amountFromRow(row.target),
  };
}

export function toHabitLogValue(row: LogRow): HabitLogValue {
  return { status: row.status, value: amountFromRow(row.value) };
}

/** The user's local today and week start, as every date rule here uses. */
async function userCalendar(
  userId: string,
  now: Date,
): Promise<{ today: LocalDate; weekStart: WeekStart }> {
  const preferences = await getUserPreferences(userId);
  return {
    today: todayFor(preferences.timezone ?? "UTC", now),
    weekStart: preferences.weekStart,
  };
}

/** Locks one of the user's habits for the rest of the transaction. */
async function findForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
): Promise<HabitRow> {
  const [row] = await tx
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .for("update");
  if (!row) throw new NotFoundError();
  return row;
}

/**
 * Runs `write`, turning a goal that is missing or another user's (the
 * composite foreign key refusing it) into a field error.
 */
async function guardGoal<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (cause) {
    if (isForeignKeyViolation(cause, GOAL_KEY)) {
      throw new ValidationError({ goalId: ["Choose one of your goals."] });
    }
    throw cause;
  }
}

/**
 * Creates the habit and its first schedule, effective from the start of
 * the user week holding `startDate`.
 */
export async function createHabit(
  userId: string,
  { cadence, target, ...input }: CreateHabitInput,
): Promise<Habit> {
  const { weekStart } = await userCalendar(userId, new Date());
  const effectiveFrom = startOfWeek(input.startDate, weekStart);

  const row = await guardGoal(() =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(habits)
        .values({ ...input, userId })
        .returning();
      if (!row) throw new Error("Habit insert returned no row");

      await tx.insert(habitSchedules).values({
        userId,
        habitId: row.id,
        effectiveFrom,
        ...cadence,
        target: amountToRow(target),
      });

      await recordAudit(tx, {
        type: "habit.created",
        userId,
        entityId: row.id,
        changes: {
          status: { from: null, to: row.status },
          measure: { from: null, to: row.measure },
          startDate: { from: null, to: row.startDate },
          endDate: { from: null, to: row.endDate },
          goalId: { from: null, to: row.goalId },
          effectiveFrom,
          cadenceType: { from: null, to: cadence.cadenceType },
          cadenceConfig: { from: null, to: cadence.cadenceConfig },
        },
      });
      return row;
    }),
  );
  return toHabit(row);
}

/**
 * Edits title, description, dates and goal link in place. Records which
 * fields changed, with old and new values for the dates and goal only.
 */
export async function updateHabit(
  userId: string,
  { id, ...input }: UpdateHabitInput,
): Promise<Habit> {
  const row = await guardGoal(() =>
    db.transaction((tx) => updateHabitInTx(tx, userId, id, input)),
  );
  return toHabit(row);
}

async function updateHabitInTx(
  tx: DbTransaction,
  userId: string,
  id: string,
  input: Omit<UpdateHabitInput, "id">,
): Promise<HabitRow> {
  const current = await findForUpdate(tx, userId, id);
  const fields = HABIT_EDITABLE_FIELDS.filter(
    (field) => current[field] !== input[field],
  );
  if (fields.length === 0) return current;

  const [updated] = await tx
    .update(habits)
    .set(input)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .returning();
  if (!updated) throw new NotFoundError();

  const change = <K extends "startDate" | "endDate" | "goalId">(field: K) =>
    fields.includes(field) && {
      [field]: { from: current[field], to: updated[field] },
    };

  await recordAudit(tx, {
    type: "habit.updated",
    userId,
    entityId: id,
    changes: {
      fields,
      ...change("startDate"),
      ...change("endDate"),
      ...change("goalId"),
    },
  });
  return updated;
}

/**
 * Sets the cadence and target from the start of the user's current week
 * (ADR 0014): a second edit in the same week replaces that week's row, and
 * past weeks keep theirs. Rows starting after this week (a habit that
 * hasn't started yet, or weeks regrouped by a week-start change) would
 * outrank the edit, so they are replaced too. Measure and unit never
 * change; the target must fit the measure. The same schedule again is a
 * no-op with no event.
 */
export async function changeHabitSchedule(
  userId: string,
  { id, ...schedule }: ChangeHabitScheduleInput,
  now: Date = new Date(),
): Promise<HabitSchedule> {
  const { today, weekStart } = await userCalendar(userId, now);
  const effectiveFrom = startOfWeek(today, weekStart);

  return db.transaction(async (tx) => {
    const habit = await findForUpdate(tx, userId, id);
    return changeScheduleInTx(tx, userId, habit, schedule, effectiveFrom);
  });
}

async function changeScheduleInTx(
  tx: DbTransaction,
  userId: string,
  habit: HabitRow,
  { cadence, target }: Omit<ChangeHabitScheduleInput, "id">,
  effectiveFrom: LocalDate,
): Promise<HabitSchedule> {
  const id = habit.id;
  if (habit.measure === "quantity" && target === null) {
    throw new ValidationError({ target: [TARGET_REQUIRED] });
  }
  if (habit.measure === "check" && target !== null) {
    throw new ValidationError({ target: [CHECK_HAS_NO_TARGET] });
  }

  const rows = await tx
    .select()
    .from(habitSchedules)
    .where(
      and(eq(habitSchedules.habitId, id), eq(habitSchedules.userId, userId)),
    )
    .orderBy(asc(habitSchedules.effectiveFrom));
  const currentRow = scheduleForWeek(rows, addDays(effectiveFrom, 6));
  if (!currentRow) throw new Error("Habit has no schedule");
  const current = toHabitSchedule(currentRow);

  const fields = (
    [
      current.cadenceType !== cadence.cadenceType && "cadenceType",
      JSON.stringify(current.cadenceConfig) !==
        JSON.stringify(cadence.cadenceConfig) && "cadenceConfig",
      current.target !== target && "target",
    ] as const
  ).filter((field) => field !== false);
  if (fields.length === 0) return current;

  await tx
    .delete(habitSchedules)
    .where(
      and(
        eq(habitSchedules.habitId, id),
        eq(habitSchedules.userId, userId),
        gt(habitSchedules.effectiveFrom, effectiveFrom),
      ),
    );
  const values = { ...cadence, target: amountToRow(target) };
  const [saved] = await tx
    .insert(habitSchedules)
    .values({ userId, habitId: id, effectiveFrom, ...values })
    .onConflictDoUpdate({
      target: [habitSchedules.habitId, habitSchedules.effectiveFrom],
      set: values,
    })
    .returning();
  if (!saved) throw new Error("Habit schedule upsert returned no row");

  await recordAudit(tx, {
    type: "habit.schedule_changed",
    userId,
    entityId: id,
    changes: {
      effectiveFrom,
      fields,
      cadenceType: { from: current.cadenceType, to: cadence.cadenceType },
      cadenceConfig: {
        from: current.cadenceConfig,
        to: cadence.cadenceConfig,
      },
    },
  });
  return toHabitSchedule(saved);
}

/**
 * The edit dialog's save: the in-place fields (as `updateHabit`) and the
 * schedule from this week (as `changeHabitSchedule`) in one transaction,
 * so a refused target leaves the other fields unsaved too. Each part
 * records its own event, and only when it changed something.
 */
export async function editHabit(
  userId: string,
  { id, cadence, target, ...input }: EditHabitInput,
  now: Date = new Date(),
): Promise<{ habit: Habit; schedule: HabitSchedule }> {
  const { today, weekStart } = await userCalendar(userId, now);
  const effectiveFrom = startOfWeek(today, weekStart);

  return guardGoal(() =>
    db.transaction(async (tx) => {
      const row = await updateHabitInTx(tx, userId, id, input);
      const schedule = await changeScheduleInTx(
        tx,
        userId,
        row,
        { cadence, target },
        effectiveFrom,
      );
      return { habit: toHabit(row), schedule };
    }),
  );
}

/**
 * Opens a pause from today, or from tomorrow when today already has a log,
 * never overlapping an earlier pause. Does nothing when one is open.
 */
async function openPauseInTx(
  tx: DbTransaction,
  userId: string,
  habitId: string,
  today: LocalDate,
): Promise<void> {
  const ofHabit = and(
    eq(habitPauses.habitId, habitId),
    eq(habitPauses.userId, userId),
  );
  const [open] = await tx
    .select({ id: habitPauses.id })
    .from(habitPauses)
    .where(and(ofHabit, isNull(habitPauses.endDate)));
  if (open) return;

  const [logged] = await tx
    .select({ id: habitLogs.id })
    .from(habitLogs)
    .where(
      and(
        eq(habitLogs.habitId, habitId),
        eq(habitLogs.userId, userId),
        eq(habitLogs.localDate, today),
      ),
    );
  const [latest] = await tx
    .select({ endDate: max(habitPauses.endDate) })
    .from(habitPauses)
    .where(ofHabit);

  await tx.insert(habitPauses).values({
    userId,
    habitId,
    startDate: pauseStartDate(today, Boolean(logged), latest?.endDate ?? null),
  });
}

/**
 * Closes the open pause with today as its first active day again, or
 * deletes it when that would leave it empty. Does nothing when none is open.
 */
async function closeOpenPauseInTx(
  tx: DbTransaction,
  userId: string,
  habitId: string,
  today: LocalDate,
): Promise<void> {
  const [open] = await tx
    .select()
    .from(habitPauses)
    .where(
      and(
        eq(habitPauses.habitId, habitId),
        eq(habitPauses.userId, userId),
        isNull(habitPauses.endDate),
      ),
    );
  if (!open) return;

  const outcome = closePause(open.startDate, today);
  const thisPause = and(
    eq(habitPauses.id, open.id),
    eq(habitPauses.userId, userId),
  );
  if (outcome === "delete") {
    await tx.delete(habitPauses).where(thisPause);
  } else {
    await tx.update(habitPauses).set(outcome).where(thisPause);
  }
}

const CONFLICT_MESSAGES: Record<HabitStatusAction, string> = {
  pause: "Restore this habit before pausing it.",
  resume: "Restore this habit to bring it back.",
  archive: "This habit can't be archived from its current status.",
  restore: "Only an archived habit can be restored. Resume it instead.",
};

/**
 * One status action (ADR 0014 "Pause and archive"). Pause and archive open
 * a pause (archive only if none is open); resume and restore close it. The
 * same status again is a no-op with no event; an action the status doesn't
 * allow is a ConflictError and changes nothing.
 */
async function changeHabitStatus(
  userId: string,
  id: string,
  action: HabitStatusAction,
  now: Date,
): Promise<Habit> {
  const { today } = await userCalendar(userId, now);

  return db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    const outcome = habitStatusActionOutcome(action, current.status);
    if (outcome === "noop") return toHabit(current);
    if (outcome === "conflict") {
      throw new ConflictError(CONFLICT_MESSAGES[action]);
    }

    const status = HABIT_STATUS_ACTIONS[action].to;
    if (action === "pause" || action === "archive") {
      await openPauseInTx(tx, userId, id, today);
    } else {
      await closeOpenPauseInTx(tx, userId, id, today);
    }

    // now() is the transaction's start, the same instant as the event.
    const [updated] = await tx
      .update(habits)
      .set({ status, statusChangedAt: sql`now()` })
      .where(and(eq(habits.id, id), eq(habits.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "habit.status_changed",
      userId,
      entityId: id,
      changes: { status: { from: current.status, to: status } },
    });
    return toHabit(updated);
  });
}

export function pauseHabit(
  userId: string,
  { id }: HabitIdInput,
  now: Date = new Date(),
): Promise<Habit> {
  return changeHabitStatus(userId, id, "pause", now);
}

export function resumeHabit(
  userId: string,
  { id }: HabitIdInput,
  now: Date = new Date(),
): Promise<Habit> {
  return changeHabitStatus(userId, id, "resume", now);
}

export function archiveHabit(
  userId: string,
  { id }: HabitIdInput,
  now: Date = new Date(),
): Promise<Habit> {
  return changeHabitStatus(userId, id, "archive", now);
}

export function restoreHabit(
  userId: string,
  { id }: HabitIdInput,
  now: Date = new Date(),
): Promise<Habit> {
  return changeHabitStatus(userId, id, "restore", now);
}

/**
 * Hard delete (ADR 0006). Its schedules, pauses and logs go by cascade; its
 * audit events are removed here.
 */
export async function deleteHabit(
  userId: string,
  { id }: HabitIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(habits)
      .where(and(eq(habits.id, id), eq(habits.userId, userId)))
      .returning({ id: habits.id });
    if (!deleted) throw new NotFoundError();

    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "habit",
      entityId: id,
    });
  });
}

/**
 * Clears the goal link of every habit linked to `goalId`, with a
 * `habit.updated` event each. Called by the goal delete in its transaction
 * before the goal goes (the foreign key's SET NULL is the backstop).
 */
export async function detachHabitsFromGoalInTx(
  tx: DbTransaction,
  userId: string,
  goalId: string,
): Promise<void> {
  const rows = await tx
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.goalId, goalId)))
    .orderBy(asc(habits.id))
    .for("update");
  if (rows.length === 0) return;

  await tx
    .update(habits)
    .set({ goalId: null })
    .where(and(eq(habits.userId, userId), eq(habits.goalId, goalId)));
  for (const row of rows) {
    await recordAudit(tx, {
      type: "habit.updated",
      userId,
      entityId: row.id,
      changes: { fields: ["goalId"], goalId: { from: goalId, to: null } },
    });
  }
}

/** What a log write did: the log now and before, for the UI's undo. */
export type HabitLogResult = {
  habitId: string;
  localDate: LocalDate;
  /** The day's log after the change; null when it has none. */
  log: HabitLogValue | null;
  /** The day's log before the change; null when it had none. */
  previous: HabitLogValue | null;
};

/** The fields a log holds, by name, for its events. */
const logFields = (log: HabitLogValue): ("status" | "value")[] =>
  log.value === null ? ["status"] : ["status", "value"];

const logOfDay = (userId: string, habitId: string, date: LocalDate) =>
  and(
    eq(habitLogs.habitId, habitId),
    eq(habitLogs.userId, userId),
    eq(habitLogs.localDate, date),
  );

/**
 * Creates or corrects a habit's log for one day (ADR 0014 "Logs"): only on
 * an active day, on or before the user's today. `value` is required on a
 * completed quantity log and refused otherwise. The same log again is a
 * no-op with no event. The habit row is locked, so two writes to one day
 * can't race.
 */
export async function setHabitLog(
  userId: string,
  { habitId, localDate, status, value }: SetHabitLogInput,
  now: Date = new Date(),
): Promise<HabitLogResult> {
  const { today } = await userCalendar(userId, now);
  const date = localDate === "today" ? today : localDate;
  const next: HabitLogValue = { status, value };

  return db.transaction(async (tx) => {
    const habit = await findForUpdate(tx, userId, habitId);
    if (date > today) {
      throw new ValidationError({ localDate: [FUTURE_DAY] }, FUTURE_DAY);
    }
    const problem = logValueProblem(habit.measure, next);
    if (problem) throw new ValidationError({ value: [problem] }, problem);

    const pauses = await tx
      .select({
        startDate: habitPauses.startDate,
        endDate: habitPauses.endDate,
      })
      .from(habitPauses)
      .where(
        and(eq(habitPauses.habitId, habitId), eq(habitPauses.userId, userId)),
      );
    if (!isActiveDay(habit, pauses, date)) {
      throw new ValidationError({ localDate: [INACTIVE_DAY] }, INACTIVE_DAY);
    }

    const [existing] = await tx
      .select()
      .from(habitLogs)
      .where(logOfDay(userId, habitId, date));
    const result = (previous: HabitLogValue | null): HabitLogResult => ({
      habitId,
      localDate: date,
      log: next,
      previous,
    });

    if (!existing) {
      await tx.insert(habitLogs).values({
        userId,
        habitId,
        localDate: date,
        status,
        value: amountToRow(value),
      });
      await recordAudit(tx, {
        type: "habit.logged",
        userId,
        entityId: habitId,
        changes: {
          localDate: date,
          fields: logFields(next),
          status: { from: null, to: status },
        },
      });
      return result(null);
    }

    const previous = toHabitLogValue(existing);
    const fields = changedLogFields(previous, next);
    if (fields.length === 0) return result(previous);

    await tx
      .update(habitLogs)
      .set({ status, value: amountToRow(value) })
      .where(logOfDay(userId, habitId, date));
    await recordAudit(tx, {
      type: "habit.log_changed",
      userId,
      entityId: habitId,
      changes: {
        localDate: date,
        fields,
        status: { from: previous.status, to: status },
      },
    });
    return result(previous);
  });
}

/**
 * Removes a habit's log for one day: undo, or a correction to "no log".
 * Allowed on any day, so a log kept on a day that no longer counts can
 * still go. A day with no log is a no-op with no event.
 */
export async function clearHabitLog(
  userId: string,
  { habitId, localDate }: ClearHabitLogInput,
  now: Date = new Date(),
): Promise<HabitLogResult> {
  const { today } = await userCalendar(userId, now);
  const date = localDate === "today" ? today : localDate;

  return db.transaction(async (tx) => {
    await findForUpdate(tx, userId, habitId);
    const [removed] = await tx
      .delete(habitLogs)
      .where(logOfDay(userId, habitId, date))
      .returning();
    if (!removed) {
      return { habitId, localDate: date, log: null, previous: null };
    }

    const previous = toHabitLogValue(removed);
    await recordAudit(tx, {
      type: "habit.log_removed",
      userId,
      entityId: habitId,
      changes: {
        localDate: date,
        fields: logFields(previous),
        status: { from: previous.status, to: null },
      },
    });
    return { habitId, localDate: date, log: null, previous };
  });
}
