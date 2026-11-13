import { randomUUID } from "node:crypto";

import { type Page } from "@playwright/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { testDatabaseUrl } from "../../playwright.config";
import {
  addDays,
  dayOfWeek,
  localDayRange,
  startOfWeek,
  todayFor,
} from "../../src/lib/dates";
import { DEFAULT_WEEK_START } from "../../src/lib/preferences";
import {
  calendarEvents,
  goals,
  habitLogs,
  habits,
  habitSchedules,
  lifeAreas,
  milestones,
  notes,
  tasks,
  timeBlocks,
  weeklyReviews,
} from "../../src/server/db/schema";
import { assertTestDatabaseUrl } from "../integration/helpers/database";
import { signInAndConfirm } from "./helpers";

export const VISUAL_ZONE = "UTC";
export const DAILY_HABIT = "Morning stretch";
export const QUANTITY_HABIT = "Read a few pages before the afternoon commute";
export const GOAL_TITLE = "Make space for a longer weekend walk";
export const EVENT_TITLE = "Walk and coffee with a friend";
export const INBOX_TASK = "Ask the library about weekend opening hours";
export const UPCOMING_TASK = "Check the trail map and pack a thermos";

/** Force a real habit query to fail for one test user until its schedule exists. */
export async function createUnscheduledHabit(
  userId: string,
  today: string,
  loggedToday = false,
) {
  const pool = new Pool({
    connectionString: assertTestDatabaseUrl(testDatabaseUrl),
  });
  const db = drizzle({ client: pool, casing: "snake_case" });
  const habitId = randomUUID();
  try {
    await db.insert(habits).values({
      id: habitId,
      userId,
      title: "Water the herbs",
      measure: "check",
      startDate: today,
    });
    if (loggedToday) {
      await db
        .insert(habitLogs)
        .values({ userId, habitId, localDate: today, status: "completed" });
    }
  } finally {
    await pool.end();
  }
  return async () => {
    const pool = new Pool({
      connectionString: assertTestDatabaseUrl(testDatabaseUrl),
    });
    try {
      await drizzle({ client: pool, casing: "snake_case" })
        .insert(habitSchedules)
        .values({
          userId,
          habitId,
          effectiveFrom: today,
          cadenceType: "daily",
          cadenceConfig: {},
        });
    } finally {
      await pool.end();
    }
  };
}

