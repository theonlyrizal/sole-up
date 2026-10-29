import "server-only";

import { and, count, desc, eq } from "drizzle-orm";

import { documentsEqual, toBodyText } from "@/lib/notes/document";
import {
  NOTE_ARCHIVED,
  NOTE_CHANGED_ELSEWHERE,
  NOTE_LINKS_FULL,
  NOTE_LINKS_MAX,
  NOTE_UPDATED_EVENT_WINDOW_MS,
  type Note,
  type NoteContentField,
  type NoteLinkTargetType,
} from "@/lib/notes/note";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { isForeignKeyViolation } from "@/server/db/errors";
import {
  auditEvents,
  goals,
  noteGoals,
  notes,
  noteTasks,
  tasks,
} from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";

import type {
  LinkTargetInput,
  NoteIdInput,
  NoteLinkInput,
  SaveNoteInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A note,
// goal or task that is missing or belongs to someone else is the same
// NotFoundError. Each mutation writes its audit event in the same
// transaction, and a no-op writes none. A note's title, body and body text
// never go into an event or a log. Rules: ADR 0016.

/** Every column but `search_vector`, which only 8.4's search reads. */
const noteColumns = {
  id: notes.id,
  title: notes.title,
  body: notes.body,
  bodyText: notes.bodyText,
  archivedAt: notes.archivedAt,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

export function toNote(row: Note): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    bodyText: row.bodyText,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const ownNote = (userId: string, id: string) =>
  and(eq(notes.id, id), eq(notes.userId, userId));

/** Locks one of the user's notes for the rest of the transaction. */
async function findForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
): Promise<Note> {
  const [row] = await tx
    .select(noteColumns)
    .from(notes)
    .where(ownNote(userId, id))
    .for("update");
  if (!row) throw new NotFoundError();
  return row;
}

/** As findForUpdate, refusing an archived note: it is read-only. */
async function findWritableForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
): Promise<Note> {
  const row = await findForUpdate(tx, userId, id);
  if (row.archivedAt) throw new ConflictError(NOTE_ARCHIVED);
  return row;
}

/** When the note's latest `note.updated` event was recorded, if ever. */
async function lastUpdatedEventAt(
  tx: DbTransaction,
  userId: string,
  noteId: string,
): Promise<Date | null> {
  const [event] = await tx
    .select({ occurredAt: auditEvents.occurredAt })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        eq(auditEvents.entityType, "note"),
        eq(auditEvents.entityId, noteId),
        eq(auditEvents.eventType, "note.updated"),
      ),
    )
    .orderBy(desc(auditEvents.occurredAt))
    .limit(1);
  return event?.occurredAt ?? null;
}

/**
 * One autosave of the whole title and body.
 *
 * Without an `id`, it creates the note, but only once there is a title or
 * some body text: an empty first save returns null and writes nothing.
 * With `linkTo`, the new note is linked to that goal or task in the same
 * transaction, when the user still has it; otherwise it is created without
 * the link, so the text is never lost to a deleted target.
 *
 * With an `id`, it writes the title and body when either changed. A save
 * that changes nothing returns the note as it is, even from a stale
 * `expectedUpdatedAt`, since there is nothing to lose. A change from a
 * stale one is refused with a ConflictError, so one tab can't overwrite
 * another's newer text. `updated_at` always moves forward, so a token
 * from before this save can never match after it.
 */
