import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { gridRange } from "@/lib/calendar-views";
import { instantFromLocal, localDateOf } from "@/lib/dates";
import type { ActionError, ActionResult } from "@/lib/result";
import { db } from "@/server/db/client";
import {
  auditEvents,
  tasks,
  timeBlockExceptions,
  timeBlocks,
  userPreferences,
} from "@/server/db/schema";
import {
  listAgenda,
  listCalendarGrid,
} from "@/server/modules/calendar-events/queries";
import { createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { listTaskBlocks, TASK_BLOCKS_DAYS } from "./queries";

// The time-block UI's server side (chunk 4.8): the actions the "Block
// time" form, the block dialog and the grid's drags call, the scope
// prompt's previews (which must change nothing), the task dialog's list of
// upcoming blocks, and blocks on the Agenda and the Week/Day grids.

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

beforeEach(() => {
  requestHeaders.current = new Headers();
});

const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";

const at = (local: string, tz = TOKYO) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, tz);
};

/** A signed-in user whose confirmed zone is `tz`. */
async function signedInUser(tz = TOKYO) {
  const user = await createTestUser();
  await db.insert(userPreferences).values({ userId: user.id, timezone: tz });
  requestHeaders.current = (await asUser(user.id)).headers;
  return user;
}

async function signInAs(userId: string) {
  requestHeaders.current = (await asUser(userId)).headers;
}

const newTask = (userId: string, title = "Write report") =>
  createTask(userId, createTaskSchema.parse({ title }));

/** The "Block time" form as it sends a block. */
const blockForm = (
  taskId: string,
  start: string,
  fields: Record<string, unknown> = {},
) => {
  const [startDate, startTime] = start.split(" ");
  return {
    taskId,
    startDate,
    startTime,
    durationMinutes: 60,
    tz: TOKYO,
    ...fields,
  };
};

async function snapshot() {
  return {
    blocks: await db.select().from(timeBlocks),
    exceptions: await db.select().from(timeBlockExceptions),
    audit: await db.select().from(auditEvents),
  };
}

/** A failed result's error, with its field errors when it has them. */
function failed(result: ActionResult<unknown>) {
  if (result.ok) throw new Error("expected a failed result");
  return result.error as ActionError & {
    fieldErrors?: Record<string, string[]>;
  };
}

