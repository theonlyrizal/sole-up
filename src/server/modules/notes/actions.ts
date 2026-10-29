"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";
import { NotFoundError } from "@/server/errors";

import {
  findLinkTargets as findLinkTargetsQuery,
  findNotesToLink as findNotesToLinkQuery,
  getNote,
  listLinkedNotes,
  listNoteLinks,
} from "./queries";
import * as service from "./service";
import {
  findLinkTargetsSchema,
  findNotesToLinkSchema,
  linkTargetSchema,
  noteIdSchema,
  noteLinkSchema,
  saveNoteSchema,
} from "./validation";

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

// Links (chunk 8.3). Linking and unlinking refresh nothing: the editor and
// the task dialog read their lists again, and the goal page refreshes
// itself, so a note being written is never re-rendered under the editor.

/** Links a note to one of the user's goals or tasks. */
export const linkNote = authedAction(
  noteLinkSchema,
  async (input, { userId }) => {
    await service.linkNote(userId, input);
  },
);

export const unlinkNote = authedAction(
  noteLinkSchema,
  async (input, { userId }) => {
    await service.unlinkNote(userId, input);
  },
);

/** The note editor's "Linked to" list. */
export const getNoteLinks = authedAction(
  noteIdSchema,
  async ({ id }, { userId }) => listNoteLinks(userId, id),
);

/**
 * The note editor's picker. A Server Action, so the search never goes into
 * a URL or a log.
 */
export const findLinkTargets = authedAction(
  findLinkTargetsSchema,
  async ({ query }, { userId }) => findLinkTargetsQuery(userId, query),
);

/** A task dialog's "Linked notes" list. */
export const getLinkedNotes = authedAction(
  linkTargetSchema,
  async (input, { userId }) => listLinkedNotes(userId, input),
);

/** "Link a note" on a goal or task. */
export const findNotesToLink = authedAction(
  findNotesToLinkSchema,
  async (input, { userId }) => findNotesToLinkQuery(userId, input),
);