export async function saveNote(
  userId: string,
  { id, linkTo, title, body, expectedUpdatedAt }: SaveNoteInput,
  now: Date = new Date(),
): Promise<Note | null> {
  const bodyText = toBodyText(body);

  if (id === undefined) {
    const fields: NoteContentField[] = [];
    if (title !== null) fields.push("title");
    if (bodyText !== "") fields.push("body");
    if (fields.length === 0) return null;

    return db.transaction(async (tx) => {
      const [created] = await tx
        .insert(notes)
        .values({
          userId,
          title,
          body,
          bodyText,
          createdAt: now,
          updatedAt: now,
        })
        .returning(noteColumns);
      if (!created) throw new Error("Note insert returned no row");

      await recordAudit(tx, {
        type: "note.created",
        userId,
        entityId: created.id,
        changes: { fields },
      });
      if (
        linkTo &&
        (await ownsTarget(tx, userId, linkTo.targetType, linkTo.targetId))
      ) {
        await insertLink(tx, userId, created.id, linkTo);
      }
      return toNote(created);
    });
  }

  return db.transaction(async (tx) => {
    const current = await findWritableForUpdate(tx, userId, id);
    const fields: NoteContentField[] = [];
    if (title !== current.title) fields.push("title");
    if (!documentsEqual(body, current.body)) fields.push("body");
    if (fields.length === 0) return toNote(current);

    if (current.updatedAt.getTime() !== expectedUpdatedAt?.getTime()) {
      throw new ConflictError(NOTE_CHANGED_ELSEWHERE);
    }

    const updatedAt = new Date(
      Math.max(now.getTime(), current.updatedAt.getTime() + 1),
    );
    const [updated] = await tx
      .update(notes)
      .set({ title, body, bodyText, updatedAt })
      .where(ownNote(userId, id))
      .returning(noteColumns);
    if (!updated) throw new NotFoundError();

    const lastEventAt = await lastUpdatedEventAt(tx, userId, id);
    if (
      !lastEventAt ||
      now.getTime() - lastEventAt.getTime() >= NOTE_UPDATED_EVENT_WINDOW_MS
    ) {
      await recordAudit(tx, {
        type: "note.updated",
        userId,
        entityId: id,
        changes: { fields },
      });
    }
    return toNote(updated);
  });
}

/**
 * Archives the note: it leaves the list and search and is read-only until
 * restored. Already archived is a no-op with no event.
 */
export async function archiveNote(
  userId: string,
  { id }: NoteIdInput,
  now: Date = new Date(),
): Promise<Note> {
  return db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    if (current.archivedAt) return toNote(current);

    const [updated] = await tx
      .update(notes)
      .set({ archivedAt: now })
      .where(ownNote(userId, id))
      .returning(noteColumns);
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "note.archived",
      userId,
      entityId: id,
      changes: { archivedAt: { from: null, to: now.toISOString() } },
    });
    return toNote(updated);
  });
}

/** Restores an archived note. Not archived is a no-op with no event. */
export async function restoreNote(
  userId: string,
  { id }: NoteIdInput,
): Promise<Note> {
  return db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    if (!current.archivedAt) return toNote(current);

    const [updated] = await tx
      .update(notes)
      .set({ archivedAt: null })
      .where(ownNote(userId, id))
      .returning(noteColumns);
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "note.restored",
      userId,
      entityId: id,
      changes: {
        archivedAt: { from: current.archivedAt.toISOString(), to: null },
      },
    });
    return toNote(updated);
  });
}

/**
 * Hard delete (ADR 0006), archived or not. Its links go by cascade; its
 * audit events are removed here.
 */
export async function deleteNote(
  userId: string,
  { id }: NoteIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(notes)
      .where(ownNote(userId, id))
      .returning({ id: notes.id });
    if (!deleted) throw new NotFoundError();

    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "note",
      entityId: id,
    });
  });
}

/** True when the user owns the goal or task, whatever its status. */
async function ownsTarget(
  tx: DbTransaction,
  userId: string,
  targetType: NoteLinkTargetType,
  targetId: string,
): Promise<boolean> {
  const table = targetType === "goal" ? goals : tasks;
  const [row] = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, targetId), eq(table.userId, userId)));
  return row !== undefined;
}

