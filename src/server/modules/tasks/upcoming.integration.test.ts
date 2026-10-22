import { describe, expect, it } from "vitest";

import { todayFor } from "@/lib/dates";
import { type UpcomingRange, upcomingWindow } from "@/lib/upcoming";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import { createMilestone } from "@/server/modules/milestones/service";
import { createMilestoneSchema } from "@/server/modules/milestones/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { listUpcomingTasks } from "./queries";
import { changeTaskStatus, createTask } from "./service";
import { createTaskSchema } from "./validation";

// The Upcoming view (chunk 2.6): the next 14 or 30 local days in a non-UTC
// zone, plans and deadlines merged by day, timed deadlines on their local
// day in the user's zone.

// Tokyo is UTC+9 with no DST. At both instants below UTC's date is the
// 23rd, so a UTC or server-date bug shows at 00:01.
const TOKYO = "Asia/Tokyo";
const AT_2359 = new Date("2026-10-23T14:59:00Z"); // Fri 23 Oct, 23:59 Tokyo
const AT_0001 = new Date("2026-10-23T15:01:00Z"); // Sat 24 Oct, 00:01 Tokyo

const newTask = (userId: string, fields: Record<string, unknown>) =>
  createTask(userId, createTaskSchema.parse(fields));

async function upcomingAt(
  userId: string,
  now: Date,
  range: UpcomingRange = 14,
) {
  const window = upcomingWindow(todayFor(TOKYO, now), range, TOKYO);
  return listUpcomingTasks(userId, window, TOKYO);
}

async function titlesByDay(
  userId: string,
  now: Date,
  range: UpcomingRange = 14,
) {
  const days = await upcomingAt(userId, now, range);
  return Object.fromEntries(
    days.map((day) => [
      day.date,
      day.entries.map(
        (entry) =>
          `${entry.task.title}${entry.planned ? " [planned]" : ""}${entry.due ? " [due]" : ""}`,
      ),
    ]),
  );
}