describe("block actions", () => {
  it("blocks time for a task and reports field errors", async () => {
    const user = await signedInUser();
    const task = await newTask(user.id);

    const created = await actions.createTimeBlock(
      blockForm(task.id, "2026-11-02 00:30", { durationMinutes: 45 }),
    );
    expect(created.ok).toBe(true);
    const [row] = await db.select().from(timeBlocks);
    expect(row).toMatchObject({
      taskId: task.id,
      tz: TOKYO,
      rrule: null,
      status: "scheduled",
    });
    // 00:30 in Tokyo is the previous day in UTC.
    expect(row!.startAt.toISOString()).toBe("2026-11-01T15:30:00.000Z");
    expect(row!.endAt.toISOString()).toBe("2026-11-01T16:15:00.000Z");

    const blank = failed(
      await actions.createTimeBlock(
        blockForm(task.id, "2026-11-02 09:00", { durationMinutes: Number.NaN }),
      ),
    );
    expect(blank.code).toBe("VALIDATION");
    expect(blank.fieldErrors?.durationMinutes).toEqual([
      "Choose a length from 1 minute to 24 hours.",
    ]);
    const tooLong = failed(
      await actions.createTimeBlock(
        blockForm(task.id, "2026-11-02 09:00", { durationMinutes: 1441 }),
      ),
    );
    expect(tooLong.fieldErrors?.durationMinutes).toBeDefined();
    const noTask = failed(
      await actions.createTimeBlock(blockForm("", "2026-11-02 09:00")),
    );
    expect(noTask.fieldErrors?.taskId).toEqual(["Choose one of your tasks."]);
    const badRule = failed(
      await actions.createTimeBlock(
        blockForm(task.id, "2026-11-02 09:00", {
          rrule: "FREQ=DAILY;UNTIL=20261101",
        }),
      ),
    );
    expect(badRule.fieldErrors?.rrule).toEqual([
      "End the repeat on or after the start date.",
    ]);

    // Another user's task is a field error, and nothing is written.
    const other = await createTestUser();
    const theirs = await newTask(other.id);
    const foreign = failed(
      await actions.createTimeBlock(blockForm(theirs.id, "2026-11-02 09:00")),
    );
    expect(foreign.fieldErrors?.taskId).toEqual(["Choose one of your tasks."]);
    expect(await db.select().from(timeBlocks)).toHaveLength(1);

    requestHeaders.current = new Headers();
    const anonymous = failed(
      await actions.createTimeBlock(blockForm(task.id, "2026-11-02 09:00")),
    );
    expect(anonymous.code).toBe("UNAUTHENTICATED");
  });

  it("moves and resizes a one-off block (a drag), and refuses a series that way", async () => {
    const user = await signedInUser();
    const task = await newTask(user.id);
    const created = await actions.createTimeBlock(
      blockForm(task.id, "2026-11-02 10:00"),
    );
    if (!created.ok) throw new Error("create failed");
    const id = created.data.id;

    const moved = await actions.updateTimeBlock({
      id,
      startDate: "2026-11-03",
      startTime: "11:00",
      durationMinutes: 90,
      tz: TOKYO,
    });
    expect(moved.ok).toBe(true);
    const [row] = await db.select().from(timeBlocks);
    expect(row!.startAt).toEqual(at("2026-11-03 11:00"));
    expect(row!.endAt).toEqual(at("2026-11-03 12:30"));
    expect(row!.rrule).toBeNull();

    const series = await actions.createTimeBlock(
      blockForm(task.id, "2026-11-02 07:00", { rrule: "FREQ=DAILY" }),
    );
    if (!series.ok) throw new Error("create failed");
    const refused = failed(
      await actions.updateTimeBlock({
        id: series.data.id,
        startDate: "2026-11-02",
        startTime: "08:00",
        durationMinutes: 60,
        tz: TOKYO,
      }),
    );
    expect(refused.code).toBe("CONFLICT");

    // Another user can't move it.
    const other = await createTestUser();
    await signInAs(other.id);
    const foreign = failed(
      await actions.updateTimeBlock({
        id,
        startDate: "2026-11-04",
        startTime: "11:00",
        durationMinutes: 60,
        tz: TOKYO,
      }),
    );
    expect(foreign.code).toBe("NOT_FOUND");
    const [after] = await db
      .select()
      .from(timeBlocks)
      .where(eq(timeBlocks.id, id));
    expect(after!.startAt).toEqual(at("2026-11-03 11:00"));
  });

  it("marks a block and an occurrence, never completing the task", async () => {
    const user = await signedInUser();
    const task = await newTask(user.id);
    const oneOff = await actions.createTimeBlock(
      blockForm(task.id, "2026-11-02 10:00"),
    );
    const series = await actions.createTimeBlock(
      blockForm(task.id, "2026-11-02 07:00", { rrule: "FREQ=DAILY;COUNT=3" }),
    );
    if (!oneOff.ok || !series.ok) throw new Error("create failed");

    expect(
      (await actions.setTimeBlockStatus({ id: oneOff.data.id, status: "done" }))
        .ok,
    ).toBe(true);
    expect(
      (
        await actions.setTimeBlockStatus({
          id: series.data.id,
          originalStart: at("2026-11-03 07:00").toISOString(),
          status: "skipped",
        })
      ).ok,
    ).toBe(true);
    // A series needs the occurrence.
    expect(
      failed(
        await actions.setTimeBlockStatus({
          id: series.data.id,
          status: "done",
        }),
      ).code,
    ).toBe("CONFLICT");

    const [taskRow] = await db.select().from(tasks);
    expect(taskRow!.status).toBe("open");
    const [one] = await db
      .select()
      .from(timeBlocks)
      .where(eq(timeBlocks.id, oneOff.data.id));
    expect(one!.status).toBe("done");
    const [exception] = await db.select().from(timeBlockExceptions);
    expect(exception).toMatchObject({ kind: "modified", status: "skipped" });

    // Another user can't mark it.
    const other = await createTestUser();
    await signInAs(other.id);
    expect(
      failed(
        await actions.setTimeBlockStatus({
          id: oneOff.data.id,
          status: "skipped",
        }),
      ).code,
    ).toBe("NOT_FOUND");
  });
});

