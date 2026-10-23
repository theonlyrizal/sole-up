import { describe, expect, it } from "vitest";

import { type AgendaEntry, agendaEntryKind } from "@/lib/agenda";
import { gridRange } from "@/lib/calendar-views";
import { localDateOf } from "@/lib/dates";
import { changeTaskStatus, createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { listCalendarGrid } from "./queries";
import { createCalendarEvent } from "./service";
import { createCalendarEventSchema } from "./validation";

// The Week and Day grids' items (chunk 4.6): events with their occurrences
// and open tasks' timed deadlines, on the user's local days in Tokyo, where
// early morning is still the day before in UTC. Plans stay off the grid.

const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";
// Monday week start: 26 Oct (Mon) to 1 Nov (Sun).
const WEEK = gridRange("week", "2026-10-28", 1);

const newTask = (userId: string, fields: Record<string, unknown>) =>
  createTask(userId, createTaskSchema.parse(fields));

const newEvent = (userId: string, fields: Record<string, unknown>) =>
  createCalendarEvent(userId, createCalendarEventSchema.parse(fields));

/** "<local day> <kind>: <title>" for each item, in Tokyo. */
async function items(userId: string, range = WEEK) {
  const entries = await listCalendarGrid(userId, range, TOKYO);
  return entries.map((entry) => `${dayOf(entry)} ${label(entry)}`).sort();
}

function dayOf(entry: AgendaEntry): string {
  return entry.allDay ? entry.start : localDateOf(new Date(entry.start), TOKYO);
}

function label(entry: AgendaEntry): string {
  return `${agendaEntryKind(entry)}: ${entry.title}`;
}

describe("listCalendarGrid in Tokyo", () => {
  it("holds a week's events, occurrences and timed deadlines, and no plans", async () => {
    const user = await createTestUser();
    await newEvent(user.id, {
      title: "Swim",
      allDay: false,
      startDate: "2026-10-26",
      startTime: "07:00",
      endDate: "2026-10-26",
      endTime: "08:00",
      tz: TOKYO,
      rrule: "FREQ=WEEKLY;BYDAY=MO,TH",
    });
    await newEvent(user.id, {
      title: "Conference",
      allDay: true,
      startDate: "2026-10-31",
      endDate: "2026-11-02",
    });
    // 00:30 on the 27th in Tokyo is still the 26th in UTC.
    await newTask(user.id, {
      title: "Pay rent",
      dueDate: "2026-10-27",
      dueTime: "00:30",
      dueTz: TOKYO,
    });
    // 11:00 in New York on the 29th is 00:00 on the 30th in Tokyo.
    await newTask(user.id, {
      title: "Call bank",
      plannedDate: "2026-10-28",
      dueDate: "2026-10-29",
      dueTime: "11:00",
      dueTz: NEW_YORK,
    });
    await newTask(user.id, { title: "Plan only", plannedDate: "2026-10-28" });
    await newTask(user.id, { title: "All-day due", dueDate: "2026-10-28" });

    expect(await items(user.id)).toEqual([
      "2026-10-26 Event: Swim",
      "2026-10-27 Task due: Pay rent",
      "2026-10-29 Event: Swim",
      "2026-10-30 Task due: Call bank",
      "2026-10-31 Event: Conference",
    ]);
  });

  it("keeps only what falls on the range's local days", async () => {
    const user = await createTestUser();
    await newTask(user.id, {
      title: "Sunday before, last minute",
      dueDate: "2026-10-25",
      dueTime: "23:59",
      dueTz: TOKYO,
    });
    await newTask(user.id, {
      title: "Monday, first minute",
      dueDate: "2026-10-26",
      dueTime: "00:00",
      dueTz: TOKYO,
    });
    await newTask(user.id, {
      title: "Sunday, last minute",
      dueDate: "2026-11-01",
      dueTime: "23:59",
      dueTz: TOKYO,
    });
    await newTask(user.id, {
      title: "Monday after, midnight",
      dueDate: "2026-11-02",
      dueTime: "00:00",
      dueTz: TOKYO,
    });
    // A timed event crossing into the week from the night before.
    await newEvent(user.id, {
      title: "Night train",
      allDay: false,
      startDate: "2026-10-25",
      startTime: "22:00",
      endDate: "2026-10-26",
      endTime: "06:00",
      tz: TOKYO,
    });

    expect(await items(user.id)).toEqual([
      "2026-10-25 Event: Night train",
      "2026-10-26 Task due: Monday, first minute",
      "2026-11-01 Task due: Sunday, last minute",
    ]);
    // The Day view holds one day only.
    expect(await items(user.id, gridRange("day", "2026-11-01", 1))).toEqual([
      "2026-11-01 Task due: Sunday, last minute",
    ]);
  });

  it("leaves out closed tasks' deadlines", async () => {
    const user = await createTestUser();
    const done = await newTask(user.id, {
      title: "Done",
      dueDate: "2026-10-28",
      dueTime: "10:00",
      dueTz: TOKYO,
    });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    expect(await items(user.id)).toEqual([]);
  });

  it("never shows another user's events or tasks", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await newEvent(other.id, {
      title: "Their event",
      allDay: true,
      startDate: "2026-10-28",
      endDate: "2026-10-28",
    });
    await newTask(other.id, {
      title: "Their deadline",
      dueDate: "2026-10-28",
      dueTime: "10:00",
      dueTz: TOKYO,
    });
    await newTask(user.id, {
      title: "Mine",
      dueDate: "2026-10-28",
      dueTime: "10:00",
      dueTz: TOKYO,
    });

    expect(await items(user.id)).toEqual(["2026-10-28 Task due: Mine"]);
    expect(await items(other.id)).toEqual([
      "2026-10-28 Event: Their event",
      "2026-10-28 Task due: Their deadline",
    ]);
  });
});
