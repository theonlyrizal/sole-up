"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import { listNoteTags, listTags as listTagsQuery } from "./queries";
import * as service from "./service";
import {
  noteTagsQuerySchema,
  renameTagSchema,
  setNoteTagsSchema,
  tagIdInputSchema,
} from "./validation";

// Auth → validate → service (scoped to the user). A tag name is never
// logged.

/**
 * Sets a note's tags by name, creating any new ones, and returns them.
 * Nothing is refreshed: the editor shows the returned tags, and a refresh
 * could remount it while the note is being written.
 */
export const setNoteTags = authedAction(
  setNoteTagsSchema,
  async (input, { userId }) => service.setNoteTags(userId, input),
);

/** The editor's tags for a note. */
export const getNoteTags = authedAction(
  noteTagsQuerySchema,
  async ({ id }, { userId }) => listNoteTags(userId, id),
);

/** The user's tags, for the editor's suggestions. */
export const listTags = authedAction(
  noteTagsQuerySchema.omit({ id: true }),
  async (_input, { userId }) => listTagsQuery(userId),
);

/** Renames a tag from the Tags manager, which then shows the new name. */
export const renameTag = authedAction(
  renameTagSchema,
  async (input, { userId }) => {
    const tag = await service.renameTag(userId, input);
    refresh();
    return tag;
  },
);

/** Deletes a tag from the Tags manager; its notes are only untagged. */
export const deleteTag = authedAction(
  tagIdInputSchema,
  async (input, { userId }) => {
    await service.deleteTag(userId, input);
    refresh();
  },
);
