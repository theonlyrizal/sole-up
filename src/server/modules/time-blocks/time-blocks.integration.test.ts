import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { instantFromLocal } from "@/lib/dates";
import { db } from "@/server/db/client";
import {
  auditEvents,
  timeBlockExceptions,
  timeBlocks,
} from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import { createLifeArea } from "@/server/modules/life-areas/service";
import { createLifeAreaSchema } from "@/server/modules/life-areas/validation";
import { createMilestone } from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";
import { changeTaskStatus, createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  blocksBetween,
  createTimeBlock,
  deleteTimeBlock,
  deleteTimeBlockOccurrence,
  editTimeBlockOccurrence,
  getTimeBlock,
  setTimeBlockStatus,
  updateTimeBlock,
} from "./service";
import {
  blocksBetweenSchema,
  createTimeBlockSchema,
  deleteTimeBlockOccurrenceSchema,
  editTimeBlockOccurrenceSchema,
  setTimeBlockStatusSchema,
  updateTimeBlockSchema,
} from "./validation";

const NEW_YORK = "America/New_York";
const TOKYO = "Asia/Tokyo";

type Scope = "this" | "following" | "all";
type Form = Record<string, unknown>;

/** The UTC instant of a wall-clock time, e.g. "2026-10-05 09:00". */
const at = (local: string, tz = NEW_YORK) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, tz);
};

/** A block form from a local start and a length in minutes. */
const form = (start: string, durationMinutes = 60, tz = NEW_YORK): Form => {
  const [startDate, startTime] = start.split(" ");
  return { startDate, startTime, durationMinutes, tz };
};

const newTask = (userId: string, fields: Form = {}) =>
  createTask(
    userId,
    createTaskSchema.parse({ title: "Write report", ...fields }),
  );

const newBlock = (
  userId: string,
  taskId: string,
  fields: Form,
  rrule?: string,
) =>
  createTimeBlock(
    userId,
    createTimeBlockSchema.parse({ taskId, ...fields, ...(rrule && { rrule }) }),
  );

const edit = (
  userId: string,
  id: string,
  originalStart: Date,
  scope: Scope,
  fields: Form,
  rrule: string | null = null,
) =>
  editTimeBlockOccurrence(
    userId,
    editTimeBlockOccurrenceSchema.parse({
      id,
      originalStart: originalStart.toISOString(),
      scope,
      ...fields,
      ...(scope !== "this" && { rrule }),
    }),
  );

const remove = (
  userId: string,
  id: string,
  originalStart: Date,
  scope: Scope,
) =>
  deleteTimeBlockOccurrence(
    userId,
    deleteTimeBlockOccurrenceSchema.parse({
      id,
      originalStart: originalStart.toISOString(),
      scope,
    }),
  );

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

const between = (
  userId: string,
  localStart: string,
  localEnd: string,
  tz = NEW_YORK,
) =>
  blocksBetween(
    userId,
    blocksBetweenSchema.parse({ localStart, localEnd, tz }),
  );

async function readBlock(id: string) {
  const [row] = await db.select().from(timeBlocks).where(eq(timeBlocks.id, id));
  return row;
}

function exceptionRows(blockId: string) {
  return db
    .select()
    .from(timeBlockExceptions)
    .where(eq(timeBlockExceptions.blockId, blockId))
    .orderBy(asc(timeBlockExceptions.originalStartAt));
}

function eventsFor(userId: string, entityId?: string) {
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        entityId ? eq(auditEvents.entityId, entityId) : undefined,
      ),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
}

type DriverError = { cause?: { code?: string; constraint?: string } };

async function dbError(write: () => Promise<unknown>): Promise<DriverError> {
  try {
    await write();
  } catch (error: unknown) {
    return error as DriverError;
  }
  throw new Error("Expected the write to fail");
}

