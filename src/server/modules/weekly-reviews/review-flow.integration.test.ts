import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayFor } from "@/lib/dates";
import { openPeriodStarts } from "@/lib/weekly-reviews";
import { db } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";
import {
  changeGoalStatus,
  createGoal,
  updateGoal,
} from "@/server/modules/goals/service";
import {
  createGoalSchema,
  updateGoalSchema,
} from "@/server/modules/goals/validation";
import { changeTaskStatus, createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import {
  getAdjustStep,
  getPriorityOptions,
  getReviewForWeek,
  getReviewPage,
} from "./queries";
import {
  finishWeeklyReview,
  setWeeklyReviewPriorities,
  startWeeklyReview,
} from "./service";

// The review flow's read models and the actions its steps call (chunk 7.3).
// Service rules are covered in weekly-reviews.integration.test.ts.

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

// Wednesday 4 Nov 2026, midday UTC, in Tokyo (UTC+9, so 21:00 there). With
// the Monday week start, this week began 11-02 and last week 10-26.
const NOW = new Date("2026-11-04T12:00:00Z");
const THIS_WEEK = "2026-11-02";
const LAST_WEEK = "2026-10-26";

async function newUser() {
  const user = await createTestUser();
  await db
    .insert(userPreferences)
    .values({ userId: user.id, timezone: "Asia/Tokyo", weekStart: 1 });
  return user;
}

const newGoal = (userId: string, title: string) =>
  createGoal(userId, createGoalSchema.parse({ title }));

const newTask = (userId: string, title: string, fields = {}) =>
  createTask(userId, createTaskSchema.parse({ title, ...fields }));

describe("getReviewPage", () => {
  it("opens last week, offering this week, before any review exists", async () => {
    const user = await newUser();
    const page = await getReviewPage(user.id, null, NOW);
    expect(page).toMatchObject({
      today: "2026-11-04",
      timeZone: "Asia/Tokyo",
      thisWeek: THIS_WEEK,
      lastWeek: LAST_WEEK,
      periodStart: LAST_WEEK,
      periodEnd: THIS_WEEK,
      review: null,
      open: true,
      otherWeek: THIS_WEEK,
    });
  });

  it("keeps opening last week until its review is finished, then this week", async () => {
    const user = await newUser();
    const last = await startWeeklyReview(
      user.id,
      { periodStart: LAST_WEEK },
      NOW,
    );
    expect(await getReviewPage(user.id, null, NOW)).toMatchObject({
      periodStart: LAST_WEEK,
      review: { id: last.id, completedAt: null },
    });

    await finishWeeklyReview(user.id, { id: last.id }, NOW);
    const page = await getReviewPage(user.id, null, NOW);
    expect(page).toMatchObject({
      periodStart: THIS_WEEK,
      periodEnd: "2026-11-09",
      review: null,
      otherWeek: LAST_WEEK,
    });

    // Asked for by name, last week still opens, finished and editable.
    expect(await getReviewPage(user.id, LAST_WEEK, NOW)).toMatchObject({
      periodStart: LAST_WEEK,
      review: { id: last.id, closesOn: "2026-11-09" },
      open: true,
      otherWeek: THIS_WEEK,
    });
  });

  it("opens a closed review read-only, and ignores weeks with none", async () => {
    const user = await newUser();
    // Reviewed during its own week, three weeks before NOW.
    const old = await startWeeklyReview(
      user.id,
      { periodStart: "2026-10-12" },
      new Date("2026-10-14T03:00:00Z"),
    );

    expect(await getReviewPage(user.id, "2026-10-12", NOW)).toMatchObject({
      periodStart: "2026-10-12",
      periodEnd: "2026-10-19",
      review: { id: old.id },
      open: false,
      otherWeek: null,
    });
    // A week with no review, a future week and a mid-week day fall back.
    for (const week of ["2026-10-05", "2026-11-09", "2026-11-04"]) {
      expect(await getReviewPage(user.id, week, NOW)).toMatchObject({
        periodStart: LAST_WEEK,
        review: null,
      });
    }
  });

  it("closes on the user's day, not UTC's", async () => {
    const user = await newUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: LAST_WEEK },
      NOW,
    );
    // Sunday 8 Nov, 15:30 UTC: already Monday 9 Nov in Tokyo, the closing day.
    const page = await getReviewPage(
      user.id,
      LAST_WEEK,
      new Date("2026-11-08T15:30:00Z"),
    );
    expect(page).toMatchObject({ review: { id: review.id }, open: false });
  });

  it("never shows another user's review", async () => {
    const alice = await newUser();
    const bob = await newUser();
    await startWeeklyReview(alice.id, { periodStart: LAST_WEEK }, NOW);
    const old = await startWeeklyReview(
      alice.id,
      { periodStart: "2026-10-12" },
      new Date("2026-10-14T03:00:00Z"),
    );

    expect(await getReviewPage(bob.id, LAST_WEEK, NOW)).toMatchObject({
      review: null,
    });
    expect(await getReviewPage(bob.id, old.periodStart, NOW)).toMatchObject({
      periodStart: LAST_WEEK,
      review: null,
    });
    expect(await getReviewForWeek(bob.id, LAST_WEEK)).toBeNull();
  });
});