/** Give a fresh test account a populated UI without relying on clicks to seed it. */
export async function seedVisualData(
  page: Page,
  { home = false, todaySchedule = false, plan = false } = {},
) {
  const userId = await signInAndConfirm(page, "Alex Morgan");
  const pool = new Pool({
    connectionString: assertTestDatabaseUrl(testDatabaseUrl),
  });
  const now = new Date();
  const today = todayFor(VISUAL_ZONE, now);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const thisWeek = startOfWeek(today, DEFAULT_WEEK_START);
  const lastWeek = addDays(thisWeek, -7);
  const habitStart = addDays(today, -18);
  const areaId = randomUUID();
  const goalId = randomUUID();
  const noteId = randomUUID();
  const pastReviewId = randomUUID();
  const eventId = randomUUID();
  const plannedTaskId = randomUUID();
  const dailyId = randomUUID();
  const weekdaysId = randomUUID();
  const flexibleId = randomUUID();
  const noteText = "Take the riverside path when there is enough daylight.";

  try {
    await drizzle({ client: pool, casing: "snake_case" }).transaction(
      async (db) => {
        await db.insert(lifeAreas).values({
          id: areaId,
          userId,
          name: "Health",
          color: "teal",
          sortOrder: 0,
        });
        await db.insert(goals).values({
          id: goalId,
          userId,
          lifeAreaId: areaId,
          title: GOAL_TITLE,
          reason: "A little more time outside each week.",
          priority: "medium",
        });
        if (home) {
          await db
            .insert(goals)
            .values(
              [
                "Learn to mend clothes",
                "Make a small herb garden",
                "Plan a weekend away",
                "Read more fiction",
              ].map((title) => ({ userId, title })),
            );
        }
        await db.insert(milestones).values([
          {
            userId,
            goalId,
            title: "Map a short loop",
            status: "completed",
            completedAt: now,
            sortOrder: 0,
          },
          { userId, goalId, title: "Try the riverside path", sortOrder: 1 },
          { userId, goalId, title: "Invite a friend", sortOrder: 2 },
        ]);
        await db.insert(tasks).values([
          {
            id: plannedTaskId,
            userId,
            goalId,
            title: "Pick a route and pack a rain jacket",
            plannedDate: today,
            priority: "high",
            estimatedMinutes: 20,
          },
          { userId, title: "Return the library books", dueDate: today },
          {
            userId,
            title:
              "Reply to the community garden about next month's volunteer morning",
            dueDate: yesterday,
          },
          {
            userId,
            title: "Move the spare seedlings to the porch",
            plannedDate: yesterday,
          },
          {
            userId,
            title: "Book the bike tune-up",
            dueDate: addDays(today, 4),
          },
          {
            userId,
            title: "Borrow a route map",
            plannedDate: lastWeek,
            status: "completed",
            completedAt: new Date(`${addDays(lastWeek, 1)}T12:00:00Z`),
          },
        ]);
        if (plan) {
          await db.insert(tasks).values([
            { userId, title: INBOX_TASK },
            {
              userId,
              goalId,
              title: UPCOMING_TASK,
              plannedDate: tomorrow,
              dueAt: new Date(`${tomorrow}T17:00:00Z`),
              dueTz: VISUAL_ZONE,
              priority: "high",
              estimatedMinutes: 45,
            },
            {
              userId,
              goalId,
              title: "Choose a café for after the walk",
              plannedDate: addDays(today, 11),
              priority: "low",
            },
          ]);
        }
        await db.insert(calendarEvents).values({
          id: eventId,
          userId,
          goalId,
          lifeAreaId: areaId,
          title: EVENT_TITLE,
          allDay: false,
          startAt: new Date(`${tomorrow}T14:00:00Z`),
          endAt: new Date(`${tomorrow}T15:00:00Z`),
          tz: VISUAL_ZONE,
        });
        if (todaySchedule) {
          const day = localDayRange(today, VISUAL_ZONE);
          await db.insert(calendarEvents).values([
            {
              userId,
              title: "Library book sale",
              allDay: true,
              startDate: today,
              endDate: tomorrow,
            },
            {
              userId,
              title: "Community garden open day",
              allDay: false,
              startAt: day.start,
              endAt: day.end,
              tz: VISUAL_ZONE,
            },
          ]);
          await db.insert(timeBlocks).values({
            userId,
            taskId: plannedTaskId,
            startAt: new Date(`${today}T15:00:00Z`),
            endAt: new Date(`${today}T15:20:00Z`),
            tz: VISUAL_ZONE,
          });
        }
        await db.insert(habits).values([
          {
            id: dailyId,
            userId,
            title: DAILY_HABIT,
            measure: "check",
            startDate: habitStart,
          },
          {
            id: weekdaysId,
            userId,
            title: QUANTITY_HABIT,
            measure: "quantity",
            unit: "pages",
            startDate: habitStart,
          },
          {
            id: flexibleId,
            userId,
            goalId,
            title: "Walk outdoors",
            measure: "check",
            startDate: habitStart,
          },
        ]);
        await db.insert(habitSchedules).values([
          {
            userId,
            habitId: dailyId,
            effectiveFrom: habitStart,
            cadenceType: "daily",
            cadenceConfig: {},
          },
          {
            userId,
            habitId: weekdaysId,
            effectiveFrom: habitStart,
            cadenceType: "weekly_days",
            cadenceConfig: { days: [dayOfWeek(today), dayOfWeek(yesterday)] },
            target: "12",
          },
          {
            userId,
            habitId: flexibleId,
            effectiveFrom: habitStart,
            cadenceType: "times_per_week",
            cadenceConfig: { timesPerWeek: 3 },
          },
        ]);
        await db.insert(habitLogs).values([
          {
            userId,
            habitId: dailyId,
            localDate: addDays(today, -2),
            status: "completed",
          },
          { userId, habitId: dailyId, localDate: yesterday, status: "skipped" },
          {
            userId,
            habitId: weekdaysId,
            localDate: today,
            status: "completed",
            value: "6",
          },
          {
            userId,
            habitId: weekdaysId,
            localDate: yesterday,
            status: "completed",
            value: "12",
          },
          {
            userId,
            habitId: flexibleId,
            localDate: today,
            status: "completed",
          },
        ]);
        await db.insert(notes).values({
          id: noteId,
          userId,
          title: "Weekend walking routes",
          bodyText: noteText,
          body: {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 1 },
                content: [{ type: "text", text: "Riverside loop" }],
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: noteText }],
              },
            ],
          },
        });
        await db.insert(weeklyReviews).values([
          {
            userId,
            periodStart: lastWeek,
            periodEnd: thisWeek,
            wins: "Made time for the short loop.",
          },
          {
            id: pastReviewId,
            userId,
            periodStart: addDays(lastWeek, -14),
            periodEnd: addDays(lastWeek, -7),
            completedAt: new Date(`${lastWeek}T12:00:00Z`),
            lessons: "Short walks fit between errands.",
          },
        ]);
      },
    );
  } finally {
    await pool.end();
  }

  return {
    userId,
    today,
    tomorrow,
    thisWeek,
    lastWeek,
    goalId,
    noteId,
    pastReviewId,
    eventId,
  };
}
