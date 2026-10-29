import { z } from "zod";

import { noteDocumentSchema } from "@/lib/notes/document";
import {
  NOTE_LINK_QUERY_MAX,
  NOTE_LINK_TARGET_TYPES,
  NOTE_TITLE_MAX,
} from "@/lib/notes/note";

// Input for the notes service (ADR 0016). The body is checked against the
// shared allowlist in src/lib/notes/document.ts; whether the note is
// archived, stale or full of links depends on the stored row, so the
// service checks those.

const idSchema = z.uuid("Choose a note.");

/** Shown when a save carries no usable `expectedUpdatedAt`. */
export const EXPECTED_UPDATED_AT_INVALID =
  "Reload this note before saving again.";

/** Shown when a link names no goal or task, or an unknown kind of target. */
export const LINK_TARGET_INVALID = "Choose a goal or a task.";

/** `linkTo` belongs to a note's first save; later links use linkNote. */
export const LINK_ON_CREATE_ONLY = "Link a saved note from its Linked to list.";

/**
 * The `updated_at` a save started from: null for a note not saved yet,
 * otherwise the instant the editor last read, as a Date or an ISO string.
 */
const expectedUpdatedAtSchema = z
  .union(
    [
      z.date(EXPECTED_UPDATED_AT_INVALID),
      z.iso.datetime({ offset: true, error: EXPECTED_UPDATED_AT_INVALID }),
    ],
    { error: EXPECTED_UPDATED_AT_INVALID },
  )
  .transform((value) => new Date(value))
  .refine(
    (value) => !Number.isNaN(value.getTime()),
    EXPECTED_UPDATED_AT_INVALID,
  )
  .nullable();

/** A goal or task a note links to. */
export const linkTargetSchema = z.strictObject({
  targetType: z.enum(NOTE_LINK_TARGET_TYPES, { error: LINK_TARGET_INVALID }),
  targetId: z.uuid(LINK_TARGET_INVALID),
});
export type LinkTargetInput = z.output<typeof linkTargetSchema>;

/**
 * One autosave: the whole title and body. Without an `id` it is a note's
 * first save, so `expectedUpdatedAt` must be null; with one, it must be the
 * `updated_at` the editor started from. `linkTo` (a first save only) links
 * the new note as it is created: "New note" from a goal or task.
 */
export const saveNoteSchema = z
  .strictObject({
    id: idSchema.optional(),
    linkTo: linkTargetSchema.optional(),
    title: z
      .string()
      .trim()
      .max(NOTE_TITLE_MAX, `Keep the title to ${NOTE_TITLE_MAX} characters.`)
      .nullable()
      .optional()
      .transform((value) => value || null),
    body: noteDocumentSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .refine(
    (input) => (input.id === undefined) === (input.expectedUpdatedAt === null),
    { message: EXPECTED_UPDATED_AT_INVALID, path: ["expectedUpdatedAt"] },
  )
  .refine((input) => input.id === undefined || input.linkTo === undefined, {
    message: LINK_ON_CREATE_ONLY,
    path: ["linkTo"],
  });
export type SaveNoteInput = z.output<typeof saveNoteSchema>;

export const noteIdSchema = z.strictObject({ id: idSchema });
export type NoteIdInput = z.output<typeof noteIdSchema>;

export const noteLinkSchema = linkTargetSchema.extend({ id: idSchema });
export type NoteLinkInput = z.output<typeof noteLinkSchema>;

/** What a link picker searches for; empty lists the most recent. */
const linkQuerySchema = z
  .string()
  .trim()
  .max(
    NOTE_LINK_QUERY_MAX,
    `Keep the search to ${NOTE_LINK_QUERY_MAX} characters.`,
  );

/** The note editor's picker: the user's goals and tasks. */
export const findLinkTargetsSchema = z.strictObject({
  query: linkQuerySchema,
});
export type FindLinkTargetsInput = z.output<typeof findLinkTargetsSchema>;

/** "Link a note" on a goal or task: notes not linked to it yet. */
export const findNotesToLinkSchema = linkTargetSchema.extend({
  query: linkQuerySchema,
});
export type FindNotesToLinkInput = z.output<typeof findNotesToLinkSchema>;