describe("getReviewForWeek", () => {
  it("reads priorities in order with their current titles and statuses", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id, "Run a 10k");
    const task = await newTask(user.id, "Book physio", { goalId: goal.id });
    const loose = await newTask(user.id, "Call the bank");
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    await setWeeklyReviewPriorities(
      user.id,
      {
        id: review.id,
        priorities: [
          { taskId: loose.id },
          { goalId: goal.id },
          { taskId: task.id },
        ],
      },
      NOW,
    );

    // Changed since: renamed, paused, completed.
    await updateGoal(
      user.id,
      updateGoalSchema.parse({ id: goal.id, title: "Run a half marathon" }),
    );
    await changeGoalStatus(user.id, { id: goal.id, status: "paused" });
    await changeTaskStatus(user.id, { id: task.id, status: "completed" });

    const detail = await getReviewForWeek(user.id, THIS_WEEK);
    expect(detail?.priorities).toEqual([
      {
        kind: "task",
        id: loose.id,
        title: "Call the bank",
        status: "open",
        goalTitle: null,
      },
      {
        kind: "goal",
        id: goal.id,
        title: "Run a half marathon",
        status: "paused",
      },
      {
        kind: "task",
        id: task.id,
        title: "Book physio",
        status: "completed",
        goalTitle: "Run a half marathon",
      },
    ]);
    expect(detail?.closesOn).toBe("2026-11-16");
  });
});

describe("getAdjustStep", () => {
  it("lists goals to pause or drop, stalled tasks, and next week's plans", async () => {
    const user = await newUser();
    const active = await newGoal(user.id, "Run a 10k");
    const paused = await newGoal(user.id, "Learn Spanish");
    await changeGoalStatus(user.id, { id: paused.id, status: "paused" });
    const dropped = await newGoal(user.id, "Old idea");
    await changeGoalStatus(user.id, { id: dropped.id, status: "dropped" });

    const overdue = await newTask(user.id, "Send the form", {
      dueDate: "2026-11-01",
    });
    const earlier = await newTask(user.id, "Tidy the desk", {
      plannedDate: "2026-11-02",
    });
    const nextWeek = await newTask(user.id, "Book physio", {
      plannedDate: "2026-11-10",
      goalId: active.id,
    });
    const today = await newTask(user.id, "Call the bank", {
      plannedDate: "2026-11-04",
    });
    const done = await newTask(user.id, "Buy shoes", {
      plannedDate: "2026-11-11",
    });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });

    // Reviewing this week: next week is 9–15 Nov, every day still ahead.
    const step = await getAdjustStep(
      user.id,
      { periodEnd: "2026-11-09", timeZone: "Asia/Tokyo" },
      NOW,
    );
    expect(step.goals).toEqual([
      { id: active.id, title: "Run a 10k", status: "active" },
      { id: paused.id, title: "Learn Spanish", status: "paused" },
    ]);
    expect(step.stalled.map(({ task, passed }) => [task.id, passed])).toEqual([
      [overdue.id, "deadline"],
      [earlier.id, "plan"],
    ]);
    expect(step.nextWeek).toMatchObject({
      start: "2026-11-09",
      end: "2026-11-16",
    });
    expect(step.nextWeek.days).toHaveLength(7);
    expect(step.plannedNextWeek.map((task) => task.id)).toEqual([nextWeek.id]);
    expect(step.plannable.map((task) => task.id).sort()).toEqual(
      [overdue.id, earlier.id, today.id].sort(),
    );

    // Reviewing last week: next week is this week, from today on.
    const lastWeekStep = await getAdjustStep(
      user.id,
      { periodEnd: THIS_WEEK, timeZone: "Asia/Tokyo" },
      NOW,
    );
    expect(lastWeekStep.nextWeek.days[0]).toBe("2026-11-04");
    expect(lastWeekStep.plannedNextWeek.map((task) => task.id)).toEqual([
      earlier.id,
      today.id,
    ]);
  });

  it("shows nothing of another user's", async () => {
    const alice = await newUser();
    const bob = await newUser();
    await newGoal(alice.id, "Run a 10k");
    await newTask(alice.id, "Send the form", { dueDate: "2026-11-01" });

    expect(
      await getAdjustStep(
        bob.id,
        { periodEnd: "2026-11-09", timeZone: "Asia/Tokyo" },
        NOW,
      ),
    ).toMatchObject({
      goals: [],
      stalled: [],
      plannedNextWeek: [],
      plannable: [],
    });
  });
});

