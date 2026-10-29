import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db/client";
import {
  auditEvents,
  habitLogs,
  habits,
  habitSchedules,
} from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { changeGoalStatus, createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { getArchivedHabits, getTrackView } from "./queries";
import {
  archiveHabit,
  changeHabitSchedule,
  createHabit,
  editHabit,
  pauseHabit,
} from "./service";
import {
  changeHabitScheduleSchema,
  createHabitSchema,
  editHabitSchema,
} from "./validation";

// The Track pages' read models, the edit dialog's combined save and the
// actions the forms call (chunk 6.3). Service rules are covered in
// habits.integration.test.ts.

// Server Actions read the session from the request's headers, and refresh()
// needs a Next.js request. Outside one, supply both here.
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

beforeEach(() => {
  requestHeaders.current = new Headers();
});

async function signInAs(userId: string) {
  requestHeaders.current = (await asUser(userId)).headers;
}

// Wednesday 4 Nov 2026, midday UTC. With no confirmed zone the user's today
// is 2026-11-04; with the default Monday week start the week began 11-02.
const NOW = new Date("2026-11-04T12:00:00Z");
const WEEK_START = "2026-11-02";

const checkHabit = (userId: string, fields: Record<string, unknown> = {}) =>
  createHabit(
    userId,
    createHabitSchema.parse({
      title: "Stretch",
      measure: "check",
      startDate: "2026-10-01",
      cadenceType: "daily",
      ...fields,
    }),
  );

const quantityHabit = (userId: string, fields: Record<string, unknown> = {}) =>
  createHabit(
    userId,
    createHabitSchema.parse({
      title: "Drink water",
      measure: "quantity",
      unit: "glasses",
      target: "8",
      startDate: "2026-10-01",
      cadenceType: "daily",
      ...fields,
    }),
  );

const goal = (userId: string, title: string) =>
  createGoal(userId, createGoalSchema.parse({ title }));

async function eventTypes(userId: string, entityId: string) {
  const rows = await db
    .select({ type: auditEvents.eventType })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.userId, userId), eq(auditEvents.entityId, entityId)),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
  return rows.map((row) => row.type);
}

async function schedulesOf(habitId: string) {
  return db
    .select({
      effectiveFrom: habitSchedules.effectiveFrom,
      cadenceType: habitSchedules.cadenceType,
      cadenceConfig: habitSchedules.cadenceConfig,
      target: habitSchedules.target,
    })
    .from(habitSchedules)
    .where(eq(habitSchedules.habitId, habitId))
    .orderBy(asc(habitSchedules.effectiveFrom));
}

/** Edit input for a habit, as the dialog sends it, with `fields` changed. */
const editInput = (
  habit: { id: string; title: string; startDate: string },
  fields: Record<string, unknown> = {},
) =>
  editHabitSchema.parse({
    id: habit.id,
    title: habit.title,
    startDate: habit.startDate,
    cadenceType: "daily",
    ...fields,
  });

