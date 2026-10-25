import { and, asc, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  addDays,
  instantFromLocal,
  localDateTimeOf,
  todayFor,
} from "@/lib/dates";
import { db } from "@/server/db/client";
import {
  auditEvents,
  timeBlockExceptions,
  timeBlocks,
  userPreferences,
  users,
} from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import {
  changeTaskStatus,
  createTask,
  deleteTask,
} from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  autoMarkTimeBlocksInTx,
  createTimeBlock,
  deleteTimeBlockOccurrence,
  editTimeBlockOccurrence,
  setTimeBlockStatus,
} from "./service";
import {
  createTimeBlockSchema,
  deleteTimeBlockOccurrenceSchema,
  editTimeBlockOccurrenceSchema,
  setTimeBlockStatusSchema,
} from "./validation";

const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";

const at = (local: string, tz = TOKYO) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, tz);
};

/** A user whose confirmed zone is `tz` (or none, with null). */
async function userIn(tz: string | null) {
  const user = await createTestUser();
  if (tz) {
    await db.insert(userPreferences).values({ userId: user.id, timezone: tz });
  }
  return user;
}

const newTask = (userId: string) =>
  createTask(userId, createTaskSchema.parse({ title: "Write report" }));

/** A block starting at a local date and time in `tz`. */
const blockAt = (
  userId: string,
  taskId: string,
  start: { date: string; time: string },
  options: { minutes?: number; tz?: string; rrule?: string } = {},
) =>
  createTimeBlock(
    userId,
    createTimeBlockSchema.parse({
      taskId,
      startDate: start.date,
      startTime: start.time,
      durationMinutes: options.minutes ?? 30,
      tz: options.tz ?? TOKYO,
      ...(options.rrule && { rrule: options.rrule }),
    }),
  );

const local = (value: string) => {
  const [date, time] = value.split(" ");
  return { date: date!, time: time! };
};

/** The local date and minute of an instant in `tz`, as a block form takes it. */
const localOf = (instant: Date, tz = TOKYO) => {
  const { date, time } = localDateTimeOf(instant, tz);
  return { date, time: time.slice(0, 5) };
};

const mark = (
  userId: string,
  id: string,
  status: string,
  originalStart?: Date,
) =>
  setTimeBlockStatus(
    userId,
    setTimeBlockStatusSchema.parse({
      id,
      status,
      ...(originalStart && { originalStart: originalStart.toISOString() }),
    }),
  );

/** Auto-mark as completing `taskId` at `completedAt` would run it. */
const autoMark = (userId: string, taskId: string, completedAt: Date) =>
  db.transaction((tx) =>
    autoMarkTimeBlocksInTx(tx, userId, taskId, completedAt),
  );

async function statusOf(id: string) {
  const [row] = await db
    .select({ status: timeBlocks.status })
    .from(timeBlocks)
    .where(eq(timeBlocks.id, id));
  return row?.status;
}

function exceptionRows(blockId: string) {
  return db
    .select()
    .from(timeBlockExceptions)
    .where(eq(timeBlockExceptions.blockId, blockId))
    .orderBy(asc(timeBlockExceptions.originalStartAt));
}

function eventsFor(userId: string, entityIds?: string[]) {
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        entityIds ? inArray(auditEvents.entityId, entityIds) : undefined,
      ),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
}

const complete = (userId: string, id: string) =>
  changeTaskStatus(userId, { id, status: "completed" });

