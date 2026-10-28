import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import {
  auditEvents,
  goals,
  habitLogs,
  habitPauses,
  habits,
  habitSchedules,
  userPreferences,
  users,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { createGoal, deleteGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  archiveHabit,
  changeHabitSchedule,
  createHabit,
  deleteHabit,
  pauseHabit,
  restoreHabit,
  resumeHabit,
  updateHabit,
} from "./service";
import {
  changeHabitScheduleSchema,
  createHabitSchema,
  updateHabitSchema,
} from "./validation";

// Wednesday 4 Nov 2026, midday UTC. With no confirmed zone the user's today
// is 2026-11-04; with the default Monday week start the week began 11-02.
const NOW = new Date("2026-11-04T12:00:00Z");
const TODAY = "2026-11-04";
const TOMORROW = "2026-11-05";
const WEEK_START = "2026-11-02";

const at = (iso: string) => new Date(iso);

type DriverError = { cause?: { code?: string; constraint?: string } };

/** Runs the write and returns the database error it raised, if any. */
async function writeError(write: () => Promise<unknown>) {
  try {
    await write();
    return null;
  } catch (error: unknown) {
    return error as DriverError;
  }
}

async function expectViolation(
  write: () => Promise<unknown>,
  code: string,
  constraint?: string,
) {
  expect(await writeError(write)).toMatchObject({
    cause: constraint ? { code, constraint } : { code },
  });
}

const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

function checkHabit(fields: Record<string, unknown> = {}) {
  return createHabitSchema.parse({
    title: "Stretch",
    measure: "check",
    startDate: "2026-10-01",
    cadenceType: "daily",
    cadenceConfig: {},
    ...fields,
  });
}

function quantityHabit(fields: Record<string, unknown> = {}) {
  return createHabitSchema.parse({
    title: "Drink water",
    description: "Before coffee",
    measure: "quantity",
    unit: "glasses",
    target: "4321.5",
    startDate: "2026-10-01",
    cadenceType: "times_per_week",
    cadenceConfig: { timesPerWeek: 3 },
    ...fields,
  });
}

const schedule = (id: string, fields: Record<string, unknown>) =>
  changeHabitScheduleSchema.parse({ id, ...fields });

async function readHabit(id: string) {
  const [row] = await db.select().from(habits).where(eq(habits.id, id));
  return row;
}

async function schedulesOf(habitId: string) {
  return db
    .select()
    .from(habitSchedules)
    .where(eq(habitSchedules.habitId, habitId))
    .orderBy(asc(habitSchedules.effectiveFrom));
}

async function pausesOf(habitId: string) {
  return db
    .select({ startDate: habitPauses.startDate, endDate: habitPauses.endDate })
    .from(habitPauses)
    .where(eq(habitPauses.habitId, habitId))
    .orderBy(asc(habitPauses.startDate));
}

async function eventsFor(userId: string, entityId?: string) {
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        entityId ? eq(auditEvents.entityId, entityId) : undefined,
      ),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
}

async function seedHabit(userId: string) {
  const [habit] = await db
    .insert(habits)
    .values({ userId, title: "Seeded", measure: "check", startDate: TODAY })
    .returning();
  return habit!;
}

async function logToday(userId: string, habitId: string) {
  await db
    .insert(habitLogs)
    .values({ userId, habitId, localDate: TODAY, status: "completed" });
}

