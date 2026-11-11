import { createHash } from "node:crypto";

import { addDays, type LocalDate, startOfWeek } from "@/lib/dates";
import { DEFAULT_TASK_LIST_FILTERS } from "@/lib/task-list";
import { todayClock } from "@/lib/today";
import { upcomingWindow } from "@/lib/upcoming";
import { AUDIT_EVENTS } from "@/server/audit/types";
import { db } from "@/server/db/client";
import {
  listAgenda,
  listCalendarGrid,
  listDaySchedule,
  listSchedule,
  listTodayTimeline,
} from "@/server/modules/calendar-events/queries";
import {
  getArchivedGoals,
  getGoalDetail,
  getGoalsView,
} from "@/server/modules/goals/queries";
import { getTodayHabits, getTrackView } from "@/server/modules/habits/queries";
import {
  deadlinesNextSevenDays,
  habitsSummary,
  listGoalsWithoutNextAction,
  nextCommitment,
  todayTaskCounts,
} from "@/server/modules/metrics/home";
import {
  goalInactivityMetric,
  habitConsistencyTrendMetric,
  nextWeekWorkloadMetric,
  overdueTrendMetric,
} from "@/server/modules/metrics/insights";
import { weeklySummary } from "@/server/modules/metrics/review";
import { listNotes } from "@/server/modules/notes/queries";
import { search } from "@/server/modules/search/queries";
import {
  listInboxTasks,
  listPlanTasks,
  listTodaySuggestions,
  listTodayTasks,
  listUpcomingTasks,
} from "@/server/modules/tasks/queries";
import {
  getReviewHistory,
  getReviewPage,
} from "@/server/modules/weekly-reviews/queries";

type CapturedQuery = { views: string[]; sql: string; params: unknown[] };
type Plan = {
  "Execution Time": number;
  "Planning Time": number;
  Plan: Record<string, unknown>;
};

