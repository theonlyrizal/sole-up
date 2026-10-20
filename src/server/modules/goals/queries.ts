import "server-only";

import { and, asc, count, desc, eq, ne } from "drizzle-orm";

import { formatLocalDate, localDateOf } from "@/lib/dates";
import {
  GOAL_LIST_STATUSES,
  type Goal,
  type GoalListStatus,
} from "@/lib/goals";
import type { LifeArea } from "@/lib/life-areas";
import { db } from "@/server/db/client";
import { auditEvents, goals, lifeAreas } from "@/server/db/schema";
import { toLifeArea } from "@/server/modules/life-areas/service";
import { getUserPreferences } from "@/server/modules/preferences/service";

import { buildGoalHistory, type GoalHistoryEntry } from "./history";
import { toGoal } from "./service";

/** A goal as the list shows it, with its dates formatted for the user. */
export type GoalListItem = Goal & {
  startDateLabel: string | null;
  targetDateLabel: string | null;
};

/** One life area's goals, or the goals with no area (`area: null`). */
export type GoalGroup = {
  area: LifeArea | null;
  goals: GoalListItem[];
};

export type GoalsView = {
  status: GoalListStatus;
  /** How many goals each filter holds, for the filter labels. */
  counts: Record<GoalListStatus, number>;
  groups: GoalGroup[];
  /**
   * Every area, active first. The form offers the active ones, plus a
   * goal's current area if that one is archived.
   */
  areas: LifeArea[];
};

/**
 * The Goals page for one user and one status filter. Groups follow the
 * user's area order; an archived area still heads its own goals, after the
 * active areas; goals with no area come last.
 */
export async function getGoalsView(
  userId: string,
  status: GoalListStatus,
): Promise<GoalsView> {
  const [areaRows, goalRows, countRows, preferences] = await Promise.all([
    db
      .select()
      .from(lifeAreas)
      .where(eq(lifeAreas.userId, userId))
      .orderBy(asc(lifeAreas.sortOrder), asc(lifeAreas.createdAt)),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, status)))
      .orderBy(asc(goals.createdAt), asc(goals.id)),
    db
      .select({ status: goals.status, count: count() })
      .from(goals)
      .where(and(eq(goals.userId, userId), ne(goals.status, "archived")))
      .groupBy(goals.status),
    getUserPreferences(userId),
  ]);

  const areas = areaRows.map(toLifeArea);
  const format = (date: string | null) =>
    date ? formatLocalDate(date, preferences.locale) : null;
  const items = goalRows.map((row): GoalListItem => {
    const goal = toGoal(row);
    return {
      ...goal,
      startDateLabel: format(goal.startDate),
      targetDateLabel: format(goal.targetDate),
    };
  });

  const ordered = [
    ...areas.filter((area) => area.status === "active"),
    ...areas.filter((area) => area.status === "archived"),
  ];
  const groups: GoalGroup[] = ordered
    .map((area) => ({
      area,
      goals: items.filter((goal) => goal.lifeAreaId === area.id),
    }))
    .filter((group) => group.goals.length > 0);
  const unassigned = items.filter((goal) => goal.lifeAreaId === null);
  if (unassigned.length > 0) groups.push({ area: null, goals: unassigned });

  const counts = Object.fromEntries(
    GOAL_LIST_STATUSES.map((listStatus) => [
      listStatus,
      countRows.find((row) => row.status === listStatus)?.count ?? 0,
    ]),
  ) as Record<GoalListStatus, number>;

  return { status, counts, groups, areas: ordered };
}

export type GoalDetail = {
  goal: GoalListItem & { completedAtLabel: string | null };
  /** The goal's area, or null when it has none. */
  area: LifeArea | null;
  /** Every area, active first, for the edit form (as in `GoalsView`). */
  areas: LifeArea[];
  /** Newest first. Structured changes only, never content. */
  history: GoalHistoryEntry[];
};

/**
 * One of the user's goals with its history, or null when it is missing or
 * belongs to someone else (the page shows the same not-found for both).
 */
export async function getGoalDetail(
  userId: string,
  goalId: string,
): Promise<GoalDetail | null> {
  const [goalRows, areaRows, eventRows, preferences] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId))),
    db
      .select()
      .from(lifeAreas)
      .where(eq(lifeAreas.userId, userId))
      .orderBy(asc(lifeAreas.sortOrder), asc(lifeAreas.createdAt)),
    db
      .select({
        id: auditEvents.id,
        eventType: auditEvents.eventType,
        occurredAt: auditEvents.occurredAt,
        changes: auditEvents.changes,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, userId),
          eq(auditEvents.entityType, "goal"),
          eq(auditEvents.entityId, goalId),
        ),
      )
      .orderBy(desc(auditEvents.occurredAt)),
    getUserPreferences(userId),
  ]);
  const [row] = goalRows;
  if (!row) return null;

  const goal = toGoal(row);
  const { locale } = preferences;
  // The (app) layout asks for a time zone before any page renders; UTC only
  // covers a race with that confirmation.
  const timeZone = preferences.timezone ?? "UTC";
  const format = (date: string | null) =>
    date ? formatLocalDate(date, locale) : null;
  const areas = areaRows.map(toLifeArea);
  const ordered = [
    ...areas.filter((area) => area.status === "active"),
    ...areas.filter((area) => area.status === "archived"),
  ];

  return {
    goal: {
      ...goal,
      startDateLabel: format(goal.startDate),
      targetDateLabel: format(goal.targetDate),
      completedAtLabel: goal.completedAt
        ? formatLocalDate(localDateOf(goal.completedAt, timeZone), locale)
        : null,
    },
    area: areas.find((area) => area.id === goal.lifeAreaId) ?? null,
    areas: ordered,
    history: buildGoalHistory(eventRows, {
      locale,
      timeZone,
      areaNames: new Map(areas.map((area) => [area.id, area.name])),
    }),
  };
}