describe("schema", () => {
  it("checks habits' status, measure, unit, dates and lengths", async () => {
    const user = await createTestUser();
    const base = {
      userId: user.id,
      title: "Ok",
      measure: "check" as const,
      startDate: TODAY,
    };
    const insert = (values: Partial<typeof habits.$inferInsert>) => () =>
      db.insert(habits).values({ ...base, ...values });

    await expectViolation(
      insert({ status: "done" as never }),
      CHECK,
      "habits_status_check",
    );
    await expectViolation(
      insert({ measure: "minutes" as never }),
      CHECK,
      "habits_measure_check",
    );
    await expectViolation(
      insert({ measure: "quantity" }),
      CHECK,
      "habits_unit_check",
    );
    await expectViolation(insert({ unit: "km" }), CHECK, "habits_unit_check");
    await expectViolation(
      insert({ endDate: "2026-11-03" }),
      CHECK,
      "habits_date_order_check",
    );
    await expectViolation(
      insert({ title: "" }),
      CHECK,
      "habits_title_length_check",
    );
    await expectViolation(
      insert({ description: "x".repeat(2001) }),
      CHECK,
      "habits_description_length_check",
    );
    await expectViolation(
      insert({ measure: "quantity", unit: "x".repeat(31) }),
      CHECK,
      "habits_unit_length_check",
    );

    await insert({ measure: "quantity", unit: "km", endDate: TODAY })();
    const [row] = await db
      .select()
      .from(habits)
      .where(eq(habits.userId, user.id));
    expect(row).toMatchObject({ status: "active", goalId: null });
  });

  it("checks schedules' cadence, config and target, one row per week", async () => {
    const user = await createTestUser();
    const habit = await seedHabit(user.id);
    const base = {
      userId: user.id,
      habitId: habit.id,
      effectiveFrom: WEEK_START,
    };
    const insert =
      (values: Partial<typeof habitSchedules.$inferInsert>) => () =>
        db.insert(habitSchedules).values({
          ...base,
          cadenceType: "daily",
          cadenceConfig: {},
          ...values,
        });

    await expectViolation(
      insert({ cadenceType: "monthly" as never }),
      CHECK,
      "habit_schedules_cadence_type_check",
    );
    for (const [cadenceType, cadenceConfig] of [
      ["daily", { days: [1] }],
      ["weekly_days", {}],
      ["weekly_days", { days: 3 }],
      ["weekly_days", { days: [1], timesPerWeek: 2 }],
      ["times_per_week", { timesPerWeek: "3" }],
      ["times_per_week", []],
    ] as const) {
      await expectViolation(
        insert({ cadenceType, cadenceConfig }),
        CHECK,
        "habit_schedules_cadence_config_check",
      );
    }
    await expectViolation(
      insert({ target: "0" }),
      CHECK,
      "habit_schedules_target_check",
    );
    // numeric(7, 2): above 99,999.99 overflows.
    await expectViolation(insert({ target: "100000" }), "22003");

    await insert({ target: "99999.99" })();
    await expectViolation(
      insert({ cadenceType: "weekly_days", cadenceConfig: { days: [1] } }),
      UNIQUE,
      "habit_schedules_habit_id_effective_from_key",
    );
    await insert({
      effectiveFrom: "2026-11-09",
      cadenceType: "times_per_week",
      cadenceConfig: { timesPerWeek: 2 },
    })();
    expect(await schedulesOf(habit.id)).toHaveLength(2);
  });

  it("allows one open pause per habit and needs the end after the start", async () => {
    const user = await createTestUser();
    const habit = await seedHabit(user.id);
    const other = await seedHabit(user.id);
    const pause = (values: Partial<typeof habitPauses.$inferInsert>) => () =>
      db.insert(habitPauses).values({
        userId: user.id,
        habitId: habit.id,
        startDate: TODAY,
        ...values,
      });

    await expectViolation(
      pause({ endDate: TODAY }),
      CHECK,
      "habit_pauses_date_order_check",
    );
    await pause({ startDate: "2026-10-01", endDate: "2026-10-05" })();
    await pause({ startDate: "2026-10-10", endDate: "2026-10-12" })();
    await pause({})();
    await expectViolation(
      pause({ startDate: TOMORROW }),
      UNIQUE,
      "habit_pauses_one_open_key",
    );
    // Another habit has its own open pause.
    await db
      .insert(habitPauses)
      .values({ userId: user.id, habitId: other.id, startDate: TODAY });
  });

  it("refuses a duplicate log and checks status, value and note", async () => {
    const user = await createTestUser();
    const habit = await seedHabit(user.id);
    const log = (values: Partial<typeof habitLogs.$inferInsert>) => () =>
      db.insert(habitLogs).values({
        userId: user.id,
        habitId: habit.id,
        localDate: TODAY,
        status: "completed",
        ...values,
      });

    await expectViolation(
      log({ status: "missed" as never }),
      CHECK,
      "habit_logs_status_check",
    );
    await expectViolation(
      log({ status: "skipped", value: "2" }),
      CHECK,
      "habit_logs_skip_value_check",
    );
    await expectViolation(log({ value: "0" }), CHECK, "habit_logs_value_check");
    await expectViolation(
      log({ note: "" }),
      CHECK,
      "habit_logs_note_length_check",
    );

    await log({})();
    await expectViolation(
      log({ status: "skipped" }),
      UNIQUE,
      "habit_logs_habit_id_local_date_key",
    );
    await log({ localDate: TOMORROW, status: "skipped" })();
    // The same date on another habit is fine.
    const other = await seedHabit(user.id);
    await log({ habitId: other.id })();
  });

  it("never links a child row or a goal across users", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const habit = await seedHabit(owner.id);
    const goal = await createGoal(
      owner.id,
      createGoalSchema.parse({ title: "Feel rested" }),
    );

    await expectViolation(
      () =>
        db.insert(habitSchedules).values({
          userId: intruder.id,
          habitId: habit.id,
          effectiveFrom: WEEK_START,
          cadenceType: "daily",
          cadenceConfig: {},
        }),
      FOREIGN_KEY,
      "habit_schedules_habit_id_user_id_fk",
    );
    await expectViolation(
      () =>
        db
          .insert(habitPauses)
          .values({ userId: intruder.id, habitId: habit.id, startDate: TODAY }),
      FOREIGN_KEY,
      "habit_pauses_habit_id_user_id_fk",
    );
    await expectViolation(
      () =>
        db.insert(habitLogs).values({
          userId: intruder.id,
          habitId: habit.id,
          localDate: TODAY,
          status: "completed",
        }),
      FOREIGN_KEY,
      "habit_logs_habit_id_user_id_fk",
    );
    await expectViolation(
      () =>
        db.insert(habits).values({
          userId: intruder.id,
          title: "Mine now",
          measure: "check",
          startDate: TODAY,
          goalId: goal.id,
        }),
      FOREIGN_KEY,
      "habits_goal_id_user_id_fk",
    );
  });

  it("deleting a goal in the database clears goal_id and keeps user_id", async () => {
    const user = await createTestUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Feel rested" }),
    );
    const habit = await createHabit(user.id, checkHabit({ goalId: goal.id }));

    // Straight to the database: the foreign key's SET NULL (goal_id) alone.
    await db.delete(goals).where(eq(goals.id, goal.id));

    expect(await readHabit(habit.id)).toMatchObject({
      goalId: null,
      userId: user.id,
    });
  });

  it("deleting the account removes habits and every child row", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, checkHabit());
    await pauseHabit(user.id, { id: habit.id }, NOW);
    await logToday(user.id, habit.id);

    await db.delete(users).where(eq(users.id, user.id));

    expect(await readHabit(habit.id)).toBeUndefined();
    expect(await schedulesOf(habit.id)).toEqual([]);
    expect(await pausesOf(habit.id)).toEqual([]);
    expect(
      await db.select().from(habitLogs).where(eq(habitLogs.habitId, habit.id)),
    ).toEqual([]);
  });
});