async function isLinked(
  tx: DbTransaction,
  noteId: string,
  targetType: NoteLinkTargetType,
  targetId: string,
): Promise<boolean> {
  const [row] =
    targetType === "goal"
      ? await tx
          .select({ id: noteGoals.id })
          .from(noteGoals)
          .where(
            and(eq(noteGoals.noteId, noteId), eq(noteGoals.goalId, targetId)),
          )
      : await tx
          .select({ id: noteTasks.id })
          .from(noteTasks)
          .where(
            and(eq(noteTasks.noteId, noteId), eq(noteTasks.taskId, targetId)),
          );
  return row !== undefined;
}

/** The note's goal and task links in all. */
async function linkCount(
  tx: DbTransaction,
  userId: string,
  noteId: string,
): Promise<number> {
  const [goalLinks] = await tx
    .select({ count: count() })
    .from(noteGoals)
    .where(and(eq(noteGoals.noteId, noteId), eq(noteGoals.userId, userId)));
  const [taskLinks] = await tx
    .select({ count: count() })
    .from(noteTasks)
    .where(and(eq(noteTasks.noteId, noteId), eq(noteTasks.userId, userId)));
  return (goalLinks?.count ?? 0) + (taskLinks?.count ?? 0);
}

/**
 * Links the note to one of the user's goals or tasks, of any status, up to
 * NOTE_LINKS_MAX links per note. An existing link is a no-op with no
 * event. Links don't move `updated_at`.
 */
export async function linkNote(
  userId: string,
  { id, targetType, targetId }: NoteLinkInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    // The note's row lock serializes its link writes, so the count holds.
    await findWritableForUpdate(tx, userId, id);
    if (!(await ownsTarget(tx, userId, targetType, targetId))) {
      throw new NotFoundError();
    }
    if (await isLinked(tx, id, targetType, targetId)) return;
    if ((await linkCount(tx, userId, id)) >= NOTE_LINKS_MAX) {
      throw new ConflictError(NOTE_LINKS_FULL);
    }
    await insertLink(tx, userId, id, { targetType, targetId });
  });
}

/**
 * Inserts one link and its `note.linked` event. The caller has checked the
 * target belongs to the user, that it isn't linked yet, and the limit.
 */
async function insertLink(
  tx: DbTransaction,
  userId: string,
  noteId: string,
  { targetType, targetId }: LinkTargetInput,
): Promise<void> {
  try {
    if (targetType === "goal") {
      await tx.insert(noteGoals).values({ userId, noteId, goalId: targetId });
    } else {
      await tx.insert(noteTasks).values({ userId, noteId, taskId: targetId });
    }
  } catch (error: unknown) {
    // The goal or task was deleted after the ownership check.
    const constraint =
      targetType === "goal"
        ? "note_goals_goal_id_user_id_fk"
        : "note_tasks_task_id_user_id_fk";
    if (isForeignKeyViolation(error, constraint)) throw new NotFoundError();
    throw error;
  }

  await recordAudit(tx, {
    type: "note.linked",
    userId,
    entityId: noteId,
    changes: { targetType, targetId },
  });
}

/** Removes a link. A target that isn't linked is a no-op with no event. */
export async function unlinkNote(
  userId: string,
  { id, targetType, targetId }: NoteLinkInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await findWritableForUpdate(tx, userId, id);
    const deleted =
      targetType === "goal"
        ? await tx
            .delete(noteGoals)
            .where(
              and(
                eq(noteGoals.noteId, id),
                eq(noteGoals.userId, userId),
                eq(noteGoals.goalId, targetId),
              ),
            )
            .returning({ id: noteGoals.id })
        : await tx
            .delete(noteTasks)
            .where(
              and(
                eq(noteTasks.noteId, id),
                eq(noteTasks.userId, userId),
                eq(noteTasks.taskId, targetId),
              ),
            )
            .returning({ id: noteTasks.id });
    if (deleted.length === 0) return;

    await recordAudit(tx, {
      type: "note.unlinked",
      userId,
      entityId: id,
      changes: { targetType, targetId },
    });
  });
}
