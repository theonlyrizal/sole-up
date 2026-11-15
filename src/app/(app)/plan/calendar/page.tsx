import type { Metadata } from "next";
import { Suspense } from "react";

import type { BlockableTask } from "@/components/calendar/block-form";
import { AgendaView } from "@/components/calendar/agenda-view";
import { AreaColumnsView } from "@/components/calendar/area-columns-view";
import { AreaTimelineView } from "@/components/calendar/area-timeline-view";
import { TimeGridView } from "@/components/calendar/time-grid-view";
import { PageFrame } from "@/components/shell/page-frame";
import { PlanTabs } from "@/components/shell/plan-tabs";
import { LoadingState } from "@/components/ui/skeleton";
import { parseAgendaRange } from "@/lib/agenda";
import { parseTimelineRange } from "@/lib/area-timeline";
import {
  parseCalendarItem,
  parseCalendarView,
  parseGridRange,
} from "@/lib/calendar-views";
import { addDays, startOfLocalDay, todayFor } from "@/lib/dates";
import { supportedTimeZones } from "@/lib/preferences";
import { parseTaskListFilters } from "@/lib/task-list";
import { requireUser } from "@/server/auth/session";
import {
  listAgenda,
  listCalendarGrid,
  listDaySchedule,
  listEventLinkOptions,
  listSchedule,
} from "@/server/modules/calendar-events/queries";
import { getLifeAreasView } from "@/server/modules/life-areas/queries";
import { getUserPreferences } from "@/server/modules/preferences/service";
import { listPlanTasks } from "@/server/modules/tasks/queries";

export const metadata: Metadata = { title: "Calendar · SoleUp" };

export default function CalendarPage({
  searchParams,
}: PageProps<"/plan/calendar">) {
  return (
    <PageFrame title="Calendar" subnav={<PlanTabs />}>
      <Suspense fallback={<LoadingState label="Loading the calendar" />}>
        <CalendarPageBody searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function CalendarPageBody({
  searchParams,
}: {
  searchParams: PageProps<"/plan/calendar">["searchParams"];
}) {
  return <Calendar params={await searchParams} />;
}

async function Calendar({
  params,
}: {
  params: Awaited<PageProps<"/plan/calendar">["searchParams"]>;
}) {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);
  // The shell only renders pages once a zone is confirmed.
  const timeZone = preferences.timezone ?? "UTC";
  // Days are the user's dates in their saved zone, never the server's.
  const today = todayFor(timeZone);
  const view = parseCalendarView(params);
  const context = {
    timeZones: supportedTimeZones(),
    userTimeZone: timeZone,
    locale: preferences.locale,
  };
  const nextDayStartsAt = startOfLocalDay(
    addDays(today, 1),
    timeZone,
  ).toISOString();

  // The same open tasks supply Block time in every view and the Week panel.
  const openTasks = listPlanTasks(user.id, parseTaskListFilters({}), {
    today,
    timeZone,
  }).then((tasks): BlockableTask[] =>
    tasks.map(({ id, title, estimatedMinutes }) => ({
      id,
      title,
      estimatedMinutes,
    })),
  );
  const navigation = {
    today,
    nextDayStartsAt,
    weekStart: preferences.weekStart,
  };

  if (view === "agenda") {
    const range = parseAgendaRange(params, today);
    const [entries, options, tasks] = await Promise.all([
      listAgenda(user.id, range, timeZone),
      listEventLinkOptions(user.id),
      openTasks,
    ]);
    return (
      <AgendaView
        entries={entries}
        range={range}
        tasks={tasks}
        {...navigation}
        options={options}
        {...context}
      />
    );
  }

  if (view === "areas") {
    const range = parseGridRange(view, params, today, preferences.weekStart);
    const [entries, options, tasks, lifeAreas] = await Promise.all([
      listDaySchedule(user.id, range.date, timeZone),
      listEventLinkOptions(user.id),
      openTasks,
      getLifeAreasView(user.id),
    ]);
    return (
      <AreaColumnsView
        // A new key per day, so moving resets the view's scroll and focus.
        key={range.start}
        entries={entries}
        areas={options.areas}
        areaColors={Object.fromEntries(
          [...lifeAreas.active, ...lifeAreas.archived].map(({ id, color }) => [
            id,
            color,
          ]),
        )}
        range={range}
        tasks={tasks}
        {...navigation}
        options={options}
        {...context}
      />
    );
  }

  if (view === "timeline") {
    const range = parseTimelineRange(params, today, preferences.weekStart);
    const [entries, options, tasks, lifeAreas] = await Promise.all([
      listSchedule(user.id, range, timeZone),
      listEventLinkOptions(user.id),
      openTasks,
      getLifeAreasView(user.id),
    ]);
    return (
      <AreaTimelineView
        // A new key per range, so moving resets the view's scroll and focus.
        key={`${range.span}:${range.start}`}
        entries={entries}
        areas={options.areas}
        areaColors={Object.fromEntries(
          [...lifeAreas.active, ...lifeAreas.archived].map(({ id, color }) => [
            id,
            color,
          ]),
        )}
        range={range}
        tasks={tasks}
        {...navigation}
        options={options}
        {...context}
      />
    );
  }

  const range = parseGridRange(view, params, today, preferences.weekStart);
  const [entries, options, tasks] = await Promise.all([
    listCalendarGrid(user.id, range, timeZone),
    listEventLinkOptions(user.id),
    openTasks,
  ]);
  return (
    <TimeGridView
      // A new key per range, so moving resets the grid's scroll and focus.
      key={`${range.view}:${range.start}`}
      entries={entries}
      tasks={tasks}
      range={range}
      {...navigation}
      openItemId={parseCalendarItem(params)}
      options={options}
      {...context}
    />
  );
}
