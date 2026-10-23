import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { groupEventsByDay, type EventDay } from "@/lib/calendar-list";
import { addDays, type LocalDate } from "@/lib/dates";
import type { GoalStatus } from "@/lib/goals";
import type { LifeAreaStatus } from "@/lib/life-areas";
import { db } from "@/server/db/client";
import { goals, lifeAreas } from "@/server/db/schema";

import { eventsBetween } from "./service";

// Read models for the calendar page. Every query is scoped to the user.

/** How many days the calendar page lists, today included (until 4.5). */
export const CALENDAR_LIST_DAYS = 30;

/**
 * The user's events and occurrences from `today` through the next
 * CALENDAR_LIST_DAYS - 1 days, grouped by their local day in `timeZone`.
 */
export async function listUpcomingEvents(
  userId: string,
  { today, timeZone }: { today: LocalDate; timeZone: string },
): Promise<EventDay[]> {
  const events = await eventsBetween(userId, {
    localStart: today,
    localEnd: addDays(today, CALENDAR_LIST_DAYS),
    tz: timeZone,
  });
  return groupEventsByDay(events, today, timeZone);
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
