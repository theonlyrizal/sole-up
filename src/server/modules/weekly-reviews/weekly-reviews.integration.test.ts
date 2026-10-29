import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { WeekStart } from "@/lib/dates";
import { REVIEW_CLOSED, REVIEW_PERIOD_NOT_OPEN } from "@/lib/weekly-reviews";
import { db } from "@/server/db/client";
import {
  auditEvents,
  userPreferences,
  users,
  weeklyReviewPriorities,
  weeklyReviews,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import {
  changeGoalStatus,
  createGoal,
  deleteGoal,
} from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import {
  changeTaskStatus,
  createTask,
  deleteTask,
} from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  deleteWeeklyReview,
  finishWeeklyReview,
  saveWeeklyReviewText,
  setWeeklyReviewPriorities,
  startWeeklyReview,
} from "./service";
import {
  PRIORITY_NOT_AVAILABLE,
  saveWeeklyReviewTextSchema,
  setWeeklyReviewPrioritiesSchema,
} from "./validation";

// Wednesday 4 Nov 2026, midday UTC. With no confirmed zone and the default
// Monday week start, this week began 11-02 and last week 10-26. Last week's
// review closes on 11-09, this week's on 11-16.
const NOW = new Date("2026-11-04T12:00:00Z");
const THIS_WEEK = "2026-11-02";
const LAST_WEEK = "2026-10-26";

type DriverError = { cause?: { code?: string; constraint?: string } };

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
  constraint: string,
) {
  expect(await writeError(write)).toMatchObject({
    cause: { code, constraint },
  });
}

const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

async function setPreferences(
  userId: string,
  values: { timezone?: string; weekStart?: WeekStart },
) {
  await db
    .insert(userPreferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userPreferences.userId, set: values });
}

const newGoal = (userId: string, title = "Run a 10k") =>
  createGoal(userId, createGoalSchema.parse({ title }));

const newTask = (userId: string, title = "Book physio") =>
  createTask(userId, createTaskSchema.parse({ title }));

const saveText = (
  userId: string,
  id: string,
  fields: Record<string, unknown>,
  now = NOW,
) =>
  saveWeeklyReviewText(
    userId,
    saveWeeklyReviewTextSchema.parse({ id, ...fields }),
    now,
  );

const setPriorities = (
  userId: string,
  id: string,
  priorities: unknown[],
  now = NOW,
) =>
  setWeeklyReviewPriorities(
    userId,
    setWeeklyReviewPrioritiesSchema.parse({ id, priorities }),
    now,
  );

async function readReview(id: string) {
  const [row] = await db
    .select()
    .from(weeklyReviews)
    .where(eq(weeklyReviews.id, id));
  return row;
}

async function prioritiesOf(reviewId: string) {
  return db
    .select({
      goalId: weeklyReviewPriorities.goalId,
      taskId: weeklyReviewPriorities.taskId,
      sortOrder: weeklyReviewPriorities.sortOrder,
    })
    .from(weeklyReviewPriorities)
    .where(eq(weeklyReviewPriorities.reviewId, reviewId))
    .orderBy(asc(weeklyReviewPriorities.sortOrder));
}

async function eventsFor(userId: string, entityId: string) {
  return db
    .select({ type: auditEvents.eventType, changes: auditEvents.changes })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.userId, userId), eq(auditEvents.entityId, entityId)),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
}

async function seedReview(userId: string, periodStart = THIS_WEEK) {
  const [row] = await db
    .insert(weeklyReviews)
    .values({ userId, periodStart, periodEnd: "2026-11-09" })
    .returning();
  return row!;
}