describe("auto-mark on task completion", () => {
  it("marks started, still-scheduled one-off blocks done, with an automatic event", async () => {
    const user = await userIn(TOKYO);
    const task = await newTask(user.id);
    const now = Date.now();
    const hour = 3_600_000;
    const started = await blockAt(
      user.id,
      task.id,
      localOf(new Date(now - 2 * hour)),
    );
    const lastWeek = await blockAt(
      user.id,
      task.id,
      localOf(new Date(now - 7 * 24 * hour)),
    );
    const future = await blockAt(
      user.id,
      task.id,
      localOf(new Date(now + 2 * 24 * hour)),
    );
    const skipped = await blockAt(
      user.id,
      task.id,
      localOf(new Date(now - hour)),
    );
    await mark(user.id, skipped.id, "skipped");
    const done = await blockAt(
      user.id,
      task.id,
      localOf(new Date(now - 3 * hour)),
    );
    await mark(user.id, done.id, "done");
    const before = await eventsFor(user.id, [skipped.id, done.id, future.id]);

    await complete(user.id, task.id);

    expect(await statusOf(started.id)).toBe("done");
    expect(await statusOf(lastWeek.id)).toBe("done");
    expect(await statusOf(future.id)).toBe("scheduled");
    expect(await statusOf(skipped.id)).toBe("skipped");
    expect(await statusOf(done.id)).toBe("done");
    expect(await eventsFor(user.id, [skipped.id, done.id, future.id])).toEqual(
      before,
    );

    const [event] = (await eventsFor(user.id, [started.id])).filter(
      (row) => row.eventType === "time_block.status_changed",
    );
    expect(event!.changes).toEqual({
      status: { from: "scheduled", to: "done" },
      automatic: true,
    });
    // The block events share the completion's transaction time.
    const [completed] = (await eventsFor(user.id, [task.id])).filter(
      (row) => row.eventType === "task.completed",
    );
    expect(event!.occurredAt).toEqual(completed!.occurredAt);
  });

  it("marks only today's started occurrence of a series that began weeks ago", async () => {
    const user = await userIn(TOKYO);
    const task = await newTask(user.id);
    const today = todayFor(TOKYO);
    // Every day at local midnight, so today's occurrence has always started.
    const series = await blockAt(
      user.id,
      task.id,
      { date: addDays(today, -21), time: "00:00" },
      { rrule: "FREQ=DAILY" },
    );

    await complete(user.id, task.id);

    const exceptions = await exceptionRows(series.id);
    expect(exceptions).toEqual([
      expect.objectContaining({
        originalStartAt: at(`${today} 00:00`),
        kind: "modified",
        startAt: at(`${today} 00:00`),
        status: "done",
      }),
    ]);
    expect(await statusOf(series.id)).toBe("scheduled");
    expect(
      (await eventsFor(user.id, [exceptions[0]!.id]))[0]!.changes,
    ).toMatchObject({ status: { from: null, to: "done" }, automatic: true });
  });

  it("uses the user's local day for a completion just after midnight", async () => {
    const user = await userIn(TOKYO);
    const task = await newTask(user.id);
    const daily = { rrule: "FREQ=DAILY" };
    // 00:05 on 10 March in Tokyo is still 9 March in UTC.
    const completedAt = at("2026-03-10 00:05");
    // 23:00 to 00:30: still running at the completion, but started the day before.
    const lateEvening = await blockAt(
      user.id,
      task.id,
      local("2026-02-01 23:00"),
      { ...daily, minutes: 90 },
    );
    const justAfterMidnight = await blockAt(
      user.id,
      task.id,
      local("2026-02-01 00:02"),
      daily,
    );
    const morning = await blockAt(
      user.id,
      task.id,
      local("2026-02-01 09:00"),
      daily,
    );

    await autoMark(user.id, task.id, completedAt);

    expect(await exceptionRows(lateEvening.id)).toEqual([]);
    expect(await exceptionRows(morning.id)).toEqual([]);
    expect(await exceptionRows(justAfterMidnight.id)).toEqual([
      expect.objectContaining({
        originalStartAt: at("2026-03-10 00:02"),
        status: "done",
      }),
    ]);
  });

  it("counts a start exactly at the completion and leaves skipped, cancelled and not-yet-started occurrences", async () => {
    const user = await userIn(TOKYO);
    const task = await newTask(user.id);
    const completedAt = at("2026-03-10 12:00");
    const daily = { rrule: "FREQ=DAILY" };
    const exact = await blockAt(
      user.id,
      task.id,
      local("2026-03-01 12:00"),
      daily,
    );
    const skipped = await blockAt(
      user.id,
      task.id,
      local("2026-03-01 08:00"),
      daily,
    );
    await mark(user.id, skipped.id, "skipped", at("2026-03-10 08:00"));
    const cancelled = await blockAt(
      user.id,
      task.id,
      local("2026-03-01 06:00"),
      daily,
    );
    await deleteTimeBlockOccurrence(
      user.id,
      deleteTimeBlockOccurrenceSchema.parse({
        id: cancelled.id,
        originalStart: at("2026-03-10 06:00").toISOString(),
        scope: "this",
      }),
    );
    const movedLater = await blockAt(
      user.id,
      task.id,
      local("2026-03-01 07:00"),
      daily,
    );
    await editTimeBlockOccurrence(
      user.id,
      editTimeBlockOccurrenceSchema.parse({
        id: movedLater.id,
        originalStart: at("2026-03-10 07:00").toISOString(),
        scope: "this",
        startDate: "2026-03-10",
        startTime: "13:00",
        durationMinutes: 30,
        tz: TOKYO,
      }),
    );
    const oneOffExact = await blockAt(
      user.id,
      task.id,
      local("2026-03-10 12:00"),
    );
    const oneOffLater = await blockAt(
      user.id,
      task.id,
      local("2026-03-10 12:01"),
    );

    await autoMark(user.id, task.id, completedAt);

    expect(await exceptionRows(exact.id)).toEqual([
      expect.objectContaining({ status: "done" }),
    ]);
    expect(await exceptionRows(skipped.id)).toEqual([
      expect.objectContaining({ status: "skipped" }),
    ]);
    expect(await exceptionRows(cancelled.id)).toEqual([
      expect.objectContaining({ kind: "cancelled", status: null }),
    ]);
    // Moved to 13:00, after the completion: not started yet.
    expect(await exceptionRows(movedLater.id)).toEqual([
      expect.objectContaining({
        status: "scheduled",
        startAt: at("2026-03-10 13:00"),
      }),
    ]);
    expect(await statusOf(oneOffExact.id)).toBe("done");
    expect(await statusOf(oneOffLater.id)).toBe("scheduled");
  });

  it("marks an occurrence moved earlier into today by its actual start", async () => {
    const user = await userIn(TOKYO);
    const task = await newTask(user.id);
    const series = await blockAt(user.id, task.id, local("2026-03-01 18:00"), {
      rrule: "FREQ=DAILY",
    });
    await editTimeBlockOccurrence(
      user.id,
      editTimeBlockOccurrenceSchema.parse({
        id: series.id,
        originalStart: at("2026-03-10 18:00").toISOString(),
        scope: "this",
        startDate: "2026-03-10",
        startTime: "09:00",
        durationMinutes: 30,
        tz: TOKYO,
      }),
    );

    await autoMark(user.id, task.id, at("2026-03-10 10:00"));

    const [exception] = await exceptionRows(series.id);
    expect(exception).toMatchObject({
      startAt: at("2026-03-10 09:00"),
      status: "done",
    });
    const events = await eventsFor(user.id, [exception!.id]);
    expect(events.at(-1)!.changes).toEqual({
      fields: ["status"],
      status: { from: "scheduled", to: "done" },
      automatic: true,
    });
  });

  it("falls back to the series' zone when the user has not confirmed one", async () => {
    const user = await userIn(null);
    const task = await newTask(user.id);
    const series = await blockAt(user.id, task.id, local("2026-03-01 00:02"), {
      tz: NEW_YORK,
      rrule: "FREQ=DAILY",
    });

    await autoMark(user.id, task.id, at("2026-03-10 00:05", NEW_YORK));

    expect(await exceptionRows(series.id)).toEqual([
      expect.objectContaining({
        originalStartAt: at("2026-03-10 00:02", NEW_YORK),
        status: "done",
      }),
    ]);
  });

  it("changes nothing on cancel, and reopening keeps auto-marked blocks done", async () => {
    const user = await userIn(TOKYO);
    const hour = 3_600_000;
    const cancelledTask = await newTask(user.id);
    const untouched = await blockAt(
      user.id,
      cancelledTask.id,
      localOf(new Date(Date.now() - hour)),
    );
    await changeTaskStatus(user.id, {
      id: cancelledTask.id,
      status: "cancelled",
    });
    expect(await statusOf(untouched.id)).toBe("scheduled");
    expect(await eventsFor(user.id, [untouched.id])).toHaveLength(1);

    const task = await newTask(user.id);
    const block = await blockAt(
      user.id,
      task.id,
      localOf(new Date(Date.now() - hour)),
    );
    await complete(user.id, task.id);
    await changeTaskStatus(user.id, { id: task.id, status: "open" });
    expect(await statusOf(block.id)).toBe("done");
    await complete(user.id, task.id);
    const statusEvents = (await eventsFor(user.id, [block.id])).filter(
      (row) => row.eventType === "time_block.status_changed",
    );
    expect(statusEvents).toHaveLength(1);
  });

  it("never touches another user's blocks", async () => {
    const owner = await userIn(TOKYO);
    const other = await userIn(TOKYO);
    const task = await newTask(owner.id);
    const block = await blockAt(
      owner.id,
      task.id,
      localOf(new Date(Date.now() - 3_600_000)),
    );

    await expect(complete(other.id, task.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await autoMark(other.id, task.id, new Date());
    expect(await statusOf(block.id)).toBe("scheduled");
    expect(await eventsFor(other.id)).toEqual([]);
  });
});

describe("task delete", () => {
  it("deletes the task's blocks, their exceptions and all their audit events", async () => {
    const user = await userIn(TOKYO);
    const task = await newTask(user.id);
    const keepTask = await newTask(user.id);
    const oneOff = await blockAt(user.id, task.id, local("2026-03-01 09:00"));
    await mark(user.id, oneOff.id, "done");
    const series = await blockAt(user.id, task.id, local("2026-03-01 10:00"), {
      rrule: "FREQ=DAILY",
    });
    await mark(user.id, series.id, "skipped", at("2026-03-02 10:00"));
    const [exception] = await exceptionRows(series.id);
    const kept = await blockAt(user.id, keepTask.id, local("2026-03-01 11:00"));
    await mark(user.id, kept.id, "done");

    await deleteTask(user.id, { id: task.id });

    expect(await statusOf(oneOff.id)).toBeUndefined();
    expect(await statusOf(series.id)).toBeUndefined();
    expect(await exceptionRows(series.id)).toEqual([]);
    expect(
      await eventsFor(user.id, [task.id, oneOff.id, series.id, exception!.id]),
    ).toEqual([]);
    expect(await statusOf(kept.id)).toBe("done");
    expect(await eventsFor(user.id, [kept.id])).toHaveLength(2);
  });

  it("refuses another user's task and leaves its blocks", async () => {
    const owner = await userIn(TOKYO);
    const other = await userIn(TOKYO);
    const task = await newTask(owner.id);
    const block = await blockAt(owner.id, task.id, local("2026-03-01 09:00"));

    await expect(deleteTask(other.id, { id: task.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await statusOf(block.id)).toBe("scheduled");
    expect(await eventsFor(owner.id, [block.id])).toHaveLength(1);
  });

  it("removes the blocks with the user's account", async () => {
    const user = await userIn(TOKYO);
    const task = await newTask(user.id);
    const series = await blockAt(user.id, task.id, local("2026-03-01 09:00"), {
      rrule: "FREQ=DAILY",
    });
    await mark(user.id, series.id, "done", at("2026-03-01 09:00"));

    await db.delete(users).where(eq(users.id, user.id));
    expect(await statusOf(series.id)).toBeUndefined();
    expect(await exceptionRows(series.id)).toEqual([]);
  });
});
