import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { formatLocalDate, localDateOf } from "@/lib/dates";
import { GOAL_STATUS_LABELS, type GoalStatus } from "@/lib/goals";
import type { Note, NoteLinkTargetType } from "@/lib/notes/note";
import { TASK_STATUS_LABELS } from "@/lib/task-list";
import type { TaskStatus } from "@/lib/tasks";
import { db } from "@/server/db/client";
import type { TagSummary } from "@/lib/notes/tags";
import {
  goals,
  noteGoals,
  notes,
  noteTags,
  noteTasks,
  tasks,
} from "@/server/db/schema";
import { getUserPreferences } from "@/server/modules/preferences/service";
import { tagsByNote } from "@/server/modules/tags/queries";

import { toNote } from "./service";

// Read models for the Notes pages (chunk 8.2) and note links (chunk 8.3).
// Every query is scoped by the user's ID: a note that is missing or someone
// else's is null, and someone else's goal or task has no links.

/** A preview holds at most this many characters of the first line. */
export const NOTE_PREVIEW_MAX = 200;

/** The first line of a note's body text, cut to NOTE_PREVIEW_MAX, in SQL. */
const notePreview = sql<string>`left(split_part(${notes.bodyText}, E'\\n', 1), ${NOTE_PREVIEW_MAX})`;

/** A note as the lists show it, with its date ready to show. */
export type NoteListItem = {
  id: string;
  title: string | null;
  /** The first line of the body text, cut to NOTE_PREVIEW_MAX. */
  preview: string;
  updatedAt: Date;
  updatedLabel: string;
  archivedLabel: string | null;
  /** The note's tags by name (chunk 8.5). */
  tags: TagSummary[];
};

/**
 * The user's notes: active ones most recently updated first, or archived
 * ones most recently archived first. Only the start of the body text is
 * read, never the body itself. With `tagId`, only notes with that tag of
 * the user's (none for someone else's tag).
 */
export async function listNotes(
  userId: string,
  { archived, tagId }: { archived: boolean; tagId?: string },
): Promise<NoteListItem[]> {
  const [preferences, rows] = await Promise.all([
    getUserPreferences(userId),
    db
      .select({
        id: notes.id,
        title: notes.title,
        preview: notePreview,
        updatedAt: notes.updatedAt,
        archivedAt: notes.archivedAt,
      })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          archived ? isNotNull(notes.archivedAt) : isNull(notes.archivedAt),
          tagId === undefined ? undefined : hasTag(userId, tagId),
        ),
      )
      .orderBy(
        ...(archived ? [desc(notes.archivedAt)] : []),
        desc(notes.updatedAt),
        desc(notes.id),
      ),
  ]);
  const tagsOf = await tagsByNote(
    userId,
    rows.map((row) => row.id),
  );
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
    tags: tagsOf.get(row.id) ?? [],
  }));
}

/**
 * True for a note carrying the user's tag `tagId` (chunk 8.5). Scoped by
 * the user's ID, so someone else's tag matches nothing.
 */
export function hasTag(userId: string, tagId: string): SQL {
  return exists(
    db
      .select({ id: noteTags.id })
      .from(noteTags)
      .where(
        and(
          eq(noteTags.noteId, notes.id),
          eq(noteTags.userId, userId),
          eq(noteTags.tagId, tagId),
        ),
      ),
  );
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

/** A link picker shows at most this many results per group. */
export const LINK_PICKER_LIMIT = 20;

/** A goal or task a note links to, or could, with its status shown. */
export type LinkTarget = {
  targetType: NoteLinkTargetType;
  targetId: string;
  title: string;
  statusLabel: string;
};

const goalTarget = (row: {
  id: string;
  title: string;
  status: GoalStatus;
}): LinkTarget => ({
  targetType: "goal",
  targetId: row.id,
  title: row.title,
  statusLabel: GOAL_STATUS_LABELS[row.status],
});

const taskTarget = (row: {
  id: string;
  title: string;
  status: TaskStatus;
}): LinkTarget => ({
  targetType: "task",
  targetId: row.id,
  title: row.title,
  statusLabel: TASK_STATUS_LABELS[row.status],
});

/** A substring pattern that matches `%`, `_` and `\` in the query literally. */
function containing(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * The goals and tasks a note links to: goals, then tasks, each in the
 * order they were linked. Every status, as links allow (ADR 0016).
 */
export async function listNoteLinks(
  userId: string,
  noteId: string,
): Promise<LinkTarget[]> {
  const [goalRows, taskRows] = await Promise.all([
    db
      .select({ id: goals.id, title: goals.title, status: goals.status })
      .from(noteGoals)
      .innerJoin(
        goals,
        and(eq(goals.id, noteGoals.goalId), eq(goals.userId, userId)),
      )
      .where(and(eq(noteGoals.noteId, noteId), eq(noteGoals.userId, userId)))
      .orderBy(asc(noteGoals.createdAt), asc(noteGoals.id)),
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(noteTasks)
      .innerJoin(
        tasks,
        and(eq(tasks.id, noteTasks.taskId), eq(tasks.userId, userId)),
      )
      .where(and(eq(noteTasks.noteId, noteId), eq(noteTasks.userId, userId)))
      .orderBy(asc(noteTasks.createdAt), asc(noteTasks.id)),
  ]);
  return [...goalRows.map(goalTarget), ...taskRows.map(taskTarget)];
}

/**
 * The note editor's picker: the user's goals and tasks, every status,
 * whose title contains the query (ignoring case), most recently updated
 * first. An empty query lists the most recently updated.
 */
export async function findLinkTargets(
  userId: string,
  query: string,
): Promise<{ goals: LinkTarget[]; tasks: LinkTarget[] }> {
  const pattern = containing(query);
  const [goalRows, taskRows] = await Promise.all([
    db
      .select({ id: goals.id, title: goals.title, status: goals.status })
      .from(goals)
      .where(
        and(
          eq(goals.userId, userId),
          query ? ilike(goals.title, pattern) : undefined,
        ),
      )
      .orderBy(desc(goals.updatedAt), desc(goals.id))
      .limit(LINK_PICKER_LIMIT),
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          query ? ilike(tasks.title, pattern) : undefined,
        ),
      )
      .orderBy(desc(tasks.updatedAt), desc(tasks.id))
      .limit(LINK_PICKER_LIMIT),
  ]);
  return { goals: goalRows.map(goalTarget), tasks: taskRows.map(taskTarget) };
}

