import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayFor } from "@/lib/dates";
import {
  CHECK_HAS_NO_VALUE,
  FUTURE_DAY,
  INACTIVE_DAY,
  SKIP_HAS_NO_VALUE,
  VALUE_REQUIRED,
} from "@/lib/habits/logging";
import { db } from "@/server/db/client";
import { auditEvents, habitLogs, userPreferences } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { getTodayHabits, getTrackView, type TrackHabit } from "./queries";
import {
  archiveHabit,
  clearHabitLog,
  createHabit,
  pauseHabit,
  setHabitLog,
} from "./service";
import { createHabitSchema, setHabitLogSchema } from "./validation";

// Habit logs (chunk 6.4): the log service and actions, Today's Habits read
// model and the Track strip. The figures come from the 6.2 engine; these
// tests check that each write reaches them at once.

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

beforeEach(() => {
  requestHeaders.current = new Headers();
});

// Wednesday 4 Nov 2026, midday UTC. With no confirmed zone the user's today
// is 2026-11-04; with the default Monday week start the week began 11-02,
// and Track's default range (the last 4 weeks) covers 12 Oct to 8 Nov.
const NOW = new Date("2026-11-04T12:00:00Z");
const TODAY = "2026-11-04";

const newHabit = (userId: string, fields: Record<string, unknown> = {}) =>
  createHabit(
    userId,
    createHabitSchema.parse({
      title: "Stretch",
      measure: "check",
      startDate: "2026-10-26",
      cadenceType: "daily",
      ...fields,
    }),
  );

const quantityFields = { measure: "quantity", unit: "glasses", target: "8" };

/** A log write as the actions send it, parsed, at NOW. */
const log = (
  userId: string,
  habitId: string,
  localDate: string,
  status: "completed" | "skipped" = "completed",
  value: number | string | null = null,
) =>
  setHabitLog(
    userId,
    setHabitLogSchema.parse({ habitId, localDate, status, value }),
    NOW,
  );

const clear = (userId: string, habitId: string, localDate: string) =>
  clearHabitLog(userId, { habitId, localDate }, NOW);

async function setZone(userId: string, timezone: string) {
  await db
    .insert(userPreferences)
    .values({ userId, timezone })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { timezone } });
}

/** The habit's log events, oldest first, without `habit.created` etc. */
async function logEvents(userId: string, habitId: string) {
  const rows = await db
    .select({ type: auditEvents.eventType, changes: auditEvents.changes })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.userId, userId), eq(auditEvents.entityId, habitId)),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
  return rows.filter((row) => row.type.startsWith("habit.log"));
}

async function logRows(habitId: string) {
  return db
    .select({
      localDate: habitLogs.localDate,
      status: habitLogs.status,
      value: habitLogs.value,
    })
    .from(habitLogs)
    .where(eq(habitLogs.habitId, habitId))
    .orderBy(asc(habitLogs.localDate));
}

async function trackHabit(userId: string, habitId: string) {
  const view = await getTrackView(userId, NOW);
  const habit = view.habits.find((item) => item.id === habitId);
  if (!habit) throw new Error("Habit not on Track");
  return habit;
}

const dayOf = (habit: TrackHabit, date: string) =>
  habit.history.weeks.flatMap((week) => week.days).find((d) => d.date === date);

async function expectValidation(
  promise: Promise<unknown>,
  fieldErrors: Record<string, string[]>,
) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ValidationError);
  expect((error as ValidationError).fieldErrors).toEqual(fieldErrors);
}