describe("scope previews", () => {
  /** A daily series from 2 Nov, with 4 Nov marked done (an exception). */
  async function seriesWithException(userId: string) {
    const task = await newTask(userId);
    const created = await actions.createTimeBlock(
      blockForm(task.id, "2026-11-02 07:00", { rrule: "FREQ=DAILY;COUNT=5" }),
    );
    if (!created.ok) throw new Error("create failed");
    const marked = await actions.setTimeBlockStatus({
      id: created.data.id,
      originalStart: at("2026-11-04 07:00").toISOString(),
      status: "done",
    });
    expect(marked.ok).toBe(true);
    return created.data.id;
  }

  it("names what a wider edit would drop, changes nothing, and matches the save", async () => {
    const user = await signedInUser();
    const id = await seriesWithException(user.id);
    const before = await snapshot();

    // From 3 Nov, weekly on Tuesdays only: 4 Nov (a Wednesday) goes.
    const input = {
      id,
      originalStart: at("2026-11-03 07:00").toISOString(),
      scope: "following" as const,
      startDate: "2026-11-03",
      startTime: "08:00",
      durationMinutes: 60,
      tz: TOKYO,
      rrule: "FREQ=WEEKLY;BYDAY=TU",
    };
    const preview = await actions.previewTimeBlockOccurrenceEdit(input);
    if (!preview.ok) throw new Error("preview failed");
    expect(preview.data.dropped).toHaveLength(1);
    expect(preview.data.dropped[0]!.originalStart).toEqual(
      at("2026-11-04 07:00"),
    );
    expect(await snapshot()).toEqual(before);

    const saved = await actions.editTimeBlockOccurrence(input);
    if (!saved.ok) throw new Error("save failed");
    expect(saved.data.dropped.map((drop) => drop.id)).toEqual(
      preview.data.dropped.map((drop) => drop.id),
    );

    // Validation errors come back from the preview as from the save.
    const invalid = failed(
      await actions.previewTimeBlockOccurrenceEdit({
        ...input,
        durationMinutes: 0,
      }),
    );
    expect(invalid.fieldErrors?.durationMinutes).toBeDefined();
  });

  it("names what a delete would drop, changes nothing, and refuses other users", async () => {
    const user = await signedInUser();
    const id = await seriesWithException(user.id);
    const before = await snapshot();
    const key = { id, originalStart: at("2026-11-03 07:00").toISOString() };

    const following = await actions.previewTimeBlockOccurrenceDelete({
      ...key,
      scope: "following",
    });
    const thisOne = await actions.previewTimeBlockOccurrenceDelete({
      ...key,
      scope: "this",
    });
    if (!following.ok || !thisOne.ok) throw new Error("preview failed");
    expect(following.data.dropped).toHaveLength(1);
    expect(thisOne.data.dropped).toEqual([]);
    expect(await snapshot()).toEqual(before);

    const other = await createTestUser();
    await signInAs(other.id);
    expect(
      failed(
        await actions.previewTimeBlockOccurrenceDelete({
          ...key,
          scope: "all",
        }),
      ).code,
    ).toBe("NOT_FOUND");
    expect(
      failed(
        await actions.previewTimeBlockOccurrenceEdit({
          ...key,
          scope: "all",
          startDate: "2026-11-03",
          startTime: "08:00",
          durationMinutes: 60,
          tz: TOKYO,
          rrule: "FREQ=DAILY",
        }),
      ).code,
    ).toBe("NOT_FOUND");
    expect(await snapshot()).toEqual(before);
  });
});

