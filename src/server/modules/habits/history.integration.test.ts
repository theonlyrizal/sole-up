import { describe, expect, it } from "vitest";

import { formatDateSpan } from "@/lib/habits/track-range";
import { db } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { getTrackView, type TrackHabit } from "./queries";
import { createHabit, setHabitLog } from "./service";
import { createHabitSchema, setHabitLogSchema } from "./validation";

// The Track page's ranges (chunk 6.5): the last 4 weeks (default), the
// last 12 or this week alone, each in whole weeks from the saved zone and
// week start. The figures are the 6.2 engine's; these tests check that the
// read model hands it the right weeks and logs, and that "This week" shows
// progress rather than a figure.

// Wednesday 4 Nov 2026, midday UTC. With no confirmed zone the user's today
// is 2026-11-04; with the default Monday week start the week began 11-02.
const NOW = new Date("2026-11-04T12:00:00Z");

const newHabit = (userId: string, fields: Record<string, unknown> = {}) =>
  createHabit(
    userId,
    createHabitSchema.parse({
      title: "Stretch",
      measure: "check",
      startDate: "2026-08-01",
      cadenceType: "daily",
      ...fields,
    }),
  );

const log = (
  userId: string,
  habitId: string,
  localDate: string,
  status: "completed" | "skipped" = "completed",
) =>
  setHabitLog(
    userId,
    setHabitLogSchema.parse({ habitId, localDate, status }),
    NOW,
  );

async function trackHabit(
  userId: string,
  habitId: string,
  range: "4w" | "12w" | "week",
) {
  const view = await getTrackView(userId, NOW, range);
  const habit = view.habits.find((item) => item.id === habitId);
  if (!habit) throw new Error("Habit not on Track");
  return { view, habit };
}

const weekStarts = (habit: TrackHabit) =>
  habit.history.weeks.map((week) => week.from);

