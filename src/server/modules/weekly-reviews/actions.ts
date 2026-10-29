"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import * as service from "./service";
import {
  saveWeeklyReviewTextSchema,
  setWeeklyReviewPrioritiesSchema,
  startWeeklyReviewSchema,
  weeklyReviewIdSchema,
} from "./validation";

// Auth → validate → service (scoped to the user) → refresh the page's
// server-rendered data. Review text is never logged.

/** Opening the flow starts the week's review, or returns the one there is. */
export const startWeeklyReview = authedAction(
  startWeeklyReviewSchema,
  async (input, { userId }) => {
    const review = await service.startWeeklyReview(userId, input);
    refresh();
    return review;
  },
);

/** Reflect's wins, blockers and lessons, and the priorities note. */
export const saveWeeklyReviewText = authedAction(
  saveWeeklyReviewTextSchema,
  async (input, { userId }) => {
    const review = await service.saveWeeklyReviewText(userId, input);
    refresh();
    return review;
  },
);

/** The priorities for next week, replaced in the order given. */
export const setWeeklyReviewPriorities = authedAction(
  setWeeklyReviewPrioritiesSchema,
  async (input, { userId }) => {
    const priorities = await service.setWeeklyReviewPriorities(userId, input);
    refresh();
    return priorities;
  },
);

/**
 * A confirmed hard delete, open or closed (ADR 0015). The caller leaves
 * the review's page, so nothing is refreshed here.
 */
export const deleteWeeklyReview = authedAction(
  weeklyReviewIdSchema,
  async (input, { userId }) => {
    await service.deleteWeeklyReview(userId, input);
  },
);

/** "Finish review". Nothing has to be filled first. */
export const finishWeeklyReview = authedAction(
  weeklyReviewIdSchema,
  async (input, { userId }) => {
    const review = await service.finishWeeklyReview(userId, input);
    refresh();
    return review;
  },
);
