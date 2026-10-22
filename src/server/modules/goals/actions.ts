"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import * as service from "./service";
import {
  changeGoalStatusSchema,
  createGoalSchema,
  goalIdSchema,
  updateGoalSchema,
} from "./validation";

// Auth → validate → service (scoped to the user) → refresh the page's
// server-rendered data.

export const createGoal = authedAction(
  createGoalSchema,
  async (input, { userId }) => {
    const goal = await service.createGoal(userId, input);
    refresh();
    return goal;
  },
);

export const updateGoal = authedAction(
  updateGoalSchema,
  async (input, { userId }) => {
    const goal = await service.updateGoal(userId, input);
    refresh();
    return goal;
  },
);

export const changeGoalStatus = authedAction(
  changeGoalStatusSchema,
  async (input, { userId }) => {
    const goal = await service.changeGoalStatus(userId, input);
    refresh();
    return goal;
  },
);

// No refresh(): the detail page navigates away after a delete, and
// refreshing it first would render its not-found. Callers refresh or
// navigate themselves.
export const deleteGoal = authedAction(
  goalIdSchema,
  async (input, { userId }) => {
    await service.deleteGoal(userId, input);
  },
);
