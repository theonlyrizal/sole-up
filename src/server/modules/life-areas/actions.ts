"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import * as service from "./service";
import {
  addStarterLifeAreasSchema,
  createLifeAreaSchema,
  dismissStarterLifeAreasSchema,
  lifeAreaIdSchema,
  reorderLifeAreasSchema,
  updateLifeAreaSchema,
} from "./validation";

// Auth → validate → service (scoped to the user) → refresh the page's
// server-rendered data.

export const createLifeArea = authedAction(
  createLifeAreaSchema,
  async (input, { userId }) => {
    const area = await service.createLifeArea(userId, input);
    refresh();
    return area;
  },
);

export const updateLifeArea = authedAction(
  updateLifeAreaSchema,
  async (input, { userId }) => {
    const area = await service.updateLifeArea(userId, input);
    refresh();
    return area;
  },
);

export const reorderLifeAreas = authedAction(
  reorderLifeAreasSchema,
  async (input, { userId }) => {
    await service.reorderLifeAreas(userId, input);
    refresh();
  },
);

export const archiveLifeArea = authedAction(
  lifeAreaIdSchema,
  async (input, { userId }) => {
    const area = await service.archiveLifeArea(userId, input);
    refresh();
    return area;
  },
);

export const unarchiveLifeArea = authedAction(
  lifeAreaIdSchema,
  async (input, { userId }) => {
    const area = await service.unarchiveLifeArea(userId, input);
    refresh();
    return area;
  },
);

export const deleteLifeArea = authedAction(
  lifeAreaIdSchema,
  async (input, { userId }) => {
    await service.deleteLifeArea(userId, input);
    refresh();
  },
);

export const addStarterLifeAreas = authedAction(
  addStarterLifeAreasSchema,
  async (input, { userId }) => {
    const areas = await service.addStarterLifeAreas(userId, input);
    refresh();
    return areas;
  },
);

export const dismissStarterLifeAreas = authedAction(
  dismissStarterLifeAreasSchema,
  async (_input, { userId }) => {
    await service.dismissStarterLifeAreas(userId);
    refresh();
  },
);