describe("createHabit", () => {
  it("writes the habit and its first schedule from the week of the start date", async () => {
    const user = await createTestUser();
    const habit = await createHabit(
      user.id,
      checkHabit({
        startDate: "2026-11-05",
        cadenceType: "weekly_days",
        cadenceConfig: { days: [5, 1] },
      }),
    );

    expect(habit).toMatchObject({
      status: "active",
      measure: "check",
      unit: null,
      startDate: "2026-11-05",
    });
    expect(await schedulesOf(habit.id)).toMatchObject([
      {
        userId: user.id,
        effectiveFrom: WEEK_START,
        cadenceType: "weekly_days",
        cadenceConfig: { days: [1, 5] },
        target: null,
      },
    ]);

    const [event] = await eventsFor(user.id, habit.id);
    expect(event).toMatchObject({
      eventType: "habit.created",
      entityType: "habit",
      changes: {
        status: { from: null, to: "active" },
        measure: { from: null, to: "check" },
        startDate: { from: null, to: "2026-11-05" },
        effectiveFrom: WEEK_START,
        cadenceType: { from: null, to: "weekly_days" },
        cadenceConfig: { from: null, to: { days: [1, 5] } },
      },
    });
  });

  it("follows the user's week start", async () => {
    const user = await createTestUser();
    await db
      .insert(userPreferences)
      .values({ userId: user.id, weekStart: 0 })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { weekStart: 0 },
      });

    const habit = await createHabit(user.id, checkHabit({ startDate: TODAY }));

    expect((await schedulesOf(habit.id))[0]?.effectiveFrom).toBe("2026-11-01");
  });

  it("stores a quantity habit's target as an exact 2-decimal number", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, quantityHabit());

    expect(habit).toMatchObject({ measure: "quantity", unit: "glasses" });
    expect(await schedulesOf(habit.id)).toMatchObject([
      { target: "4321.50", cadenceConfig: { timesPerWeek: 3 } },
    ]);
  });

  it("refuses another user's goal as a field error and writes nothing", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const goal = await createGoal(
      owner.id,
      createGoalSchema.parse({ title: "Feel rested" }),
    );

    const error = await createHabit(
      intruder.id,
      checkHabit({ goalId: goal.id }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toEqual({
      goalId: ["Choose one of your goals."],
    });
    expect(
      await db.select().from(habits).where(eq(habits.userId, intruder.id)),
    ).toEqual([]);
    expect(await eventsFor(intruder.id)).toEqual([]);
  });
});

