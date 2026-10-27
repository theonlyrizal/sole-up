import { describe, expect, it } from "vitest";

import { type AreaColumn, areaColumns } from "@/lib/area-columns";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import {
  archiveLifeArea,
  createLifeArea,
} from "@/server/modules/life-areas/service";
import { createLifeAreaSchema } from "@/server/modules/life-areas/validation";
import { createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";
import { createTimeBlock } from "@/server/modules/time-blocks/service";
import { createTimeBlockSchema } from "@/server/modules/time-blocks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { listDaySchedule, listEventLinkOptions } from "./queries";
import { createCalendarEvent } from "./service";
import { createCalendarEventSchema } from "./validation";

// The By area view (chunk 4.10): one Tokyo day's events and time blocks,
// put in a column per active life area plus "No area". Events go by their
// own area, blocks by their task's goal's area.
//
// Tokyo is UTC+9 with no DST: 08:00 on the 27th there is still the 26th in
// UTC, so a UTC-date bug shows.
const TOKYO = "Asia/Tokyo";
const DAY = "2026-10-27";

const area = (userId: string, name: string) =>
  createLifeArea(userId, createLifeAreaSchema.parse({ name }));

const timedEvent = (
  userId: string,
  title: string,
  start: string,
  end: string,
  lifeAreaId?: string,
) =>
  createCalendarEvent(
    userId,
    createCalendarEventSchema.parse({
      title,
      allDay: false,
      startDate: DAY,
      startTime: start,
      endDate: DAY,
      endTime: end,
      tz: TOKYO,
      ...(lifeAreaId ? { lifeAreaId } : {}),
    }),
  );

/** A block for a new task, under a goal in `lifeAreaId` when given. */
async function block(
  userId: string,
  title: string,
  start: string,
  lifeAreaId?: string,
) {
  const goal = lifeAreaId
    ? await createGoal(
        userId,
        createGoalSchema.parse({ title: `${title} goal`, lifeAreaId }),
      )
    : null;
  const task = await createTask(
    userId,
    createTaskSchema.parse({ title, ...(goal ? { goalId: goal.id } : {}) }),
  );
  return createTimeBlock(
    userId,
    createTimeBlockSchema.parse({
      taskId: task.id,
      startDate: DAY,
      startTime: start,
      durationMinutes: 60,
      tz: TOKYO,
    }),
  );
}

/** The view's columns for the user, as the page builds them. */
async function columns(userId: string) {
  const [entries, options] = await Promise.all([
    listDaySchedule(userId, DAY, TOKYO),
    listEventLinkOptions(userId),
  ]);
  return areaColumns(entries, options.areas, DAY, TOKYO);
}

/** "<column>: <title> <lane>/<lanes>, …" for each column. */
const summary = (all: AreaColumn[]) =>
  all.map(
    (column) =>
      `${column.name}${column.archived ? " (archived)" : ""}: ${[
        ...column.allDay.map((entry) => `${entry.title} all day`),
        ...column.timed.map(
          ({ entry, lane, lanes }) => `${entry.title} ${lane}/${lanes}`,
        ),
      ].join(", ")}`,
  );

describe("the By area columns in Tokyo", () => {
  it("puts events by their area and blocks by their task's goal's area", async () => {
    const user = await createTestUser();
    const health = await area(user.id, "Health");
    const work = await area(user.id, "Work");
    await timedEvent(user.id, "Dentist", "08:00", "09:00", health.id);
    await timedEvent(user.id, "Physio", "08:30", "09:30", health.id);
    await block(user.id, "Write report", "08:00", work.id);
    await timedEvent(user.id, "Errands", "12:00", "13:00");
    await block(user.id, "Inbox task", "12:30");
    await createCalendarEvent(
      user.id,
      createCalendarEventSchema.parse({
        title: "Race day",
        allDay: true,
        startDate: DAY,
        endDate: DAY,
        lifeAreaId: health.id,
      }),
    );

    expect(summary(await columns(user.id))).toEqual([
      "Health: Race day all day, Dentist 0/2, Physio 1/2",
      "Work: Write report 0/1",
      "No area: Errands 0/2, Inbox task 1/2",
    ]);
  });

  it("places items at their Tokyo time, not UTC", async () => {
    const user = await createTestUser();
    await timedEvent(user.id, "Early run", "06:00", "07:00");
    const [none] = await columns(user.id);
    expect(none!.timed[0]!.top).toBeCloseTo(6 / 24);
  });

  it("keeps an archived area's items under it, marked, and hides it when empty", async () => {
    const user = await createTestUser();
    const old = await area(user.id, "Old job");
    const empty = await area(user.id, "Hobbies");
    await timedEvent(user.id, "Exit interview", "10:00", "11:00", old.id);
    await archiveLifeArea(user.id, { id: old.id });
    await archiveLifeArea(user.id, { id: empty.id });

    expect(summary(await columns(user.id))).toEqual([
      "Old job (archived): Exit interview 0/1",
      "No area: ",
    ]);
  });

  it("shows only the user's own areas and items", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const theirs = await area(other.id, "Their area");
    await timedEvent(other.id, "Their event", "09:00", "10:00", theirs.id);
    await block(other.id, "Their block", "10:00", theirs.id);

    expect(summary(await columns(user.id))).toEqual(["No area: "]);
    expect(summary(await columns(other.id))).toEqual([
      "Their area: Their event 0/1, Their block 0/1",
      "No area: ",
    ]);
  });
});