describe("setHabitLog and clearHabitLog", () => {
  it("log, correct and clear a day, each with its event", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id);

    expect(await log(user.id, habit.id, "2026-11-02")).toEqual({
      habitId: habit.id,
      localDate: "2026-11-02",
      log: { status: "completed", value: null },
      previous: null,
    });
    // The same log again changes nothing and records nothing.
    expect(await log(user.id, habit.id, "2026-11-02")).toMatchObject({
      previous: { status: "completed", value: null },
    });
    expect(await log(user.id, habit.id, "2026-11-02", "skipped")).toMatchObject(
      {
        log: { status: "skipped", value: null },
        previous: { status: "completed", value: null },
      },
    );
    expect(await logRows(habit.id)).toEqual([
      { localDate: "2026-11-02", status: "skipped", value: null },
    ]);

    expect(await clear(user.id, habit.id, "2026-11-02")).toEqual({
      habitId: habit.id,
      localDate: "2026-11-02",
      log: null,
      previous: { status: "skipped", value: null },
    });
    expect(await logRows(habit.id)).toEqual([]);
    // Nothing left to clear: no event.
    expect(await clear(user.id, habit.id, "2026-11-02")).toMatchObject({
      previous: null,
    });

    expect(await logEvents(user.id, habit.id)).toEqual([
      {
        type: "habit.logged",
        changes: {
          localDate: "2026-11-02",
          fields: ["status"],
          status: { from: null, to: "completed" },
        },
      },
      {
        type: "habit.log_changed",
        changes: {
          localDate: "2026-11-02",
          fields: ["status"],
          status: { from: "completed", to: "skipped" },
        },
      },
      {
        type: "habit.log_removed",
        changes: {
          localDate: "2026-11-02",
          fields: ["status"],
          status: { from: "skipped", to: null },
        },
      },
    ]);
  });

  it("quantity logs need a value; check logs and skips refuse one", async () => {
    const user = await createTestUser();
    const check = await newHabit(user.id);
    const water = await newHabit(user.id, quantityFields);

    await expectValidation(log(user.id, water.id, TODAY), {
      value: [VALUE_REQUIRED],
    });
    await expectValidation(log(user.id, check.id, TODAY, "completed", 2), {
      value: [CHECK_HAS_NO_VALUE],
    });
    await expectValidation(
      setHabitLog(
        user.id,
        {
          habitId: water.id,
          localDate: TODAY,
          status: "skipped",
          value: 3,
        },
        NOW,
      ),
      { value: [SKIP_HAS_NO_VALUE] },
    );
    expect(
      setHabitLogSchema.safeParse({
        habitId: water.id,
        localDate: TODAY,
        status: "skipped",
        value: "3",
      }).error?.issues,
    ).toMatchObject([{ path: ["value"], message: SKIP_HAS_NO_VALUE }]);

    await log(user.id, water.id, TODAY, "completed", "5.5");
    await log(user.id, water.id, TODAY, "completed", 7.25);
    await log(user.id, water.id, TODAY, "skipped");
    expect(await logRows(water.id)).toEqual([
      { localDate: TODAY, status: "skipped", value: null },
    ]);
    expect(await logRows(check.id)).toEqual([]);

    const events = await logEvents(user.id, water.id);
    expect(events.map((event) => event.changes)).toEqual([
      {
        localDate: TODAY,
        fields: ["status", "value"],
        status: { from: null, to: "completed" },
      },
      {
        localDate: TODAY,
        fields: ["value"],
        status: { from: "completed", to: "completed" },
      },
      {
        localDate: TODAY,
        fields: ["status", "value"],
        status: { from: "completed", to: "skipped" },
      },
    ]);
    // Amounts and the unit are never in an event.
    const recorded = JSON.stringify(events);
    expect(recorded).not.toMatch(/5\.5|7\.25|glasses/);
  });

  it("refuse days after the user's today, in their zone", async () => {
    const user = await createTestUser();
    // 12:00 UTC is already 01:00 on 5 November in Auckland.
    await setZone(user.id, "Pacific/Auckland");
    const habit = await newHabit(user.id);

    expect(await log(user.id, habit.id, "today")).toMatchObject({
      localDate: "2026-11-05",
    });
    await expectValidation(log(user.id, habit.id, "2026-11-06"), {
      localDate: [FUTURE_DAY],
    });

    const utcUser = await createTestUser();
    const utcHabit = await newHabit(utcUser.id);
    await expectValidation(log(utcUser.id, utcHabit.id, "2026-11-05"), {
      localDate: [FUTURE_DAY],
    });
    expect(await logRows(utcHabit.id)).toEqual([]);
  });

  it("refuse days before the start, after the end, or paused", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id, {
      startDate: "2026-10-28",
      endDate: "2026-11-03",
    });
    for (const date of ["2026-10-27", TODAY]) {
      await expectValidation(log(user.id, habit.id, date), {
        localDate: [INACTIVE_DAY],
      });
    }
    await log(user.id, habit.id, "2026-10-28");

    // Paused from today (nothing logged today): today no longer counts,
    // the days before still do.
    const paused = await newHabit(user.id);
    await pauseHabit(user.id, { id: paused.id }, NOW);
    await expectValidation(log(user.id, paused.id, TODAY), {
      localDate: [INACTIVE_DAY],
    });
    await expectValidation(log(user.id, paused.id, TODAY, "skipped"), {
      localDate: [INACTIVE_DAY],
    });
    await log(user.id, paused.id, "2026-11-03");

    expect(await logRows(habit.id)).toHaveLength(1);
    expect(await logRows(paused.id)).toEqual([
      { localDate: "2026-11-03", status: "completed", value: null },
    ]);
  });

  it("clear a log kept on a day that no longer counts", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id);
    // A log from before the start date moved later (ADR 0014: kept).
    await db.insert(habitLogs).values({
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-10-20",
      status: "completed",
    });

    await expectValidation(log(user.id, habit.id, "2026-10-20", "skipped"), {
      localDate: [INACTIVE_DAY],
    });
    expect(await clear(user.id, habit.id, "2026-10-20")).toMatchObject({
      previous: { status: "completed", value: null },
    });
    expect(await logRows(habit.id)).toEqual([]);
  });

  it("treat another user's habit as missing", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const habit = await newHabit(alice.id);
    await log(alice.id, habit.id, "2026-11-02");

    await expect(log(bob.id, habit.id, "2026-11-03")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      log(bob.id, habit.id, "2026-11-02", "skipped"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(clear(bob.id, habit.id, "2026-11-02")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // Missing or not, a future day says nothing about the habit.
    await expect(log(bob.id, habit.id, "2027-01-01")).rejects.toBeInstanceOf(
      NotFoundError,
    );

    expect(await logRows(habit.id)).toEqual([
      { localDate: "2026-11-02", status: "completed", value: null },
    ]);
    expect(await logEvents(bob.id, habit.id)).toEqual([]);
  });
});

