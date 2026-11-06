import { eq } from "drizzle-orm";
import { expect, it } from "vitest";

import { db } from "@/server/db/client";
import {
  auditEvents,
  insightDismissals,
  userPreferences,
  users,
} from "@/server/db/schema";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { dismissedInsightKeys, dismissInsightForPeriod } from "./service";
import { dismissInsightSchema, taskInsightPeriodSchema } from "./validation";

it("dismisses one insight for one user's local period, once even when retried", async () => {
  const owner = await createTestUser();
  const other = await createTestUser();
  await db
    .insert(userPreferences)
    .values({ userId: owner.id, timezone: "Asia/Tokyo", weekStart: 1 });
  // Monday in Tokyo but still Sunday in UTC.
  const now = new Date("2026-11-08T16:00:00Z");
  const input = { key: "goal_inactivity", start: "2026-11-09" } as const;
  await Promise.all([
    dismissInsightForPeriod(owner.id, input, now),
    dismissInsightForPeriod(owner.id, input, now),
  ]);

  expect(await db.select().from(insightDismissals)).toMatchObject([
    {
      userId: owner.id,
      insightKey: input.key,
      periodStart: input.start,
      periodEnd: "2026-11-16",
    },
  ]);
  expect(await db.select().from(auditEvents)).toMatchObject([
    { userId: owner.id, eventType: "insight_dismissal.created" },
  ]);
  expect(await dismissedInsightKeys(owner.id, "2026-11-15", 1)).toEqual(
    new Set([input.key]),
  );
  expect(await dismissedInsightKeys(other.id, "2026-11-15", 1)).toEqual(
    new Set(),
  );
  expect(await dismissedInsightKeys(owner.id, "2026-11-16", 1)).toEqual(
    new Set(),
  );

  await db.delete(users).where(eq(users.id, owner.id));
  expect(await db.select().from(insightDismissals)).toEqual([]);
});

it("rejects a stale dismissal instead of hiding a newly rolled insight", async () => {
  const { id } = await createTestUser();
  await db
    .insert(userPreferences)
    .values({ userId: id, timezone: "UTC", weekStart: 1 });
  await expect(
    dismissInsightForPeriod(
      id,
      { key: "overdue_trend", start: "2026-10-05" },
      new Date("2026-11-09T00:00:00Z"),
    ),
  ).rejects.toThrow("period has changed");
  expect(await db.select().from(insightDismissals)).toEqual([]);
});

it("validates insight keys and local dates at the boundaries", () => {
  expect(
    dismissInsightSchema.safeParse({ key: "unknown", start: "2026-11-09" })
      .success,
  ).toBe(false);
  expect(
    dismissInsightSchema.safeParse({
      key: "goal_inactivity",
      start: "2026-11-31",
    }).success,
  ).toBe(false);
  expect(
    taskInsightPeriodSchema.safeParse({
      key: "goal_inactivity",
      start: "2026-11-09",
    }).success,
  ).toBe(false);
  expect(
    taskInsightPeriodSchema.safeParse({
      key: "overdue_trend",
      start: "9999-12-31",
    }).success,
  ).toBe(false);
});
