"use server";

import { refresh } from "next/cache";

import { todayFor } from "@/lib/dates";
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
 * Bulk "plan today". Today is worked out here from the user's saved time
 * zone, never from the device's clock.
 */
export const planTasksToday = authedAction(
  taskIdsSchema,
  async ({ ids }, { userId }) => {
    const { timezone } = await getUserPreferences(userId);
    if (!timezone) throw new ValidationError({}, NO_TIME_ZONE, [NO_TIME_ZONE]);
    const plannedDate = todayFor(timezone);
    const tasks = await service.planTasks(userId, { ids, plannedDate });
    refresh();
    return { plannedDate, count: tasks.length };
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
