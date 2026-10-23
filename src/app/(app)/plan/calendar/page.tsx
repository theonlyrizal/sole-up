import type { Metadata } from "next";
import { Suspense } from "react";

import { AgendaView } from "@/components/calendar/agenda-view";
import { PlanSubnav } from "@/components/tasks/plan-subnav";
import { LoadingState } from "@/components/ui/skeleton";
import { parseAgendaRange } from "@/lib/agenda";
import { addDays, startOfLocalDay, todayFor } from "@/lib/dates";
import { supportedTimeZones } from "@/lib/preferences";
import { requireUser } from "@/server/auth/session";
import {
  listAgenda,
  listEventLinkOptions,
} from "@/server/modules/calendar-events/queries";
import { getUserPreferences } from "@/server/modules/preferences/service";

export const metadata: Metadata = { title: "Calendar · SoleUp" };

export default function CalendarPage({
  searchParams,
}: PageProps<"/plan/calendar">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-muted">
          Appointments, planned tasks and deadlines, day by day.
        </p>
      </div>
      <PlanSubnav />
      <Suspense fallback={<LoadingState label="Loading the agenda" />}>
        <Calendar searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Calendar({
  searchParams,
}: {
  searchParams: PageProps<"/plan/calendar">["searchParams"];
}) {
  const user = await requireUser();
  const [params, preferences] = await Promise.all([
    searchParams,
    getUserPreferences(user.id),
  ]);
  // The shell only renders pages once a zone is confirmed.
  const timeZone = preferences.timezone ?? "UTC";
  // Days are the user's dates in their saved zone, never the server's.
  const today = todayFor(timeZone);
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
      nextDayStartsAt={startOfLocalDay(
        addDays(today, 1),
        timeZone,
      ).toISOString()}
      options={options}
      timeZones={supportedTimeZones()}
      userTimeZone={timeZone}
      locale={preferences.locale}
    />
  );
}
