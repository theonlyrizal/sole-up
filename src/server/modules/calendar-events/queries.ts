import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import {
  agendaEnd,
  agendaEntries,
  type AgendaEntry,
  type AgendaRange,
} from "@/lib/agenda";
import type { GoalStatus } from "@/lib/goals";
import type { LifeAreaStatus } from "@/lib/life-areas";
import { db } from "@/server/db/client";
import { goals, lifeAreas } from "@/server/db/schema";
import {
  listAgendaTasks,
  type PlanTaskItem,
} from "@/server/modules/tasks/queries";

import { eventsBetween } from "./service";

// Read models for the calendar page. Every query is scoped to the user.

/**
 * The Agenda's rows for `range` (chunk 4.5): the user's events and
 * occurrences overlapping its local days in `timeZone` (the user's), and
 * their open tasks' plans and timed deadlines on those days.
 */
export async function listAgenda(
  userId: string,
  range: AgendaRange,
  timeZone: string,
): Promise<AgendaEntry<PlanTaskItem>[]> {
  const to = agendaEnd(range);
  const [events, tasks] = await Promise.all([
    eventsBetween(userId, {
      localStart: range.start,
      localEnd: to,
      tz: timeZone,
    }),
    listAgendaTasks(userId, { from: range.start, to, timeZone }),
  ]);
  return agendaEntries(events, tasks, range, timeZone);
}

/** What an event can link to: goals (with their area) and life areas. */
export type EventLinkOptions = {
  goals: {
    id: string;
    title: string;
    status: GoalStatus;
    lifeAreaId: string | null;
  }[];
  areas: { id: string; name: string; status: LifeAreaStatus }[];
};

const GOAL_STATUS_ORDER = sql`case ${goals.status}
  when 'active' then 0 when 'paused' then 1 when 'completed' then 2
  when 'dropped' then 3 else 4 end`;

/**
 * Every goal (live ones first) and every life area (active first). The
 * form offers the live ones, plus whatever the event already links to.
 */
export async function listEventLinkOptions(
  userId: string,
): Promise<EventLinkOptions> {
  const [goalRows, areaRows] = await Promise.all([
    db
      .select({
        id: goals.id,
        title: goals.title,
        status: goals.status,
        lifeAreaId: goals.lifeAreaId,
      })
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(GOAL_STATUS_ORDER, asc(goals.createdAt), asc(goals.id)),
    db
      .select({
        id: lifeAreas.id,
        name: lifeAreas.name,
        status: lifeAreas.status,
      })
      .from(lifeAreas)
      .where(eq(lifeAreas.userId, userId))
      .orderBy(
        sql`case when ${lifeAreas.status} = 'active' then 0 else 1 end`,
        asc(lifeAreas.sortOrder),
        asc(lifeAreas.createdAt),
      ),
  ]);
  return { goals: goalRows, areas: areaRows };
}
