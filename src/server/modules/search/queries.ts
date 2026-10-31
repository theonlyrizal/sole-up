import "server-only";

import {
  and,
  desc,
  eq,
  isNull,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";

import { formatLocalDate, localDateOf } from "@/lib/dates";
import { GOAL_STATUS_LABELS } from "@/lib/goals";
import {
  HIGHLIGHT_START,
  HIGHLIGHT_STOP,
  SEARCH_GROUP_LIMIT,
} from "@/lib/search";
import { TASK_STATUS_LABELS } from "@/lib/task-list";
import type { Task } from "@/lib/tasks";
import { db } from "@/server/db/client";
import { goals, notes, tasks } from "@/server/db/schema";
import { hasTag } from "@/server/modules/notes/queries";
import { getUserPreferences } from "@/server/modules/preferences/service";
import { toTask } from "@/server/modules/tasks/service";

// Full-text search (chunk 8.4, ADR 0016): the user's notes (not archived),
// plus goal and task titles of every status, with Postgres's `english`
// configuration. Each of the three queries is scoped by the user's ID.
//
// - Notes match on the generated `search_vector` (title weighted above
//   body); goals and tasks on `to_tsvector('english', title)`, the exact
//   expression of their GIN indexes (migration 0019), so the index applies.
// - Each group is ranked by `ts_rank_cd`, then most recently updated, up to
//   SEARCH_GROUP_LIMIT.
// - Highlights come from `ts_headline` with the private delimiters in
//   src/lib/search.ts, never HTML. `body_text` holds no control characters
//   (src/lib/notes/document.ts), but titles may, so the delimiters are
//   removed from a title before it is highlighted.
// - The search terms are never logged.

/** `ts_headline` options for a title: the whole title, matches marked. */
const TITLE_HEADLINE_OPTIONS = `StartSel="${HIGHLIGHT_START}", StopSel="${HIGHLIGHT_STOP}", HighlightAll=true`;

/** `ts_headline` options for a note's text: up to two short excerpts. */
const EXCERPT_HEADLINE_OPTIONS = `StartSel="${HIGHLIGHT_START}", StopSel="${HIGHLIGHT_STOP}", MaxFragments=2, MinWords=8, MaxWords=24, FragmentDelimiter=" … "`;

const DELIMITERS = HIGHLIGHT_START + HIGHLIGHT_STOP;

/** A note that matched, its title and excerpt with highlight delimiters. */
export type NoteSearchHit = {
  id: string;
  /** The highlighted title, or null for an untitled note. */
  titleHighlight: string | null;
  /** Excerpts of the body text around the matches, or its start. */
  excerptHighlight: string;
  updatedLabel: string;
};

export type GoalSearchHit = {
  id: string;
  titleHighlight: string;
  statusLabel: string;
};

/** A task that matched, whole, so the search page can open its dialog. */
export type TaskSearchHit = {
  task: Task;
  titleHighlight: string;
  statusLabel: string;
};

export type SearchResults =
  /** The query held only stop words ("the", "and"), so nothing was run. */
  | { status: "nothing_to_search" }
  | {
      status: "results";
      notes: NoteSearchHit[];
      goals: GoalSearchHit[];
      tasks: TaskSearchHit[];
    };

function toTsQuery(query: string): SQL {
  return sql`websearch_to_tsquery('english', ${query}::text)`;
}

function titleHeadline(title: SQLWrapper, tsQuery: SQL): SQL {
  return sql`ts_headline('english', translate(${title}, ${DELIMITERS}::text, ''), ${tsQuery}, ${TITLE_HEADLINE_OPTIONS}::text)`;
}

function titleVector(title: SQLWrapper): SQL {
  return sql`to_tsvector('english', ${title})`;
}

/**
 * Searches the user's notes, goals and tasks for an already trimmed,
 * non-empty query, in `websearch_to_tsquery` syntax (quotes, `OR`,
 * `-word`). With `tagId` (chunk 8.5), the notes group holds only notes with
 * that tag of the user's; goals and tasks aren't tagged, so they are
 * unchanged.
 */
export async function search(
  userId: string,
  query: string,
  { tagId }: { tagId?: string } = {},
): Promise<SearchResults> {
  const tsQuery = toTsQuery(query);
  const {
    rows: [parsed],
  } = await db.execute<{ nodes: number }>(
    sql`select numnode(${tsQuery}) as nodes`,
  );
  if (!parsed || Number(parsed.nodes) === 0) {
    return { status: "nothing_to_search" };
  }

  const [preferences, noteRows, goalRows, taskRows] = await Promise.all([
    getUserPreferences(userId),
    db
      .select({
        id: notes.id,
        titleHighlight: sql<
          string | null
        >`case when ${notes.title} is null then null else ${titleHeadline(notes.title, tsQuery)} end`,
        excerptHighlight: sql<string>`ts_headline('english', ${notes.bodyText}, ${tsQuery}, ${EXCERPT_HEADLINE_OPTIONS}::text)`,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          isNull(notes.archivedAt),
          tagId === undefined ? undefined : hasTag(userId, tagId),
          sql`${notes.searchVector} @@ ${tsQuery}`,
        ),
      )
      .orderBy(
        sql`ts_rank_cd(${notes.searchVector}, ${tsQuery}) desc`,
        desc(notes.updatedAt),
        desc(notes.id),
      )
      .limit(SEARCH_GROUP_LIMIT),
    db
      .select({
        id: goals.id,
        status: goals.status,
        titleHighlight: sql<string>`${titleHeadline(goals.title, tsQuery)}`,
      })
      .from(goals)
      .where(
        and(
          eq(goals.userId, userId),
          sql`${titleVector(goals.title)} @@ ${tsQuery}`,
        ),
      )
      .orderBy(
        sql`ts_rank_cd(${titleVector(goals.title)}, ${tsQuery}) desc`,
        desc(goals.updatedAt),
        desc(goals.id),
      )
      .limit(SEARCH_GROUP_LIMIT),
    db
      .select({
        task: tasks,
        titleHighlight: sql<string>`${titleHeadline(tasks.title, tsQuery)}`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          sql`${titleVector(tasks.title)} @@ ${tsQuery}`,
        ),
      )
      .orderBy(
        sql`ts_rank_cd(${titleVector(tasks.title)}, ${tsQuery}) desc`,
        desc(tasks.updatedAt),
        desc(tasks.id),
      )
      .limit(SEARCH_GROUP_LIMIT),
  ]);

  const timeZone = preferences.timezone ?? "UTC";
  return {
    status: "results",
    notes: noteRows.map((row) => ({
      id: row.id,
      titleHighlight: row.titleHighlight,
      excerptHighlight: row.excerptHighlight,
      updatedLabel: formatLocalDate(
        localDateOf(row.updatedAt, timeZone),
        preferences.locale,
      ),
    })),
    goals: goalRows.map((row) => ({
      id: row.id,
      titleHighlight: row.titleHighlight,
      statusLabel: GOAL_STATUS_LABELS[row.status],
    })),
    tasks: taskRows.map((row) => ({
      task: toTask(row.task),
      titleHighlight: row.titleHighlight,
      statusLabel: TASK_STATUS_LABELS[row.task.status],
    })),
  };
}