describe("schema", () => {
  it("holds period_end to period_start + 7", async () => {
    const user = await createTestUser();
    await expectViolation(
      () =>
        db.insert(weeklyReviews).values({
          userId: user.id,
          periodStart: THIS_WEEK,
          periodEnd: "2026-11-08",
        }),
      CHECK,
      "weekly_reviews_period_check",
    );
    await expect(seedReview(user.id)).resolves.toBeDefined();
  });

  it.each([
    ["wins", "weekly_reviews_wins_length_check"],
    ["blockers", "weekly_reviews_blockers_length_check"],
    ["lessons", "weekly_reviews_lessons_length_check"],
    ["prioritiesNote", "weekly_reviews_priorities_note_length_check"],
  ])("holds %s to 1–5,000 characters", async (field, constraint) => {
    const user = await createTestUser();
    const insert = (text: string, periodStart: string, periodEnd: string) =>
      db
        .insert(weeklyReviews)
        .values({ userId: user.id, periodStart, periodEnd, [field]: text });

    await expectViolation(
      () => insert("a".repeat(5001), THIS_WEEK, "2026-11-09"),
      CHECK,
      constraint,
    );
    await expectViolation(
      () => insert("", THIS_WEEK, "2026-11-09"),
      CHECK,
      constraint,
    );
    await expect(
      insert("a".repeat(5000), THIS_WEEK, "2026-11-09"),
    ).resolves.toBeDefined();
  });

  it("allows one review per period per user", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await seedReview(user.id);

    await expectViolation(
      () => seedReview(user.id),
      UNIQUE,
      "weekly_reviews_user_id_period_start_key",
    );
    await expect(seedReview(other.id)).resolves.toBeDefined();
  });

  it("links each priority to exactly one goal or task", async () => {
    const user = await createTestUser();
    const review = await seedReview(user.id);
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    const base = { userId: user.id, reviewId: review.id, sortOrder: 0 };

    await expectViolation(
      () =>
        db
          .insert(weeklyReviewPriorities)
          .values({ ...base, goalId: goal.id, taskId: task.id }),
      CHECK,
      "weekly_review_priorities_one_target_check",
    );
    await expectViolation(
      () => db.insert(weeklyReviewPriorities).values(base),
      CHECK,
      "weekly_review_priorities_one_target_check",
    );
    await expectViolation(
      () =>
        db
          .insert(weeklyReviewPriorities)
          .values({ ...base, goalId: goal.id, sortOrder: -1 }),
      CHECK,
      "weekly_review_priorities_sort_order_check",
    );
  });

  it("links a goal or task at most once, with one priority per position", async () => {
    const user = await createTestUser();
    const review = await seedReview(user.id);
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    const other = await newTask(user.id, "Other");
    const base = { userId: user.id, reviewId: review.id };
    await db.insert(weeklyReviewPriorities).values([
      { ...base, goalId: goal.id, sortOrder: 0 },
      { ...base, taskId: task.id, sortOrder: 1 },
    ]);

    await expectViolation(
      () =>
        db
          .insert(weeklyReviewPriorities)
          .values({ ...base, goalId: goal.id, sortOrder: 2 }),
      UNIQUE,
      "weekly_review_priorities_review_id_goal_id_key",
    );
    await expectViolation(
      () =>
        db
          .insert(weeklyReviewPriorities)
          .values({ ...base, taskId: task.id, sortOrder: 2 }),
      UNIQUE,
      "weekly_review_priorities_review_id_task_id_key",
    );
    await expectViolation(
      () =>
        db
          .insert(weeklyReviewPriorities)
          .values({ ...base, taskId: other.id, sortOrder: 1 }),
      UNIQUE,
      "weekly_review_priorities_review_id_sort_order_key",
    );
  });

  it("never links a priority to another user's review, goal or task", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const review = await seedReview(user.id);
    const foreignReview = await seedReview(other.id);
    const goal = await newGoal(user.id);
    const foreignGoal = await newGoal(other.id);
    const foreignTask = await newTask(other.id);
    const base = { userId: user.id, sortOrder: 0 };

    await expectViolation(
      () =>
        db
          .insert(weeklyReviewPriorities)
          .values({ ...base, reviewId: foreignReview.id, goalId: goal.id }),
      FOREIGN_KEY,
      "weekly_review_priorities_review_id_user_id_fk",
    );
    await expectViolation(
      () =>
        db
          .insert(weeklyReviewPriorities)
          .values({ ...base, reviewId: review.id, goalId: foreignGoal.id }),
      FOREIGN_KEY,
      "weekly_review_priorities_goal_id_user_id_fk",
    );
    await expectViolation(
      () =>
        db
          .insert(weeklyReviewPriorities)
          .values({ ...base, reviewId: review.id, taskId: foreignTask.id }),
      FOREIGN_KEY,
      "weekly_review_priorities_task_id_user_id_fk",
    );
  });

  it("removes a priority when its goal or task is deleted, keeping the rest", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const goal = await newGoal(user.id);
    const kept = await newGoal(user.id, "Kept");
    const task = await newTask(user.id);
    await setPriorities(user.id, review.id, [
      { goalId: goal.id },
      { taskId: task.id },
      { goalId: kept.id },
    ]);

    await deleteGoal(user.id, { id: goal.id });
    expect(await prioritiesOf(review.id)).toEqual([
      { goalId: null, taskId: task.id, sortOrder: 1 },
      { goalId: kept.id, taskId: null, sortOrder: 2 },
    ]);

    await deleteTask(user.id, { id: task.id });
    expect(await prioritiesOf(review.id)).toEqual([
      { goalId: kept.id, taskId: null, sortOrder: 2 },
    ]);
    expect(await readReview(review.id)).toBeDefined();
  });

  it("deletes reviews and priorities with the account", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const goal = await newGoal(user.id);
    await setPriorities(user.id, review.id, [{ goalId: goal.id }]);

    await db.delete(users).where(eq(users.id, user.id));
    expect(await readReview(review.id)).toBeUndefined();
    expect(await prioritiesOf(review.id)).toEqual([]);
  });
});

