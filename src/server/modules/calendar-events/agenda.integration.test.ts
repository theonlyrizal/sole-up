import { describe, expect, it } from "vitest";

import { type AgendaEntry, agendaEntryKind } from "@/lib/agenda";
import { localDateOf } from "@/lib/dates";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import { changeTaskStatus, createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { listAgenda } from "./queries";
import { createCalendarEvent } from "./service";
import { createCalendarEventSchema } from "./validation";

// The Agenda's rows (chunk 4.5): events with their occurrences, open tasks'
// plans and timed deadlines, on the user's local days in Tokyo, where early
// morning is still the day before in UTC.

const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";
const WEEK = { start: "2026-10-24", days: 7 } as const; // 24–30 Oct

const newTask = (userId: string, fields: Record<string, unknown>) =>
  createTask(userId, createTaskSchema.parse(fields));

/** "<local day> <kind>: <title>" for each row, in Tokyo. */
async function rows(userId: string, range = WEEK, timeZone = TOKYO) {
  const entries = await listAgenda(userId, range, timeZone);
  return entries.map((entry) => `${dayOf(entry)} ${label(entry)}`).sort();
}

function dayOf(entry: AgendaEntry): string {
  return entry.allDay ? entry.start : localDateOf(new Date(entry.start), TOKYO);
}

function label(entry: AgendaEntry): string {
  return `${agendaEntryKind(entry)}: ${entry.title}`;
}

describe("listAgenda in Tokyo", () => {
  it("merges events, plans and timed deadlines on their local days", async () => {
    const user = await createTestUser();
    await createCalendarEvent(
      user.id,
      createCalendarEventSchema.parse({
        title: "Yoga",
        allDay: false,
        startDate: "2026-10-24",
        startTime: "07:00",
        endDate: "2026-10-24",
        endTime: "08:00",
        tz: TOKYO,
        rrule: "FREQ=DAILY;INTERVAL=3",
      }),
    );
    await newTask(user.id, { title: "Plan only", plannedDate: "2026-10-25" });
    // 00:30 on the 26th in Tokyo is still the 25th in UTC.
    await newTask(user.id, {
      title: "Due early",
      dueDate: "2026-10-26",
      dueTime: "00:30",
      dueTz: TOKYO,
    });
    // 11:00 in New York on the 26th is 00:00 on the 27th in Tokyo.
    await newTask(user.id, {
      title: "Both, same day",
      plannedDate: "2026-10-27",
      dueDate: "2026-10-26",
      dueTime: "11:00",
      dueTz: NEW_YORK,
    });
    await newTask(user.id, {
      title: "Both, two days",
      plannedDate: "2026-10-28",
      dueDate: "2026-10-29",
      dueTime: "18:00",
      dueTz: TOKYO,
    });

    expect(await rows(user.id)).toEqual([
      "2026-10-24 Event: Yoga",
      "2026-10-25 Planned task: Plan only",
      "2026-10-26 Task due: Due early",
      "2026-10-27 Event: Yoga",
      "2026-10-27 Planned task, due: Both, same day",
      "2026-10-28 Planned task: Both, two days",
      "2026-10-29 Task due: Both, two days",
      "2026-10-30 Event: Yoga",
    ]);
  });

  it("keeps only what falls inside the range's local days", async () => {
    const user = await createTestUser();
    await newTask(user.id, { title: "Day before", plannedDate: "2026-10-23" });
    await newTask(user.id, { title: "Day after", plannedDate: "2026-10-31" });
    await newTask(user.id, {
      title: "First minute",
      dueDate: "2026-10-24",
      dueTime: "00:00",
      dueTz: TOKYO,
    });
    await newTask(user.id, {
      title: "Last minute",
      dueDate: "2026-10-30",
      dueTime: "23:59",
      dueTz: TOKYO,
    });
    await newTask(user.id, {
      title: "Midnight after",
      dueDate: "2026-10-31",
      dueTime: "00:00",
      dueTz: TOKYO,
    });
    // Plan outside the range, deadline inside: only the deadline shows.
    await newTask(user.id, {
      title: "Half in",
      plannedDate: "2026-11-02",
      dueDate: "2026-10-30",
      dueTime: "09:00",
      dueTz: TOKYO,
    });

    expect(await rows(user.id)).toEqual([
      "2026-10-24 Task due: First minute",
      "2026-10-30 Task due: Half in",
      "2026-10-30 Task due: Last minute",
    ]);
  });

  it("leaves out closed tasks, undated ones and all-day deadlines", async () => {
    const user = await createTestUser();
    const done = await newTask(user.id, {
      title: "Done",
      plannedDate: "2026-10-25",
    });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    const dropped = await newTask(user.id, {
      title: "Cancelled",
      dueDate: "2026-10-25",
      dueTime: "10:00",
      dueTz: TOKYO,
    });
    await changeTaskStatus(user.id, { id: dropped.id, status: "cancelled" });
    await newTask(user.id, {
      title: "All-day deadline",
      dueDate: "2026-10-25",
    });
    await newTask(user.id, { title: "No dates" });

    expect(await rows(user.id)).toEqual([]);
  });

  it("carries the task's goal for the row and its dialog", async () => {
    const user = await createTestUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Run a half marathon" }),
    );
    await newTask(user.id, {
      title: "Long run",
      goalId: goal.id,
      plannedDate: "2026-10-25",
    });
    const [entry] = await listAgenda(user.id, WEEK, TOKYO);
    expect(entry).toMatchObject({
      kind: "task",
      role: "planned",
      task: { title: "Long run", goal: { title: "Run a half marathon" } },
    });
  });

  it("never shows another user's events or tasks", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await newTask(other.id, { title: "Theirs", plannedDate: "2026-10-25" });
    await createCalendarEvent(
      other.id,
      createCalendarEventSchema.parse({
        title: "Their event",
        allDay: true,
        startDate: "2026-10-25",
        endDate: "2026-10-25",
      }),
    );
    await newTask(user.id, { title: "Mine", plannedDate: "2026-10-25" });

    expect(await rows(user.id)).toEqual(["2026-10-25 Planned task: Mine"]);
    expect(await rows(other.id)).toEqual([
      "2026-10-25 Event: Their event",
      "2026-10-25 Planned task: Theirs",
    ]);
  });
});