describe("listUpcomingTasks in Tokyo", () => {
  it("moves its window at local midnight: tomorrow through day 14", async () => {
    const user = await createTestUser();
    await newTask(user.id, {
      title: "Planned 24th",
      plannedDate: "2026-10-24",
    });
    await newTask(user.id, { title: "Due 6 Nov", dueDate: "2026-11-06" });
    await newTask(user.id, { title: "Due 7 Nov", dueDate: "2026-11-07" });
    await newTask(user.id, { title: "No dates" });

    // At 23:59 on the 23rd, the 24th is tomorrow and 6 Nov is day 14.
    expect(await titlesByDay(user.id, AT_2359)).toEqual({
      "2026-10-24": ["Planned 24th [planned]"],
      "2026-11-06": ["Due 6 Nov [due]"],
    });
    // At 00:01 the 24th is today (Today's, not Upcoming's), and 7 Nov is
    // day 14.
    expect(await titlesByDay(user.id, AT_0001)).toEqual({
      "2026-11-06": ["Due 6 Nov [due]"],
      "2026-11-07": ["Due 7 Nov [due]"],
    });
  });

  it("shows the next 30 days when asked", async () => {
    const user = await createTestUser();
    await newTask(user.id, { title: "Day 15", dueDate: "2026-11-08" });
    await newTask(user.id, { title: "Day 30", plannedDate: "2026-11-23" });
    await newTask(user.id, { title: "Day 31", plannedDate: "2026-11-24" });

    expect(await titlesByDay(user.id, AT_0001)).toEqual({});
    expect(await titlesByDay(user.id, AT_0001, 30)).toEqual({
      "2026-11-08": ["Day 15 [due]"],
      "2026-11-23": ["Day 30 [planned]"],
    });
  });

  it("puts a timed deadline on its local day in the user's zone", async () => {
    const user = await createTestUser();
    // 00:30 on the 26th in Tokyo is 15:30 UTC on the 25th.
    await newTask(user.id, {
      title: "Dentist",
      dueDate: "2026-10-26",
      dueTime: "00:30",
      dueTz: TOKYO,
    });
    // Set in New York: 20:00 on the 30th there is 09:00 on the 31st in Tokyo.
    await newTask(user.id, {
      title: "Call New York",
      dueDate: "2026-10-30",
      dueTime: "20:00",
      dueTz: "America/New_York",
    });
    // 23:59 on day 14 is in; 00:00 on day 15 is not.
    await newTask(user.id, {
      title: "Last minute",
      dueDate: "2026-11-07",
      dueTime: "23:59",
      dueTz: TOKYO,
    });
    await newTask(user.id, {
      title: "Day 15 midnight",
      dueDate: "2026-11-08",
      dueTime: "00:00",
      dueTz: TOKYO,
    });

    const days = await upcomingAt(user.id, AT_0001);

    expect(
      Object.fromEntries(
        days.map((day) => [
          day.date,
          day.entries.map((entry) => entry.task.title),
        ]),
      ),
    ).toEqual({
      "2026-10-26": ["Dentist"],
      "2026-10-31": ["Call New York"],
      "2026-11-07": ["Last minute"],
    });
    const dentist = days[0]!.entries[0]!.task;
    expect(dentist.dueAt).toEqual(new Date("2026-10-25T15:30:00Z"));
    expect(dentist.dueTz).toBe(TOKYO);
  });

  it("merges plans and deadlines by day, with each task's goal and milestone", async () => {
    const user = await createTestUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Run a 10k" }),
    );
    const milestone = await createMilestone(
      user.id,
      createMilestoneSchema.parse({ goalId: goal.id, title: "5k" }),
    );
    await newTask(user.id, {
      title: "Same day",
      plannedDate: "2026-10-26",
      dueDate: "2026-10-26",
      milestoneId: milestone.id,
    });
    await newTask(user.id, {
      title: "Two days",
      plannedDate: "2026-10-27",
      dueDate: "2026-10-29",
      goalId: goal.id,
    });
    // Planned today, so only its deadline is upcoming.
    await newTask(user.id, {
      title: "Planned today",
      plannedDate: "2026-10-24",
      dueDate: "2026-10-28",
    });

    const days = await upcomingAt(user.id, AT_0001);

    expect(await titlesByDay(user.id, AT_0001)).toEqual({
      "2026-10-26": ["Same day [planned] [due]"],
      "2026-10-27": ["Two days [planned]"],
      "2026-10-28": ["Planned today [due]"],
      "2026-10-29": ["Two days [due]"],
    });
    expect(days[0]!.entries[0]!.task).toMatchObject({
      goal: { id: goal.id, title: "Run a 10k" },
      milestone: { id: milestone.id, title: "5k" },
    });
    expect(days[1]!.entries[0]!.task).toMatchObject({
      goal: { id: goal.id },
      milestone: null,
    });
  });

  it("shows open tasks only, and none of another user's", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await newTask(user.id, { title: "Mine", plannedDate: "2026-10-25" });
    const done = await newTask(user.id, {
      title: "Done",
      plannedDate: "2026-10-25",
    });
    await changeTaskStatus(user.id, { id: done.id, status: "completed" });
    const cancelled = await newTask(user.id, {
      title: "Cancelled",
      dueDate: "2026-10-25",
    });
    await changeTaskStatus(user.id, { id: cancelled.id, status: "cancelled" });
    await newTask(other.id, { title: "Theirs", plannedDate: "2026-10-25" });
    await newTask(other.id, {
      title: "Their deadline",
      dueDate: "2026-10-26",
      dueTime: "09:00",
      dueTz: TOKYO,
    });

    expect(await titlesByDay(user.id, AT_0001)).toEqual({
      "2026-10-25": ["Mine [planned]"],
    });
    expect(await titlesByDay(other.id, AT_0001)).toEqual({
      "2026-10-25": ["Theirs [planned]"],
      "2026-10-26": ["Their deadline [due]"],
    });
  });
});