describe("updateHabit", () => {
  it("edits in place and records changed fields with dates and goal only", async () => {
    const user = await createTestUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Feel rested" }),
    );
    const habit = await createHabit(user.id, checkHabit());

    const updated = await updateHabit(
      user.id,
      updateHabitSchema.parse({
        id: habit.id,
        title: "Stretch longer",
        description: "Ten minutes",
        startDate: "2026-09-01",
        endDate: "2026-12-31",
        goalId: goal.id,
      }),
    );

    expect(updated).toMatchObject({
      title: "Stretch longer",
      startDate: "2026-09-01",
      endDate: "2026-12-31",
      goalId: goal.id,
    });
    const events = await eventsFor(user.id, habit.id);
    expect(events.at(-1)).toMatchObject({
      eventType: "habit.updated",
      changes: {
        fields: ["title", "description", "startDate", "endDate", "goalId"],
        startDate: { from: "2026-10-01", to: "2026-09-01" },
        endDate: { from: null, to: "2026-12-31" },
        goalId: { from: null, to: goal.id },
      },
    });
  });

  it("is a no-op with no event when nothing changed", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, checkHabit());

    await updateHabit(
      user.id,
      updateHabitSchema.parse({
        id: habit.id,
        title: habit.title,
        startDate: habit.startDate,
      }),
    );

    expect(await eventsFor(user.id, habit.id)).toHaveLength(1);
  });

  it("refuses another user's goal as a field error", async () => {
    const owner = await createTestUser();
    const user = await createTestUser();
    const goal = await createGoal(
      owner.id,
      createGoalSchema.parse({ title: "Theirs" }),
    );
    const habit = await createHabit(user.id, checkHabit());

    await expect(
      updateHabit(
        user.id,
        updateHabitSchema.parse({
          id: habit.id,
          title: "Stretch",
          startDate: habit.startDate,
          goalId: goal.id,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await readHabit(habit.id))?.goalId).toBeNull();
  });
});

