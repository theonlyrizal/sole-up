import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import { eq, getTableColumns, getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import { testDatabaseUrl } from "../../playwright.config";
import type { NoteDocument } from "../../src/lib/notes/document";
import * as schema from "../../src/server/db/schema";
import { assertTestDatabaseUrl } from "../integration/helpers/database";
import { signInAndConfirm } from "./helpers";

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

// The database fixtures exercise ownership even for tables with no user-facing
// creation flow. The assertions discover tables independently of the fixtures.
async function seedExportRows(db: ReturnType<typeof drizzle>, userId: string) {
  const goalId = randomUUID();
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
      .values({ userId, name: "Area", sortOrder: 0 });
    await tx.insert(schema.goals).values({ id: goalId, userId, title: "Goal" });
    await tx
      .insert(schema.milestones)
      .values({ userId, goalId, title: "Milestone", sortOrder: 0 });
    // More rows than one export page, with distinguishable content.
    await tx.insert(schema.tasks).values(
      Array.from({ length: 40 }, (_, index) => ({
        id: index === 0 ? taskId : randomUUID(),
        userId,
        goalId,
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
      title: "Event",
      allDay: true,
      startDate: day,
      endDate: end,
      rrule: "FREQ=WEEKLY",
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

const privateFields: Record<string, string[]> = {
  accounts: ["accessToken", "refreshToken", "idToken", "password"],
  sessions: ["token"],
  push_subscriptions: ["endpoint", "p256dh", "auth"],
};

test("Settings downloads every owned table with only the signed-in user's rows", async ({
  page,
  request,
}) => {
  const anonymous = await request.get("/api/export");
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["cache-control"]).toContain("no-store");

  const userId = await signInAndConfirm(page);
  const other = await request.post("/api/test/sign-in", {
    data: { email: `e2e-${randomUUID()}@example.test`, name: "Other user" },
  });
  expect(other.ok()).toBe(true);
  const { userId: otherId } = (await other.json()) as { userId: string };

  const pool = new Pool({
    connectionString: assertTestDatabaseUrl(testDatabaseUrl),
  });
  const db = drizzle({ client: pool, casing: "snake_case" });
  try {
    await seedExportRows(db, userId);
    await seedExportRows(db, otherId);

    await page.goto("/settings");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download export" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^soleup-export-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const archive = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(archive.version).toBe(1);
    expect(new Date(archive.exportedAt).toISOString()).toBe(archive.exportedAt);

    const expectedTables: string[] = [];
    for (const table of Object.values(schema)) {
      const name = getTableName(table);
      const fields = getTableColumns(table);
      const owner =
        table === schema.users
          ? schema.users.id
          : getTableConfig(table)
              .foreignKeys.map((fk) => fk.reference())
              .find((fk) => fk.foreignTable === schema.users)?.columns[0];
      if (!owner) continue;
      expectedTables.push(name);

      const key = "id" in fields ? fields.id : owner;
      const rows = await db
        .select()
        .from(table)
        .where(eq(owner, userId))
        .orderBy(key);
      const otherRows = await db
        .select({ key })
        .from(table)
        .where(eq(owner, otherId));
      expect(rows.length, `${name} has a current-user fixture`).toBeGreaterThan(
        0,
      );
      expect(
        otherRows.length,
        `${name} has a cross-user fixture`,
      ).toBeGreaterThan(0);
      const expectedRows = rows.map((row) => {
        const safe = Object.fromEntries(
          Object.entries(row).filter(
            ([field]) => !privateFields[name]?.includes(field),
          ),
        );
        if (table === schema.notes) {
          safe.markdown =
            "## Café\n\n**Read _this_**\\\n[a link](<https://example.test/a(b)>)\n\n````ts\n```\n````";
        }
        return safe;
      });
      expect(archive.tables[name], name).toEqual(
        JSON.parse(JSON.stringify(expectedRows)),
      );
    }
    expect(Object.keys(archive.tables).sort()).toEqual(expectedTables.sort());
  } finally {
    await pool.end();
  }
});
