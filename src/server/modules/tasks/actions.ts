"use server";

import { refresh } from "next/cache";

import { relativeDay } from "@/lib/today";
import { authedAction } from "@/server/auth/authed-action";
import { ValidationError } from "@/server/errors";
import { getUserPreferences } from "@/server/modules/preferences/service";

import { listTaskParentOptions } from "./queries";
import * as service from "./service";
import {
  changeTaskStatusSchema,
  createTaskSchema,
  moveTasksSchema,
  noInputSchema,
  planTaskForDaySchema,
  planTaskSchema,
  rescheduleTaskDueSchema,
  scheduleTaskSchema,
  taskIdsSchema,
  updateTaskSchema,
} from "./validation";

// Auth → validate → service (scoped to the user) → refresh the page's
// server-rendered data.

/** Quick add. Sends `{ title }` at least; everything else is optional. */
export const createTask = authedAction(
  createTaskSchema,
  async (input, { userId }) => {
    const task = await service.createTask(userId, input);
    refresh();
    return task;
  },
);

/** Goals and milestones for the parent pickers, read when a picker opens. */
export const getTaskParentOptions = authedAction(
  noInputSchema,
  async (_input, { userId }) => listTaskParentOptions(userId),
);

const NO_TIME_ZONE = "Confirm your time zone in Settings first.";

/**
 * The user's date `days` after today, from their saved time zone, never
 * from the device's or the server's clock.
 */
async function userDay(userId: string, days: number) {
  const { timezone } = await getUserPreferences(userId);
  if (!timezone) throw new ValidationError({}, NO_TIME_ZONE, [NO_TIME_ZONE]);
  return relativeDay(timezone, days);
}

/** Bulk "plan today", and Today's "Add to today" picker. */
export const planTasksToday = authedAction(
  taskIdsSchema,
  async ({ ids }, { userId }) => {
    const plannedDate = await userDay(userId, 0);
    const tasks = await service.planTasks(userId, { ids, plannedDate });
    refresh();
    return { plannedDate, count: tasks.length };
  },
);

/** Plan one task for today or tomorrow in the user's zone. */
export const planTaskForDay = authedAction(
  planTaskForDaySchema,
  async ({ id, day }, { userId }) => {
    const plannedDate = await userDay(userId, day === "today" ? 0 : 1);
    const task = await service.planTask(userId, { id, plannedDate });
    refresh();
    return task;
  },
);

/** Plan one task for a picked date, or unplan it with null. */
export const planTask = authedAction(
  planTaskSchema,
  async (input, { userId }) => {
    const task = await service.planTask(userId, input);
    refresh();
    return task;
  },
);

/** A new deadline for one task (Today's "New due date"). */
export const rescheduleTaskDue = authedAction(
  rescheduleTaskDueSchema,
  async (input, { userId }) => {
    const task = await service.rescheduleTaskDue(userId, input);
    refresh();
    return task;
  },
);

/** Bulk "assign to a goal" (or one of its milestones). */
export const moveTasks = authedAction(
  moveTasksSchema,
  async (input, { userId }) => {
    const tasks = await service.moveTasks(userId, input);
    refresh();
    return { count: tasks.length };
  },
);

/** The edit form: title, notes, priority and estimate. */
export const updateTask = authedAction(
  updateTaskSchema,
  async (input, { userId }) => {
    const task = await service.updateTask(userId, input);
    refresh();
    return task;
  },
);

/** Complete, reopen or cancel. */
export const changeTaskStatus = authedAction(
  changeTaskStatusSchema,
  async (input, { userId }) => {
    const task = await service.changeTaskStatus(userId, input);
    refresh();
    return task;
  },
);

/** The Plan page's inline edit of planned date, deadline and parent. */
export const scheduleTask = authedAction(
  scheduleTaskSchema,
  async (input, { userId }) => {
    const task = await service.scheduleTask(userId, input);
    refresh();
    return task;
  },
);