describe("startWeeklyReview", () => {
  it("creates this week's or last week's review once", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: LAST_WEEK },
      NOW,
    );
    expect(review).toMatchObject({
      periodStart: LAST_WEEK,
      periodEnd: THIS_WEEK,
      wins: null,
      blockers: null,
      lessons: null,
      prioritiesNote: null,
      completedAt: null,
    });

    const again = await startWeeklyReview(
      user.id,
      { periodStart: LAST_WEEK },
      NOW,
    );
    expect(again.id).toBe(review.id);

    const current = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    expect(current).toMatchObject({
      periodStart: THIS_WEEK,
      periodEnd: "2026-11-09",
    });

    expect(await eventsFor(user.id, review.id)).toEqual([
      {
        type: "weekly_review.started",
        changes: {
          periodStart: { from: null, to: LAST_WEEK },
          periodEnd: { from: null, to: THIS_WEEK },
        },
      },
    ]);
  });

  it("returns the same review when two starts race", async () => {
    const user = await createTestUser();
    const [a, b] = await Promise.all([
      startWeeklyReview(user.id, { periodStart: THIS_WEEK }, NOW),
      startWeeklyReview(user.id, { periodStart: THIS_WEEK }, NOW),
    ]);
    expect(a.id).toBe(b.id);
    expect(await eventsFor(user.id, a.id)).toHaveLength(1);
  });

  it.each([
    ["next week", "2026-11-09"],
    ["two weeks ago", "2026-10-19"],
    ["a day that isn't a week start", "2026-11-03"],
  ])("refuses %s", async (_case, periodStart) => {
    const user = await createTestUser();
    const error = await writeError(() =>
      startWeeklyReview(user.id, { periodStart }, NOW),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      message: REVIEW_PERIOD_NOT_OPEN,
      fieldErrors: { periodStart: [REVIEW_PERIOD_NOT_OPEN] },
    });
    expect(
      await db
        .select()
        .from(weeklyReviews)
        .where(eq(weeklyReviews.userId, user.id)),
    ).toEqual([]);
  });

  it("uses the current week start, leaving saved periods where they are", async () => {
    const user = await createTestUser();
    const monday = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );

    await setPreferences(user.id, { weekStart: 0 });
    await expect(
      startWeeklyReview(user.id, { periodStart: THIS_WEEK }, NOW),
    ).rejects.toBeInstanceOf(ValidationError);
    const sunday = await startWeeklyReview(
      user.id,
      { periodStart: "2026-11-01" },
      NOW,
    );
    expect(sunday.periodEnd).toBe("2026-11-08");

    // The Monday review overlaps the Sunday one and is still open.
    await saveText(user.id, monday.id, { wins: "Still editable" });
    expect(await readReview(monday.id)).toMatchObject({
      periodStart: THIS_WEEK,
      periodEnd: "2026-11-09",
      wins: "Still editable",
    });
  });

  it("uses the user's own today", async () => {
    const user = await createTestUser();
    await setPreferences(user.id, { timezone: "Pacific/Auckland" });
    // Sunday 8 Nov 12:00 UTC is already Monday 9 Nov in Auckland, so this
    // week is 11-09 there while UTC is still in the week of 11-02.
    const sundayUtc = new Date("2026-11-08T12:00:00Z");

    const review = await startWeeklyReview(
      user.id,
      { periodStart: "2026-11-09" },
      sundayUtc,
    );
    expect(review.periodStart).toBe("2026-11-09");
    await expect(
      startWeeklyReview(user.id, { periodStart: LAST_WEEK }, sundayUtc),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("saveWeeklyReviewText", () => {
  it("writes the given fields and records their names only", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );

    const saved = await saveText(user.id, review.id, {
      wins: "  Ran three times ",
      lessons: "Sleep first",
    });
    expect(saved).toMatchObject({
      wins: "Ran three times",
      blockers: null,
      lessons: "Sleep first",
      prioritiesNote: null,
    });

    // Absent fields are kept; blank clears.
    await saveText(user.id, review.id, {
      lessons: "  ",
      prioritiesNote: "Protect mornings",
    });
    expect(await readReview(review.id)).toMatchObject({
      wins: "Ran three times",
      lessons: null,
      prioritiesNote: "Protect mornings",
    });

    const events = await eventsFor(user.id, review.id);
    expect(events.slice(1)).toEqual([
      {
        type: "weekly_review.updated",
        changes: { fields: ["wins", "lessons"] },
      },
      {
        type: "weekly_review.updated",
        changes: { fields: ["lessons", "prioritiesNote"] },
      },
    ]);
  });

  it("records nothing when nothing changes", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    await saveText(user.id, review.id, { wins: "Same" });

    await saveText(user.id, review.id, { wins: " Same ", blockers: "" });
    await saveText(user.id, review.id, {});
    expect(await eventsFor(user.id, review.id)).toHaveLength(2);
  });
});

