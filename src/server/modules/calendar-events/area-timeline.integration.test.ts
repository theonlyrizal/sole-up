import { describe, expect, it } from "vitest";

import {
  timelineRange,
  type TimelineRow,
  timelineRows,
} from "@/lib/area-timeline";
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
import { listEventLinkOptions, listSchedule } from "./queries";
import { createCalendarEvent } from "./service";
import { createCalendarEventSchema } from "./validation";

// The Timeline view (chunk 4.11): a Tokyo week's (or day's) events and
// time blocks, in a row per active life area plus "No area", placed along
// the range. Events go by their own area, blocks by their task's goal's
// area.
//
// Tokyo is UTC+9 with no DST: 08:00 on Tuesday there is still Monday in
// UTC, so a UTC-date bug shows. The week runs Monday 26 October to Sunday
// 1 November 2026.
const TOKYO = "Asia/Tokyo";
const WEEK = timelineRange("week", "2026-10-27", 1);
const HOURS = 168;

const area = (userId: string, name: string) =>
  createLifeArea(userId, createLifeAreaSchema.parse({ name }));

const timedEvent = (
  userId: string,
  title: string,
  start: [date: string, time: string],
  end: [date: string, time: string],
  lifeAreaId?: string,
) =>
  createCalendarEvent(
    userId,
    createCalendarEventSchema.parse({
      title,
      allDay: false,
      startDate: start[0],
      startTime: start[1],
      endDate: end[0],
      endTime: end[1],
      tz: TOKYO,
      ...(lifeAreaId ? { lifeAreaId } : {}),
    }),
  );

/** A one-hour block for a new task, under a goal in `lifeAreaId` when given. */
async function block(
  userId: string,
  title: string,
  [startDate, startTime]: [string, string],
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
      startDate,
      startTime,
      durationMinutes: 60,
      tz: TOKYO,
    }),
  );
}

/** The view's rows for the user, as the page builds them. */
async function rows(userId: string, range = WEEK) {
  const [entries, options] = await Promise.all([
    listSchedule(userId, range, TOKYO),
    listEventLinkOptions(userId),
  ]);
  return timelineRows(entries, options.areas, range, TOKYO);
}

/** "<row>: <title> <lane>/<lanes> @<hours from the start>, …" per row. */
const summary = (all: TimelineRow[], hours = HOURS) =>
  all.map(
    (row) =>
      `${row.name}${row.archived ? " (archived)" : ""}: ${row.items
        .map(
          ({ entry, lane, lanes, offset }) =>
            `${entry.title} ${lane}/${lanes} @${Math.round(offset * hours * 100) / 100}`,
        )
        .join(", ")}`,
  );

describe("the Timeline rows in Tokyo", () => {
  it("puts events by their area and blocks by their task's goal's area, at their Tokyo time", async () => {
    const user = await createTestUser();
    const health = await area(user.id, "Health");
    const work = await area(user.id, "Work");
    await timedEvent(
      user.id,
      "Dentist",
      ["2026-10-27", "08:00"],
      ["2026-10-27", "09:00"],
      health.id,
    );
    await timedEvent(
      user.id,
      "Physio",
      ["2026-10-27", "08:30"],
      ["2026-10-27", "09:30"],
      health.id,
    );
    await block(user.id, "Write report", ["2026-10-28", "09:00"], work.id);
    await timedEvent(
      user.id,
      "Errands",
      ["2026-10-29", "13:00"],
      ["2026-10-29", "14:00"],
    );
    await block(user.id, "Inbox task", ["2026-11-01", "23:00"]);
    await createCalendarEvent(
      user.id,
      createCalendarEventSchema.parse({
        title: "Race day",
        allDay: true,
        startDate: "2026-10-31",
        endDate: "2026-10-31",
        lifeAreaId: health.id,
      }),
    );

    expect(summary(await rows(user.id))).toEqual([
      "Health: Dentist 0/2 @32, Physio 1/2 @32.5, Race day 0/1 @120",
      "Work: Write report 0/1 @57",
      // Sunday 23:00 takes its two hours of room inside the week.
      "No area: Errands 0/1 @85, Inbox task 0/1 @166",
    ]);
  });

  it("keeps the range's edges: in from the night before, not touching ones", async () => {
    const user = await createTestUser();
    // Ends exactly as the week starts: not in it.
    await timedEvent(
      user.id,
      "Late film",
      ["2026-10-25", "22:00"],
      ["2026-10-26", "00:00"],
    );
    // Crosses in from Sunday night: clipped to the start.
    await timedEvent(
      user.id,
      "Night shift",
      ["2026-10-25", "22:00"],
      ["2026-10-26", "03:00"],
    );
    // Starts exactly as the week ends: not in it.
    await timedEvent(
      user.id,
      "Next week",
      ["2026-11-02", "00:00"],
      ["2026-11-02", "01:00"],
    );

    const [none] = await rows(user.id);
    expect(summary([none!])).toEqual(["No area: Night shift 0/1 @0"]);
    expect(none!.items[0]!.length * HOURS).toBeCloseTo(3);
  });

  it("holds one day on a day span", async () => {
    const user = await createTestUser();
    await timedEvent(
      user.id,
      "Early run",
      ["2026-10-27", "06:00"],
      ["2026-10-27", "07:00"],
    );
    await timedEvent(
      user.id,
      "Tomorrow",
      ["2026-10-28", "06:00"],
      ["2026-10-28", "07:00"],
    );
    const day = timelineRange("day", "2026-10-27", 1);
    expect(summary(await rows(user.id, day), 24)).toEqual([
      "No area: Early run 0/1 @6",
    ]);
  });

  it("keeps an archived area's items under it, marked, and hides it when empty", async () => {
    const user = await createTestUser();
    const old = await area(user.id, "Old job");
    const empty = await area(user.id, "Hobbies");
    await timedEvent(
      user.id,
      "Exit interview",
      ["2026-10-30", "10:00"],
      ["2026-10-30", "11:00"],
      old.id,
    );
    await archiveLifeArea(user.id, { id: old.id });
    await archiveLifeArea(user.id, { id: empty.id });

    expect(summary(await rows(user.id))).toEqual([
      "Old job (archived): Exit interview 0/1 @106",
      "No area: ",
    ]);
  });

  it("shows only the user's own areas and items", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const theirs = await area(other.id, "Their area");
    await timedEvent(
      other.id,
      "Their event",
      ["2026-10-27", "09:00"],
      ["2026-10-27", "10:00"],
      theirs.id,
    );
    await block(other.id, "Their block", ["2026-10-28", "10:00"], theirs.id);

    expect(summary(await rows(user.id))).toEqual(["No area: "]);
    expect(summary(await rows(other.id))).toEqual([
      "Their area: Their event 0/1 @33, Their block 0/1 @58",
      "No area: ",
    ]);
  });
});