/** One of the user's goals or tasks as a link target, or null. */
export async function getLinkTarget(
  userId: string,
  targetType: NoteLinkTargetType,
  targetId: string,
): Promise<LinkTarget | null> {
  if (targetType === "goal") {
    const [row] = await db
      .select({ id: goals.id, title: goals.title, status: goals.status })
      .from(goals)
      .where(and(eq(goals.id, targetId), eq(goals.userId, userId)));
    return row ? goalTarget(row) : null;
  }
  const [row] = await db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.id, targetId), eq(tasks.userId, userId)));
  return row ? taskTarget(row) : null;
}

/** A note as a goal's or task's notes section lists it. */
export type LinkedNoteItem = {
  id: string;
  title: string | null;
  updatedAt: Date;
  updatedLabel: string;
};

export type LinkedNotes = {
  /** Linked notes that aren't archived, most recently updated first. */
  notes: LinkedNoteItem[];
  /** Every linked note, archived too: what a delete would unlink. */
  linkCount: number;
};

/** The link table and its target column for one kind of target. */
function linkTable(targetType: NoteLinkTargetType) {
  return targetType === "goal"
    ? { table: noteGoals, target: noteGoals.goalId }
    : { table: noteTasks, target: noteTasks.taskId };
}

/**
 * The notes linked to one of the user's goals or tasks. Someone else's
 * goal or task has none.
 */
export async function listLinkedNotes(
  userId: string,
  {
    targetType,
    targetId,
  }: { targetType: NoteLinkTargetType; targetId: string },
): Promise<LinkedNotes> {
  const { table, target } = linkTable(targetType);
  const [preferences, rows] = await Promise.all([
    getUserPreferences(userId),
    db
      .select({
        id: notes.id,
        title: notes.title,
        updatedAt: notes.updatedAt,
        archivedAt: notes.archivedAt,
      })
      .from(table)
      .innerJoin(
        notes,
        and(eq(notes.id, table.noteId), eq(notes.userId, userId)),
      )
      .where(and(eq(target, targetId), eq(table.userId, userId)))
      .orderBy(desc(notes.updatedAt), desc(notes.id)),
  ]);
  const timeZone = preferences.timezone ?? "UTC";
  return {
    notes: rows
      .filter((row) => row.archivedAt === null)
      .map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt,
        updatedLabel: formatLocalDate(
          localDateOf(row.updatedAt, timeZone),
          preferences.locale,
        ),
      })),
    linkCount: rows.length,
  };
}

/**
 * How many notes, archived too, link to each of the user's goals or tasks,
 * for delete confirmations. IDs with none are absent.
 */
export async function countLinkedNotes(
  userId: string,
  targetType: NoteLinkTargetType,
  targetIds: string[],
): Promise<Map<string, number>> {
  if (targetIds.length === 0) return new Map();
  const { table, target } = linkTable(targetType);
  const rows = await db
    .select({ targetId: target, count: count() })
    .from(table)
    .where(and(eq(table.userId, userId), inArray(target, targetIds)))
    .groupBy(target);
  return new Map(rows.map((row) => [row.targetId, row.count]));
}

/**
 * "Link a note" on a goal or task: the user's notes that aren't archived
 * or linked to it yet, whose title or text contains the query (ignoring
 * case), most recently updated first. An empty query lists the most recent.
 */
export async function findNotesToLink(
  userId: string,
  {
    targetType,
    targetId,
    query,
  }: { targetType: NoteLinkTargetType; targetId: string; query: string },
): Promise<Omit<NoteListItem, "tags">[]> {
  const { table, target } = linkTable(targetType);
  const pattern = containing(query);
  const [preferences, rows] = await Promise.all([
    getUserPreferences(userId),
    db
      .select({
        id: notes.id,
        title: notes.title,
        preview: notePreview,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          isNull(notes.archivedAt),
          query
            ? or(ilike(notes.title, pattern), ilike(notes.bodyText, pattern))
            : undefined,
          notExists(
            db
              .select({ id: table.id })
              .from(table)
              .where(
                and(
                  eq(table.noteId, notes.id),
                  eq(table.userId, userId),
                  eq(target, targetId),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(notes.updatedAt), desc(notes.id))
      .limit(LINK_PICKER_LIMIT),
  ]);
  const timeZone = preferences.timezone ?? "UTC";
  return rows.map((row) => ({
    ...row,
    updatedLabel: formatLocalDate(
      localDateOf(row.updatedAt, timeZone),
      preferences.locale,
    ),
    archivedLabel: null,
  }));
}