describe("setWeeklyReviewPriorities", () => {
  it("replaces the list in order with a dense sort order", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const goal = await newGoal(user.id);
    const paused = await newGoal(user.id, "Paused");
    await changeGoalStatus(user.id, { id: paused.id, status: "paused" });
    const task = await newTask(user.id);

    const first = [
      { taskId: task.id },
      { goalId: goal.id },
      { goalId: paused.id },
    ];
    expect(await setPriorities(user.id, review.id, first)).toEqual(first);
    expect(await prioritiesOf(review.id)).toEqual([
      { goalId: null, taskId: task.id, sortOrder: 0 },
      { goalId: goal.id, taskId: null, sortOrder: 1 },
      { goalId: paused.id, taskId: null, sortOrder: 2 },
    ]);

    const second = [{ goalId: paused.id }, { taskId: task.id }];
    await setPriorities(user.id, review.id, second);
    expect(await prioritiesOf(review.id)).toEqual([
      { goalId: paused.id, taskId: null, sortOrder: 0 },
      { goalId: null, taskId: task.id, sortOrder: 1 },
    ]);

    await setPriorities(user.id, review.id, []);
    expect(await prioritiesOf(review.id)).toEqual([]);

    const events = await eventsFor(user.id, review.id);
    expect(events.slice(1)).toEqual([
      {
        type: "weekly_review.priorities_changed",
        changes: { priorities: { from: [], to: first } },
      },
      {
        type: "weekly_review.priorities_changed",
        changes: { priorities: { from: first, to: second } },
      },
      {
        type: "weekly_review.priorities_changed",
        changes: { priorities: { from: second, to: [] } },
      },
    ]);
  });

  it("records nothing for the same list", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const goal = await newGoal(user.id);
    await setPriorities(user.id, review.id, []);
    await setPriorities(user.id, review.id, [{ goalId: goal.id }]);
    await setPriorities(user.id, review.id, [{ goalId: goal.id }]);
    expect(await eventsFor(user.id, review.id)).toHaveLength(2);
  });

  it.each([
    ["a completed goal", "goal", "completed"],
    ["a dropped goal", "goal", "dropped"],
    ["an archived goal", "goal", "archived"],
    ["a completed task", "task", "completed"],
    ["a cancelled task", "task", "cancelled"],
  ] as const)("refuses to add %s", async (_case, kind, status) => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const open = await newTask(user.id, "Open");
    let priority;
    if (kind === "goal") {
      const goal = await newGoal(user.id);
      await changeGoalStatus(user.id, { id: goal.id, status });
      priority = { goalId: goal.id };
    } else {
      const task = await newTask(user.id);
      await changeTaskStatus(user.id, { id: task.id, status });
      priority = { taskId: task.id };
    }

    const error = await writeError(() =>
      setPriorities(user.id, review.id, [{ taskId: open.id }, priority]),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ message: PRIORITY_NOT_AVAILABLE });
    expect(await prioritiesOf(review.id)).toEqual([]);
    expect(await eventsFor(user.id, review.id)).toHaveLength(1);
  });

  it("keeps a linked goal that has since been completed", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    await setPriorities(user.id, review.id, [
      { goalId: goal.id },
      { taskId: task.id },
    ]);
    await changeGoalStatus(user.id, { id: goal.id, status: "completed" });

    await setPriorities(user.id, review.id, [
      { taskId: task.id },
      { goalId: goal.id },
    ]);
    expect(await prioritiesOf(review.id)).toEqual([
      { goalId: null, taskId: task.id, sortOrder: 0 },
      { goalId: goal.id, taskId: null, sortOrder: 1 },
    ]);

    // Once removed, it can't be added back.
    await setPriorities(user.id, review.id, [{ taskId: task.id }]);
    await expect(
      setPriorities(user.id, review.id, [{ goalId: goal.id }]),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("finishWeeklyReview", () => {
  it("finishes an empty review once and keeps it editable while open", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: LAST_WEEK },
      NOW,
    );

    const finished = await finishWeeklyReview(user.id, { id: review.id }, NOW);
    expect(finished.completedAt).toEqual(NOW);

    const later = new Date("2026-11-05T09:00:00Z");
    const again = await finishWeeklyReview(user.id, { id: review.id }, later);
    expect(again.completedAt).toEqual(NOW);

    await saveText(user.id, review.id, { blockers: "Travel" }, later);
    expect(await readReview(review.id)).toMatchObject({
      blockers: "Travel",
      completedAt: NOW,
    });

    const events = await eventsFor(user.id, review.id);
    expect(events.map((event) => event.type)).toEqual([
      "weekly_review.started",
      "weekly_review.finished",
      "weekly_review.updated",
    ]);
    expect(events[1]!.changes).toEqual({
      completedAt: { from: null, to: NOW.toISOString() },
    });
  });
});

