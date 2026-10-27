import { describe, expect, it } from "vitest";

import { agendaEntryKind } from "@/lib/agenda";
import { instantFromLocal } from "@/lib/dates";
import type { ScheduleEntry } from "@/lib/schedule";
import { todayClock } from "@/lib/today";
import { db } from "@/server/db/client";
import { timeBlocks } from "@/server/db/schema";
import { createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";
import {
  createTimeBlock,
  setTimeBlockStatus,
} from "@/server/modules/time-blocks/service";
import { createTimeBlockSchema } from "@/server/modules/time-blocks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { listTodayTimeline } from "./queries";
import { createCalendarEvent } from "./service";
import { createCalendarEventSchema } from "./validation";

// Today's timeline (chunk 4.9): the events and time blocks overlapping the
// user's today in their zone, all-day events first, then by start.
//
// Tokyo is UTC+9 with no DST. At NOW it is 00:01 on Sat 24 Oct in Tokyo but
// still the 23rd in UTC, so a UTC or server-date bug shows.
const TOKYO = "Asia/Tokyo";
const NOW = new Date("2026-10-23T15:01:00Z");
const clock = todayClock(TOKYO, NOW);

const timedEvent = (
  userId: string,
  title: string,
  start: string,
  end: string,
  rrule?: string,
) => {
  const [startDate, startTime] = start.split(" ");
  const [endDate, endTime] = end.split(" ");
  return createCalendarEvent(
    userId,
    createCalendarEventSchema.parse({
      title,
      allDay: false,
      startDate,
      startTime,
      endDate,
      endTime,
      tz: TOKYO,
      ...(rrule ? { rrule } : {}),
    }),
  );
};

const allDayEvent = (
  userId: string,
  title: string,
  startDate: string,
  endDate: string,
) =>
  createCalendarEvent(
    userId,
    createCalendarEventSchema.parse({
      title,
      allDay: true,
      startDate,
      endDate,
    }),
  );

async function block(
  userId: string,
  title: string,
  start: string,
  durationMinutes = 60,
) {
  const task = await createTask(userId, createTaskSchema.parse({ title }));
  const [startDate, startTime] = start.split(" ");
  return createTimeBlock(
    userId,
    createTimeBlockSchema.parse({
      taskId: task.id,
      startDate,
      startTime,
      durationMinutes,
      tz: TOKYO,
    }),
  );
}

const label = (entry: ScheduleEntry) =>
  `${agendaEntryKind(entry)}: ${entry.title}`;

describe("listTodayTimeline in Tokyo", () => {
  it("lists today's events and blocks on the Tokyo day, all-day first, then by start", async () => {
    const user = await createTestUser();
    await timedEvent(
      user.id,
      "Dentist",
      "2026-10-24 09:00",
      "2026-10-24 10:00",
    );
    await block(user.id, "Write report", "2026-10-24 10:30");
    await allDayEvent(user.id, "Trip", "2026-10-23", "2026-10-25");
    await allDayEvent(user.id, "Birthday", "2026-10-24", "2026-10-24");
    // Began last night and is still going at 00:01.
    await timedEvent(
      user.id,
      "Late call",
      "2026-10-23 23:30",
      "2026-10-24 00:30",
    );
    // A daily series begun last week has an occurrence today.
    await timedEvent(
      user.id,
      "Standup",
      "2026-10-19 09:00",
      "2026-10-19 09:15",
      "FREQ=DAILY",
    );
    await block(user.id, "Evening read", "2026-10-24 23:00", 60);

    expect((await listTodayTimeline(user.id, clock, TOKYO)).map(label)).toEqual(
      [
        // All-day first, the one that began earlier first.
        "Event: Trip",
        "Event: Birthday",
        "Event: Late call",
        // Same start: by title.
        "Event: Dentist",
        "Event: Standup",
        "Time block: Write report",
        "Time block: Evening read",
      ],
    );
  });

  it("leaves out items touching the day's edges and other days", async () => {
    const user = await createTestUser();
    // Ends exactly at Tokyo midnight, which is 15:00 UTC on the 23rd.
    await timedEvent(
      user.id,
      "Ends at midnight",
      "2026-10-23 23:00",
      "2026-10-24 00:00",
    );
    // Starts exactly at the next midnight.
    await block(user.id, "Starts tomorrow", "2026-10-25 00:00");
    await allDayEvent(user.id, "Yesterday", "2026-10-23", "2026-10-23");
    await allDayEvent(user.id, "Tomorrow", "2026-10-25", "2026-10-25");
    // 23:30 on the 24th in Tokyo, the last half hour of today.
    await block(user.id, "Last thing", "2026-10-24 23:30", 30);

    expect((await listTodayTimeline(user.id, clock, TOKYO)).map(label)).toEqual(
      ["Time block: Last thing"],
    );
  });

  it("keeps marked blocks, with their status", async () => {
    const user = await createTestUser();
    const done = await block(user.id, "Done block", "2026-10-24 08:00");
    await setTimeBlockStatus(user.id, { id: done.id, status: "done" });

    const [entry] = await listTodayTimeline(user.id, clock, TOKYO);
    expect(entry).toMatchObject({ kind: "block", title: "Done block" });
    expect(entry?.kind === "block" && entry.block.status).toBe("done");
  });

  it("shows only the user's own items", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await timedEvent(
      other.id,
      "Their event",
      "2026-10-24 09:00",
      "2026-10-24 10:00",
    );
    const theirs = await createTask(
      other.id,
      createTaskSchema.parse({ title: "Their task" }),
    );
    await db.insert(timeBlocks).values({
      userId: other.id,
      taskId: theirs.id,
      startAt: instantFromLocal("2026-10-24", "11:00", TOKYO),
      endAt: instantFromLocal("2026-10-24", "12:00", TOKYO),
      tz: TOKYO,
    });

    expect(await listTodayTimeline(user.id, clock, TOKYO)).toEqual([]);
    expect(await listTodayTimeline(other.id, clock, TOKYO)).toHaveLength(2);
  });
});