describe("time_blocks schema", () => {
  it("allows exactly 24 hours and refuses a minute more", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const startAt = at("2026-10-05 09:00");
    const insert = (minutes: number, table: "blocks" | "exceptions") =>
      table === "blocks"
        ? db.insert(timeBlocks).values({
            userId: user.id,
            taskId: task.id,
            startAt,
            endAt: new Date(startAt.getTime() + minutes * 60_000),
            tz: NEW_YORK,
          })
        : db.insert(timeBlockExceptions).values({
            userId: user.id,
            blockId: seriesId,
            originalStartAt: at("2026-10-06 09:00"),
            kind: "modified",
            startAt,
            endAt: new Date(startAt.getTime() + minutes * 60_000),
            status: "scheduled",
          });
    const series = await newBlock(
      user.id,
      task.id,
      form("2026-10-05 09:00"),
      "FREQ=DAILY",
    );
    const seriesId = series.id;

    await insert(1440, "blocks");
    expect(await dbError(() => insert(1441, "blocks"))).toMatchObject({
      cause: { code: "23514", constraint: "time_blocks_duration_check" },
    });
    expect(await dbError(() => insert(0, "blocks"))).toMatchObject({
      cause: { code: "23514", constraint: "time_blocks_end_check" },
    });
    expect(await dbError(() => insert(1441, "exceptions"))).toMatchObject({
      cause: {
        code: "23514",
        constraint: "time_block_exceptions_duration_check",
      },
    });
    await insert(1440, "exceptions");
  });

  it("refuses a bad status, a marked series row and half an override", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const base = {
      userId: user.id,
      taskId: task.id,
      startAt: at("2026-10-05 09:00"),
      endAt: at("2026-10-05 10:00"),
      tz: NEW_YORK,
    };
    expect(
      await dbError(() =>
        db.insert(timeBlocks).values({ ...base, status: "maybe" as never }),
      ),
    ).toMatchObject({ cause: { constraint: "time_blocks_status_check" } });
    expect(
      await dbError(() =>
        db
          .insert(timeBlocks)
          .values({ ...base, rrule: "FREQ=DAILY", status: "done" }),
      ),
    ).toMatchObject({
      cause: { constraint: "time_blocks_series_status_check" },
    });

    const series = await newBlock(
      user.id,
      task.id,
      form("2026-10-05 09:00"),
      "FREQ=DAILY",
    );
    expect(
      await dbError(() =>
        db.insert(timeBlockExceptions).values({
          userId: user.id,
          blockId: series.id,
          originalStartAt: at("2026-10-06 09:00"),
          kind: "cancelled",
          status: "done",
        }),
      ),
    ).toMatchObject({
      cause: { constraint: "time_block_exceptions_override_check" },
    });
  });

  it("refuses another user's task or block through the composite keys", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const task = await newTask(owner.id);
    const block = await newBlock(
      owner.id,
      task.id,
      form("2026-10-05 09:00"),
      "FREQ=DAILY",
    );

    expect(
      await dbError(() =>
        db.insert(timeBlocks).values({
          userId: other.id,
          taskId: task.id,
          startAt: at("2026-10-05 09:00"),
          endAt: at("2026-10-05 10:00"),
          tz: NEW_YORK,
        }),
      ),
    ).toMatchObject({
      cause: { code: "23503", constraint: "time_blocks_task_id_user_id_fk" },
    });
    expect(
      await dbError(() =>
        db.insert(timeBlockExceptions).values({
          userId: other.id,
          blockId: block.id,
          originalStartAt: at("2026-10-06 09:00"),
          kind: "cancelled",
        }),
      ),
    ).toMatchObject({
      cause: {
        code: "23503",
        constraint: "time_block_exceptions_block_id_user_id_fk",
      },
    });
  });
});