describe("corrections reach the figures at once", () => {
  it("a past day corrected on Track changes its strip and figure", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id);

    // 26 Oct to 3 Nov are counted; today counts once done.
    let track = await trackHabit(user.id, habit.id);
    expect(track.history.figure).toBe("0 of 9 days");
    expect(dayOf(track, "2026-10-28")).toMatchObject({
      state: "missed",
      stateLabel: "Missed",
      loggable: true,
      active: true,
    });
    expect(dayOf(track, "2026-11-05")).toMatchObject({
      state: "future",
      loggable: false,
    });

    await log(user.id, habit.id, "2026-10-28");
    track = await trackHabit(user.id, habit.id);
    expect(track.history.figure).toBe("1 of 9 days");
    expect(dayOf(track, "2026-10-28")).toMatchObject({
      state: "completed",
      log: { status: "completed", value: null },
    });

    // The correction: it was a deliberate skip after all.
    await log(user.id, habit.id, "2026-10-28", "skipped");
    track = await trackHabit(user.id, habit.id);
    expect(track.history.figure).toBe("0 of 8 days · 1 skipped");
    expect(dayOf(track, "2026-10-28")?.stateLabel).toBe("Skipped");

    await log(user.id, habit.id, TODAY);
    track = await trackHabit(user.id, habit.id);
    expect(track.history.figure).toBe("1 of 9 days · 1 skipped");

    await clear(user.id, habit.id, "2026-10-28");
    track = await trackHabit(user.id, habit.id);
    expect(track.history.figure).toBe("1 of 10 days");
    expect(dayOf(track, "2026-10-28")?.state).toBe("missed");

    // The audit log holds the whole history of that day.
    const events = (await logEvents(user.id, habit.id)).filter(
      (event) =>
        (event.changes as { localDate: string }).localDate === "2026-10-28",
    );
    expect(events.map((event) => [event.type, event.changes])).toEqual([
      [
        "habit.logged",
        expect.objectContaining({ status: { from: null, to: "completed" } }),
      ],
      [
        "habit.log_changed",
        expect.objectContaining({
          fields: ["status"],
          status: { from: "completed", to: "skipped" },
        }),
      ],
      [
        "habit.log_removed",
        expect.objectContaining({ status: { from: "skipped", to: null } }),
      ],
    ]);
  });

  it("quantity corrections change the credit and this week's progress", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id, {
      ...quantityFields,
      cadenceType: "times_per_week",
      cadenceConfig: { timesPerWeek: 2 },
    });

    await log(user.id, habit.id, "2026-10-27", "completed", 4);
    let track = await trackHabit(user.id, habit.id);
    // Last week: 0.5 of 2. This week so far: nothing done, nothing lost.
    expect(track.history.figure).toBe("0.5 of 2 times · 0 at target");
    expect(track.history.progressLabel).toBe(
      "0 of 2 times so far this week · 0 at target",
    );
    expect(dayOf(track, "2026-10-27")).toMatchObject({
      state: "completed",
      credit: 0.5,
      stateLabel: "4 of 8 glasses",
      target: 8,
    });
    expect(dayOf(track, "2026-10-28")?.stateLabel).toBe("Not logged");

    await log(user.id, habit.id, "2026-10-27", "completed", 8);
    await log(user.id, habit.id, "2026-11-03", "completed", 6);
    track = await trackHabit(user.id, habit.id);
    expect(track.history.figure).toBe("1.7 of 3 times · 1 at target");
    expect(track.history.progressLabel).toBe(
      "0.7 of 2 times so far this week · 0 at target",
    );
  });
});