describe("changeHabitSchedule", () => {
  it("adds a row from this week and keeps the past week's", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, checkHabit());

    const saved = await changeHabitSchedule(
      user.id,
      schedule(habit.id, {
        cadenceType: "weekly_days",
        cadenceConfig: { days: [2, 4] },
      }),
      NOW,
    );

    expect(saved).toMatchObject({
      effectiveFrom: WEEK_START,
      cadenceType: "weekly_days",
      cadenceConfig: { days: [2, 4] },
      target: null,
    });
    expect(
      (await schedulesOf(habit.id)).map((row) => [
        row.effectiveFrom,
        row.cadenceType,
      ]),
    ).toEqual([
      ["2026-09-28", "daily"],
      [WEEK_START, "weekly_days"],
    ]);
    expect((await eventsFor(user.id, habit.id)).at(-1)).toMatchObject({
      eventType: "habit.schedule_changed",
      changes: {
        effectiveFrom: WEEK_START,
        fields: ["cadenceType", "cadenceConfig"],
        cadenceType: { from: "daily", to: "weekly_days" },
        cadenceConfig: { from: {}, to: { days: [2, 4] } },
      },
    });
  });

  it("a second edit in the same week replaces the first", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, quantityHabit());

    await changeHabitSchedule(
      user.id,
      schedule(habit.id, {
        cadenceType: "times_per_week",
        cadenceConfig: { timesPerWeek: 4 },
        target: 6,
      }),
      NOW,
    );
    await changeHabitSchedule(
      user.id,
      schedule(habit.id, {
        cadenceType: "daily",
        cadenceConfig: {},
        target: 2.25,
      }),
      at("2026-11-08T20:00:00Z"),
    );

    expect(
      (await schedulesOf(habit.id)).map((row) => [
        row.effectiveFrom,
        row.cadenceType,
        row.target,
      ]),
    ).toEqual([
      ["2026-09-28", "times_per_week", "4321.50"],
      [WEEK_START, "daily", "2.25"],
    ]);
    const changes = (await eventsFor(user.id, habit.id))
      .filter((event) => event.eventType === "habit.schedule_changed")
      .map((event) => event.changes);
    expect(changes).toEqual([
      {
        effectiveFrom: WEEK_START,
        fields: ["cadenceConfig", "target"],
        cadenceType: { from: "times_per_week", to: "times_per_week" },
        cadenceConfig: { from: { timesPerWeek: 3 }, to: { timesPerWeek: 4 } },
      },
      {
        effectiveFrom: WEEK_START,
        fields: ["cadenceType", "cadenceConfig", "target"],
        cadenceType: { from: "times_per_week", to: "daily" },
        cadenceConfig: { from: { timesPerWeek: 4 }, to: {} },
      },
    ]);
  });

  it("an edit in the habit's first week replaces its first row", async () => {
    const user = await createTestUser();
    const habit = await createHabit(
      user.id,
      checkHabit({ startDate: "2026-11-03" }),
    );

    await changeHabitSchedule(
      user.id,
      schedule(habit.id, {
        cadenceType: "times_per_week",
        cadenceConfig: { timesPerWeek: 2 },
      }),
      NOW,
    );

    expect(await schedulesOf(habit.id)).toMatchObject([
      { effectiveFrom: WEEK_START, cadenceType: "times_per_week" },
    ]);
  });

  it("replaces rows after this week, so a habit not yet started takes the edit", async () => {
    const user = await createTestUser();
    const habit = await createHabit(
      user.id,
      checkHabit({ startDate: "2026-12-02" }),
    );
    expect((await schedulesOf(habit.id))[0]?.effectiveFrom).toBe("2026-11-30");

    await changeHabitSchedule(
      user.id,
      schedule(habit.id, {
        cadenceType: "weekly_days",
        cadenceConfig: { days: [3] },
      }),
      NOW,
    );

    expect(await schedulesOf(habit.id)).toMatchObject([
      { effectiveFrom: WEEK_START, cadenceType: "weekly_days" },
    ]);
  });

  it("is a no-op with no event for the same schedule", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, checkHabit());

    const result = await changeHabitSchedule(
      user.id,
      schedule(habit.id, { cadenceType: "daily", cadenceConfig: {} }),
      NOW,
    );

    expect(result.effectiveFrom).toBe("2026-09-28");
    expect(await schedulesOf(habit.id)).toHaveLength(1);
    expect(await eventsFor(user.id, habit.id)).toHaveLength(1);
  });

  it("needs a target for a quantity habit and refuses one for a check habit", async () => {
    const user = await createTestUser();
    const check = await createHabit(user.id, checkHabit());
    const quantity = await createHabit(user.id, quantityHabit());

    const checkError = await changeHabitSchedule(
      user.id,
      schedule(check.id, { cadenceType: "daily", target: 3 }),
      NOW,
    ).catch((caught: unknown) => caught);
    const quantityError = await changeHabitSchedule(
      user.id,
      schedule(quantity.id, { cadenceType: "daily" }),
      NOW,
    ).catch((caught: unknown) => caught);

    expect((checkError as ValidationError).fieldErrors).toEqual({
      target: ["Only quantity habits have a target."],
    });
    expect((quantityError as ValidationError).fieldErrors).toEqual({
      target: ["Enter the amount to aim for each day."],
    });
    expect(await schedulesOf(check.id)).toHaveLength(1);
    expect(await schedulesOf(quantity.id)).toHaveLength(1);
  });
});