describe("Track ranges", () => {
  it("defaults to the last 4 weeks, ending with this week", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id);
    await log(user.id, habit.id, "2026-10-20");

    const view = await getTrackView(user.id, NOW);
    const [item] = view.habits;

    expect(view).toMatchObject({
      range: "4w",
      rangeLabel: "Last 4 weeks",
      rangeDatesLabel: formatDateSpan(
        { from: "2026-10-12", to: "2026-11-08" },
        "en-US",
      ),
    });
    expect(weekStarts(item!)).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
    ]);
    expect(item!.history.weeks[0]).toMatchObject({
      label: "Week of Oct 12, 2026",
      shortLabel: "Oct 12",
    });
    expect(item!.history.weeks.every((week) => week.days.length === 7)).toBe(
      true,
    );
    // 12 Oct to 3 Nov are counted; today counts once done.
    expect(item!.history.figure).toBe("1 of 23 days");
    expect(item!.history.definition).toContain(
      "Today counts only once it's logged as completed.",
    );
    expect(item!.history.progressLabel).toBeNull();
  });

  it("the last 12 weeks reach logs the 4 weeks don't, and take backfills", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id);
    await log(user.id, habit.id, "2026-10-20");
    // Ten weeks back: outside the default range, still loggable.
    await log(user.id, habit.id, "2026-09-01");
    await log(user.id, habit.id, "2026-09-02", "skipped");

    const { view, habit: twelve } = await trackHabit(user.id, habit.id, "12w");
    expect(view.rangeLabel).toBe("Last 12 weeks");
    expect(weekStarts(twelve)).toHaveLength(12);
    expect(weekStarts(twelve)[0]).toBe("2026-08-17");
    // 17 Aug to 3 Nov is 79 days, one of them skipped.
    expect(twelve.history.figure).toBe("2 of 78 days · 1 skipped");
    const day = twelve.history.weeks
      .flatMap((week) => week.days)
      .find((entry) => entry.date === "2026-09-01");
    expect(day).toMatchObject({
      state: "completed",
      stateLabel: "Done",
      loggable: true,
    });

    const { habit: four } = await trackHabit(user.id, habit.id, "4w");
    expect(four.history.figure).toBe("1 of 23 days");
  });

  it("this week shows the week in progress, never a figure", async () => {
    const user = await createTestUser();
    const daily = await newHabit(user.id, { title: "Daily" });
    const weekly = await newHabit(user.id, {
      title: "Run",
      cadenceType: "times_per_week",
      cadenceConfig: { timesPerWeek: 3 },
    });
    await log(user.id, daily.id, "2026-11-02");
    await log(user.id, daily.id, "2026-11-03", "skipped");
    await log(user.id, weekly.id, "2026-11-03");

    const { view, habit } = await trackHabit(user.id, daily.id, "week");
    expect(view).toMatchObject({ range: "week", rangeLabel: "This week" });
    expect(weekStarts(habit)).toEqual(["2026-11-02"]);
    expect(habit.history).toMatchObject({
      figure: null,
      // Seven days this week, one skipped: six expected, later days too.
      progressLabel: "1 of 6 days so far this week · 1 skipped",
    });
    expect(habit.history.definition).toContain(
      "This week shows what's done so far against all of this week's expected days.",
    );

    const run = view.habits.find((item) => item.id === weekly.id)!;
    expect(run.history).toMatchObject({
      figure: null,
      progressLabel: "1 of 3 times so far this week",
    });
    expect(run.history.definition).toContain(
      "This week shows what's done so far against the week's target.",
    );
  });

  it("the longer ranges add this week's progress for times_per_week", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id, {
      cadenceType: "times_per_week",
      cadenceConfig: { timesPerWeek: 2 },
      startDate: "2026-10-26",
    });
    await log(user.id, habit.id, "2026-10-27");
    await log(user.id, habit.id, "2026-11-03");

    const { habit: item } = await trackHabit(user.id, habit.id, "4w");
    // Last week 1 of 2; this week counts only what's done: 1 of 1.
    expect(item.history.figure).toBe("2 of 3 times");
    expect(item.history.progressLabel).toBe("1 of 2 times so far this week");
  });

  it("a habit that started recently has nothing before its start", async () => {
    const user = await createTestUser();
    const habit = await newHabit(user.id, { startDate: "2026-11-02" });

    const { habit: item } = await trackHabit(user.id, habit.id, "12w");
    const before = item.history.weeks
      .flatMap((week) => week.days)
      .filter((day) => day.date < "2026-11-02");
    expect(before).toHaveLength(77);
    expect(
      before.every((day) => day.state === "inactive" && !day.loggable),
    ).toBe(true);
    expect(item.history.figure).toBe("0 of 2 days");
  });

  it("works the weeks out from the saved zone and week start", async () => {
    const user = await createTestUser();
    // In Auckland it is already Thursday 5 Nov; weeks start on Sunday.
    await db
      .insert(userPreferences)
      .values({ userId: user.id, timezone: "Pacific/Auckland", weekStart: 0 })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { timezone: "Pacific/Auckland", weekStart: 0 },
      });
    const habit = await newHabit(user.id);

    const { view, habit: item } = await trackHabit(user.id, habit.id, "4w");
    expect(view.today).toBe("2026-11-05");
    expect(weekStarts(item)).toEqual([
      "2026-10-11",
      "2026-10-18",
      "2026-10-25",
      "2026-11-01",
    ]);
    expect(view.rangeDatesLabel).toBe(
      formatDateSpan({ from: "2026-10-11", to: "2026-11-07" }, "en-US"),
    );
    // 11 Oct to 4 Nov in Auckland.
    expect(item.history.figure).toBe("0 of 25 days");

    const { habit: week } = await trackHabit(user.id, habit.id, "week");
    expect(weekStarts(week)).toEqual(["2026-11-01"]);
  });

  it("shows only the user's own habits and logs in every range", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const habit = await newHabit(alice.id);
    await log(alice.id, habit.id, "2026-09-01");

    for (const range of ["4w", "12w", "week"] as const) {
      const view = await getTrackView(bob.id, NOW, range);
      expect(view.habits).toEqual([]);
    }
  });
});
