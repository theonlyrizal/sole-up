// Note constants and types shared by the server (schema, validation,
// service, audit) and the UI. Pure: no server-only imports.
// The rules come from docs/decisions/0016-notes-rich-text-links-search-tags.md.

import type { NoteDocument } from "./document";

/** A title holds up to this many characters; an empty title is null. */
export const NOTE_TITLE_MAX = 200;

/** `body_text`, derived from the body, holds up to this many characters. */
export const NOTE_BODY_TEXT_MAX = 100_000;

/** A note links to at most this many goals and tasks in all. */
export const NOTE_LINKS_MAX = 50;

/**
 * Within this long of a note's latest `note.updated` event, a save records
 * no new one: the event marks an editing session, not each autosave.
 */
export const NOTE_UPDATED_EVENT_WINDOW_MS = 10 * 60 * 1000;

/** The content fields a save can change, as `note.updated` names them. */
export const NOTE_CONTENT_FIELDS = ["title", "body"] as const;
export type NoteContentField = (typeof NOTE_CONTENT_FIELDS)[number];

/** What a note can link to (ADR 0016 "Links"). */
export const NOTE_LINK_TARGET_TYPES = ["goal", "task"] as const;
export type NoteLinkTargetType = (typeof NOTE_LINK_TARGET_TYPES)[number];

/** Shown when a save starts from an `updated_at` that is no longer current. */
export const NOTE_CHANGED_ELSEWHERE = "This note changed somewhere else.";

/** Shown when a write reaches an archived note. */
export const NOTE_ARCHIVED = "Restore this note to change it.";

/** Shown when a link would take a note past NOTE_LINKS_MAX. */
export const NOTE_LINKS_FULL = `A note can link to up to ${NOTE_LINKS_MAX} goals and tasks.`;

export type Note = {
  id: string;
  title: string | null;
  body: NoteDocument;
  bodyText: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
