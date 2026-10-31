import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { TAG_NAME_TAKEN, type TagSummary } from "@/lib/notes/tags";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { isUniqueViolation } from "@/server/db/errors";
import { noteTags, tags } from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import { findWritableForUpdate } from "@/server/modules/notes/service";

import type {
  RenameTagInput,
  SetNoteTagsInput,
  TagIdInput,
} from "./validation";

// Tags on notes (chunk 8.5, ADR 0016). Every function takes the user's ID
// and scopes each query by it: a note or tag that is missing or someone
// else's is the same NotFoundError, and note_tags' composite foreign keys
// refuse a cross-user pair on their own. Each change writes its audit
// event in the same transaction, a no-op writes none, and a tag name never
// goes into an event, an error message or a log.

/** The unique index on (user_id, lower(name)). */
const NAME_KEY = "tags_user_id_name_key";

const ownTag = (userId: string, id: string) =>
  and(eq(tags.id, id), eq(tags.userId, userId));

/**
 * The user's tag with this name ignoring case, created (`tag.created`)
 * when there is none. A tag created by a concurrent call is found, not
 * duplicated.
 */
async function findOrCreateTag(
  tx: DbTransaction,
  userId: string,
  name: string,
  now: Date,
): Promise<string> {
  const sameName = and(
    eq(tags.userId, userId),
    sql`lower(${tags.name}) = lower(${name})`,
  );
  const [existing] = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(sameName);
  if (existing) return existing.id;

  const [created] = await tx
    .insert(tags)
    .values({ userId, name, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning({ id: tags.id });
  if (created) {
    await recordAudit(tx, {
      type: "tag.created",
      userId,
      entityId: created.id,
      changes: {},
    });
    return created.id;
  }

  // Another transaction created it after the select above.
  const [raced] = await tx.select({ id: tags.id }).from(tags).where(sameName);
  if (!raced) throw new Error("Tag insert conflicted but no tag was found");
  return raced.id;
}

/** The note's tags, by name ignoring case. */
export async function noteTagsOf(
  tx: DbTransaction | typeof db,
  userId: string,
  noteId: string,
): Promise<TagSummary[]> {
  return tx
    .select({ id: tags.id, name: tags.name })
    .from(noteTags)
    .innerJoin(
      tags,
      and(eq(tags.id, noteTags.tagId), eq(tags.userId, noteTags.userId)),
    )
    .where(and(eq(noteTags.noteId, noteId), eq(noteTags.userId, userId)))
    .orderBy(sql`lower(${tags.name})`, asc(tags.id));
}

const sorted = (ids: Iterable<string>) => [...ids].sort();

/**
 * Sets the note's tags to exactly these names (already normalized, unique
 * ignoring case, at most NOTE_TAGS_MAX). A name matching one of the
 * user's tags ignoring case uses it; any other name creates a tag. Records
 * `note.tags_changed` with the tag IDs before and after, when they differ.
 * An archived note refuses. Tags don't move the note's `updated_at`.
 * Returns the note's tags.
 */
export async function setNoteTags(
  userId: string,
  { id, names }: SetNoteTagsInput,
  now: Date = new Date(),
): Promise<TagSummary[]> {
  return db.transaction(async (tx) => {
    // The note's row lock serializes its tag writes.
    await findWritableForUpdate(tx, userId, id);

    const wanted = new Set<string>();
    for (const name of names) {
      wanted.add(await findOrCreateTag(tx, userId, name, now));
    }

    const current = new Set(
      (
        await tx
          .select({ tagId: noteTags.tagId })
          .from(noteTags)
          .where(and(eq(noteTags.noteId, id), eq(noteTags.userId, userId)))
      ).map((row) => row.tagId),
    );
    const removed = [...current].filter((tagId) => !wanted.has(tagId));
    const added = [...wanted].filter((tagId) => !current.has(tagId));

    if (removed.length > 0 || added.length > 0) {
      if (removed.length > 0) {
        await tx
          .delete(noteTags)
          .where(
            and(
              eq(noteTags.noteId, id),
              eq(noteTags.userId, userId),
              inArray(noteTags.tagId, removed),
            ),
          );
      }
      if (added.length > 0) {
        await tx
          .insert(noteTags)
          .values(added.map((tagId) => ({ userId, noteId: id, tagId })));
      }
      await recordAudit(tx, {
        type: "note.tags_changed",
        userId,
        entityId: id,
        changes: { tagIds: { from: sorted(current), to: sorted(wanted) } },
      });
    }

    return noteTagsOf(tx, userId, id);
  });
}

/**
 * Renames one of the user's tags. A name another of their tags has,
 * ignoring case, is a ConflictError; the same name is a no-op with no
 * event, while a change of case alone is a rename.
 */
export async function renameTag(
  userId: string,
  { id, name }: RenameTagInput,
  now: Date = new Date(),
): Promise<TagSummary> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(ownTag(userId, id))
      .for("update");
    if (!current) throw new NotFoundError();
    if (current.name === name) return current;

    let renamed: TagSummary | undefined;
    try {
      [renamed] = await tx
        .update(tags)
        .set({ name, updatedAt: now })
        .where(ownTag(userId, id))
        .returning({ id: tags.id, name: tags.name });
    } catch (error: unknown) {
      // The whole transaction rolls back with it.
      if (isUniqueViolation(error, NAME_KEY)) {
        throw new ConflictError(TAG_NAME_TAKEN);
      }
      throw error;
    }
    if (!renamed) throw new NotFoundError();

    await recordAudit(tx, {
      type: "tag.renamed",
      userId,
      entityId: id,
      changes: {},
    });
    return renamed;
  });
}

/**
 * Hard delete (ADR 0006): the tag goes, its notes are untagged by cascade
 * and kept, and the tag's own events are removed. The notes record no
 * `note.tags_changed`, as a goal delete records no `note.unlinked`.
 */
export async function deleteTag(
  userId: string,
  { id }: TagIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(tags)
      .where(ownTag(userId, id))
      .returning({ id: tags.id });
    if (!deleted) throw new NotFoundError();

    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "tag",
      entityId: id,
    });
  });
}
