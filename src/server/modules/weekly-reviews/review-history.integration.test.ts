import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayFor } from "@/lib/dates";
import { openPeriodStarts } from "@/lib/weekly-reviews";
import { db } from "@/server/db/client";
import { auditEvents, userPreferences } from "@/server/db/schema";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { getReviewForWeek, getReviewHistory, getReviewView } from "./queries";
import {
  finishWeeklyReview,
  saveWeeklyReviewText,
  setWeeklyReviewPriorities,
  startWeeklyReview,
} from "./service";

// Review history (chunk 7.4): the list, the read-only view and delete.
// Service rules are covered in weekly-reviews.integration.test.ts.

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

// Wednesday 4 Nov 2026, midday UTC, in Tokyo. With the Monday week start,
// this week began 11-02 and last week 10-26; 10-19 closed on 11-02.
const NOW = new Date("2026-11-04T12:00:00Z");
const THIS_WEEK = "2026-11-02";
const LAST_WEEK = "2026-10-26";
const CLOSED_WEEK = "2026-10-19";

async function newUser() {
  const user = await createTestUser();
  await db
    .insert(userPreferences)
    .values({ userId: user.id, timezone: "Asia/Tokyo", weekStart: 1 });
  return user;
}

/** A review of `week`, started (and maybe finished) during that week. */
async function reviewOf(
  userId: string,
  week: string,
  { finished = false } = {},
) {
  const during = new Date(`${week}T03:00:00Z`);
  const review = await startWeeklyReview(userId, { periodStart: week }, during);
  if (finished) await finishWeeklyReview(userId, { id: review.id }, during);
  return review;
}

describe("getReviewHistory", () => {
  it("lists nothing before the first review", async () => {
    const user = await newUser();
    expect(await getReviewHistory(user.id, NOW)).toMatchObject({
      today: "2026-11-04",
      timeZone: "Asia/Tokyo",
      thisWeek: THIS_WEEK,
      lastWeek: LAST_WEEK,
      reviews: [],
    });
  });

  it("lists reviews newest first, open or closed, finished or not", async () => {
    const user = await newUser();
    // Skipped weeks (10-05, 10-12) leave no trace.
    const older = await reviewOf(user.id, "2026-09-28", { finished: true });
    const closed = await reviewOf(user.id, CLOSED_WEEK);
    const last = await reviewOf(user.id, LAST_WEEK, { finished: true });
    const current = await reviewOf(user.id, THIS_WEEK);

    const { reviews } = await getReviewHistory(user.id, NOW);
    expect(reviews).toEqual([
      {
        id: current.id,
        periodStart: THIS_WEEK,
        periodEnd: "2026-11-09",
        completedAt: null,
        closesOn: "2026-11-16",
        open: true,
      },
      {
        id: last.id,
        periodStart: LAST_WEEK,
        periodEnd: THIS_WEEK,
        completedAt: new Date(`${LAST_WEEK}T03:00:00Z`),
        closesOn: "2026-11-09",
        open: true,
      },
      expect.objectContaining({
        id: closed.id,
        completedAt: null,
        closesOn: THIS_WEEK,
        open: false,
      }),
      expect.objectContaining({ id: older.id, open: false }),
    ]);
  });

  it("closes on the user's day, not UTC's", async () => {
    const user = await newUser();
    await reviewOf(user.id, CLOSED_WEEK);
    // Sunday 1 Nov 23:30 UTC is already Monday 2 Nov in Tokyo.
    const { reviews } = await getReviewHistory(
      user.id,
      new Date("2026-11-01T23:30:00Z"),
    );
    expect(reviews).toMatchObject([{ periodStart: CLOSED_WEEK, open: false }]);
  });

  it("never lists another user's reviews", async () => {
    const alice = await newUser();
    const bob = await newUser();
    await reviewOf(alice.id, LAST_WEEK);
    expect((await getReviewHistory(bob.id, NOW)).reviews).toEqual([]);
  });
});

describe("getReviewView", () => {
  it("reads a review with its text, priorities and window", async () => {
    const user = await newUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Run a 10k" }),
    );
    const during = new Date(`${CLOSED_WEEK}T03:00:00Z`);
    const review = await reviewOf(user.id, CLOSED_WEEK);
    await saveWeeklyReviewText(
      user.id,
      { id: review.id, wins: "Ran twice" },
      during,
    );
    await setWeeklyReviewPriorities(
      user.id,
      { id: review.id, priorities: [{ goalId: goal.id }] },
      during,
    );

    expect(await getReviewView(user.id, review.id, NOW)).toMatchObject({
      today: "2026-11-04",
      periodStart: CLOSED_WEEK,
      periodEnd: LAST_WEEK,
      open: false,
      otherWeek: null,
      review: {
        id: review.id,
        wins: "Ran twice",
        closesOn: THIS_WEEK,
        priorities: [{ kind: "goal", id: goal.id, title: "Run a 10k" }],
      },
    });
    const open = await reviewOf(user.id, LAST_WEEK);
    expect(await getReviewView(user.id, open.id, NOW)).toMatchObject({
      open: true,
    });
  });

  it("is null for another user's review or an unknown ID", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const review = await reviewOf(alice.id, LAST_WEEK);
    expect(await getReviewView(bob.id, review.id, NOW)).toBeNull();
    expect(await getReviewView(alice.id, crypto.randomUUID(), NOW)).toBeNull();
  });
});

describe("deleteWeeklyReview action", () => {
  // The actions run on the real clock, so take the weeks from it.
  const weeks = () => openPeriodStarts(todayFor("UTC"), 1);

  it("refuses a signed-out caller and keeps the review", async () => {
    const user = await createTestUser();
    const review = await startWeeklyReview(user.id, {
      periodStart: weeks().thisWeek,
    });
    expect(await actions.deleteWeeklyReview({ id: review.id })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(await getReviewForWeek(user.id, weeks().thisWeek)).not.toBeNull();
  });

  it("refuses to write a closed review, but deletes it with its events", async () => {
    const user = await createTestUser();
    // Started two weeks before the real today, on the week before that:
    // closed since last week.
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const review = await startWeeklyReview(
      user.id,
      {
        periodStart: openPeriodStarts(todayFor("UTC", twoWeeksAgo), 1).lastWeek,
      },
      twoWeeksAgo,
    );
    await signInAs(user.id);
    expect(
      await actions.saveWeeklyReviewText({ id: review.id, wins: "Too late" }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "This review is closed for editing.",
      },
    });

    expect(await actions.deleteWeeklyReview({ id: review.id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await getReviewView(user.id, review.id)).toBeNull();
    expect(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, review.id)),
    ).toEqual([]);
  });

  it("answers NotFound for another user's review and leaves it", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const review = await startWeeklyReview(alice.id, {
      periodStart: weeks().thisWeek,
    });
    await signInAs(bob.id);
    expect(await actions.deleteWeeklyReview({ id: review.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(
      await actions.deleteWeeklyReview({ id: "not-a-uuid" }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await getReviewForWeek(alice.id, weeks().thisWeek)).toMatchObject({
      id: review.id,
    });
  });
});
