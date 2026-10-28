import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { instantFromLocal } from "@/lib/dates";
import { db } from "@/server/db/client";
import { reminders } from "@/server/db/schema";
import { savePreferences } from "@/server/modules/preferences/service";
import { createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import {
  asUser,
  createTestUser,
} from "../../../../../../tests/integration/helpers/users";
import { POST } from "./route";

// The notification's snooze action (chunk 5.6): the service worker POSTs
// here with the session cookie.
const ORIGIN = "http://localhost:3000";

/** A user with a task due far ahead whose reminder has gone out. */
async function sentReminder() {
  const user = await createTestUser();
  await savePreferences(user.id, {
    timezone: "Europe/London",
    locale: "en-GB",
    weekStart: 1,
  });
  const task = await createTask(
    user.id,
    createTaskSchema.parse({
      title: "Submit visa form",
      dueDate: "2099-01-01",
      dueTime: "10:00",
      dueTz: "Europe/London",
    }),
  );
  const targetAt = instantFromLocal("2099-01-01", "10:00", "Europe/London");
  const [row] = await db
    .insert(reminders)
    .values({
      userId: user.id,
      kind: "task_deadline",
      taskId: task.id,
      targetAt,
      fireAt: targetAt,
      status: "sent",
      sentAt: new Date(),
    })
    .returning();
  return { user, task, reminder: row! };
}

async function post(
  id: string,
  {
    headers = new Headers(),
    origin = ORIGIN as string | null,
    body = JSON.stringify({ minutes: 15 }) as string | undefined,
  } = {},
) {
  const sent = new Headers(headers);
  if (origin) sent.set("origin", origin);
  sent.set("content-type", "application/json");
  return POST(
    new Request(`${ORIGIN}/api/reminders/${id}/snooze`, {
      method: "POST",
      headers: sent,
      body,
    }),
    { params: Promise.resolve({ id }) },
  );
}

const snoozedRowsOf = (userId: string) =>
  db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .then((rows) => rows.filter((row) => row.snoozed));

describe("POST /api/reminders/[id]/snooze", () => {
  it("snoozes the signed-in user's reminder 15 minutes from now", async () => {
    const { user, reminder } = await sentReminder();
    const { headers } = await asUser(user.id);
    const before = Date.now();

    const response = await post(reminder.id, { headers });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { fireAt } = (await response.json()) as { fireAt: string };
    const minutes = (new Date(fireAt).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThanOrEqual(15);
    expect(minutes).toBeLessThan(16);
    expect(await snoozedRowsOf(user.id)).toEqual([
      expect.objectContaining({
        status: "scheduled",
        targetAt: reminder.targetAt,
        fireAt: new Date(fireAt),
      }),
    ]);
  });

  it("answers 401 without a session", async () => {
    const { user, reminder } = await sentReminder();
    const response = await post(reminder.id);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(await snoozedRowsOf(user.id)).toEqual([]);
  });

  it.each([
    ["another site", "https://evil.example"],
    ["no origin", null],
  ])("answers 403 for a request from %s", async (_, origin) => {
    const { user, reminder } = await sentReminder();
    const { headers } = await asUser(user.id);
    const response = await post(reminder.id, { headers, origin });
    expect(response.status).toBe(403);
    expect(await snoozedRowsOf(user.id)).toEqual([]);
  });

  it.each([
    ["30 minutes", JSON.stringify({ minutes: 30 })],
    ["an empty body", ""],
    ["a body that isn't JSON", "minutes=15"],
  ])("answers 400 for %s", async (_, body) => {
    const { user, reminder } = await sentReminder();
    const { headers } = await asUser(user.id);
    const response = await post(reminder.id, { headers, body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid" });
  });

  it("answers 404 for another user's reminder or one that doesn't exist", async () => {
    const { user, reminder } = await sentReminder();
    const other = await createTestUser();
    const { headers } = await asUser(other.id);

    const theirs = await post(reminder.id, { headers });
    const missing = await post(randomUUID(), { headers });

    expect(theirs.status).toBe(404);
    expect(await theirs.json()).toEqual({ error: "not_found" });
    expect(missing.status).toBe(404);
    expect(await snoozedRowsOf(user.id)).toEqual([]);
  });

  it("answers 409 for a reminder that hasn't gone out yet", async () => {
    const { user, reminder } = await sentReminder();
    await db
      .update(reminders)
      .set({ status: "skipped", skipReason: "stale", sentAt: null })
      .where(eq(reminders.id, reminder.id));
    const { headers } = await asUser(user.id);
    const response = await post(reminder.id, { headers });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "conflict" });
  });
});
