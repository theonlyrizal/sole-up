"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import { listTaskBlocks } from "./queries";
import * as service from "./service";
import {
  createTimeBlockSchema,
  deleteTimeBlockOccurrenceSchema,
  editTimeBlockOccurrenceSchema,
  setTimeBlockStatusSchema,
  taskBlocksSchema,
  timeBlockIdSchema,
  updateTimeBlockSchema,
} from "./validation";

// Auth → validate → service (scoped to the user) → refresh the page's
// server-rendered data. Reads and previews change nothing, so they don't
// refresh.

/** "Block time": a one-off block for a task, or a series with a rule. */
export const createTimeBlock = authedAction(
  createTimeBlockSchema,
  async (input, { userId }) => {
    const block = await service.createTimeBlock(userId, input);
    refresh();
    return block;
  },
);

/** A one-off block's new times (a move, a resize or the form). */
export const updateTimeBlock = authedAction(
  updateTimeBlockSchema,
  async (input, { userId }) => {
    const block = await service.updateTimeBlock(userId, input);
    refresh();
    return block;
  },
);

/** A one-off block, or a whole series (the UI confirms first). */
export const deleteTimeBlock = authedAction(
  timeBlockIdSchema,
  async (input, { userId }) => {
    await service.deleteTimeBlock(userId, input);
    refresh();
  },
);

/** Changes one occurrence, it and the later ones, or the whole series. */
export const editTimeBlockOccurrence = authedAction(
  editTimeBlockOccurrenceSchema,
  async (input, { userId }) => {
    const result = await service.editTimeBlockOccurrence(userId, input);
    refresh();
    return result;
  },
);

/** Deletes occurrences; scope "following" is also "End series here". */
export const deleteTimeBlockOccurrence = authedAction(
  deleteTimeBlockOccurrenceSchema,
  async (input, { userId }) => {
    const result = await service.deleteTimeBlockOccurrence(userId, input);
    refresh();
    return result;
  },
);

/** Done, skipped or back to scheduled. Never changes the task. */
export const setTimeBlockStatus = authedAction(
  setTimeBlockStatusSchema,
  async (input, { userId }) => {
    await service.setTimeBlockStatus(userId, input);
    refresh();
  },
);

/** What an occurrence edit would drop, for the scope prompt. Changes nothing. */
export const previewTimeBlockOccurrenceEdit = authedAction(
  editTimeBlockOccurrenceSchema,
  (input, { userId }) => service.previewTimeBlockOccurrenceEdit(userId, input),
);

/** What an occurrence delete would drop, for the scope prompt. Changes nothing. */
export const previewTimeBlockOccurrenceDelete = authedAction(
  deleteTimeBlockOccurrenceSchema,
  (input, { userId }) =>
    service.previewTimeBlockOccurrenceDelete(userId, input),
);

/** A task's upcoming blocks, read when its dialog opens. */
export const getTaskBlocks = authedAction(
  taskBlocksSchema,
  (input, { userId }) => listTaskBlocks(userId, input.taskId),
);