describe("editHabit", () => {
  it("saves the fields and this week's schedule together, with an event each", async () => {
    const user = await createTestUser();
    const habit = await quantityHabit(user.id);
    const run = await goal(user.id, "Run 10k");

    const { habit: saved, schedule } = await editHabit(
      user.id,
      editInput(habit, {
        title: "Drink more water",
        goalId: run.id,
        cadenceType: "weekly_days",
        cadenceConfig: { days: [1, 3, 5] },
        target: "6.5",
      }),
      NOW,
    );

    expect(saved).toMatchObject({ title: "Drink more water", goalId: run.id });
    expect(schedule).toMatchObject({
      effectiveFrom: WEEK_START,
      cadenceType: "weekly_days",
      cadenceConfig: { days: [1, 3, 5] },
      target: 6.5,
    });
    // The first schedule keeps the weeks before this one.
    expect(await schedulesOf(habit.id)).toEqual([
      {
        effectiveFrom: "2026-09-28",
        cadenceType: "daily",
        cadenceConfig: {},
        target: "8.00",
      },
      {
        effectiveFrom: WEEK_START,
        cadenceType: "weekly_days",
        cadenceConfig: { days: [1, 3, 5] },
        target: "6.50",
      },
    ]);
    // One transaction, so both share an instant: compare them unordered.
    expect((await eventTypes(user.id, habit.id)).sort()).toEqual([
      "habit.created",
      "habit.schedule_changed",
      "habit.updated",
    ]);
  });

  it("records nothing when nothing changed", async () => {
    const user = await createTestUser();
    const habit = await quantityHabit(user.id);

    await editHabit(user.id, editInput(habit, { target: "8" }), NOW);

    expect(await eventTypes(user.id, habit.id)).toEqual(["habit.created"]);
  });

  it("changes only the schedule when only the cadence changed", async () => {
    const user = await createTestUser();
    const habit = await checkHabit(user.id);

    await editHabit(
      user.id,
      editInput(habit, {
        cadenceType: "times_per_week",
        cadenceConfig: { timesPerWeek: 3 },
      }),
      NOW,
    );

    expect(await eventTypes(user.id, habit.id)).toEqual([
      "habit.created",
      "habit.schedule_changed",
    ]);
  });

  it("saves nothing when the target doesn't fit the measure", async () => {
    const user = await createTestUser();
    const check = await checkHabit(user.id);
    const quantity = await quantityHabit(user.id);

    await expect(
      editHabit(
        user.id,
        editInput(check, { title: "Renamed", target: "3" }),
        NOW,
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      editHabit(user.id, editInput(quantity, { title: "Renamed" }), NOW),
    ).rejects.toThrow(ValidationError);

    for (const habit of [check, quantity]) {
      const [row] = await db
        .select({ title: habits.title })
        .from(habits)
        .where(eq(habits.id, habit.id));
      expect(row?.title).toBe(habit.title);
      expect(await schedulesOf(habit.id)).toHaveLength(1);
      expect(await eventTypes(user.id, habit.id)).toEqual(["habit.created"]);
    }
  });

  it("refuses another user's goal as a field error", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const habit = await checkHabit(alice.id);
    const bobs = await goal(bob.id, "Bob's goal");

    await expect(
      editHabit(alice.id, editInput(habit, { goalId: bobs.id }), NOW),
    ).rejects.toMatchObject({
      fieldErrors: { goalId: ["Choose one of your goals."] },
    });
  });

  it("can't edit another user's habit", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const habit = await checkHabit(alice.id);

    await expect(
      editHabit(bob.id, editInput(habit, { title: "Mine now" }), NOW),
    ).rejects.toThrow(NotFoundError);
    expect(await eventTypes(alice.id, habit.id)).toEqual(["habit.created"]);
  });
});

describe("getTrackView", () => {
  it("is empty for a new user, with this week's start", async () => {
    const user = await createTestUser();

    expect(await getTrackView(user.id, NOW)).toEqual({
      habits: [],
      archivedCount: 0,
      goals: [],
      today: "2026-11-04",
      weekStart: 1,
      locale: "en-US",
      thisWeekStartLabel: "Nov 2, 2026",
    });
  });

  it("lists active habits, then paused ones, and counts the archived", async () => {
    const user = await createTestUser();
    const resting = await checkHabit(user.id, { title: "Resting" });
    await checkHabit(user.id, { title: "Walk" });
    const gone = await checkHabit(user.id, { title: "Gone" });
    await quantityHabit(user.id);
    await pauseHabit(user.id, { id: resting.id }, NOW);
    await archiveHabit(user.id, { id: gone.id }, NOW);

    const view = await getTrackView(user.id, NOW);

    expect(view.habits.map((habit) => [habit.title, habit.status])).toEqual([
      ["Walk", "active"],
      ["Drink water", "active"],
      ["Resting", "paused"],
    ]);
    expect(view.archivedCount).toBe(1);
  });

  it("gives each habit this week's schedule, labels, goal and log count", async () => {
    const user = await createTestUser();
    const run = await goal(user.id, "Run 10k");
    const habit = await quantityHabit(user.id, {
      goalId: run.id,
      endDate: "2027-01-31",
    });
    await changeHabitSchedule(
      user.id,
      changeHabitScheduleSchema.parse({
        id: habit.id,
        cadenceType: "weekly_days",
        cadenceConfig: { days: [0, 3] },
        target: "2.5",
      }),
      NOW,
    );
    await db.insert(habitLogs).values([
      {
        userId: user.id,
        habitId: habit.id,
        localDate: "2026-10-20",
        status: "completed",
        value: "8.00",
      },
      {
        userId: user.id,
        habitId: habit.id,
        localDate: "2026-10-21",
        status: "skipped",
      },
    ]);

    const [item] = (await getTrackView(user.id, NOW)).habits;

    expect(item).toMatchObject({
      id: habit.id,
      schedule: {
        effectiveFrom: WEEK_START,
        cadenceType: "weekly_days",
        cadenceConfig: { days: [0, 3] },
        target: 2.5,
      },
      cadenceLabel: "Wed, Sun",
      targetLabel: "2.5 glasses a day",
      goal: { id: run.id, title: "Run 10k" },
      startDateLabel: "Oct 1, 2026",
      endDateLabel: "Jan 31, 2027",
      logCount: 2,
    });
  });

  it("offers every goal, live ones first", async () => {
    const user = await createTestUser();
    const done = await goal(user.id, "Done");
    const waiting = await goal(user.id, "Waiting");
    const live = await goal(user.id, "Live");
    await changeGoalStatus(user.id, { id: done.id, status: "completed" });
    await changeGoalStatus(user.id, { id: waiting.id, status: "paused" });

    const { goals } = await getTrackView(user.id, NOW);

    expect(goals).toEqual([
      { id: live.id, title: "Live", status: "active" },
      { id: waiting.id, title: "Waiting", status: "paused" },
      { id: done.id, title: "Done", status: "completed" },
    ]);
  });

  it("shows only the user's own habits and goals", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await checkHabit(alice.id);
    await goal(alice.id, "Alice's goal");

    expect(await getTrackView(bob.id, NOW)).toMatchObject({
      habits: [],
      archivedCount: 0,
      goals: [],
    });
  });
});