describe("getTodayHabits", () => {
  it("shows what is due today and anything already logged", async () => {
    const user = await createTestUser();
    const daily = await newHabit(user.id, { title: "Daily" });
    const water = await newHabit(user.id, {
      title: "Water",
      ...quantityFields,
    });
    // Today is a Wednesday.
    const monFri = await newHabit(user.id, {
      title: "Mon and Fri",
      cadenceType: "weekly_days",
      cadenceConfig: { days: [1, 5] },
    });
    const twice = await newHabit(user.id, {
      title: "Twice",
      cadenceType: "times_per_week",
      cadenceConfig: { timesPerWeek: 2 },
    });
    const pausedToday = await newHabit(user.id, { title: "Paused" });
    await pauseHabit(user.id, { id: pausedToday.id }, NOW);
    const loggedThenPaused = await newHabit(user.id, { title: "Logged" });
    await log(user.id, loggedThenPaused.id, TODAY);
    await pauseHabit(user.id, { id: loggedThenPaused.id }, NOW);
    const archived = await newHabit(user.id, { title: "Archived" });
    await log(user.id, archived.id, TODAY);
    await archiveHabit(user.id, { id: archived.id }, NOW);
    await newHabit(user.id, { title: "Later", startDate: "2026-11-05" });

    let today = await getTodayHabits(user.id, NOW);
    expect(today.hasActiveHabits).toBe(true);
    expect(today.habits.map((habit) => habit.title)).toEqual([
      "Daily",
      "Water",
      "Twice",
      "Logged",
    ]);
    expect(today.habits[1]).toEqual({
      id: water.id,
      title: "Water",
      measure: "quantity",
      unit: "glasses",
      scheduleLabel: "Every day · 8 glasses a day",
      target: 8,
      log: null,
      progressLabel: null,
    });
    expect(today.habits[2]).toMatchObject({
      progressLabel: "0 of 2 so far this week",
    });
    expect(today.habits[3]).toMatchObject({
      log: { status: "completed", value: null },
    });

    // An off-day extra shows once logged; a met weekly target hides.
    await log(user.id, monFri.id, "today");
    await log(user.id, twice.id, "2026-11-02");
    await log(user.id, twice.id, "2026-11-03");
    await log(user.id, daily.id, "today", "skipped");
    today = await getTodayHabits(user.id, NOW);
    expect(today.habits.map((habit) => habit.title)).toEqual([
      "Daily",
      "Water",
      "Mon and Fri",
      "Logged",
    ]);
    expect(today.habits[0]?.log).toEqual({ status: "skipped", value: null });

    // Tomorrow's view of the same records.
    const tomorrow = await getTodayHabits(
      user.id,
      new Date("2026-11-05T12:00:00Z"),
    );
    expect(tomorrow.habits.map((habit) => habit.title)).toEqual([
      "Daily",
      "Water",
      "Later",
    ]);

    const bob = await createTestUser();
    expect(await getTodayHabits(bob.id, NOW)).toEqual({
      habits: [],
      hasActiveHabits: false,
    });
  });
});

describe("log actions", () => {
  it("refuse a signed-out caller", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id);
    for (const result of [
      await actions.setHabitLog({
        habitId: habit.id,
        localDate: "today",
        status: "completed",
      }),
      await actions.clearHabitLog({ habitId: habit.id, localDate: "today" }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    }
    expect(await logRows(habit.id)).toEqual([]);
  });

  it("log today from the form's input, and undo it", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id, {
      ...quantityFields,
      startDate: "2026-01-01",
    });
    requestHeaders.current = (await asUser(user.id)).headers;
    const today = todayFor("UTC");

    const logged = await actions.setHabitLog({
      habitId: habit.id,
      localDate: "today",
      status: "completed",
      value: " 2.5 ",
    });
    expect(logged).toEqual({
      ok: true,
      data: {
        habitId: habit.id,
        localDate: today,
        log: { status: "completed", value: 2.5 },
        previous: null,
      },
    });
    expect(
      await actions.clearHabitLog({ habitId: habit.id, localDate: today }),
    ).toMatchObject({ ok: true, data: { log: null } });
    expect(await logRows(habit.id)).toEqual([]);

    for (const input of [
      { habitId: habit.id, localDate: "yesterday", status: "completed" },
      { habitId: habit.id, localDate: today, status: "done" },
      { habitId: habit.id, localDate: today, status: "completed", value: 0 },
      { habitId: habit.id, localDate: today, status: "completed", note: "x" },
    ]) {
      expect(await actions.setHabitLog(input as never)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
    }
    expect(
      await actions.setHabitLog({
        habitId: habit.id,
        localDate: today,
        status: "completed",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { value: [VALUE_REQUIRED] } },
    });
  });
});
