import "server-only";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import type { TagSummary } from "@/lib/notes/tags";
import { db } from "@/server/db/client";
import { noteTags, tags } from "@/server/db/schema";

import { noteTagsOf } from "./service";

// Read models for tags (chunk 8.5). Every query is scoped by the user's
// ID: someone else's tag is null or absent, never an error that tells.

/** A tag with how many notes carry it, archived ones included. */
export type TagWithCount = TagSummary & { noteCount: number };

/** The user's tags by name ignoring case, with their note counts. */
export async function listTags(userId: string): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      noteCount: count(noteTags.id),
    })
    .from(tags)
    .leftJoin(
      noteTags,
      and(eq(noteTags.tagId, tags.id), eq(noteTags.userId, tags.userId)),
    )
    .where(eq(tags.userId, userId))
    .groupBy(tags.id)
    .orderBy(sql`lower(${tags.name})`, asc(tags.id));
  return rows.map((row) => ({ ...row, noteCount: Number(row.noteCount) }));
}

/** One of the user's tags, or null when missing or someone else's. */
export async function getTag(
  userId: string,
  id: string,
): Promise<TagSummary | null> {
  const [row] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)));
  return row ?? null;
}

/** The note's tags by name; none for a note that isn't the user's. */
export async function listNoteTags(
  userId: string,
  noteId: string,
): Promise<TagSummary[]> {
  return noteTagsOf(db, userId, noteId);
}

/** The tags of each of these notes of the user's, by name. */
export async function tagsByNote(
  userId: string,
  noteIds: readonly string[],
): Promise<Map<string, TagSummary[]>> {
  const result = new Map<string, TagSummary[]>();
  if (noteIds.length === 0) return result;
  const rows = await db
    .select({ noteId: noteTags.noteId, id: tags.id, name: tags.name })
    .from(noteTags)
    .innerJoin(
      tags,
      and(eq(tags.id, noteTags.tagId), eq(tags.userId, noteTags.userId)),
    )
    .where(
      and(eq(noteTags.userId, userId), inArray(noteTags.noteId, [...noteIds])),
    )
    .orderBy(sql`lower(${tags.name})`, asc(tags.id));
  for (const { noteId, id, name } of rows) {
    const list = result.get(noteId) ?? [];
    list.push({ id, name });
    result.set(noteId, list);
  }
  return result;
}
