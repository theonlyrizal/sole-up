import "server-only";

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { formatLocalDate, localDateOf } from "@/lib/dates";
import type { Note } from "@/lib/notes/note";
import { db } from "@/server/db/client";
import { notes } from "@/server/db/schema";
import { getUserPreferences } from "@/server/modules/preferences/service";

import { toNote } from "./service";

// Read models for the Notes pages (chunk 8.2). Every query is scoped by the
// user's ID; a note that is missing or someone else's is null.

/** A preview holds at most this many characters of the first line. */
export const NOTE_PREVIEW_MAX = 200;

/** A note as the lists show it, with its date ready to show. */
export type NoteListItem = {
  id: string;
  title: string | null;
  /** The first line of the body text, cut to NOTE_PREVIEW_MAX. */
  preview: string;
  updatedAt: Date;
  updatedLabel: string;
  archivedLabel: string | null;
};

/**
 * The user's notes: active ones most recently updated first, or archived
 * ones most recently archived first. Only the start of the body text is
 * read, never the body itself.
 */
export async function listNotes(
  userId: string,
  { archived }: { archived: boolean },
): Promise<NoteListItem[]> {
  const [preferences, rows] = await Promise.all([
    getUserPreferences(userId),
    db
      .select({
        id: notes.id,
        title: notes.title,
        preview: sql<string>`left(split_part(${notes.bodyText}, E'\\n', 1), ${NOTE_PREVIEW_MAX})`,
        updatedAt: notes.updatedAt,
        archivedAt: notes.archivedAt,
      })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          archived ? isNotNull(notes.archivedAt) : isNull(notes.archivedAt),
        ),
      )
      .orderBy(
        ...(archived ? [desc(notes.archivedAt)] : []),
        desc(notes.updatedAt),
        desc(notes.id),
      ),
  ]);
  const timeZone = preferences.timezone ?? "UTC";
  const dayOf = (instant: Date) =>
    formatLocalDate(localDateOf(instant, timeZone), preferences.locale);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    preview: row.preview,
    updatedAt: row.updatedAt,
    updatedLabel: dayOf(row.updatedAt),
    archivedLabel: row.archivedAt ? dayOf(row.archivedAt) : null,
  }));
}

/** One note for the editor or the read-only view, with its dates shown. */
export type NotePage = Note & {
  updatedLabel: string;
  archivedLabel: string | null;
};

export async function getNote(
  userId: string,
  id: string,
): Promise<NotePage | null> {
  const [preferences, [row]] = await Promise.all([
    getUserPreferences(userId),
    db
      .select({
        id: notes.id,
        title: notes.title,
        body: notes.body,
        bodyText: notes.bodyText,
        archivedAt: notes.archivedAt,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId))),
  ]);
  if (!row) return null;
  const timeZone = preferences.timezone ?? "UTC";
  const dayOf = (instant: Date) =>
    formatLocalDate(localDateOf(instant, timeZone), preferences.locale);
  return {
    ...toNote(row),
    updatedLabel: dayOf(row.updatedAt),
    archivedLabel: row.archivedAt ? dayOf(row.archivedAt) : null,
  };
}