describe("one-off blocks", () => {
  it("creates a block for a task with an audit event and no text", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const block = await newBlock(
      user.id,
      task.id,
      form("2026-10-05 09:30", 90),
    );

    expect(block).toMatchObject({
      taskId: task.id,
      startAt: at("2026-10-05 09:30"),
      endAt: at("2026-10-05 11:00"),
      tz: NEW_YORK,
      rrule: null,
      status: "scheduled",
    });
    expect(await getTimeBlock(user.id, { id: block.id })).toEqual(block);

    const [event] = await eventsFor(user.id, block.id);
    expect(event).toMatchObject({
      eventType: "time_block.created",
      entityType: "time_block",
      changes: {
        taskId: { from: null, to: task.id },
        startAt: { from: null, to: "2026-10-05T13:30:00.000Z" },
        endAt: { from: null, to: "2026-10-05T15:00:00.000Z" },
        tz: { from: null, to: NEW_YORK },
        rrule: { from: null, to: null },
        status: { from: null, to: "scheduled" },
      },
    });
    expect(JSON.stringify(event!.changes)).not.toContain("Write report");
  });

  it("refuses another user's task, a long block and a bad zone as field errors", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const task = await newTask(owner.id);

    await expect(
      newBlock(other.id, task.id, form("2026-10-05 09:00")),
    ).rejects.toMatchObject({
      fieldErrors: { taskId: ["Choose one of your tasks."] },
    });
    expect(
      createTimeBlockSchema
        .safeParse({
          taskId: task.id,
          ...form("2026-10-05 09:00", 1441),
        })
        .error?.flatten().fieldErrors,
    ).toEqual({
      durationMinutes: ["Choose a length from 1 minute to 24 hours."],
    });
    expect(
      createTimeBlockSchema
        .safeParse({
          taskId: task.id,
          ...form("2026-10-05 09:00", 30, "+05:00"),
        })
        .error?.flatten().fieldErrors,
    ).toEqual({ tz: ["Choose a time zone."] });
  });

  it("edits times, sets status and turns into a series keeping its status", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const block = await newBlock(user.id, task.id, form("2026-10-05 09:00"));

    const moved = await updateTimeBlock(
      user.id,
      updateTimeBlockSchema.parse({
        id: block.id,
        ...form("2026-10-06 14:00", 30),
      }),
    );
    expect(moved).toMatchObject({
      startAt: at("2026-10-06 14:00"),
      endAt: at("2026-10-06 14:30"),
    });

    await mark(user.id, block.id, "skipped");
    await mark(user.id, block.id, "skipped");
    expect((await readBlock(block.id))!.status).toBe("skipped");
    const statusEvents = (await eventsFor(user.id, block.id)).filter(
      (event) => event.eventType === "time_block.status_changed",
    );
    expect(statusEvents.map((event) => event.changes)).toEqual([
      { status: { from: "scheduled", to: "skipped" } },
    ]);

    const series = await updateTimeBlock(
      user.id,
      updateTimeBlockSchema.parse({
        id: block.id,
        ...form("2026-10-06 14:00", 30),
        rrule: "FREQ=DAILY",
      }),
    );
    expect(series).toMatchObject({ rrule: "FREQ=DAILY", status: "scheduled" });
    const [first] = await exceptionRows(block.id);
    expect(first).toMatchObject({
      originalStartAt: at("2026-10-06 14:00"),
      kind: "modified",
      status: "skipped",
    });
    const [occurrence, next] = await between(
      user.id,
      "2026-10-06",
      "2026-10-08",
    );
    expect(occurrence).toMatchObject({ status: "skipped", modified: true });
    expect(next).toMatchObject({ status: "scheduled", modified: false });

    await expect(
      updateTimeBlock(
        user.id,
        updateTimeBlockSchema.parse({
          id: block.id,
          ...form("2026-10-07 14:00"),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("marking a block done never completes its task", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const block = await newBlock(user.id, task.id, form("2026-10-05 09:00"));
    await mark(user.id, block.id, "done");

    const [occurrence] = await between(user.id, "2026-10-05", "2026-10-06");
    expect(occurrence).toMatchObject({ status: "done", taskStatus: "open" });
  });

  it("deletes a block with its audit events", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const keep = await newBlock(user.id, task.id, form("2026-10-06 09:00"));
    const block = await newBlock(user.id, task.id, form("2026-10-05 09:00"));
    await mark(user.id, block.id, "done");

    await deleteTimeBlock(user.id, { id: block.id });
    expect(await readBlock(block.id)).toBeUndefined();
    expect(await eventsFor(user.id, block.id)).toEqual([]);
    expect(await eventsFor(user.id, keep.id)).toHaveLength(1);
  });
});

describe("repeating blocks", () => {
  const DAILY = "FREQ=DAILY";

  async function setup() {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const series = await newBlock(
      user.id,
      task.id,
      form("2026-10-05 09:00"),
      DAILY,
    );
    return { user, task, series };
  }

  it("expands occurrences, each scheduled until marked", async () => {
    const { user, series } = await setup();
    await mark(user.id, series.id, "done", at("2026-10-06 09:00"));

    const occurrences = await between(user.id, "2026-10-05", "2026-10-08");
    expect(
      occurrences.map(({ startAt, status, seriesId, originalStart }) => ({
        startAt,
        status,
        seriesId,
        originalStart,
      })),
    ).toEqual([
      {
        startAt: at("2026-10-05 09:00"),
        status: "scheduled",
        seriesId: series.id,
        originalStart: at("2026-10-05 09:00"),
      },
      {
        startAt: at("2026-10-06 09:00"),
        status: "done",
        seriesId: series.id,
        originalStart: at("2026-10-06 09:00"),
      },
      {
        startAt: at("2026-10-07 09:00"),
        status: "scheduled",
        seriesId: series.id,
        originalStart: at("2026-10-07 09:00"),
      },
    ]);
    expect((await readBlock(series.id))!.status).toBe("scheduled");
    await expect(mark(user.id, series.id, "done")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("keeps 09:00 local across the New York fall-back", async () => {
    const { user } = await setup();
    const occurrences = await between(user.id, "2026-10-31", "2026-11-03");
    expect(occurrences.map(({ startAt }) => startAt.toISOString())).toEqual([
      "2026-10-31T13:00:00.000Z",
      "2026-11-01T14:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
    ]);
  });

  it('"this" moves one occurrence keeping its status, and cancels one', async () => {
    const { user, series } = await setup();
    const oct7 = at("2026-10-07 09:00");
    await mark(user.id, series.id, "done", oct7);
    await edit(user.id, series.id, oct7, "this", form("2026-10-07 11:00", 30));
    await edit(user.id, series.id, oct7, "this", form("2026-10-07 11:00", 30));

    const [exception] = await exceptionRows(series.id);
    expect(exception).toMatchObject({
      kind: "modified",
      startAt: at("2026-10-07 11:00"),
      endAt: at("2026-10-07 11:30"),
      status: "done",
    });
    const exceptionEvents = await eventsFor(user.id, exception!.id);
    expect(exceptionEvents.map((event) => event.eventType)).toEqual([
      "time_block_exception.created",
      "time_block_exception.updated",
    ]);
    expect(exceptionEvents[1]!.changes).toEqual({
      fields: ["startAt", "endAt"],
      scope: "this",
      startAt: {
        from: "2026-10-07T13:00:00.000Z",
        to: "2026-10-07T15:00:00.000Z",
      },
      endAt: {
        from: "2026-10-07T14:00:00.000Z",
        to: "2026-10-07T15:30:00.000Z",
      },
    });

    await expect(
      edit(
        user.id,
        series.id,
        oct7,
        "this",
        form("2026-10-07 11:00", 30, TOKYO),
      ),
    ).rejects.toMatchObject({ fieldErrors: { tz: [expect.any(String)] } });

    const oct8 = at("2026-10-08 09:00");
    await remove(user.id, series.id, oct8, "this");
    await expect(mark(user.id, series.id, "done", oct8)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const days = await between(user.id, "2026-10-07", "2026-10-09");
    expect(
      days.map(({ startAt, modified }) => ({ startAt, modified })),
    ).toEqual([{ startAt: at("2026-10-07 11:00"), modified: true }]);
  });

  it('"all" moves the series, carrying exceptions and their statuses', async () => {
    const { user, series } = await setup();
    await mark(user.id, series.id, "done", at("2026-10-06 09:00"));
    await edit(
      user.id,
      series.id,
      at("2026-10-07 09:00"),
      "this",
      form("2026-10-07 12:00"),
    );
    await mark(user.id, series.id, "skipped", at("2026-10-07 09:00"));
    await remove(user.id, series.id, at("2026-10-08 09:00"), "this");

    const { block, dropped } = await edit(
      user.id,
      series.id,
      at("2026-10-09 09:00"),
      "all",
      form("2026-10-09 08:00", 45),
      DAILY,
    );
    expect(dropped).toEqual([]);
    expect(block).toMatchObject({
      startAt: at("2026-10-05 08:00"),
      endAt: at("2026-10-05 08:45"),
      rrule: DAILY,
    });

    const days = await between(user.id, "2026-10-05", "2026-10-10");
    expect(
      days.map(({ startAt, endAt, status }) => ({ startAt, endAt, status })),
    ).toEqual([
      {
        startAt: at("2026-10-05 08:00"),
        endAt: at("2026-10-05 08:45"),
        status: "scheduled",
      },
      // Marked at generated times: follows the new times.
      {
        startAt: at("2026-10-06 08:00"),
        endAt: at("2026-10-06 08:45"),
        status: "done",
      },
      // Moved by the user: keeps its own times.
      {
        startAt: at("2026-10-07 12:00"),
        endAt: at("2026-10-07 13:00"),
        status: "skipped",
      },
      {
        startAt: at("2026-10-09 08:00"),
        endAt: at("2026-10-09 08:45"),
        status: "scheduled",
      },
    ]);

    const updates = (await eventsFor(user.id, series.id)).filter(
      (event) => event.eventType === "time_block.updated",
    );
    expect(updates.at(-1)!.changes).toMatchObject({
      fields: ["startAt", "endAt"],
      scope: "all",
    });
  });

  it('"all" with a weekly rule drops exceptions on days it no longer has', async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    // Monday 5 Oct 2026, every Monday and Wednesday.
    const series = await newBlock(
      user.id,
      task.id,
      form("2026-10-05 09:00"),
      "FREQ=WEEKLY;BYDAY=MO,WE",
    );
    await mark(user.id, series.id, "done", at("2026-10-07 09:00"));

    const { dropped } = await edit(
      user.id,
      series.id,
      at("2026-10-05 09:00"),
      "all",
      form("2026-10-05 09:00"),
      "FREQ=WEEKLY;BYDAY=MO",
    );
    expect(dropped).toEqual([
      expect.objectContaining({
        kind: "modified",
        originalStart: at("2026-10-07 09:00"),
      }),
    ]);
    expect(await exceptionRows(series.id)).toEqual([]);
  });

  it('"following" splits the series and moves later exceptions to the new one', async () => {
    const { user, task, series } = await setup();
    await mark(user.id, series.id, "done", at("2026-10-06 09:00"));
    await mark(user.id, series.id, "skipped", at("2026-10-11 09:00"));

    const { block, dropped } = await edit(
      user.id,
      series.id,
      at("2026-10-10 09:00"),
      "following",
      form("2026-10-10 07:00", 30),
      DAILY,
    );
    expect(dropped).toEqual([]);
    expect(block).toMatchObject({
      taskId: task.id,
      startAt: at("2026-10-10 07:00"),
      endAt: at("2026-10-10 07:30"),
      rrule: DAILY,
      status: "scheduled",
    });
    expect((await readBlock(series.id))!.rrule).toBe(
      "FREQ=DAILY;UNTIL=20261009",
    );

    const [kept] = await exceptionRows(series.id);
    expect(kept).toMatchObject({ originalStartAt: at("2026-10-06 09:00") });
    const [moved] = await exceptionRows(block.id);
    expect(moved).toMatchObject({
      originalStartAt: at("2026-10-11 07:00"),
      startAt: at("2026-10-11 07:00"),
      status: "skipped",
    });

    const [created] = await eventsFor(user.id, block.id);
    expect(created!.changes).toMatchObject({
      scope: "following",
      splitFromId: series.id,
    });
    const updates = (await eventsFor(user.id, series.id)).filter(
      (event) => event.eventType === "time_block.updated",
    );
    expect(updates.at(-1)!.changes).toMatchObject({
      fields: ["rrule"],
      scope: "following",
      splitIntoId: block.id,
    });
    const movedEvents = await eventsFor(user.id, moved!.id);
    expect(movedEvents.at(-1)!.changes).toMatchObject({
      scope: "following",
      blockId: { from: series.id, to: block.id },
    });
  });

  it('"following" with the same rule keeps the count left', async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const series = await newBlock(
      user.id,
      task.id,
      form("2026-10-05 09:00"),
      "FREQ=DAILY;COUNT=5",
    );
    const { block } = await edit(
      user.id,
      series.id,
      at("2026-10-07 09:00"),
      "following",
      form("2026-10-07 10:00"),
      "FREQ=DAILY;COUNT=5",
    );
    expect(block.rrule).toBe("FREQ=DAILY;COUNT=3");
    const days = await between(user.id, "2026-10-01", "2026-10-15");
    expect(days).toHaveLength(5);
  });

  it('"all" stopping the repeat folds the first occurrence\'s status into the block', async () => {
    const { user, series } = await setup();
    await mark(user.id, series.id, "done", at("2026-10-05 09:00"));
    await mark(user.id, series.id, "skipped", at("2026-10-06 09:00"));

    const { block, dropped } = await edit(
      user.id,
      series.id,
      at("2026-10-05 09:00"),
      "all",
      form("2026-10-05 09:00"),
      null,
    );
    expect(block).toMatchObject({ rrule: null, status: "done" });
    expect(dropped.map(({ originalStart }) => originalStart)).toEqual([
      at("2026-10-06 09:00"),
    ]);
    expect(await exceptionRows(series.id)).toEqual([]);
  });

  it('deletes "this and following" from a later occurrence, and the whole series from the first', async () => {
    const { user, task, series } = await setup();
    await mark(user.id, series.id, "done", at("2026-10-09 09:00"));
    const [exception] = await exceptionRows(series.id);

    const { dropped } = await remove(
      user.id,
      series.id,
      at("2026-10-08 09:00"),
      "following",
    );
    expect(dropped.map(({ id }) => id)).toEqual([exception!.id]);
    expect((await readBlock(series.id))!.rrule).toBe(
      "FREQ=DAILY;UNTIL=20261007",
    );
    expect(await eventsFor(user.id, exception!.id)).toEqual([]);

    await remove(user.id, series.id, at("2026-10-05 09:00"), "following");
    expect(await readBlock(series.id)).toBeUndefined();
    expect(await eventsFor(user.id, series.id)).toEqual([]);

    const other = await newBlock(
      user.id,
      task.id,
      form("2026-10-05 09:00"),
      DAILY,
    );
    await mark(user.id, other.id, "done", at("2026-10-06 09:00"));
    await remove(user.id, other.id, at("2026-10-07 09:00"), "all");
    expect(await readBlock(other.id)).toBeUndefined();
    expect(await eventsFor(user.id)).toEqual([
      expect.objectContaining({ eventType: "task.created" }),
    ]);
  });

  it("addresses only occurrences the rule generates, and only on a series", async () => {
    const { user, task, series } = await setup();
    await expect(
      mark(user.id, series.id, "done", at("2026-10-06 09:30")),
    ).rejects.toBeInstanceOf(NotFoundError);
    const oneOff = await newBlock(user.id, task.id, form("2026-10-05 09:00"));
    await expect(
      remove(user.id, oneOff.id, at("2026-10-05 09:00"), "this"),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("blocksBetween", () => {
  it("returns each block's task title, task status and lane", async () => {
    const user = await createTestUser();
    const area = await createLifeArea(
      user.id,
      createLifeAreaSchema.parse({ name: "Work" }),
    );
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Ship v1", lifeAreaId: area.id }),
    );
    const milestone = await createMilestone(
      user.id,
      createMilestoneSchema.parse({ goalId: goal.id, title: "Beta" }),
    );
    const direct = await newTask(user.id, { title: "Direct", goalId: goal.id });
    const viaMilestone = await newTask(user.id, {
      title: "Via milestone",
      milestoneId: milestone.id,
    });
    const inbox = await newTask(user.id, { title: "Inbox" });
    await changeTaskStatus(user.id, { id: inbox.id, status: "cancelled" });

    await newBlock(user.id, direct.id, form("2026-10-05 09:00"));
    await newBlock(user.id, viaMilestone.id, form("2026-10-05 10:00"));
    await newBlock(user.id, inbox.id, form("2026-10-05 11:00"));

    const blocks = await between(user.id, "2026-10-05", "2026-10-06");
    expect(
      blocks.map(({ taskTitle, taskStatus, goalId, lifeAreaId }) => ({
        taskTitle,
        taskStatus,
        goalId,
        lifeAreaId,
      })),
    ).toEqual([
      {
        taskTitle: "Direct",
        taskStatus: "open",
        goalId: goal.id,
        lifeAreaId: area.id,
      },
      {
        taskTitle: "Via milestone",
        taskStatus: "open",
        goalId: goal.id,
        lifeAreaId: area.id,
      },
      {
        taskTitle: "Inbox",
        taskStatus: "cancelled",
        goalId: null,
        lifeAreaId: null,
      },
    ]);
  });

  it("uses instant overlap in the range's zone, edges excluded", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    // 23:00–00:30 Tokyo, crossing into the 6th.
    const crossing = await newBlock(
      user.id,
      task.id,
      form("2026-10-05 23:00", 90, TOKYO),
    );
    // Ends exactly at Tokyo midnight on the 5th.
    await newBlock(user.id, task.id, form("2026-10-04 23:00", 60, TOKYO));
    // Starts exactly at Tokyo midnight on the 7th.
    await newBlock(user.id, task.id, form("2026-10-07 00:00", 60, TOKYO));

    const blocks = await between(user.id, "2026-10-06", "2026-10-07", TOKYO);
    expect(blocks.map(({ id }) => id)).toEqual([crossing.id]);
    // The same block seen from New York is on the 5th there.
    expect(
      (await between(user.id, "2026-10-05", "2026-10-06")).map(({ id }) => id),
    ).toContain(crossing.id);
  });

  it("finds an occurrence moved before a series' start into the range", async () => {
    const user = await createTestUser();
    const task = await newTask(user.id);
    const series = await newBlock(
      user.id,
      task.id,
      form("2026-10-10 09:00"),
      "FREQ=DAILY",
    );
    await edit(
      user.id,
      series.id,
      at("2026-10-10 09:00"),
      "this",
      form("2026-10-03 09:00"),
    );
    const blocks = await between(user.id, "2026-10-01", "2026-10-05");
    expect(blocks).toEqual([
      expect.objectContaining({
        startAt: at("2026-10-03 09:00"),
        originalStart: at("2026-10-10 09:00"),
      }),
    ]);
  });
});

describe("cross-user access", () => {
  it("treats another user's blocks and occurrences as not found and changes nothing", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const task = await newTask(owner.id);
    const oneOff = await newBlock(owner.id, task.id, form("2026-10-05 09:00"));
    const series = await newBlock(
      owner.id,
      task.id,
      form("2026-10-05 12:00"),
      "FREQ=DAILY",
    );
    await mark(owner.id, series.id, "done", at("2026-10-06 12:00"));
    const before = await eventsFor(owner.id);

    const oct6 = at("2026-10-06 12:00");
    const attempts = [
      () => getTimeBlock(other.id, { id: oneOff.id }),
      () =>
        updateTimeBlock(
          other.id,
          updateTimeBlockSchema.parse({
            id: oneOff.id,
            ...form("2026-10-06 09:00"),
          }),
        ),
      () => mark(other.id, oneOff.id, "done"),
      () => deleteTimeBlock(other.id, { id: oneOff.id }),
      () => deleteTimeBlock(other.id, { id: series.id }),
      () => mark(other.id, series.id, "skipped", oct6),
      () => edit(other.id, series.id, oct6, "this", form("2026-10-06 15:00")),
      () =>
        edit(
          other.id,
          series.id,
          oct6,
          "following",
          form("2026-10-06 15:00"),
          "FREQ=DAILY",
        ),
      () =>
        edit(other.id, series.id, oct6, "all", form("2026-10-06 15:00"), null),
      () => remove(other.id, series.id, oct6, "this"),
      () => remove(other.id, series.id, oct6, "following"),
      () => remove(other.id, series.id, oct6, "all"),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    }

    expect(await between(other.id, "2026-10-01", "2026-10-10")).toEqual([]);
    expect(await readBlock(oneOff.id)).toMatchObject({ status: "scheduled" });
    expect(await readBlock(series.id)).toMatchObject({ rrule: "FREQ=DAILY" });
    expect(await exceptionRows(series.id)).toHaveLength(1);
    expect(await eventsFor(owner.id)).toEqual(before);
    expect(await eventsFor(other.id)).toEqual([]);
  });

  it("refuses validation failures before touching the database", () => {
    expect(
      setTimeBlockStatusSchema
        .safeParse({ id: "x", status: "finished" })
        .error?.flatten().fieldErrors,
    ).toEqual({ id: ["Choose a time block."], status: ["Choose a status."] });
    expect(() =>
      editTimeBlockOccurrenceSchema.parse({
        id: crypto.randomUUID(),
        originalStart: "2026-10-05T13:00:00.000Z",
        scope: "this",
        ...form("2026-10-05 09:00"),
        rrule: "FREQ=DAILY",
      }),
    ).toThrow();
  });
});
