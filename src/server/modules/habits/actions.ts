"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import * as service from "./service";
import {
  createHabitSchema,
  editHabitSchema,
  habitIdSchema,
} from "./validation";

// Auth → validate → service (scoped to the user) → refresh the page's
// server-rendered data.

export const createHabit = authedAction(
  createHabitSchema,
  async (input, { userId }) => {
    const habit = await service.createHabit(userId, input);
    refresh();
    return habit;
  },
);

/** Fields and schedule together, from the edit dialog. */
export const editHabit = authedAction(
  editHabitSchema,
  async (input, { userId }) => {
    const { habit } = await service.editHabit(userId, input);
    refresh();
    return habit;
  },
);

export const pauseHabit = authedAction(
  habitIdSchema,
  async (input, { userId }) => {
    const habit = await service.pauseHabit(userId, input);
    refresh();
    return habit;
  },
);

export const resumeHabit = authedAction(
  habitIdSchema,
  async (input, { userId }) => {
    const habit = await service.resumeHabit(userId, input);
    refresh();
    return habit;
  },
);

export const archiveHabit = authedAction(
  habitIdSchema,
  async (input, { userId }) => {
    const habit = await service.archiveHabit(userId, input);
    refresh();
    return habit;
  },
);

export const restoreHabit = authedAction(
  habitIdSchema,
  async (input, { userId }) => {
    const habit = await service.restoreHabit(userId, input);
    refresh();
    return habit;
  },
);

export const deleteHabit = authedAction(
  habitIdSchema,
  async (input, { userId }) => {
    await service.deleteHabit(userId, input);
    refresh();
  },
);