describe("pause, resume, archive and restore", () => {
  it("pauses from today and a same-day resume deletes the empty pause", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, checkHabit());

    const paused = await pauseHabit(user.id, { id: habit.id }, NOW);
    expect(paused.status).toBe("paused");
    expect(await pausesOf(habit.id)).toEqual([
      { startDate: TODAY, endDate: null },
    ]);

    const resumed = await resumeHabit(user.id, { id: habit.id }, NOW);
    expect(resumed.status).toBe("active");
    expect(await pausesOf(habit.id)).toEqual([]);
    expect(
      (await eventsFor(user.id, habit.id))
        .filter((event) => event.eventType === "habit.status_changed")
        .map((event) => event.changes),
    ).toEqual([
      { status: { from: "active", to: "paused" } },
      { status: { from: "paused", to: "active" } },
    ]);
  });

  it("pauses from tomorrow when today is logged", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, checkHabit());
    await logToday(user.id, habit.id);

    await pauseHabit(user.id, { id: habit.id }, NOW);
    expect(await pausesOf(habit.id)).toEqual([
      { startDate: TOMORROW, endDate: null },
    ]);

    // Resuming before it began leaves nothing behind.
    await resumeHabit(user.id, { id: habit.id }, NOW);
    expect(await pausesOf(habit.id)).toEqual([]);
  });

  it("resuming on a later day closes the pause, and a new pause follows it", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, checkHabit());

    await pauseHabit(user.id, { id: habit.id }, at("2026-11-02T09:00:00Z"));
    await resumeHabit(user.id, { id: habit.id }, NOW);
    await pauseHabit(user.id, { id: habit.id }, NOW);

    expect(await pausesOf(habit.id)).toEqual([
      { startDate: "2026-11-02", endDate: TODAY },
      { startDate: TODAY, endDate: null },
    ]);
  });

  it("uses the user's own today", async () => {
    const user = await createTestUser();
    await db
      .insert(userPreferences)
      .values({ userId: user.id, timezone: "Pacific/Auckland" })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { timezone: "Pacific/Auckland" },
      });
    const habit = await createHabit(user.id, checkHabit());

    // 12:00 UTC is already 01:00 on 5 November in Auckland.
    await pauseHabit(user.id, { id: habit.id }, NOW);

    expect(await pausesOf(habit.id)).toEqual([
      { startDate: TOMORROW, endDate: null },
    ]);
  });

  it("archive opens a pause only when none is open, and restore closes it", async () => {
    const user = await createTestUser();
    const active = await createHabit(user.id, checkHabit());
    const paused = await createHabit(user.id, checkHabit());

    await archiveHabit(user.id, { id: active.id }, at("2026-11-01T10:00:00Z"));
    expect(await pausesOf(active.id)).toEqual([
      { startDate: "2026-11-01", endDate: null },
    ]);

    await pauseHabit(user.id, { id: paused.id }, at("2026-11-01T10:00:00Z"));
    await archiveHabit(user.id, { id: paused.id }, at("2026-11-03T10:00:00Z"));
    expect(await pausesOf(paused.id)).toEqual([
      { startDate: "2026-11-01", endDate: null },
    ]);
    expect((await readHabit(paused.id))?.status).toBe("archived");

    const restored = await restoreHabit(user.id, { id: paused.id }, NOW);
    expect(restored.status).toBe("active");
    expect(await pausesOf(paused.id)).toEqual([
      { startDate: "2026-11-01", endDate: TODAY },
    ]);
  });

  it("the same status again is a no-op with no event", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, checkHabit());

    await resumeHabit(user.id, { id: habit.id }, NOW);
    await restoreHabit(user.id, { id: habit.id }, NOW);
    await pauseHabit(user.id, { id: habit.id }, NOW);
    await pauseHabit(user.id, { id: habit.id }, NOW);

    expect(
      (await eventsFor(user.id, habit.id)).map((event) => event.eventType),
    ).toEqual(["habit.created", "habit.status_changed"]);
    expect(await pausesOf(habit.id)).toHaveLength(1);
  });

  it("refuses moves the status doesn't allow and changes nothing", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, checkHabit());
    await archiveHabit(user.id, { id: habit.id }, NOW);

    await expect(
      pauseHabit(user.id, { id: habit.id }, NOW),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      resumeHabit(user.id, { id: habit.id }, NOW),
    ).rejects.toBeInstanceOf(ConflictError);

    const other = await createHabit(user.id, checkHabit());
    await pauseHabit(user.id, { id: other.id }, NOW);
    await expect(
      restoreHabit(user.id, { id: other.id }, NOW),
    ).rejects.toBeInstanceOf(ConflictError);

    expect((await readHabit(habit.id))?.status).toBe("archived");
    expect((await readHabit(other.id))?.status).toBe("paused");
    expect(await pausesOf(habit.id)).toHaveLength(1);
  });
});

