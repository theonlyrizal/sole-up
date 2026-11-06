import { randomUUID } from "node:crypto";

import type { drizzle } from "drizzle-orm/node-postgres";

import type { NoteDocument } from "../../src/lib/notes/document";
import * as schema from "../../src/server/db/schema";

const body: NoteDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Café" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Read ", marks: [{ type: "bold" }] },
        {
          type: "text",
          text: "this",
          marks: [{ type: "italic" }, { type: "bold" }],
        },
        { type: "hardBreak" },
        {
          type: "text",
          text: "a link",
          marks: [
            { type: "link", attrs: { href: "https://example.test/a(b)" } },
          ],
        },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [{ type: "text", text: "```" }],
    },
  ],
};

// Populate every owned table, including tables with no user-facing creation
// flow. The assertions discover the tables independently of the fixtures.
export async function seedOwnedRows(
  db: ReturnType<typeof drizzle>,
  userId: string,
) {
  const lifeAreaId = randomUUID();
  const goalId = randomUUID();
  const milestoneId = randomUUID();
  const taskId = randomUUID();
  const habitId = randomUUID();
  const noteId = randomUUID();
  const tagId = randomUUID();
  const eventId = randomUUID();
  const blockId = randomUUID();
  const reviewId = randomUUID();
  const day = "2026-10-05";
  const end = "2026-10-12";
  const startAt = new Date(`${day}T12:00:00Z`);
  const endAt = new Date(`${day}T13:00:00Z`);
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.userPreferences)
      .values({ userId })
      .onConflictDoNothing();
    await tx.insert(schema.accounts).values({
      userId,
      accountId: userId,
      providerId: "github",
      accessToken: "fixture-access",
      refreshToken: "fixture-refresh",
      idToken: "fixture-id-token",
      password: "fixture-password",
    });
    await tx.insert(schema.pushSubscriptions).values({
      userId,
      endpoint: `https://example.test/push/${userId}`,
      p256dh: "a".repeat(87),
      auth: "b".repeat(22),
      userAgentLabel: "Test browser",
    });
    await tx
      .insert(schema.lifeAreas)
      .values({ id: lifeAreaId, userId, name: "Area", sortOrder: 0 });
    await tx
      .insert(schema.goals)
      .values({ id: goalId, userId, lifeAreaId, title: "Goal" });
    await tx.insert(schema.milestones).values({
      id: milestoneId,
      userId,
      goalId,
      title: "Milestone",
      sortOrder: 0,
    });
    // More rows than one export page, with distinguishable content.
    await tx.insert(schema.tasks).values(
      Array.from({ length: 40 }, (_, index) => ({
        id: index === 0 ? taskId : randomUUID(),
        userId,
        goalId: index === 0 ? null : goalId,
        milestoneId: index === 0 ? milestoneId : null,
        title: `${userId} task ${index}`,
      })),
    );
    await tx.insert(schema.auditEvents).values({
      userId,
      eventType: "goal.created",
      entityType: "goal",
      entityId: goalId,
      changes: {},
    });
    await tx.insert(schema.calendarEvents).values({
      id: eventId,
      userId,
      goalId,
      lifeAreaId,
      title: "Event",
      allDay: true,
      startDate: day,
      endDate: end,
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    });
    await tx
      .insert(schema.calendarEventExceptions)
      .values({ userId, eventId, kind: "cancelled", originalStartDate: end });
    await tx.insert(schema.timeBlocks).values({
      id: blockId,
      userId,
      taskId,
      startAt,
      endAt,
      tz: "UTC",
      rrule: "FREQ=DAILY",
    });
    await tx
      .insert(schema.timeBlockExceptions)
      .values({ userId, blockId, kind: "cancelled", originalStartAt: startAt });
    await tx.insert(schema.reminders).values({
      userId,
      kind: "weekly_review",
      targetAt: startAt,
      fireAt: startAt,
      // A delivery record the global sweep in reminders.spec cannot change.
      status: "sent",
      sentAt: startAt,
    });
    await tx.insert(schema.habits).values({
      id: habitId,
      userId,
      title: "Habit",
      measure: "check",
      startDate: day,
    });
    await tx.insert(schema.habitSchedules).values({
      userId,
      habitId,
      effectiveFrom: day,
      cadenceType: "daily",
      cadenceConfig: {},
    });
    await tx
      .insert(schema.habitPauses)
      .values({ userId, habitId, startDate: end });
    await tx
      .insert(schema.habitLogs)
      .values({ userId, habitId, localDate: day, status: "completed" });
    await tx
      .insert(schema.weeklyReviews)
      .values({ id: reviewId, userId, periodStart: day, periodEnd: end });
    await tx
      .insert(schema.weeklyReviewPriorities)
      .values({ userId, reviewId, goalId, sortOrder: 0 });
    await tx.insert(schema.notes).values({
      id: noteId,
      userId,
      title: "Archived note",
      body,
      bodyText: "Café\nRead this\na link\n```",
      archivedAt: startAt,
    });
    await tx.insert(schema.tags).values({ id: tagId, userId, name: "Tag" });
    await tx.insert(schema.noteGoals).values({ userId, noteId, goalId });
    await tx.insert(schema.noteTasks).values({ userId, noteId, taskId });
    await tx.insert(schema.noteTags).values({ userId, noteId, tagId });
    await tx.insert(schema.insightDismissals).values({
      userId,
      insightKey: "goal_inactivity",
      periodStart: day,
      periodEnd: end,
    });
  });
}