describe("a task's upcoming blocks", () => {
  it("lists the task's blocks that haven't ended, through the next 30 days", async () => {
    const user = await signedInUser();
    const task = await newTask(user.id);
    const otherTask = await newTask(user.id, "Something else");
    const now = at("2026-11-02 10:30");
    const add = async (taskId: string, start: string, fields = {}) => {
      const created = await actions.createTimeBlock(
        blockForm(taskId, start, fields),
      );
      expect(created.ok).toBe(true);
    };

    await add(task.id, "2026-11-02 08:00"); // ended at 09:00
    await add(task.id, "2026-11-02 10:00"); // running
    await add(task.id, "2026-11-03 09:00");
    await add(task.id, "2026-12-20 09:00"); // past the 30 days
    await add(task.id, "2026-11-05 07:00", {
      rrule: "FREQ=WEEKLY;BYDAY=TH;COUNT=3",
    });
    await add(otherTask.id, "2026-11-03 10:00");

    const { blocks, timeZone, locale } = await listTaskBlocks(
      user.id,
      task.id,
      now,
    );
    expect(timeZone).toBe(TOKYO);
    expect(locale).toBe("en-US");
    expect(blocks.map((block) => block.startAt)).toEqual([
      at("2026-11-02 10:00"),
      at("2026-11-03 09:00"),
      at("2026-11-05 07:00"),
      at("2026-11-12 07:00"),
      at("2026-11-19 07:00"),
    ]);
    expect(blocks.every((block) => block.taskId === task.id)).toBe(true);
    expect(TASK_BLOCKS_DAYS).toBe(30);

    // Another user sees none of them, even with the task's ID.
    const other = await createTestUser();
    expect((await listTaskBlocks(other.id, task.id, now)).blocks).toEqual([]);
  });

  it("reads them through an action, for signed-in users only", async () => {
    const user = await signedInUser(NEW_YORK);
    const task = await newTask(user.id);
    const result = await actions.getTaskBlocks({ taskId: task.id });
    if (!result.ok) throw new Error("read failed");
    expect(result.data).toMatchObject({ blocks: [], timeZone: NEW_YORK });

    expect(failed(await actions.getTaskBlocks({ taskId: "nope" })).code).toBe(
      "VALIDATION",
    );
    requestHeaders.current = new Headers();
    expect(failed(await actions.getTaskBlocks({ taskId: task.id })).code).toBe(
      "UNAUTHENTICATED",
    );
  });
});

describe("blocks on the calendar", () => {
  it("puts blocks on their Tokyo day in the Agenda and the grids, for their owner only", async () => {
    const user = await signedInUser();
    const task = await newTask(user.id);
    // 00:30 on 2 Nov in Tokyo is still 1 Nov in UTC.
    await actions.createTimeBlock(blockForm(task.id, "2026-11-02 00:30"));
    await actions.createTimeBlock(
      blockForm(task.id, "2026-11-03 07:00", { rrule: "FREQ=DAILY;COUNT=2" }),
    );
    const other = await createTestUser();
    const theirs = await newTask(other.id, "Their task");
    await db.insert(timeBlocks).values({
      userId: other.id,
      taskId: theirs.id,
      startAt: at("2026-11-02 09:00"),
      endAt: at("2026-11-02 10:00"),
      tz: TOKYO,
    });

    const agenda = await listAgenda(
      user.id,
      { start: "2026-11-02", days: 7 },
      TOKYO,
    );
    const agendaBlocks = agenda.filter((entry) => entry.kind === "block");
    expect(agendaBlocks.map((entry) => entry.title)).toEqual([
      "Write report",
      "Write report",
      "Write report",
    ]);
    expect(
      agendaBlocks.map((entry) => localDateOf(new Date(entry.start), TOKYO)),
    ).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);

    const day = await listCalendarGrid(
      user.id,
      gridRange("day", "2026-11-02", 1),
      TOKYO,
    );
    expect(day).toHaveLength(1);
    expect(day[0]).toMatchObject({ kind: "block", allDay: false });
    const week = await listCalendarGrid(
      user.id,
      gridRange("week", "2026-11-02", 1),
      TOKYO,
    );
    expect(week.filter((entry) => entry.kind === "block")).toHaveLength(3);
    expect(week.some((entry) => entry.title === "Their task")).toBe(false);
  });
});
