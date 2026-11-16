import { randomUUID } from "node:crypto";

import { type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
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
  auditEvents,
  calendarEventExceptions,
  calendarEvents,
  goals,
  habitLogs,
  habitPauses,
  habits,
  habitSchedules,
  lifeAreas,
  milestones,
  noteGoals,
  notes,
  tasks,
  timeBlocks,
  userPreferences,
  weeklyReviewPriorities,
  weeklyReviews,
} from "../../src/server/db/schema";
import { assertTestDatabaseUrl } from "../integration/helpers/database";
import { signInAndConfirm } from "./helpers";

export const VISUAL_ZONE = "UTC";
export const DAILY_HABIT = "Morning stretch";
export const QUANTITY_HABIT = "Read a few pages before the afternoon commute";
export const GOAL_TITLE = "Make space for a longer weekend walk";
export const CALENDAR_BLOCK_TITLE = "Pick a route and pack a rain jacket";
export const CALENDAR_SERIES_TITLE = "Morning planning";
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
  {
    home = false,
    todaySchedule = false,
    plan = false,
    calendar = false,
    goalsUI = false,
    track = false,
    reviewUI = false,
  } = {},
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
  const habitStart = addDays(today, track ? -65 : -18);
  const areaId = randomUUID();
  const goalId = randomUUID();
  const archivedGoalId = randomUUID();
  const noteId = randomUUID();
  const reviewId = randomUUID();
  const pastReviewId = randomUUID();
  const eventId = randomUUID();
  const plannedTaskId = randomUUID();
  const stalledTaskId = randomUUID();
  const completedTaskId = randomUUID();
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
          ...(goalsUI && { startDate: today, targetDate: addDays(today, 45) }),
          ...(reviewUI && { createdAt: new Date(`${lastWeek}T12:00:00Z`) }),
        });
        if (goalsUI) {
          await db.insert(lifeAreas).values([
            { userId, name: "Learning", color: "violet", sortOrder: 1 },
            {
              userId,
              name: "Neighborhood projects",
              color: "amber",
              sortOrder: 2,
            },
            {
              userId,
              name: "Studio",
              color: "pink",
              sortOrder: 3,
              status: "archived",
            },
          ]);
          await db.insert(goals).values([
            {
              userId,
              lifeAreaId: areaId,
              title: "Swim at the community pool",
              reason: "Have a regular place to move and unwind.",
            },
            {
              userId,
              lifeAreaId: areaId,
              title:
                "Build a weekday routine that leaves time for dinner with friends",
              reason:
                "I want a little more breathing room at the end of the day.",
              targetDate: addDays(today, 30),
            },
            {
              userId,
              title: "Learn to mend clothes",
              reason: "Keep wearing the pieces I reach for most.",
            },
            { userId, title: "Make a small herb garden", status: "paused" },
            {
              id: archivedGoalId,
              userId,
              lifeAreaId: areaId,
              title: "Organize the winter walking group",
              status: "archived",
              completedAt: now,
            },
            { userId, title: "Read more fiction", status: "archived" },
          ]);
          await db.insert(milestones).values({
            userId,
            goalId: archivedGoalId,
            title: "Share the route",
            status: "completed",
            completedAt: now,
            sortOrder: 0,
          });
          await db.insert(tasks).values({
            userId,
            goalId: archivedGoalId,
            title: "Print spare maps",
          });
        }
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
            title: CALENDAR_BLOCK_TITLE,
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
            id: stalledTaskId,
            userId,
            title: "Move the spare seedlings to the porch",
            plannedDate: reviewUI ? addDays(lastWeek, 2) : yesterday,
          },
          {
            userId,
            title: "Book the bike tune-up",
            dueDate: addDays(today, 4),
          },
          {
            id: completedTaskId,
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
        if (calendar) {
          const seriesId = randomUUID();
          const archivedId = randomUUID();
          const time = (date: string, at: string) =>
            new Date(`${date}T${at}:00Z`);
          await db.insert(lifeAreas).values({
            id: archivedId,
            userId,
            name: "Studio",
            color: "violet",
            status: "archived",
            sortOrder: 1,
          });
          await db.insert(calendarEvents).values([
            {
              id: seriesId,
              userId,
              lifeAreaId: areaId,
              title: CALENDAR_SERIES_TITLE,
              allDay: false,
              startAt: time(today, "08:00"),
              endAt: time(today, "09:30"),
              tz: VISUAL_ZONE,
              rrule: "FREQ=DAILY;COUNT=5",
            },
            {
              userId,
              lifeAreaId: archivedId,
              title:
                "Review the first print proofs and return notes to the studio",
              allDay: false,
              startAt: time(today, "10:00"),
              endAt: time(today, "11:30"),
              tz: VISUAL_ZONE,
            },
            {
              userId,
              title: "Library book sale",
              allDay: true,
              startDate: today,
              endDate: tomorrow,
            },
          ]);
          await db.insert(calendarEventExceptions).values({
            userId,
            eventId: seriesId,
            kind: "modified",
            lifeAreaId: areaId,
            originalStartAt: time(tomorrow, "08:00"),
            startAt: time(tomorrow, "09:00"),
            endAt: time(tomorrow, "10:30"),
            title: "Planning after the school run",
          });
          await db.insert(timeBlocks).values({
            userId,
            taskId: plannedTaskId,
            startAt: time(today, "08:30"),
            endAt: time(today, "10:00"),
            tz: VISUAL_ZONE,
            rrule: "FREQ=DAILY;COUNT=4",
          });
          await db.insert(tasks).values({
            userId,
            title: "Send the revised route",
            dueAt: time(today, "11:30"),
            dueTz: VISUAL_ZONE,
          });
        }
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
        if (track) {
          await db
            .update(userPreferences)
            .set({ weekStart: dayOfWeek(addDays(today, -4)) })
            .where(eq(userPreferences.userId, userId));
          const pausedId = randomUUID();
          const archivedId = randomUUID();
          await db.insert(habits).values([
            {
              id: pausedId,
              userId,
              title: "Evening reflection",
              measure: "check",
              startDate: habitStart,
              status: "paused",
            },
            {
              id: archivedId,
              userId,
              title: "Practice guitar",
              measure: "check",
              startDate: habitStart,
              status: "archived",
            },
          ]);
          await db.insert(habitSchedules).values(
            [pausedId, archivedId].map((habitId) => ({
              userId,
              habitId,
              cadenceType: "daily" as const,
              cadenceConfig: {},
              effectiveFrom: habitStart,
            })),
          );
          await db.insert(habitPauses).values(
            [pausedId, archivedId].map((habitId) => ({
              userId,
              habitId,
              startDate: addDays(today, -6),
            })),
          );
          await db.insert(habitLogs).values([
            ...[-7, -13, -21, -28, -35, -53].map((offset) => ({
              userId,
              habitId: dailyId,
              localDate: addDays(today, offset),
              status:
                offset === -21 ? ("skipped" as const) : ("completed" as const),
            })),
            {
              userId,
              habitId: weekdaysId,
              localDate: addDays(today, -2),
              status: "completed",
              value: "18",
            },
            {
              userId,
              habitId: pausedId,
              localDate: addDays(today, -7),
              status: "completed",
            },
          ]);
        }
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
        if (goalsUI) {
          await db.insert(noteGoals).values([
            { userId, noteId, goalId },
            { userId, noteId, goalId: archivedGoalId },
          ]);
        }
        await db.insert(weeklyReviews).values([
          {
            userId,
            id: reviewId,
            periodStart: lastWeek,
            periodEnd: thisWeek,
            wins: "Made time for the short loop.",
            ...(reviewUI && {
              blockers: "Two appointments shifted into the afternoon.",
              lessons: "Keep the shorter route ready for busy days.",
              prioritiesNote: "Pack the bag the night before.",
            }),
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
        if (reviewUI) {
          const occurredAt = new Date(`${lastWeek}T15:00:00Z`);
          await db.insert(auditEvents).values([
            {
              userId,
              entityId: completedTaskId,
              entityType: "task",
              eventType: "task.planned",
              occurredAt,
              changes: { plannedDate: { from: null, to: lastWeek } },
            },
            {
              userId,
              entityId: stalledTaskId,
              entityType: "task",
              eventType: "task.planned",
              occurredAt,
              changes: {
                plannedDate: { from: lastWeek, to: addDays(lastWeek, 2) },
              },
            },
          ]);
          await db.insert(weeklyReviewPriorities).values([
            { userId, reviewId, goalId, sortOrder: 0 },
            { userId, reviewId, taskId: plannedTaskId, sortOrder: 1 },
            { userId, reviewId: pastReviewId, goalId, sortOrder: 0 },
          ]);
        }
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
    reviewId,
    pastReviewId,
    eventId,
  };
}