describe("closed periods", () => {
  // Last week's review closes on 9 Nov. In Auckland (UTC+13) that day
  // begins at 11:00 UTC on 8 Nov, while UTC is still on the 8th.
  const LAST_OPEN = new Date("2026-11-08T10:59:59Z");
  const CLOSING = new Date("2026-11-08T11:00:00Z");

  async function aucklandReview() {
    const user = await createTestUser();
    await setPreferences(user.id, { timezone: "Pacific/Auckland" });
    const review = await startWeeklyReview(
      user.id,
      { periodStart: LAST_WEEK },
      NOW,
    );
    const goal = await newGoal(user.id);
    await setPriorities(user.id, review.id, [{ goalId: goal.id }]);
    await saveText(user.id, review.id, { wins: "Kept" });
    return { user, review, goal };
  }

  it("allows every write up to the last open moment", async () => {
    const { user, review, goal } = await aucklandReview();
    const task = await newTask(user.id);

    await saveText(user.id, review.id, { lessons: "Late" }, LAST_OPEN);
    await setPriorities(
      user.id,
      review.id,
      [{ goalId: goal.id }, { taskId: task.id }],
      LAST_OPEN,
    );
    await finishWeeklyReview(user.id, { id: review.id }, LAST_OPEN);
    expect(await readReview(review.id)).toMatchObject({
      lessons: "Late",
      completedAt: LAST_OPEN,
    });
  });

  it("refuses every write from the closing day in the user's zone", async () => {
    const { user, review, goal } = await aucklandReview();
    const before = await readReview(review.id);
    const eventCount = (await eventsFor(user.id, review.id)).length;

    const writes = [
      () => saveText(user.id, review.id, { wins: "Rewritten" }, CLOSING),
      () => saveText(user.id, review.id, { wins: "Kept" }, CLOSING),
      () => setPriorities(user.id, review.id, [], CLOSING),
      () => setPriorities(user.id, review.id, [{ goalId: goal.id }], CLOSING),
      () => finishWeeklyReview(user.id, { id: review.id }, CLOSING),
    ];
    for (const write of writes) {
      const error = await writeError(write);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error).toMatchObject({ message: REVIEW_CLOSED });
    }

    expect(await readReview(review.id)).toEqual(before);
    expect(await prioritiesOf(review.id)).toEqual([
      { goalId: goal.id, taskId: null, sortOrder: 0 },
    ]);
    expect(await eventsFor(user.id, review.id)).toHaveLength(eventCount);
  });

  it("refuses a finished review too, and can't start the week again", async () => {
    const { user, review } = await aucklandReview();
    await finishWeeklyReview(user.id, { id: review.id }, NOW);

    await expect(
      finishWeeklyReview(user.id, { id: review.id }, CLOSING),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      startWeeklyReview(user.id, { periodStart: LAST_WEEK }, CLOSING),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("still allows delete, removing priorities and events", async () => {
    const { user, review } = await aucklandReview();
    const other = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );

    await deleteWeeklyReview(user.id, { id: review.id });

    expect(await readReview(review.id)).toBeUndefined();
    expect(await prioritiesOf(review.id)).toEqual([]);
    expect(await eventsFor(user.id, review.id)).toEqual([]);
    expect(await eventsFor(user.id, other.id)).toHaveLength(1);
  });
});

describe("cross-user access", () => {
  it("treats another user's review as not found for every write", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const review = await startWeeklyReview(
      owner.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const ownGoal = await newGoal(intruder.id);
    const before = await readReview(review.id);

    const writes = [
      () => saveText(intruder.id, review.id, { wins: "Mine now" }),
      () => setPriorities(intruder.id, review.id, [{ goalId: ownGoal.id }]),
      () => finishWeeklyReview(intruder.id, { id: review.id }, NOW),
      () => deleteWeeklyReview(intruder.id, { id: review.id }),
    ];
    for (const write of writes) {
      expect(await writeError(write)).toBeInstanceOf(NotFoundError);
    }

    expect(await readReview(review.id)).toEqual(before);
    expect(await prioritiesOf(review.id)).toEqual([]);
    expect(await eventsFor(owner.id, review.id)).toHaveLength(1);
    expect(await eventsFor(intruder.id, review.id)).toEqual([]);
  });

  it("refuses another user's goal or task as a priority", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const foreignGoal = await newGoal(other.id);
    const foreignTask = await newTask(other.id);

    for (const priority of [
      { goalId: foreignGoal.id },
      { taskId: foreignTask.id },
    ]) {
      const error = await writeError(() =>
        setPriorities(user.id, review.id, [priority]),
      );
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ message: PRIORITY_NOT_AVAILABLE });
    }
    expect(await prioritiesOf(review.id)).toEqual([]);
  });

  it("starts a separate review for each user in the same period", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const reviewA = await startWeeklyReview(
      a.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const reviewB = await startWeeklyReview(
      b.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    expect(reviewA.id).not.toBe(reviewB.id);
  });
});