/** Capture the exact SQL and binds issued by production read models. */
export async function measure(asOf: string) {
  const pool = db.$client;
  const originalQuery = pool.query;
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(107, 1)");
    const { rows: users } = await pool.query<{ id: string; as_of: string }>(
      "SELECT id, updated_at::date::text AS as_of FROM users WHERE email = 'performance-1@example.invalid'",
    );
    if (!users[0]) throw new Error("Run db:seed:performance first.");
    if (users[0].as_of !== asOf) {
      throw new Error("Use the same --as-of date for seeding and measuring.");
    }
    const userId = users[0].id;
    const { rows: events } = await pool.query<{
      event_type: keyof typeof AUDIT_EVENTS;
      changes: unknown;
    }>("SELECT event_type, changes FROM audit_events WHERE user_id = $1", [
      userId,
    ]);
    for (const event of events) {
      AUDIT_EVENTS[event.event_type].changes.parse(event.changes);
    }
    const { rows: goals } = await pool.query<{ id: string }>(
      "SELECT id FROM goals WHERE user_id = $1 AND status = 'active' ORDER BY id LIMIT 1",
      [userId],
    );
    const { rows: tags } = await pool.query<{ id: string }>(
      "SELECT id FROM tags WHERE user_id = $1 ORDER BY id LIMIT 1",
      [userId],
    );
    const queries = new Map<string, CapturedQuery>();
    let view = "";
    Object.defineProperty(pool, "query", {
      configurable: true,
      writable: true,
      value: (...args: unknown[]) => {
        const config = args[0] as string | { text: string };
        const sql = typeof config === "string" ? config : config.text;
        // Preferences first ensures its row with INSERT ... DO NOTHING.
        // Let read models initialize normally, and EXPLAIN only their SELECTs.
        if (!/^\s*select\b/i.test(sql)) {
          return Reflect.apply(originalQuery, pool, args);
        }
        const params = (args[1] ?? []) as unknown[];
        const key = createHash("sha256")
          .update(sql + JSON.stringify(params))
          .digest("hex");
        const existing = queries.get(key);
        if (existing) {
          if (!existing.views.includes(view)) existing.views.push(view);
        } else {
          queries.set(key, { views: [view], sql, params });
        }
        return Reflect.apply(originalQuery, pool, args);
      },
    });

    const timeZone = "Asia/Dhaka";
    const now = new Date(`${asOf}T17:59:59.000Z`);
    const clock = todayClock(timeZone, now);
    const weekStart = 1 as const;
    const week = startOfWeek(clock.today, weekStart);
    const context = { userId, clock, timeZone, weekStart };
    const views: [string, () => Promise<unknown>][] = [
      [
        "Home",
        () =>
          Promise.all([
            todayTaskCounts(userId, clock, timeZone),
            listGoalsWithoutNextAction(userId),
            deadlinesNextSevenDays(userId, clock, timeZone),
            nextCommitment(userId, clock, timeZone),
            habitsSummary(userId, clock, timeZone, weekStart),
          ]),
      ],
      [
        "Plan",
        () =>
          listPlanTasks(userId, DEFAULT_TASK_LIST_FILTERS, {
            today: clock.today,
            timeZone,
          }),
      ],
      [
        "Plan closed",
        () =>
          listPlanTasks(
            userId,
            { ...DEFAULT_TASK_LIST_FILTERS, showClosed: true },
            { today: clock.today, timeZone },
          ),
      ],
      ["Inbox", () => listInboxTasks(userId)],
      [
        "Today",
        () =>
          Promise.all([
            listTodayTasks(userId, clock, timeZone),
            listTodaySuggestions(userId, clock, timeZone),
            getTodayHabits(userId, now),
            listTodayTimeline(userId, clock, timeZone),
          ]),
      ],
      [
        "Upcoming 7d",
        () =>
          listUpcomingTasks(
            userId,
            upcomingWindow(clock.today, 7, timeZone),
            timeZone,
          ),
      ],
      [
        "Upcoming 30d",
        () =>
          listUpcomingTasks(
            userId,
            upcomingWindow(clock.today, 30, timeZone),
            timeZone,
          ),
      ],
      [
        "Calendar agenda",
        () => listAgenda(userId, { start: clock.today, days: 30 }, timeZone),
      ],
      [
        "Calendar week",
        () =>
          listCalendarGrid(
            userId,
            {
              view: "week",
              date: clock.today,
              start: week,
              end: addDays(week, 7),
            },
            timeZone,
          ),
      ],
      ["Calendar areas", () => listDaySchedule(userId, clock.today, timeZone)],
      [
        "Calendar timeline",
        () =>
          listSchedule(
            userId,
            { start: week, end: addDays(week, 7) },
            timeZone,
          ),
      ],
      ["Goals", () => getGoalsView(userId, "active")],
      ["Goals archive", () => getArchivedGoals(userId)],
      ["Goal detail", () => getGoalDetail(userId, goals[0].id)],
      ["Track 4w", () => getTrackView(userId, now, "4w")],
      ["Track 12w", () => getTrackView(userId, now, "12w")],
      ["Review", () => getReviewPage(userId, addDays(week, -7), now)],
      [
        "Review summary",
        () =>
          weeklySummary(userId, {
            periodStart: addDays(week, -7),
            clock,
            timeZone,
            weekStart,
          }),
      ],
      ["Review history", () => getReviewHistory(userId, now)],
      [
        "Insights",
        () =>
          Promise.all([
            goalInactivityMetric(context),
            overdueTrendMetric(context),
            habitConsistencyTrendMetric(context),
            nextWeekWorkloadMetric(context),
          ]),
      ],
      ["Notes", () => listNotes(userId, { archived: false })],
      [
        "Notes tagged",
        () => listNotes(userId, { archived: false, tagId: tags[0].id }),
      ],
      ["Notes archive", () => listNotes(userId, { archived: true })],
      ["Search", () => search(userId, "project")],
      ["Search tagged", () => search(userId, "project", { tagId: tags[0].id })],
    ];
    for (const [name, run] of views) {
      view = name;
      await run();
    }
    pool.query = originalQuery;

    const reports = [];
    for (const [id, query] of queries) {
      const explain = () =>
        pool.query<{ "QUERY PLAN": Plan[] }>(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
          query.params,
        );
      await explain(); // One warm-up, then five measured runs per exact query.
      const samples: Plan[] = [];
      for (let run = 0; run < 5; run++) {
        const { rows } = await explain();
        samples.push(rows[0]["QUERY PLAN"][0]);
      }
      samples.sort((a, b) => a["Execution Time"] - b["Execution Time"]);
      reports.push({
        id,
        ...query,
        medianMs: samples[2]["Execution Time"],
        timings: samples.map((sample) => ({
          executionMs: sample["Execution Time"],
          planningMs: sample["Planning Time"],
        })),
        plan: samples[2].Plan,
      });
    }
    const { rows: metadata } = await pool.query(`
      SELECT version(), current_setting('shared_buffers') AS shared_buffers,
        current_setting('random_page_cost') AS random_page_cost,
        current_setting('work_mem') AS work_mem
    `);
    const { rows: indexes } = await pool.query(`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname
    `);
    return {
      asOf: asOf as LocalDate,
      measuredAt: new Date().toISOString(),
      metadata,
      indexes,
      views: views.map(([name]) => name),
      queries: reports,
    };
  } finally {
    pool.query = originalQuery;
    await lockClient.query("SELECT pg_advisory_unlock(107, 1)");
    lockClient.release();
    await pool.end();
  }
}
