import type { Metadata } from "next";
import { Suspense } from "react";

import { AgendaView } from "@/components/calendar/agenda-view";
import { TimeGridView } from "@/components/calendar/time-grid-view";
import { PlanSubnav } from "@/components/tasks/plan-subnav";
import { cx } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { parseAgendaRange } from "@/lib/agenda";
import { parseCalendarView, parseGridRange } from "@/lib/calendar-views";
import { addDays, startOfLocalDay, todayFor } from "@/lib/dates";
import { supportedTimeZones } from "@/lib/preferences";
import { requireUser } from "@/server/auth/session";
import {
  listAgenda,
  listCalendarGrid,
  listEventLinkOptions,
} from "@/server/modules/calendar-events/queries";
import { getUserPreferences } from "@/server/modules/preferences/service";

export const metadata: Metadata = { title: "Calendar · SoleUp" };

export default function CalendarPage({
  searchParams,
}: PageProps<"/plan/calendar">) {
  return (
    <Suspense fallback={<LoadingState label="Loading the calendar" />}>
      <CalendarPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function CalendarPageBody({
  searchParams,
}: {
  searchParams: PageProps<"/plan/calendar">["searchParams"];
}) {
  const params = await searchParams;
  const view = parseCalendarView(params);
  return (
    // The time grids need the room for seven day columns.
    <div
      className={cx(
        "mx-auto flex w-full flex-col gap-6 px-4 py-10",
        view === "agenda" ? "max-w-2xl" : "max-w-5xl",
      )}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-muted">
          Appointments, planned tasks and deadlines, day by day.
        </p>
      </div>
      <PlanSubnav />
      <Suspense fallback={<LoadingState label="Loading the calendar" />}>
        <Calendar params={params} />
      </Suspense>
    </div>
  );
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

  if (view === "agenda") {
    const range = parseAgendaRange(params, today);
    const [entries, options] = await Promise.all([
      listAgenda(user.id, range, timeZone),
      listEventLinkOptions(user.id),
    ]);
    return (
      <AgendaView
        entries={entries}
        range={range}
        today={today}
        nextDayStartsAt={nextDayStartsAt}
        options={options}
        {...context}
      />
    );
  }

  const range = parseGridRange(view, params, today, preferences.weekStart);
  const [entries, options] = await Promise.all([
    listCalendarGrid(user.id, range, timeZone),
    listEventLinkOptions(user.id),
  ]);
  return (
    <TimeGridView
      // A new key per range, so moving resets the grid's scroll and focus.
      key={`${range.view}:${range.start}`}
      entries={entries}
      range={range}
      today={today}
      nextDayStartsAt={nextDayStartsAt}
      options={options}
      {...context}
    />
  );
}
