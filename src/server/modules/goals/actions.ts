"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import * as service from "./service";
import {
  changeGoalStatusSchema,
  createGoalSchema,
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