describe("getArchivedHabits", () => {
  it("lists archived habits, newest first, with the archived date", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const first = await checkHabit(alice.id, { title: "First" });
    const second = await checkHabit(alice.id, { title: "Second" });
    await checkHabit(alice.id, { title: "Still going" });
    await archiveHabit(alice.id, { id: first.id }, NOW);
    await archiveHabit(alice.id, { id: second.id }, NOW);

    const archived = await getArchivedHabits(alice.id, NOW);

    expect(archived.map((habit) => habit.title)).toEqual(["Second", "First"]);
    expect(archived[0]).toMatchObject({
      status: "archived",
      cadenceLabel: "Every day",
      logCount: 0,
    });
    expect(archived[0]?.archivedAtLabel).toMatch(/\d{4}$/);
    expect(await getArchivedHabits(bob.id, NOW)).toEqual([]);
  });
});

describe("habit actions", () => {
  it("refuse a signed-out caller", async () => {
    const user = await createTestUser();
    const habit = await checkHabit(user.id);

    for (const result of [
      await actions.createHabit({ title: "Anything" } as never),
      await actions.editHabit({ id: habit.id } as never),
      await actions.pauseHabit({ id: habit.id }),
      await actions.archiveHabit({ id: habit.id }),
      await actions.deleteHabit({ id: habit.id }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    }
  });

  it("create and edit from the form's flat input", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const created = await actions.createHabit({
      title: "Read",
      description: "",
      measure: "quantity",
      unit: "pages",
      target: "20",
      startDate: "2026-11-02",
      endDate: "",
      goalId: null,
      cadenceType: "weekly_days",
      cadenceConfig: { days: [1, 2] },
    });
    expect(created).toMatchObject({
      ok: true,
      data: { title: "Read", measure: "quantity", unit: "pages" },
    });
    if (!created.ok) return;

    const edited = await actions.editHabit({
      id: created.data.id,
      title: "Read more",
      description: "Fiction counts",
      startDate: "2026-11-02",
      endDate: "",
      goalId: null,
      cadenceType: "daily",
      cadenceConfig: {},
      target: "25",
    });
    expect(edited).toMatchObject({
      ok: true,
      data: { title: "Read more", description: "Fiction counts" },
    });
    const schedules = await schedulesOf(created.data.id);
    expect(schedules.at(-1)).toMatchObject({
      cadenceType: "daily",
      target: "25.00",
    });
  });

  it("return field errors for the form", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const result = await actions.createHabit({
      title: "Water",
      measure: "quantity",
      unit: "",
      target: "",
      startDate: "2026-11-02",
      cadenceType: "weekly_days",
      cadenceConfig: { days: [] },
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: {
          unit: [expect.any(String)],
          target: [expect.any(String)],
          "cadenceConfig.days": [expect.any(String)],
        },
      },
    });
  });

  it("can't touch another user's habit", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const habit = await checkHabit(alice.id);
    await signInAs(bob.id);

    for (const result of [
      await actions.editHabit({
        id: habit.id,
        title: "Mine now",
        startDate: "2026-10-01",
        cadenceType: "daily",
      }),
      await actions.pauseHabit({ id: habit.id }),
      await actions.resumeHabit({ id: habit.id }),
      await actions.archiveHabit({ id: habit.id }),
      await actions.restoreHabit({ id: habit.id }),
      await actions.deleteHabit({ id: habit.id }),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    const [row] = await db
      .select({ title: habits.title, status: habits.status })
      .from(habits)
      .where(eq(habits.id, habit.id));
    expect(row).toEqual({ title: "Stretch", status: "active" });
  });

  it("delete removes the habit and its logs", async () => {
    const user = await createTestUser();
    const habit = await checkHabit(user.id);
    await db.insert(habitLogs).values({
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-10-20",
      status: "completed",
    });
    await signInAs(user.id);

    expect(await actions.deleteHabit({ id: habit.id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(
      await db.select().from(habitLogs).where(eq(habitLogs.habitId, habit.id)),
    ).toEqual([]);
    expect(await eventTypes(user.id, habit.id)).toEqual([]);
  });
});