describe("deleteHabit", () => {
  it("removes the habit, its schedules, pauses, logs and events only", async () => {
    const user = await createTestUser();
    const habit = await createHabit(user.id, quantityHabit());
    const kept = await createHabit(user.id, checkHabit());
    await changeHabitSchedule(
      user.id,
      schedule(habit.id, { cadenceType: "daily", target: 1 }),
      NOW,
    );
    await logToday(user.id, habit.id);
    await pauseHabit(user.id, { id: habit.id }, NOW);

    await deleteHabit(user.id, { id: habit.id });

    expect(await readHabit(habit.id)).toBeUndefined();
    expect(await schedulesOf(habit.id)).toEqual([]);
    expect(await pausesOf(habit.id)).toEqual([]);
    expect(
      await db.select().from(habitLogs).where(eq(habitLogs.habitId, habit.id)),
    ).toEqual([]);
    expect(await eventsFor(user.id, habit.id)).toEqual([]);
    expect(await eventsFor(user.id, kept.id)).toHaveLength(1);
    expect(await schedulesOf(kept.id)).toHaveLength(1);
  });
});

describe("goal delete", () => {
  it("clears the goal link with a habit.updated event per habit", async () => {
    const user = await createTestUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Feel rested" }),
    );
    const first = await createHabit(user.id, checkHabit({ goalId: goal.id }));
    const second = await createHabit(
      user.id,
      quantityHabit({ goalId: goal.id }),
    );
    const unlinked = await createHabit(user.id, checkHabit());

    await deleteGoal(user.id, { id: goal.id });

    for (const habit of [first, second]) {
      expect(await readHabit(habit.id)).toMatchObject({
        goalId: null,
        userId: user.id,
      });
      expect((await eventsFor(user.id, habit.id)).at(-1)).toMatchObject({
        eventType: "habit.updated",
        changes: { fields: ["goalId"], goalId: { from: goal.id, to: null } },
      });
    }
    expect(await eventsFor(user.id, unlinked.id)).toHaveLength(1);
  });
});

describe("cross-user access", () => {
  it("every operation on another user's habit is NotFound and changes nothing", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const habit = await createHabit(owner.id, quantityHabit());
    const id = { id: habit.id };

    const attempts: Array<() => Promise<unknown>> = [
      () =>
        updateHabit(
          intruder.id,
          updateHabitSchema.parse({
            id: habit.id,
            title: "Mine",
            startDate: TODAY,
          }),
        ),
      () =>
        changeHabitSchedule(
          intruder.id,
          schedule(habit.id, { cadenceType: "daily", target: 1 }),
          NOW,
        ),
      () => pauseHabit(intruder.id, id, NOW),
      () => resumeHabit(intruder.id, id, NOW),
      () => archiveHabit(intruder.id, id, NOW),
      () => restoreHabit(intruder.id, id, NOW),
      () => deleteHabit(intruder.id, id),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    }

    expect(await readHabit(habit.id)).toMatchObject({
      title: "Drink water",
      status: "active",
      startDate: "2026-10-01",
    });
    expect(await schedulesOf(habit.id)).toHaveLength(1);
    expect(await pausesOf(habit.id)).toEqual([]);
    expect(await eventsFor(owner.id, habit.id)).toHaveLength(1);
    expect(await eventsFor(intruder.id)).toEqual([]);
  });
});

describe("audit privacy", () => {
  it("events never hold the title, description, unit or a target number", async () => {
    const user = await createTestUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Feel rested" }),
    );
    const habit = await createHabit(user.id, quantityHabit());
    await updateHabit(
      user.id,
      updateHabitSchema.parse({
        id: habit.id,
        title: "Drink more water",
        description: "Secret plan",
        startDate: "2026-10-02",
        goalId: goal.id,
      }),
    );
    await changeHabitSchedule(
      user.id,
      schedule(habit.id, {
        cadenceType: "weekly_days",
        cadenceConfig: { days: [1, 3] },
        target: "8765.25",
      }),
      NOW,
    );
    await pauseHabit(user.id, { id: habit.id }, NOW);
    await deleteGoal(user.id, { id: goal.id });

    const events = await eventsFor(user.id, habit.id);
    expect(events.map((event) => event.eventType)).toEqual([
      "habit.created",
      "habit.updated",
      "habit.schedule_changed",
      "habit.status_changed",
      "habit.updated",
    ]);
    const stored = JSON.stringify(events.map((event) => event.changes));
    for (const secret of [
      "Drink",
      "water",
      "Before coffee",
      "Secret plan",
      "glasses",
      "4321",
      "8765",
    ]) {
      expect(stored).not.toContain(secret);
    }
  });
});
