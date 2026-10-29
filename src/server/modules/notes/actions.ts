"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";
import { NotFoundError } from "@/server/errors";

import { getNote } from "./queries";
import * as service from "./service";
import { noteIdSchema, saveNoteSchema } from "./validation";

// Auth → validate → service (scoped to the user). A note's title and body
// are never logged.

/**
 * One autosave. Returns the note's ID and the `updatedAt` to send as the
 * next save's `expectedUpdatedAt`, or null for an empty first save, which
 * creates nothing. The body isn't sent back, and nothing is refreshed: the
 * editor already shows what was saved.
 */
export const saveNote = authedAction(
  saveNoteSchema,
  async (input, { userId }) => {
    const note = await service.saveNote(userId, input);
    return note && { id: note.id, updatedAt: note.updatedAt };
  },
);

/** The saved version, for an editor whose save met a conflict. */
export const loadNote = authedAction(
  noteIdSchema,
  async ({ id }, { userId }) => {
    const note = await getNote(userId, id);
    if (!note) throw new NotFoundError();
    return {
      id: note.id,
      title: note.title,
      body: note.body,
      updatedAt: note.updatedAt,
      archived: note.archivedAt !== null,
    };
  },
);

/** The caller leaves the note's page, so nothing is refreshed here. */
export const archiveNote = authedAction(
  noteIdSchema,
  async (input, { userId }) => {
    await service.archiveNote(userId, input);
  },
);

/** The note's page shows the editor again. */
export const restoreNote = authedAction(
  noteIdSchema,
  async (input, { userId }) => {
    await service.restoreNote(userId, input);
    refresh();
  },
);

/**
 * A confirmed hard delete (ADR 0006). The caller leaves the note's page,
 * so nothing is refreshed here.
 */
export const deleteNote = authedAction(
  noteIdSchema,
  async (input, { userId }) => {
    await service.deleteNote(userId, input);
  },
);