describe("getPriorityOptions", () => {
  it("offers active and paused goals and open tasks, the user's own", async () => {
    const user = await newUser();
    const other = await newUser();
    const active = await newGoal(user.id, "Run a 10k");
    const paused = await newGoal(user.id, "Learn Spanish");
    await changeGoalStatus(user.id, { id: paused.id, status: "paused" });
    const completed = await newGoal(user.id, "Done already");
    await changeGoalStatus(user.id, { id: completed.id, status: "completed" });
    const open = await newTask(user.id, "Book physio", { goalId: active.id });
    const cancelled = await newTask(user.id, "Never mind");
    await changeTaskStatus(user.id, { id: cancelled.id, status: "cancelled" });
    await newGoal(other.id, "Someone else's");
    await newTask(other.id, "Someone else's task");

    expect(await getPriorityOptions(user.id, "Asia/Tokyo", NOW)).toEqual({
      goals: [
        { id: active.id, title: "Run a 10k", status: "active" },
        { id: paused.id, title: "Learn Spanish", status: "paused" },
      ],
      tasks: [{ id: open.id, title: "Book physio", goalTitle: "Run a 10k" }],
    });
  });
});

describe("weekly review actions", () => {
  // The actions run on the real clock, so take this and last week from it.
  const weeks = () => openPeriodStarts(todayFor("UTC"), 1);

  it("refuse a signed-out caller", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(user.id, {
      periodStart: weeks().thisWeek,
    });

    for (const result of [
      await actions.startWeeklyReview({ periodStart: weeks().thisWeek }),
      await actions.saveWeeklyReviewText({ id: review.id, wins: "Hi" }),
      await actions.setWeeklyReviewPriorities({
        id: review.id,
        priorities: [],
      }),
      await actions.finishWeeklyReview({ id: review.id }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    }
  });

  it("start, save each step and finish with nothing required", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id, "Run a 10k");
    await signInAs(user.id);

    const started = await actions.startWeeklyReview({
      periodStart: weeks().lastWeek,
    });
    expect(started).toMatchObject({ ok: true });
    if (!started.ok) return;
    const id = started.data.id;
    // Opening again returns the same review.
    expect(
      await actions.startWeeklyReview({ periodStart: weeks().lastWeek }),
    ).toMatchObject({ ok: true, data: { id } });

    expect(
      await actions.saveWeeklyReviewText({ id, wins: "  Kept going  " }),
    ).toMatchObject({ ok: true, data: { wins: "Kept going", lessons: null } });
    expect(
      await actions.setWeeklyReviewPriorities({
        id,
        priorities: [{ goalId: goal.id }],
      }),
    ).toEqual({ ok: true, data: [{ goalId: goal.id }] });
    expect(
      await actions.saveWeeklyReviewText({ id, prioritiesNote: "" }),
    ).toMatchObject({ ok: true, data: { prioritiesNote: null } });

    const finished = await actions.finishWeeklyReview({ id });
    expect(finished).toMatchObject({ ok: true });
    if (finished.ok) expect(finished.data.completedAt).toBeInstanceOf(Date);

    const empty = await actions.startWeeklyReview({
      periodStart: weeks().thisWeek,
    });
    if (!empty.ok) throw new Error("expected a review");
    expect(
      await actions.finishWeeklyReview({ id: empty.data.id }),
    ).toMatchObject({ ok: true, data: { wins: null, blockers: null } });
  });

  it("return field errors and NotFound for another user's review", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const review = await startWeeklyReview(alice.id, {
      periodStart: weeks().thisWeek,
    });
    await signInAs(bob.id);

    expect(
      await actions.startWeeklyReview({ periodStart: "2020-01-06" }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { periodStart: [expect.any(String)] },
      },
    });
    expect(
      await actions.saveWeeklyReviewText({
        id: review.id,
        wins: "x".repeat(5001),
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { wins: [expect.any(String)] },
      },
    });
    for (const result of [
      await actions.saveWeeklyReviewText({ id: review.id, wins: "Mine now" }),
      await actions.setWeeklyReviewPriorities({
        id: review.id,
        priorities: [],
      }),
      await actions.finishWeeklyReview({ id: review.id }),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    expect(await getReviewForWeek(alice.id, weeks().thisWeek)).toMatchObject({
      wins: null,
      completedAt: null,
    });
  });
});
