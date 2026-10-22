"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import * as service from "./service";
import {
  changeMilestoneStatusSchema,
  createMilestoneSchema,
  reorderMilestonesSchema,
} from "./validation";

// Auth → validate → service (scoped to the user) → refresh the page's
// server-rendered data.

export const createMilestone = authedAction(
  createMilestoneSchema,
  async (input, { userId }) => {
    const milestone = await service.createMilestone(userId, input);
    refresh();
    return milestone;
  },
);

export const reorderMilestones = authedAction(
  reorderMilestonesSchema,
  async (input, { userId }) => {
    await service.reorderMilestones(userId, input);
    refresh();
  },
);

export const changeMilestoneStatus = authedAction(
  changeMilestoneStatusSchema,
  async (input, { userId }) => {
    const milestone = await service.changeMilestoneStatus(userId, input);
    refresh();
    return milestone;
  },
);