describe("audit privacy", () => {
  it("events never hold review text or linked titles", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(
      user.id,
      { periodStart: THIS_WEEK },
      NOW,
    );
    const goal = await newGoal(user.id, "Zebra goal title");
    const task = await newTask(user.id, "Quokka task title");

    await saveText(user.id, review.id, {
      wins: "Marigold",
      blockers: "Tangerine",
      lessons: "Saffron",
      prioritiesNote: "Vermilion",
    });
    await saveText(user.id, review.id, { wins: "Cerulean" });
    await setPriorities(user.id, review.id, [
      { goalId: goal.id },
      { taskId: task.id },
    ]);
    await finishWeeklyReview(user.id, { id: review.id }, NOW);

    const events = await eventsFor(user.id, review.id);
    expect(events.map((event) => event.type)).toEqual([
      "weekly_review.started",
      "weekly_review.updated",
      "weekly_review.updated",
      "weekly_review.priorities_changed",
      "weekly_review.finished",
    ]);
    const stored = JSON.stringify(events.map((event) => event.changes));
    for (const secret of [
      "Marigold",
      "Tangerine",
      "Saffron",
      "Vermilion",
      "Cerulean",
      "Zebra",
      "Quokka",
    ]) {
      expect(stored).not.toContain(secret);
    }
  });
});
